/**
 * Test: Enforcement Hooks — plan-gate, approval-sequence, progress-sync
 *
 * Verifies:
 *   - plan-gate: strict blocks, advisory warns, disabled allows, exemptPaths
 *   - plan-gate: allows when approved plan exists
 *   - approval-sequence: blocks design.md without approved requirements
 *   - approval-sequence: blocks tasks.md without approved design (complex)
 *   - progress-sync: auto-updates progress.md when tasks.md changes
 *   - quality-config: planGate defaults exist
 *   - hooks.json: 3 new hooks registered
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  describe, assertOk, assertEqual, assertContains, assertNotContains,
  projectRoot, printSummary
} = require('./helpers');

const { DEFAULTS } = require(path.join(projectRoot(), 'scripts', 'lib', 'quality-config'));

const PLAN_GATE_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'plan-gate.js');
const APPROVAL_SEQ_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'approval-sequence.js');
const APPROVAL_GUARD_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'approval-guard.js');
const PROGRESS_SYNC_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'progress-sync.js');

// ── Test fixtures ──────────────────────────────────────────────────

function createTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enforce-test-'));
  fs.mkdirSync(path.join(dir, '.claude', 'config'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"enforce-fixture"}\n');
  return dir;
}

function removeTempProject(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function createPlanDir(projectDir, name, progressContent, requirements, design, tasks) {
  const planDir = path.join(projectDir, 'docs', 'plans', name);
  fs.mkdirSync(planDir, { recursive: true });
  if (progressContent) fs.writeFileSync(path.join(planDir, 'progress.md'), progressContent);
  if (requirements) fs.writeFileSync(path.join(planDir, 'requirements.md'), requirements);
  if (design) fs.writeFileSync(path.join(planDir, 'design.md'), design);
  if (tasks) fs.writeFileSync(path.join(planDir, 'tasks.md'), tasks);
  return planDir;
}

const ACTIVE_PROGRESS = `# Progress: Test Feature
updated: 2026-06-10
plan: P002-test
complexity: medium

## Task Stats
total: 3
completed: 0
in_progress: 1
pending: 2

## Approval State
requirements: approved
design: none
tasks: draft

## Active Task
1.1 Implement feature

## Blockers
- none
`;

const PENDING_ARCHIVE_PROGRESS = `# Progress: Pre-Archive
updated: 2026-07-11
plan: P099-pre-archive
complexity: m-feature
status: in_progress

## Task Stats
total: 3
completed: 3
in_progress: 0
pending: 0

## Approval State
requirements: approved
design: approved
tasks: approved

## Active Task
none

## Blockers
- none
`;

const COMPLEX_PROGRESS = `# Progress: Complex Feature
updated: 2026-06-10
plan: P003-complex
complexity: complex

## Task Stats
total: 5
completed: 0
in_progress: 1
pending: 4

## Approval State
requirements: approved
design: approved
test-plan: approved
tasks: draft

## Active Task
1.1 Setup

## Blockers
- none
`;

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

// ── quality-config: planGate defaults ──────────────────────────────

describe('quality-config: planGate defaults', suite => {
  suite.test('DEFAULTS.planGate exists', () => {
    assertOk('planGate' in DEFAULTS, 'planGate key exists');
  });

  suite.test('planGate.mode defaults to advisory', () => {
    assertEqual(DEFAULTS.planGate.mode, 'advisory', 'default mode is advisory');
  });

  suite.test('planGate.exemptPaths is array', () => {
    assertOk(Array.isArray(DEFAULTS.planGate.exemptPaths), 'exemptPaths is array');
    assertOk(DEFAULTS.planGate.exemptPaths.includes('docs/'), 'docs/ exempt');
    assertOk(DEFAULTS.planGate.exemptPaths.includes('test/'), 'test/ exempt');
  });

  suite.test('planGate.requireActiveTask defaults to true', () => {
    assertEqual(DEFAULTS.planGate.requireActiveTask, true, 'requireActiveTask defaults true');
  });

  suite.test('taskPickup.onBlocked defaults to wait_user', () => {
    assertEqual(DEFAULTS.taskPickup.onBlocked, 'wait_user', 'onBlocked defaults wait_user');
  });
});

// ── plan-gate tests ────────────────────────────────────────────────

describe('plan-gate: advisory mode (default)', suite => {
  suite.test('blocks with visible warning on stderr (exit 2) for source edit without plan', () => {
    const tmp = createTempProject();
    try {
      const result = runHook(PLAN_GATE_PATH, path.join(tmp, 'src', 'feature.js'), tmp);
      // Advisory mode uses exit 2 (block) because additionalContext is invisible
      // for plugin hooks — confirmed via E2E testing. Both strict and advisory
      // use exit 2, but advisory has a softer message tone.
      assertEqual(result.exitCode, 2, 'advisory mode should block (exit 2 for visibility)');
      assertContains(result.stderr, '[Plan Gate]', 'should contain warning in stderr');
      assertContains(result.stderr, 'advisory', 'should mention advisory mode');
      assertContains(result.stderr, 'feature.js', 'should mention file name');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('allows source edit with approved plan', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P002-active', ACTIVE_PROGRESS);
      const result = runHook(PLAN_GATE_PATH, path.join(tmp, 'src', 'feature.js'), tmp);
      assertNotContains(result.stderr, '[Plan Gate]', 'should not warn with approved plan');
      assertEqual(result.exitCode, 0, 'should allow with approved plan');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('allows source edit when all tasks done but status in_progress (pre-archive)', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P099-pre-archive', PENDING_ARCHIVE_PROGRESS);
      const result = runHook(PLAN_GATE_PATH, path.join(tmp, 'src', 'fix-before-archive.js'), tmp);
      assertEqual(result.exitCode, 0, 'pre-archive plan should still allow edits');
      assertNotContains(result.stderr, '[Plan Gate]', 'should not block pre-archive fixes');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('allows exempt paths without plan', () => {
    const tmp = createTempProject();
    try {
      const result = runHook(PLAN_GATE_PATH, path.join(tmp, 'docs', 'readme.md'), tmp);
      assertEqual(result.exitCode, 0, 'docs/ should be exempt');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('allows test files without plan', () => {
    const tmp = createTempProject();
    try {
      const result = runHook(PLAN_GATE_PATH, path.join(tmp, 'test', 'test-feature.js'), tmp);
      assertEqual(result.exitCode, 0, 'test files should be exempt');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('allows .d.ts files without plan', () => {
    const tmp = createTempProject();
    try {
      const result = runHook(PLAN_GATE_PATH, path.join(tmp, 'src', 'types.d.ts'), tmp);
      assertEqual(result.exitCode, 0, '.d.ts should be exempt');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('allows non-source extensions without plan', () => {
    const tmp = createTempProject();
    try {
      const result = runHook(PLAN_GATE_PATH, path.join(tmp, 'package.json'), tmp);
      assertEqual(result.exitCode, 0, '.json should not be source');
    } finally {
      removeTempProject(tmp);
    }
  });
});

describe('plan-gate: strict mode', suite => {
  suite.test('blocks source edit without plan', () => {
    const tmp = createTempProject();
    try {
      const configPath = path.join(tmp, '.claude', 'config', 'quality.json');
      fs.writeFileSync(configPath, JSON.stringify({ planGate: { mode: 'strict' } }));
      const result = runHook(PLAN_GATE_PATH, path.join(tmp, 'src', 'feature.js'), tmp);
      assertContains(result.stderr, '[Plan Gate]', 'should block in strict mode');
      assertEqual(result.exitCode, 2, 'should exit 2 in strict mode');
      assertEqual(result.stdout, '', 'should not passthrough when blocking');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('allows source edit with approved plan in strict mode', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P002-active', ACTIVE_PROGRESS);
      const configPath = path.join(tmp, '.claude', 'config', 'quality.json');
      fs.writeFileSync(configPath, JSON.stringify({ planGate: { mode: 'strict' } }));
      const result = runHook(PLAN_GATE_PATH, path.join(tmp, 'src', 'feature.js'), tmp);
      assertEqual(result.exitCode, 0, 'should allow with approved plan in strict');
      assertEqual(result.stdout, result.input, 'should passthrough stdin');
    } finally {
      removeTempProject(tmp);
    }
  });
});

describe('plan-gate: disabled mode', suite => {
  suite.test('allows everything without checking', () => {
    const tmp = createTempProject();
    try {
      const configPath = path.join(tmp, '.claude', 'config', 'quality.json');
      fs.writeFileSync(configPath, JSON.stringify({ planGate: { mode: 'disabled' } }));
      const result = runHook(PLAN_GATE_PATH, path.join(tmp, 'src', 'feature.js'), tmp);
      assertNotContains(result.stderr, '[Plan Gate]', 'disabled should not warn');
      assertEqual(result.exitCode, 0, 'disabled should allow');
      assertEqual(result.stdout, result.input, 'should passthrough stdin');
    } finally {
      removeTempProject(tmp);
    }
  });
});

// ── approval-sequence tests ────────────────────────────────────────

describe('approval-sequence: R→D→T order', suite => {
  suite.test('blocks design.md when requirements not approved', () => {
    const tmp = createTempProject();
    try {
      const progressNoReq = COMPLEX_PROGRESS.replace('requirements: approved', 'requirements: draft');
      createPlanDir(tmp, 'P003-complex', progressNoReq);
      const designPath = path.join(tmp, 'docs', 'plans', 'P003-complex', 'design.md');
      const result = runHook(APPROVAL_SEQ_PATH, designPath, tmp);
      assertContains(result.stderr, '[Approval Sequence]', 'should warn about sequence');
      assertEqual(result.exitCode, 2, 'should block');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('allows design.md when requirements approved', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P003-complex', COMPLEX_PROGRESS);
      const designPath = path.join(tmp, 'docs', 'plans', 'P003-complex', 'design.md');
      const result = runHook(APPROVAL_SEQ_PATH, designPath, tmp);
      assertEqual(result.exitCode, 0, 'should allow design with approved requirements');
      assertEqual(result.stdout, result.input, 'should passthrough stdin');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('blocks test-plan.md for complex when design not approved', () => {
    const tmp = createTempProject();
    try {
      // m-feature: requirements → design → test-plan → tasks (immediate predecessor only)
      const progressNoDesign = COMPLEX_PROGRESS
        .replace('design: approved', 'design: draft')
        .replace('test-plan: approved', 'test-plan: none');
      createPlanDir(tmp, 'P003-complex', progressNoDesign);
      const testPlanPath = path.join(tmp, 'docs', 'plans', 'P003-complex', 'test-plan.md');
      const result = runHook(APPROVAL_SEQ_PATH, testPlanPath, tmp);
      assertContains(result.stderr, '[Approval Sequence]', 'should warn about design approval');
      assertContains(result.stderr, 'design.md', 'message names previous document');
      assertEqual(result.exitCode, 2, 'should block test-plan without design approval');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('allows tasks.md for complex when design and test-plan approved', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(tmp, 'P003-complex', COMPLEX_PROGRESS);
      const tasksPath = path.join(tmp, 'docs', 'plans', 'P003-complex', 'tasks.md');
      const result = runHook(APPROVAL_SEQ_PATH, tasksPath, tmp);
      assertEqual(result.exitCode, 0, 'should allow tasks with approved design and test-plan');
      assertEqual(result.stdout, result.input, 'should passthrough stdin');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('blocks tasks.md for complex when test-plan not approved', () => {
    const tmp = createTempProject();
    try {
      const progressNoTp = COMPLEX_PROGRESS.replace('test-plan: approved', 'test-plan: draft');
      createPlanDir(tmp, 'P003-complex', progressNoTp);
      const tasksPath = path.join(tmp, 'docs', 'plans', 'P003-complex', 'tasks.md');
      const result = runHook(APPROVAL_SEQ_PATH, tasksPath, tmp);
      assertContains(result.stderr, '[Approval Sequence]', 'should warn about test-plan approval');
      assertContains(result.stderr, 'test-plan.md', 'message names previous document');
      assertEqual(result.exitCode, 2, 'should block tasks without test-plan approval');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('allows non-plan files without checking', () => {
    const tmp = createTempProject();
    try {
      const result = runHook(APPROVAL_SEQ_PATH, path.join(tmp, 'src', 'feature.js'), tmp);
      assertEqual(result.exitCode, 0, 'should allow non-plan files');
      assertEqual(result.stdout, result.input, 'should passthrough stdin');
    } finally {
      removeTempProject(tmp);
    }
  });
});

// ── progress-sync tests ────────────────────────────────────────────

describe('progress-sync: auto-update progress.md', suite => {
  suite.test('updates progress.md Task Stats after tasks.md edit', () => {
    const tmp = createTempProject();
    try {
      const tasksContent = `# Tasks: Test

## 1.0 Implement

### 1.1 Task A
- **Status**: ✅ completed
- **Depends on**: none

### 1.2 Task B
- **Status**: 🔄 in_progress
- **Depends on**: 1.1

### 1.3 Task C
- **Status**: ⏳ pending
- **Depends on**: 1.2
`;
      createPlanDir(tmp, 'P002-active', ACTIVE_PROGRESS, null, null, tasksContent);
      const tasksPath = path.join(tmp, 'docs', 'plans', 'P002-active', 'tasks.md');
      const result = runHook(PROGRESS_SYNC_PATH, tasksPath, tmp);
      assertEqual(result.exitCode, 0, 'progress-sync should exit 0');

      // Verify progress.md was updated
      const progressPath = path.join(tmp, 'docs', 'plans', 'P002-active', 'progress.md');
      const updated = fs.readFileSync(progressPath, 'utf8');
      assertContains(updated, 'total: 3', 'total updated');
      assertContains(updated, 'completed: 1', 'completed updated');
      assertContains(updated, 'in_progress: 1', 'in_progress updated');
      assertContains(updated, 'pending: 1', 'pending updated');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('updates Active Task to first in-progress task', () => {
    const tmp = createTempProject();
    try {
      const tasksContent = `# Tasks: Test

## 1.0 Implement

### 1.1 Task A
- **Status**: ✅ completed
- **Depends on**: none

### 1.2 Task B
- **Status**: 🔄 in_progress
- **Depends on**: 1.1

### 1.3 Task C
- **Status**: ⏳ pending
- **Depends on**: 1.2
`;
      createPlanDir(tmp, 'P002-active', ACTIVE_PROGRESS, null, null, tasksContent);
      const tasksPath = path.join(tmp, 'docs', 'plans', 'P002-active', 'tasks.md');
      runHook(PROGRESS_SYNC_PATH, tasksPath, tmp);

      const progressPath = path.join(tmp, 'docs', 'plans', 'P002-active', 'progress.md');
      const updated = fs.readFileSync(progressPath, 'utf8');
      assertContains(updated, '1.2 Task B', 'active task updated to first in-progress');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('skips non-tasks.md files', () => {
    const tmp = createTempProject();
    try {
      const result = runHook(PROGRESS_SYNC_PATH, path.join(tmp, 'src', 'feature.js'), tmp);
      assertEqual(result.exitCode, 0, 'should exit 0 for non-tasks files');
    } finally {
      removeTempProject(tmp);
    }
  });
});

// ── hooks.json registration ────────────────────────────────────────

describe('hooks.json: enforcement hooks registered', suite => {
  const hooksJson = JSON.parse(fs.readFileSync(path.join(projectRoot(), 'hooks', 'hooks.json'), 'utf8'));

  suite.test('plan-gate registered in PreToolUse', () => {
    const preHooks = hooksJson.hooks.PreToolUse;
    const entry = preHooks.find(h => h.description && h.description.toLowerCase().includes('plan gate'));
    assertOk(entry, 'plan-gate entry exists in PreToolUse');
    assertOk(entry.hooks[0].command.includes('plan-gate.js'), 'command references plan-gate.js');
    assertOk(!entry.hooks[0].async, 'plan-gate must not be async');
  });

  suite.test('approval-sequence registered in PreToolUse', () => {
    const preHooks = hooksJson.hooks.PreToolUse;
    const entry = preHooks.find(h => h.description && h.description.toLowerCase().includes('approval sequence'));
    assertOk(entry, 'approval-sequence entry exists in PreToolUse');
    assertOk(entry.hooks[0].command.includes('approval-sequence.js'), 'command references approval-sequence.js');
    assertOk(!entry.hooks[0].async, 'approval-sequence must not be async');
  });

  suite.test('progress-sync registered in PostToolUse', () => {
    const postHooks = hooksJson.hooks.PostToolUse;
    const entry = postHooks.find(h => h.description && h.description.toLowerCase().includes('progress sync'));
    assertOk(entry, 'progress-sync entry exists in PostToolUse');
    assertOk(entry.hooks[0].command.includes('progress-sync.js'), 'command references progress-sync.js');
    assertOk(entry.hooks[0].async, 'progress-sync must be async');
  });

  suite.test('approval-guard registered in PreToolUse', () => {
    const preHooks = hooksJson.hooks.PreToolUse;
    const entry = preHooks.find(h => h.description && h.description.toLowerCase().includes('approval guard'));
    assertOk(entry, 'approval-guard entry exists in PreToolUse');
    assertOk(entry.hooks[0].command.includes('approval-guard.js'), 'command references approval-guard.js');
    assertOk(!entry.hooks[0].async, 'approval-guard must not be async');
  });
});

// ── Run standalone ─────────────────────────────────────────────────
process.exit(printSummary());
