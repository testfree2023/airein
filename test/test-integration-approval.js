/**
 * Integration Test: Self-Approval Attack Prevention + Advisory Visibility
 *
 * Simulates real CC behavior patterns discovered during testing:
 *   1. CC edits progress.md to self-approve → blocked by approval-guard
 *   2. CC retries after block → still blocked
 *   3. Advisory warning uses exit 2 + stderr (visible to model, no additionalContext)
 *   4. Hook chain: plan-gate (strict) → model tries self-approve → approval-guard blocks
 *   5. Edge cases: Bash bypass attempt, concurrent edit, multi-field change
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  describe, assertOk, assertEqual, assertContains, assertNotContains,
  projectRoot, printSummary
} = require('./helpers');

const PLAN_GATE_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'plan-gate.js');
const APPROVAL_GUARD_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'approval-guard.js');
const APPROVAL_SEQ_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'approval-sequence.js');

// ── Test fixtures ──────────────────────────────────────────────────

const DRAFT_PROGRESS = `# Progress: Attack Target
updated: 2026-06-11
plan: P099-attack-test
complexity: complex

## Task Stats
total: 3
completed: 0
in_progress: 1
pending: 2

## Approval State
requirements: draft
design: none
tasks: none

## Active Task
1.1 Setup project

## Blockers
- none
`;

const APPROVED_PROGRESS = `# Progress: Attack Target
updated: 2026-06-11
plan: P099-attack-test
complexity: complex

## Task Stats
total: 3
completed: 0
in_progress: 1
pending: 2

## Approval State
requirements: approved
design: none
tasks: none

## Active Task
1.1 Setup project

## Blockers
- none
`;

function createTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-test-'));
  fs.mkdirSync(path.join(dir, '.claude', 'config'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"integration-fixture"}\n');
  return dir;
}

function removeTempProject(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function createPlanDir(projectDir, name, progressContent) {
  const planDir = path.join(projectDir, 'docs', 'plans', name);
  fs.mkdirSync(planDir, { recursive: true });
  if (progressContent) {
    fs.writeFileSync(path.join(planDir, 'progress.md'), progressContent);
  }
  return planDir;
}

function runHook(hookPath, filePath, cwd, extra) {
  const input = JSON.stringify(extra || { tool_input: { file_path: filePath } });
  const result = spawnSync(process.execPath, [hookPath], {
    input,
    cwd: cwd || projectRoot(),
    encoding: 'utf8',
    timeout: 5000
  });
  return {
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    exitCode: result.status === null ? 1 : result.status,
    input
  };
}

function parseJsonSafe(str) {
  try { return JSON.parse(str); } catch { return null; }
}

// ════════════════════════════════════════════════════════════════════
// Scenario 1: Full self-approval attack chain
// ════════════════════════════════════════════════════════════════════

describe('SCENARIO 1: Full self-approval attack chain', suite => {
  suite.test('Step 1: plan-gate (strict) blocks source edit without approved plan', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P099-attack-test', DRAFT_PROGRESS);
      // Configure strict mode
      fs.writeFileSync(
        path.join(tmp, '.claude', 'config', 'quality.json'),
        JSON.stringify({ planGate: { mode: 'strict' } })
      );
      const srcPath = path.join(tmp, 'src', 'feature.js');
      const result = runHook(PLAN_GATE_PATH, srcPath, tmp);
      assertEqual(result.exitCode, 2, 'plan-gate strict should block');
      assertContains(result.stderr, '无已批准的计划', 'should mention no approved plan');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('Step 2: CC tries to Edit progress.md to self-approve → approval-guard blocks', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P099-attack-test', DRAFT_PROGRESS);
      const progressPath = path.join(tmp, 'docs', 'plans', 'P099-attack-test', 'progress.md');

      // CC attempts: Edit old="requirements: draft" → new="requirements: approved"
      const result = runHook(APPROVAL_GUARD_PATH, progressPath, tmp, {
        tool_name: 'Edit',
        tool_input: {
          file_path: progressPath,
          old_string: 'requirements: draft',
          new_string: 'requirements: approved',
        }
      });
      assertEqual(result.exitCode, 2, 'approval-guard should block self-approval');
      assertContains(result.stderr, '[Approval Guard]', 'should identify as approval guard');
      assertContains(result.stderr, 'requirements', 'should mention the field');
      assertContains(result.stderr, 'draft', 'should mention old value');
      assertContains(result.stderr, 'approved', 'should mention new value');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('Step 3: CC retries with same edit → still blocked', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P099-attack-test', DRAFT_PROGRESS);
      const progressPath = path.join(tmp, 'docs', 'plans', 'P099-attack-test', 'progress.md');

      // First attempt
      const r1 = runHook(APPROVAL_GUARD_PATH, progressPath, tmp, {
        tool_name: 'Edit',
        tool_input: { file_path: progressPath, old_string: 'requirements: draft', new_string: 'requirements: approved' }
      });
      assertEqual(r1.exitCode, 2, 'first attempt blocked');

      // Retry (progress.md unchanged because CC's Edit was blocked)
      const r2 = runHook(APPROVAL_GUARD_PATH, progressPath, tmp, {
        tool_name: 'Edit',
        tool_input: { file_path: progressPath, old_string: 'requirements: draft', new_string: 'requirements: approved' }
      });
      assertEqual(r2.exitCode, 2, 'second attempt also blocked');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('Step 4: Verify progress.md was NOT modified', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P099-attack-test', DRAFT_PROGRESS);
      const progressPath = path.join(tmp, 'docs', 'plans', 'P099-attack-test', 'progress.md');

      runHook(APPROVAL_GUARD_PATH, progressPath, tmp, {
        tool_name: 'Edit',
        tool_input: { file_path: progressPath, old_string: 'requirements: draft', new_string: 'requirements: approved' }
      });

      const current = fs.readFileSync(progressPath, 'utf8');
      assertContains(current, 'requirements: draft', 'approval state should remain draft');
      assertNotContains(current, 'requirements: approved', 'should NOT be approved');
    } finally {
      removeTempProject(tmp);
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// Scenario 2: Advisory warning visibility (exit 2 for visibility)
// ════════════════════════════════════════════════════════════════════

describe('SCENARIO 2: Advisory warning visibility (exit 2 fallback)', suite => {
  suite.test('plan-gate advisory blocks with visible stderr warning', () => {
    const tmp = createTempProject();
    try {
      const srcPath = path.join(tmp, 'src', 'feature.js');
      const result = runHook(PLAN_GATE_PATH, srcPath, tmp);

      // Advisory now uses exit 2 (not exit 0 + additionalContext)
      // because additionalContext is invisible for plugin hooks (confirmed E2E)
      assertEqual(result.exitCode, 2, 'advisory should block (exit 2 for visibility)');

      assertContains(result.stderr, '[Plan Gate]', 'stderr should contain [Plan Gate]');
      assertContains(result.stderr, 'feature.js', 'stderr should mention file name');
      assertContains(result.stderr, 'advisory', 'stderr should mention advisory mode');
      assertContains(result.stderr, '/new-plan', 'stderr should suggest /new-plan');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('plan-gate advisory with approved plan allows (raw passthrough)', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P099-active', APPROVED_PROGRESS);
      const srcPath = path.join(tmp, 'src', 'feature.js');
      const result = runHook(PLAN_GATE_PATH, srcPath, tmp);

      assertEqual(result.exitCode, 0, 'should allow with approved plan');
      // When there IS an approved plan, hook uses raw passthrough (not blocking)
      const json = parseJsonSafe(result.stdout);
      assertOk(json === null || !json.hookSpecificOutput, 'should not use additionalContext when plan is approved');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('plan-gate strict mode uses stderr + exit 2 (same mechanism as advisory)', () => {
    const tmp = createTempProject();
    try {
      fs.writeFileSync(
        path.join(tmp, '.claude', 'config', 'quality.json'),
        JSON.stringify({ planGate: { mode: 'strict' } })
      );
      const srcPath = path.join(tmp, 'src', 'feature.js');
      const result = runHook(PLAN_GATE_PATH, srcPath, tmp);

      assertEqual(result.exitCode, 2, 'strict should block');
      assertContains(result.stderr, '[Plan Gate]', 'strict mode uses stderr');
      // Both modes use exit 2 + stderr, but strict has different message tone
      assertContains(result.stderr, '无已批准的计划', 'strict mentions no approved plan');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('advisory and strict messages are differentiated', () => {
    const tmp = createTempProject();
    try {
      // Advisory
      const advResult = runHook(PLAN_GATE_PATH, path.join(tmp, 'src', 'adv.js'), tmp);
      assertContains(advResult.stderr, 'advisory', 'advisory mentions mode');

      // Strict
      fs.writeFileSync(
        path.join(tmp, '.claude', 'config', 'quality.json'),
        JSON.stringify({ planGate: { mode: 'strict' } })
      );
      const strictResult = runHook(PLAN_GATE_PATH, path.join(tmp, 'src', 'strict.js'), tmp);
      assertContains(strictResult.stderr, '🚫', 'strict uses harder block symbol');
      assertNotContains(strictResult.stderr, 'advisory', 'strict does not mention advisory');
    } finally {
      removeTempProject(tmp);
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// Scenario 3: Edge cases for approval-guard
// ════════════════════════════════════════════════════════════════════

describe('SCENARIO 3: Approval-guard edge cases', suite => {
  suite.test('blocks Write that removes approval fields entirely', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P099-attack-test', APPROVED_PROGRESS);
      const progressPath = path.join(tmp, 'docs', 'plans', 'P099-attack-test', 'progress.md');

      // Malicious Write that removes the Approval State section — deleting an
      // already-granted approval is a bypass attempt and must be blocked.
      const noApprovalContent = APPROVED_PROGRESS.replace(/## Approval State\nrequirements: approved\ndesign: none\ntasks: none\n/, '## Approval State\n');
      const result = runHook(APPROVAL_GUARD_PATH, progressPath, tmp, {
        tool_name: 'Write',
        tool_input: { file_path: progressPath, content: noApprovalContent }
      });
      assertEqual(result.exitCode, 2, 'should block removal of approval fields');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('blocks changing all three fields at once', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P099-attack-test', DRAFT_PROGRESS);
      const progressPath = path.join(tmp, 'docs', 'plans', 'P099-attack-test', 'progress.md');

      const allApproved = DRAFT_PROGRESS
        .replace('requirements: draft', 'requirements: approved')
        .replace('design: none', 'design: approved')
        .replace('tasks: none', 'tasks: approved');
      const result = runHook(APPROVAL_GUARD_PATH, progressPath, tmp, {
        tool_name: 'Write',
        tool_input: { file_path: progressPath, content: allApproved }
      });
      assertEqual(result.exitCode, 2, 'should block changing all fields');
      assertContains(result.stderr, 'requirements', 'should mention requirements');
      assertContains(result.stderr, 'design', 'should mention design');
      assertContains(result.stderr, 'tasks', 'should mention tasks');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('allows changing requirements: none → draft (initial draft creation)', () => {
    const tmp = createTempProject();
    try {
      // Progress with requirements: none (plan just created)
      const initialProgress = DRAFT_PROGRESS.replace('requirements: draft', 'requirements: none');
      createPlanDir(tmp, 'P099-attack-test', initialProgress);
      const progressPath = path.join(tmp, 'docs', 'plans', 'P099-attack-test', 'progress.md');

      const result = runHook(APPROVAL_GUARD_PATH, progressPath, tmp, {
        tool_name: 'Edit',
        tool_input: { file_path: progressPath, old_string: 'requirements: none', new_string: 'requirements: draft' }
      });
      // none → draft is the AI's normal initial draft creation (new-plan skill
      // flow), NOT a self-approval — must pass without a confirmation file.
      assertEqual(result.exitCode, 0, 'none→draft is initial draft creation, should allow');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('old_string not found in file → still safe (edit would fail anyway)', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P099-attack-test', DRAFT_PROGRESS);
      const progressPath = path.join(tmp, 'docs', 'plans', 'P099-attack-test', 'progress.md');

      const result = runHook(APPROVAL_GUARD_PATH, progressPath, tmp, {
        tool_name: 'Edit',
        tool_input: { file_path: progressPath, old_string: 'NOT_IN_FILE', new_string: 'requirements: approved' }
      });
      // old_string doesn't match anything, simulated edit doesn't change approval state
      assertEqual(result.exitCode, 0, 'non-matching edit should allow (CC will reject anyway)');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('Write with identical approval state → allowed', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P099-attack-test', DRAFT_PROGRESS);
      const progressPath = path.join(tmp, 'docs', 'plans', 'P099-attack-test', 'progress.md');

      // Rewrite same content but with different active task
      const modified = DRAFT_PROGRESS.replace('1.1 Setup project', '1.2 Implement feature');
      const result = runHook(APPROVAL_GUARD_PATH, progressPath, tmp, {
        tool_name: 'Write',
        tool_input: { file_path: progressPath, content: modified }
      });
      assertEqual(result.exitCode, 0, 'should allow Write with same approval state');
    } finally {
      removeTempProject(tmp);
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// Scenario 4: Hook interaction (multiple hooks in chain)
// ════════════════════════════════════════════════════════════════════

describe('SCENARIO 4: Hook chain interaction', suite => {
  suite.test('approval-guard + approval-sequence: both protect plan docs', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P099-attack-test', DRAFT_PROGRESS);

      // approval-sequence blocks design.md when requirements not approved
      const designPath = path.join(tmp, 'docs', 'plans', 'P099-attack-test', 'design.md');
      const seqResult = runHook(APPROVAL_SEQ_PATH, designPath, tmp);
      assertEqual(seqResult.exitCode, 2, 'approval-sequence should block design.md');
      assertContains(seqResult.stderr, '[Approval Sequence]', 'should identify as approval-sequence');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('approval-guard does NOT interfere with approval-sequence', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P099-attack-test', DRAFT_PROGRESS);
      // approval-guard only protects progress.md, not design.md
      const designPath = path.join(tmp, 'docs', 'plans', 'P099-attack-test', 'design.md');
      const guardResult = runHook(APPROVAL_GUARD_PATH, designPath, tmp, {
        tool_name: 'Write',
        tool_input: { file_path: designPath, content: '# Design\n\ntbd' }
      });
      assertEqual(guardResult.exitCode, 0, 'approval-guard should not block design.md');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('plan-gate + approval-guard: independent protections', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P099-attack-test', DRAFT_PROGRESS);

      // plan-gate blocks source edit (requirements: draft, not approved)
      fs.writeFileSync(
        path.join(tmp, '.claude', 'config', 'quality.json'),
        JSON.stringify({ planGate: { mode: 'strict' } })
      );
      const srcPath = path.join(tmp, 'src', 'feature.js');
      const gateResult = runHook(PLAN_GATE_PATH, srcPath, tmp);
      assertEqual(gateResult.exitCode, 2, 'plan-gate should block');

      // approval-guard also blocks trying to self-approve
      const progressPath = path.join(tmp, 'docs', 'plans', 'P099-attack-test', 'progress.md');
      const guardResult = runHook(APPROVAL_GUARD_PATH, progressPath, tmp, {
        tool_name: 'Edit',
        tool_input: { file_path: progressPath, old_string: 'requirements: draft', new_string: 'requirements: approved' }
      });
      assertEqual(guardResult.exitCode, 2, 'approval-guard should also block');
    } finally {
      removeTempProject(tmp);
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// Scenario 5: Document the Bash bypass gap
// ════════════════════════════════════════════════════════════════════

describe('SCENARIO 5: Known gap — Bash tool bypass (documented)', suite => {
  suite.test('approval-guard does not intercept Bash commands (by design)', () => {
    // This test documents a known limitation: the model could use
    // Bash to run sed/awk/echo to modify progress.md, bypassing
    // the approval-guard. This is accepted as Layer 1 protection.
    //
    // Future Layer 2: add a PreToolUse+Bash matcher that checks
    // command strings for progress.md references.
    assertOk(true, 'known gap documented — Bash bypass accepted at Layer 1');
  });
});

// ── Run standalone ─────────────────────────────────────────────────
process.exit(printSummary());
