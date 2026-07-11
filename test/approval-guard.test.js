/**
 * Test: Approval Guard Hook (3-Mode)
 *
 * Verifies:
 *   - Blocks Edit that changes approval state fields (requirements/design/tasks)
 *   - Blocks Write that changes approval state fields
 *   - Allows Edit to non-approval fields (task stats, active task, blockers)
 *   - Allows Write for new progress.md (file doesn't exist yet)
 *   - Ignores non-progress.md files
 *   - Ignores progress.md outside plan directories
 *   - advisory mode: warns but allows (exit 0)
 *   - console-confirm mode: blocks + allows with confirmation file
 *   - manual-only mode: strict block, no bypass
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  describe, assertOk, assertEqual, assertContains, assertNotContains,
  projectRoot, printSummary
} = require('./helpers');

const APPROVAL_GUARD_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'approval-guard.js');

// ── Test fixtures ──────────────────────────────────────────────────

const PROGRESS_LINES = [
  '# Progress: Test Feature',
  'updated: 2026-06-10',
  'plan: P010-test',
  'complexity: medium',
  '',
  '## Task Stats',
  'total: 3',
  'completed: 1',
  'in_progress: 1',
  'pending: 1',
  '',
  '## Approval State',
  'requirements: draft',
  'design: none',
  'tasks: none',
  '',
  '## Active Task',
  '1.2 Implement feature',
  '',
  '## Blockers',
  '- none',
];
const PROGRESS_CONTENT = PROGRESS_LINES.join('\n');

function createTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-guard-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  // No `.git`/`package.json`: getConfirmationFile() resolves root via the shared
  // getProjectDir() (process.cwd()), not filesystem markers — every test here
  // is implicitly a non-git project (dogfood 2026-07-10 regression guard).
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

function writeQualityConfig(projectDir, mode) {
  const configDir = path.join(projectDir, '.claude', 'config');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, 'quality.json'), JSON.stringify({
    approvalGuard: { mode: mode }
  }, null, 2));
}

function runHook(filePath, cwd, toolName, overrides) {
  const input = JSON.stringify({
    tool_name: toolName || 'Edit',
    tool_input: { file_path: filePath, ...(overrides || {}) }
  });
  const result = spawnSync(process.execPath, [APPROVAL_GUARD_PATH], {
    input, cwd: cwd || projectRoot(), encoding: 'utf8', timeout: 5000
  });
  return {
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    exitCode: result.status === null ? 1 : result.status,
    input
  };
}

// ═══════════════════════════════════════════════════════════════════
// Mode: console-confirm (default)
// ═══════════════════════════════════════════════════════════════════

describe('approval-guard [console-confirm]: Edit blocks approval state changes', suite => {
  suite.test('blocks Edit changing requirements: draft -> approved', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const r = runHook(pp, tmp, 'Edit', {
        old_string: 'requirements: draft', new_string: 'requirements: approved'
      });
      assertEqual(r.exitCode, 2, 'should block');
      assertContains(r.stderr, '[Approval Guard]', 'guard marker');
      assertContains(r.stderr, 'requirements', 'field name');
    } finally { removeTempProject(tmp); }
  });

  suite.test('blocks Edit changing design: none -> approved', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const r = runHook(pp, tmp, 'Edit', {
        old_string: 'design: none', new_string: 'design: approved'
      });
      assertEqual(r.exitCode, 2, 'should block');
      assertContains(r.stderr, 'design', 'field name');
    } finally { removeTempProject(tmp); }
  });

  suite.test('blocks Edit changing requirements: none -> approved (skip-draft approval)', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const r = runHook(pp, tmp, 'Edit', {
        old_string: 'requirements: draft', new_string: 'requirements: approved'
      });
      assertEqual(r.exitCode, 2, 'should block approval');
    } finally { removeTempProject(tmp); }
  });
});

describe('approval-guard [console-confirm]: Edit allows non-approval changes', suite => {
  suite.test('allows Edit to task stats', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const r = runHook(pp, tmp, 'Edit', { old_string: 'total: 3', new_string: 'total: 4' });
      assertEqual(r.exitCode, 0, 'should allow');
    } finally { removeTempProject(tmp); }
  });

  suite.test('allows Edit to active task', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const r = runHook(pp, tmp, 'Edit', {
        old_string: '1.2 Implement feature', new_string: '1.3 Write tests'
      });
      assertEqual(r.exitCode, 0, 'should allow');
    } finally { removeTempProject(tmp); }
  });

  suite.test('allows Edit to blockers', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const r = runHook(pp, tmp, 'Edit', {
        old_string: '- none', new_string: '- waiting for API access'
      });
      assertEqual(r.exitCode, 0, 'should allow');
    } finally { removeTempProject(tmp); }
  });

  suite.test('allows Edit to updated date', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const r = runHook(pp, tmp, 'Edit', {
        old_string: 'updated: 2026-06-10', new_string: 'updated: 2026-06-11'
      });
      assertEqual(r.exitCode, 0, 'should allow');
    } finally { removeTempProject(tmp); }
  });

  // ── draft transitions are NOT approval — must not block ──
  // new-plan skill flow: AI creates doc → marks state `draft` → waits for user
  // approval → user approves → AI marks `approved`. Only `→ approved` is the
  // self-approval risk approval-guard exists to prevent. `→ draft` is the AI's
  // own normal progression and must pass without a confirmation file.
  suite.test('allows Edit changing tasks: none -> draft (draft is not approval)', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const r = runHook(pp, tmp, 'Edit', {
        old_string: 'tasks: none', new_string: 'tasks: draft'
      });
      assertEqual(r.exitCode, 0, 'draft is not approval — should allow');
    } finally { removeTempProject(tmp); }
  });

  suite.test('allows Edit changing design: none -> draft (matches new-plan skill flow)', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const r = runHook(pp, tmp, 'Edit', {
        old_string: 'design: none', new_string: 'design: draft'
      });
      assertEqual(r.exitCode, 0, 'creating a draft is not self-approval — should allow');
    } finally { removeTempProject(tmp); }
  });
});

describe('approval-guard [console-confirm]: Write blocks approval state changes', suite => {
  suite.test('blocks Write with changed approval state', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const nc = PROGRESS_CONTENT.replace('requirements: draft', 'requirements: approved');
      const r = runHook(pp, tmp, 'Write', { content: nc });
      assertEqual(r.exitCode, 2, 'should block');
      assertContains(r.stderr, '[Approval Guard]', 'guard marker');
    } finally { removeTempProject(tmp); }
  });

  suite.test('allows Write with same approval state', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const nc = PROGRESS_CONTENT.replace('total: 3', 'total: 4');
      const r = runHook(pp, tmp, 'Write', { content: nc });
      assertEqual(r.exitCode, 0, 'should allow');
    } finally { removeTempProject(tmp); }
  });
});

describe('approval-guard [console-confirm]: ignores non-target files', suite => {
  suite.test('allows Edit to source files', () => {
    const tmp = createTempProject();
    try {
      const r = runHook(path.join(tmp, 'src', 'feature.js'), tmp, 'Edit', {
        old_string: 'hello', new_string: 'world'
      });
      assertEqual(r.exitCode, 0, 'should allow');
    } finally { removeTempProject(tmp); }
  });

  suite.test('allows Edit to requirements.md', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const rp = path.join(tmp, 'docs', 'plans', 'P010-test', 'requirements.md');
      const r = runHook(rp, tmp, 'Edit', { old_string: 'old', new_string: 'new' });
      assertEqual(r.exitCode, 0, 'should allow');
    } finally { removeTempProject(tmp); }
  });

  suite.test('allows Edit to progress.md outside plan dirs', () => {
    const tmp = createTempProject();
    try {
      const md = path.join(tmp, 'docs', 'misc');
      fs.mkdirSync(md, { recursive: true });
      const mp = path.join(md, 'progress.md');
      fs.writeFileSync(mp, PROGRESS_CONTENT);
      const r = runHook(mp, tmp, 'Edit', {
        old_string: 'requirements: draft', new_string: 'requirements: approved'
      });
      assertEqual(r.exitCode, 0, 'should allow');
    } finally { removeTempProject(tmp); }
  });

  suite.test('allows Write to new progress.md', () => {
    const tmp = createTempProject();
    try {
      const pd = createPlanDir(tmp, 'P010-new', null);
      const pp = path.join(pd, 'progress.md');
      const r = runHook(pp, tmp, 'Write', { content: PROGRESS_CONTENT });
      assertEqual(r.exitCode, 0, 'should allow');
    } finally { removeTempProject(tmp); }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Mode: console-confirm — confirmation file bypass
// ═══════════════════════════════════════════════════════════════════

describe('approval-guard [console-confirm]: confirmation file bypass', suite => {
  suite.test('allows Edit when valid confirmation file exists', () => {
    const tmp = createTempProject();
    try {
      writeQualityConfig(tmp, 'console-confirm');
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const cd = path.join(tmp, '.claude');
      fs.mkdirSync(cd, { recursive: true });
      fs.writeFileSync(path.join(cd, 'approval-confirmed.json'),
        JSON.stringify({ requirements: 'approved' }));
      const r = runHook(pp, tmp, 'Edit', {
        old_string: 'requirements: draft', new_string: 'requirements: approved'
      });
      assertEqual(r.exitCode, 0, 'should allow with valid confirmation');
    } finally { removeTempProject(tmp); }
  });

  suite.test('blocks Edit when confirmation data does not match', () => {
    const tmp = createTempProject();
    try {
      writeQualityConfig(tmp, 'console-confirm');
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const cd = path.join(tmp, '.claude');
      fs.mkdirSync(cd, { recursive: true });
      fs.writeFileSync(path.join(cd, 'approval-confirmed.json'),
        JSON.stringify({ requirements: 'draft' }));
      const r = runHook(pp, tmp, 'Edit', {
        old_string: 'requirements: draft', new_string: 'requirements: approved'
      });
      assertEqual(r.exitCode, 2, 'should block mismatched');
    } finally { removeTempProject(tmp); }
  });

  suite.test('blocks Edit when confirmation file is expired', () => {
    const tmp = createTempProject();
    try {
      writeQualityConfig(tmp, 'console-confirm');
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const cd = path.join(tmp, '.claude');
      fs.mkdirSync(cd, { recursive: true });
      const cf = path.join(cd, 'approval-confirmed.json');
      fs.writeFileSync(cf, JSON.stringify({ requirements: 'approved' }));
      const ot = new Date(Date.now() - 180000);
      fs.utimesSync(cf, ot, ot);
      const r = runHook(pp, tmp, 'Edit', {
        old_string: 'requirements: draft', new_string: 'requirements: approved'
      });
      assertEqual(r.exitCode, 2, 'should block expired');
    } finally { removeTempProject(tmp); }
  });

  suite.test('consumes confirmation file after successful use', () => {
    const tmp = createTempProject();
    try {
      writeQualityConfig(tmp, 'console-confirm');
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const cd = path.join(tmp, '.claude');
      fs.mkdirSync(cd, { recursive: true });
      const cf = path.join(cd, 'approval-confirmed.json');
      fs.writeFileSync(cf, JSON.stringify({ requirements: 'approved' }));
      runHook(pp, tmp, 'Edit', {
        old_string: 'requirements: draft', new_string: 'requirements: approved'
      });
      assertEqual(fs.existsSync(cf), false, 'should be consumed');
    } finally { removeTempProject(tmp); }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Non-git project support (dogfood 2026-07-10)
// ═══════════════════════════════════════════════════════════════════

describe('approval-guard [console-confirm]: non-git project bypass', suite => {
  // Dogfood-found 2026-07-10 (3.14 /new-plan on airein-test, a non-git project):
  // getConfirmationFile() used to walk upward looking for `.git`/`package.json`
  // markers and returned null when neither was found → checkConfirmation() always
  // false → confirmation-file bypass permanently locked for non-git projects
  // (the whole m-feature pipeline stalled: requirements stuck at `draft`,
  // design.md / tasks.md uncreatable). Fix: resolve root via the shared
  // getProjectDir() (process.cwd(), which every host sets to the project root)
  // instead of guessing from filesystem markers. This fixture MUST NOT create
  // `.git`/`package.json` — that would mask the regression by satisfying the old
  // marker walk; it only seeds `.claude/config/` (via writeQualityConfig).
  suite.test('accepts confirmation file in non-git project (only .claude/ present)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-nongit-'));
    try {
      // NO .git, NO package.json — simulates a non-git, non-node airein project.
      writeQualityConfig(tmp, 'console-confirm');  // creates <tmp>/.claude/config/
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const cf = path.join(tmp, '.claude', 'approval-confirmed.json');
      fs.writeFileSync(cf, JSON.stringify({ requirements: 'approved' }));
      const r = runHook(pp, tmp, 'Edit', {
        old_string: 'requirements: draft', new_string: 'requirements: approved'
      });
      assertEqual(r.exitCode, 0, 'non-git airein project should accept confirmation file');
    } finally { removeTempProject(tmp); }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Mode: advisory — warn but allow
// ═══════════════════════════════════════════════════════════════════

describe('approval-guard [advisory mode]', suite => {
  suite.test('allows Edit with approval change (exit 0)', () => {
    const tmp = createTempProject();
    try {
      writeQualityConfig(tmp, 'advisory');
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const r = runHook(pp, tmp, 'Edit', {
        old_string: 'requirements: draft', new_string: 'requirements: approved'
      });
      assertEqual(r.exitCode, 0, 'advisory should allow');
    } finally { removeTempProject(tmp); }
  });

  suite.test('outputs warning to stderr in advisory mode', () => {
    const tmp = createTempProject();
    try {
      writeQualityConfig(tmp, 'advisory');
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const r = runHook(pp, tmp, 'Edit', {
        old_string: 'requirements: draft', new_string: 'requirements: approved'
      });
      assertContains(r.stderr, '[Approval Guard]', 'warning');
      assertContains(r.stderr, 'advisory', 'mode name');
      assertContains(r.stderr, 'requirements', 'field');
    } finally { removeTempProject(tmp); }
  });

  suite.test('allows Write with approval change (exit 0)', () => {
    const tmp = createTempProject();
    try {
      writeQualityConfig(tmp, 'advisory');
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const nc = PROGRESS_CONTENT.replace('requirements: draft', 'requirements: approved');
      const r = runHook(pp, tmp, 'Write', { content: nc });
      assertEqual(r.exitCode, 0, 'advisory should allow Write');
      assertContains(r.stderr, '[Approval Guard]', 'warning');
    } finally { removeTempProject(tmp); }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Mode: manual-only — strict block, no bypass
// ═══════════════════════════════════════════════════════════════════

describe('approval-guard [manual-only mode]', suite => {
  suite.test('blocks Edit with approval change (exit 2)', () => {
    const tmp = createTempProject();
    try {
      writeQualityConfig(tmp, 'manual-only');
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const r = runHook(pp, tmp, 'Edit', {
        old_string: 'requirements: draft', new_string: 'requirements: approved'
      });
      assertEqual(r.exitCode, 2, 'manual-only should block');
    } finally { removeTempProject(tmp); }
  });

  suite.test('blocks even with confirmation file present', () => {
    const tmp = createTempProject();
    try {
      writeQualityConfig(tmp, 'manual-only');
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const cd = path.join(tmp, '.claude');
      fs.mkdirSync(cd, { recursive: true });
      fs.writeFileSync(path.join(cd, 'approval-confirmed.json'),
        JSON.stringify({ requirements: 'approved' }));
      const r = runHook(pp, tmp, 'Edit', {
        old_string: 'requirements: draft', new_string: 'requirements: approved'
      });
      assertEqual(r.exitCode, 2, 'should ignore confirmation');
    } finally { removeTempProject(tmp); }
  });

  suite.test('message mentions external editor requirement', () => {
    const tmp = createTempProject();
    try {
      writeQualityConfig(tmp, 'manual-only');
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const r = runHook(pp, tmp, 'Edit', {
        old_string: 'requirements: draft', new_string: 'requirements: approved'
      });
      assertContains(r.stderr, '[Approval Guard]', 'guard marker');
      assertContains(r.stderr, 'manual-only', 'mode name');
      assertContains(r.stderr, '外部编辑器', 'external editor');
    } finally { removeTempProject(tmp); }
  });

  suite.test('blocks Write with approval change', () => {
    const tmp = createTempProject();
    try {
      writeQualityConfig(tmp, 'manual-only');
      createPlanDir(tmp, 'P010-test', PROGRESS_CONTENT);
      const pp = path.join(tmp, 'docs', 'plans', 'P010-test', 'progress.md');
      const nc = PROGRESS_CONTENT.replace('requirements: draft', 'requirements: approved');
      const r = runHook(pp, tmp, 'Write', { content: nc });
      assertEqual(r.exitCode, 2, 'manual-only should block Write');
    } finally { removeTempProject(tmp); }
  });
});

// ── Run standalone ─────────────────────────────────────────────────
process.exit(printSummary());
