/**
 * Test: Plan System v3.0 — plan-parser.js + Hook adaptation
 *
 * Verifies:
 *   - plan-parser: findActivePlan, parseProgress, getApprovalState, isPlanCompleted, getComplexity
 *   - session-start reads progress.md from directory-format plans
 *   - pre-compact reads progress.md from directory-format plans
 *   - steering files exist after init
 *   - migrate-plans converts single-file to directory format
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  describe, assertOk, assertEqual, assertContains, assertNotContains,
  assertMatch, projectRoot, printSummary
} = require('./helpers');

const PLAN_PARSER_PATH = path.join(projectRoot(), 'scripts', 'lib', 'plan-parser.js');
const QUALITY_CONFIG_PATH = path.join(projectRoot(), 'scripts', 'lib', 'quality-config.js');
const APPROVAL_SEQUENCE_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'approval-sequence.js');

// ── Test fixtures ──────────────────────────────────────────────────

function createTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-test-'));
  const plansDir = path.join(dir, 'docs', 'plans');
  fs.mkdirSync(plansDir, { recursive: true });
  return dir;
}

function removeTempProject(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function createPlanDir(plansDir, name, progressContent) {
  const planDir = path.join(plansDir, name);
  fs.mkdirSync(planDir, { recursive: true });
  if (progressContent) {
    fs.writeFileSync(path.join(planDir, 'progress.md'), progressContent);
  }
  return planDir;
}

function runApprovalSequence(filePath, cwd) {
  const input = JSON.stringify({ tool_input: { file_path: filePath } });
  return spawnSync(process.execPath, [APPROVAL_SEQUENCE_PATH], {
    input,
    cwd,
    encoding: 'utf8'
  });
}

const SAMPLE_PROGRESS = `# Progress: Test Feature
updated: 2026-06-10
plan: P002-test-feature
complexity: medium

## Task Stats
total: 5
completed: 2
in_progress: 1
pending: 2

## Approval State
requirements: approved
design: none
tasks: draft

## Active Task
1.3 Implement auth middleware

## Blockers
- none
`;

const COMPLETED_PROGRESS = `# Progress: Done Feature
updated: 2026-06-09
plan: P001-done
complexity: simple
status: completed

## Task Stats
total: 3
completed: 3
in_progress: 0
pending: 0

## Approval State
requirements: none
design: none
tasks: approved
`;

const PENDING_ARCHIVE_PROGRESS = `# Progress: Pre-Archive Feature
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
total: 10
completed: 3
in_progress: 1
pending: 6

## Approval State
requirements: approved
design: approved
tasks: draft

## Active Task
2.1 Build API layer

## Blockers
- Waiting for external API credentials
`;

// ── plan-parser unit tests ─────────────────────────────────────────

describe('plan-parser: module loading', suite => {
  suite.test('plan-parser.js can be required without error', () => {
    const parser = require(PLAN_PARSER_PATH);
    assertOk(parser, 'module loads');
    assertOk(typeof parser.findActivePlan === 'function', 'findActivePlan exported');
    assertOk(typeof parser.parseProgress === 'function', 'parseProgress exported');
    assertOk(typeof parser.getApprovalState === 'function', 'getApprovalState exported');
    assertOk(typeof parser.isPlanCompleted === 'function', 'isPlanCompleted exported');
    assertOk(typeof parser.getComplexity === 'function', 'getComplexity exported');
    assertOk(typeof parser.getStatus === 'function', 'getStatus exported');
  });
});

describe('plan-parser: findActivePlan', suite => {
  const parser = require(PLAN_PARSER_PATH);

  suite.test('returns null when plans dir does not exist', () => {
    const tmp = createTempProject();
    try {
      const result = parser.findActivePlan(path.join(tmp, 'nonexistent'));
      assertEqual(result, null, 'should return null for missing dir');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('returns null when plans dir is empty', () => {
    const tmp = createTempProject();
    try {
      const result = parser.findActivePlan(tmp);
      assertEqual(result, null, 'should return null for empty plans dir');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('skips old-format .md files', () => {
    const tmp = createTempProject();
    try {
      const plansDir = path.join(tmp, 'docs', 'plans');
      fs.writeFileSync(path.join(plansDir, 'P001-old.md'), '# Old Plan\n');
      const result = parser.findActivePlan(tmp);
      assertEqual(result, null, 'should skip .md files without progress.md');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('finds directory with progress.md', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(path.join(tmp, 'docs', 'plans'), 'P002-active', SAMPLE_PROGRESS);
      const result = parser.findActivePlan(tmp);
      assertOk(result, 'should find active plan');
      assertContains(result.dir, 'P002-active', 'dir name contains plan ID');
      assertContains(result.progress, 'total: 5', 'progress content loaded');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('skips completed plans (status completed + all tasks done)', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(path.join(tmp, 'docs', 'plans'), 'P001-done', COMPLETED_PROGRESS);
      const result = parser.findActivePlan(tmp);
      assertEqual(result, null, 'should skip completed plans');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('keeps plan active when all tasks done but status in_progress (pre-archive)', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(path.join(tmp, 'docs', 'plans'), 'P099-pre-archive', PENDING_ARCHIVE_PROGRESS);
      const result = parser.findActivePlan(tmp);
      assertOk(result, 'pre-archive plan should stay active');
      assertContains(result.dir, 'P099-pre-archive', 'found pre-archive plan');
      assertEqual(parser.isPlanCompleted(result.progress), true, 'tasks are all done');
      assertEqual(parser.getStatus(result.progress), 'in_progress', 'status still in_progress');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('prefers incomplete plan over completed one', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(path.join(tmp, 'docs', 'plans'), 'P001-done', COMPLETED_PROGRESS);
      createPlanDir(path.join(tmp, 'docs', 'plans'), 'P002-active', SAMPLE_PROGRESS);
      const result = parser.findActivePlan(tmp);
      assertOk(result, 'should find active plan');
      assertContains(result.dir, 'P002-active', 'found the incomplete plan');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('skips directory without progress.md', () => {
    const tmp = createTempProject();
    try {
      createPlanDir(path.join(tmp, 'docs', 'plans'), 'P003-noprogress', null);
      const result = parser.findActivePlan(tmp);
      assertEqual(result, null, 'should skip dirs without progress.md');
    } finally {
      removeTempProject(tmp);
    }
  });
});

describe('plan-parser: parseProgress', suite => {
  const parser = require(PLAN_PARSER_PATH);

  suite.test('parses task stats correctly', () => {
    const result = parser.parseProgress(SAMPLE_PROGRESS);
    assertEqual(result.total, 5, 'total tasks');
    assertEqual(result.completed, 2, 'completed tasks');
    assertEqual(result.inProgress, 1, 'in_progress tasks');
    assertEqual(result.pending, 2, 'pending tasks');
  });

  suite.test('extracts active task', () => {
    const result = parser.parseProgress(SAMPLE_PROGRESS);
    assertContains(result.activeTask, '1.3 Implement auth middleware', 'active task');
  });

  suite.test('extracts blockers', () => {
    const result = parser.parseProgress(SAMPLE_PROGRESS);
    assertOk(Array.isArray(result.blockers), 'blockers is array');
    assertEqual(result.blockers.length, 1, 'one blocker entry');
    assertContains(result.blockers[0], 'none', 'blocker content');
  });

  suite.test('extracts blockers from complex plan', () => {
    const result = parser.parseProgress(COMPLEX_PROGRESS);
    assertEqual(result.blockers.length, 1, 'one blocker');
    assertContains(result.blockers[0], 'Waiting for external API credentials', 'blocker detail');
  });

  suite.test('returns null active task for completed plan', () => {
    const result = parser.parseProgress(COMPLETED_PROGRESS);
    assertOk(!result.activeTask || result.activeTask === 'none', 'no active task when completed');
  });

  suite.test('handles empty progress content', () => {
    const result = parser.parseProgress('');
    assertEqual(result.total, 0, 'total defaults to 0');
    assertEqual(result.completed, 0, 'completed defaults to 0');
  });
});

describe('plan-parser: getApprovalState', suite => {
  const parser = require(PLAN_PARSER_PATH);

  suite.test('parses medium plan approval state', () => {
    const result = parser.getApprovalState(SAMPLE_PROGRESS);
    assertEqual(result.requirements, 'approved', 'requirements approved');
    assertEqual(result.design, 'none', 'design none (medium plan)');
    assertEqual(result.tasks, 'draft', 'tasks draft');
  });

  suite.test('parses complex plan approval state', () => {
    const result = parser.getApprovalState(COMPLEX_PROGRESS);
    assertEqual(result.requirements, 'approved', 'requirements approved');
    assertEqual(result.design, 'approved', 'design approved');
    assertEqual(result.tasks, 'draft', 'tasks draft');
  });

  suite.test('parses simple plan (all none except tasks)', () => {
    const simpleProgress = `# Progress: Simple
complexity: simple

## Approval State
requirements: none
design: none
tasks: approved
`;
    const result = parser.getApprovalState(simpleProgress);
    assertEqual(result.requirements, 'none', 'requirements none');
    assertEqual(result.design, 'none', 'design none');
    assertEqual(result.tasks, 'approved', 'tasks approved');
  });

  suite.test('parses custom approval keys for configurable pipelines', () => {
    const customProgress = `# Progress: Custom
complexity: complex

## Approval State
requirements: approved
design: approved
tasks: approved
test-plan: draft
`;
    const result = parser.getApprovalState(customProgress);
    assertEqual(result['test-plan'], 'draft', 'custom test-plan state');
  });

  suite.test('parses markdown-list format (- key: value)', () => {
    // progress.md 用 "- requirements: draft" markdown 列表语法写审批状态
    // （P025-device-status-domain-split 实际格式）。getApprovalState 必须兼容。
    const listProgress = `# Progress: Device Status Domain Split
complexity: s-feature

## Approval State
- grilling: completed
- requirements: draft
- design: draft
- test-plan: draft
- deployment: draft
- tasks: draft
`;
    const result = parser.getApprovalState(listProgress);
    assertEqual(result.requirements, 'draft', 'requirements draft from list format');
    assertEqual(result.design, 'draft', 'design draft from list format');
    assertEqual(result.tasks, 'draft', 'tasks draft from list format');
  });
});

describe('plan-parser: setApprovalState', suite => {
  const parser = require(PLAN_PARSER_PATH);

  suite.test('setApprovalState is exported', () => {
    assertOk(typeof parser.setApprovalState === 'function', 'setApprovalState exported');
  });

  suite.test('approves plain format and preserves key', () => {
    const content = `# Progress: X

## Approval State
requirements: draft
design: none
tasks: none
`;
    const updated = parser.setApprovalState(content, 'requirements');
    const state = parser.getApprovalState(updated);
    assertEqual(state.requirements, 'approved', 'requirements now approved');
    assertEqual(state.design, 'none', 'design untouched');
    assertEqual(state.tasks, 'none', 'tasks untouched');
  });

  suite.test('approves markdown-list format and preserves "- " prefix', () => {
    // P025 实际格式："- requirements: draft" 列表前缀必须保留
    const content = `# Progress: P025

## Approval State
- grilling: completed
- requirements: draft
- design: draft
- tasks: draft
`;
    const updated = parser.setApprovalState(content, 'requirements');
    // 前缀保留
    assertContains(updated, '- requirements: approved', 'list prefix preserved');
    // 其他行不动
    assertContains(updated, '- design: draft', 'design untouched');
    // 解析回来正确
    const state = parser.getApprovalState(updated);
    assertEqual(state.requirements, 'approved', 'requirements approved after set');
    assertEqual(state.design, 'draft', 'design still draft');
  });

  suite.test('idempotent: setting approved twice stays approved', () => {
    const content = `# Progress: X

## Approval State
requirements: draft
`;
    const once = parser.setApprovalState(content, 'requirements');
    const twice = parser.setApprovalState(once, 'requirements');
    assertEqual(parser.getApprovalState(twice).requirements, 'approved', 'stays approved');
  });
});

describe('plan-parser: isPlanCompleted', suite => {
  const parser = require(PLAN_PARSER_PATH);

  suite.test('returns true when all tasks completed', () => {
    const result = parser.isPlanCompleted(COMPLETED_PROGRESS);
    assertEqual(result, true, 'completed plan detected');
  });

  suite.test('returns false when tasks remain', () => {
    const result = parser.isPlanCompleted(SAMPLE_PROGRESS);
    assertEqual(result, false, 'incomplete plan detected');
  });
});

describe('plan-parser: getComplexity', suite => {
  const parser = require(PLAN_PARSER_PATH);

  suite.test('detects simple complexity', () => {
    const result = parser.getComplexity('complexity: simple\n');
    assertEqual(result, 'simple', 'simple complexity');
  });

  suite.test('detects medium complexity', () => {
    const result = parser.getComplexity(SAMPLE_PROGRESS);
    assertEqual(result, 'medium', 'medium complexity');
  });

  suite.test('detects complex complexity', () => {
    const result = parser.getComplexity(COMPLEX_PROGRESS);
    assertEqual(result, 'complex', 'complex complexity');
  });

  suite.test('defaults to m-feature when missing', () => {
    const result = parser.getComplexity('no complexity line here');
    assertEqual(result, 'm-feature', 'defaults to m-feature');
  });
});

describe('plan-parser: getStatus', suite => {
  const parser = require(PLAN_PARSER_PATH);

  suite.test('detects in_progress status', () => {
    const result = parser.getStatus('status: in_progress\n');
    assertEqual(result, 'in_progress', 'in_progress status');
  });

  suite.test('detects completed status', () => {
    const result = parser.getStatus('status: completed\n');
    assertEqual(result, 'completed', 'completed status');
  });

  suite.test('detects archived status', () => {
    const result = parser.getStatus('status: archived\n');
    assertEqual(result, 'archived', 'archived status');
  });

  suite.test('defaults to in_progress when missing', () => {
    const result = parser.getStatus('no status line here');
    assertEqual(result, 'in_progress', 'defaults to in_progress');
  });

  suite.test('defaults to in_progress for null/empty', () => {
    assertEqual(parser.getStatus(null), 'in_progress', 'null defaults to in_progress');
    assertEqual(parser.getStatus(''), 'in_progress', 'empty defaults to in_progress');
  });

  suite.test('defaults to in_progress for unknown value', () => {
    const result = parser.getStatus('status: unknown_value\n');
    assertEqual(result, 'in_progress', 'unknown value defaults to in_progress');
  });

  suite.test('handles Windows line endings (\\r)', () => {
    const result = parser.getStatus('status: archived\r\n');
    assertEqual(result, 'archived', 'handles \\r in status value');
  });
});

// ── Indented format tests (regression: progress.md with leading whitespace) ──

const INDENTED_PROGRESS = `# Progress: E2E Test
  updated: 2026-06-11
  plan: P100-e2e-test
  complexity: medium

  ## Task Stats
  total: 3
  completed: 1
  in_progress: 1
  pending: 1

  ## Approval State
  requirements: draft
  design: none
  tasks: none

  ## Active Task
  1.2 Write integration tests

  ## Blockers
  - none
`;

describe('plan-parser: indented format (normalizeProgressFormat)', suite => {
  const parser = require(PLAN_PARSER_PATH);

  suite.test('normalizeProgressFormat is exported', () => {
    assertOk(typeof parser.normalizeProgressFormat === 'function', 'normalizeProgressFormat exported');
  });

  suite.test('normalizeProgressFormat strips leading whitespace', () => {
    const result = parser.normalizeProgressFormat(INDENTED_PROGRESS);
    // After normalization, no line should start with spaces (except list items)
    const lines = result.split('\n');
    for (const line of lines) {
      if (line.trim() === '') continue;       // blank lines ok
      if (/^- /.test(line)) continue;         // list items ok
      assertOk(!/^\s+/.test(line), `line should not have leading whitespace: "${line.substring(0, 40)}"`);
    }
  });

  suite.test('normalizeProgressFormat strips all leading whitespace including list items', () => {
    const input = '  - item1\n    - nested item\n';
    const result = parser.normalizeProgressFormat(input);
    assertContains(result, '- item1', 'list item at col 0');
    assertContains(result, '- nested item', 'nested item at col 0');
  });

  suite.test('parseProgress handles indented format', () => {
    const result = parser.parseProgress(INDENTED_PROGRESS);
    assertEqual(result.total, 3, 'total tasks from indented');
    assertEqual(result.completed, 1, 'completed from indented');
    assertEqual(result.inProgress, 1, 'in_progress from indented');
    assertEqual(result.pending, 1, 'pending from indented');
    assertEqual(result.activeTask, '1.2 Write integration tests', 'active task from indented');
  });

  suite.test('getApprovalState handles indented format', () => {
    const result = parser.getApprovalState(INDENTED_PROGRESS);
    assertEqual(result.requirements, 'draft', 'requirements from indented');
    assertEqual(result.design, 'none', 'design from indented');
    assertEqual(result.tasks, 'none', 'tasks from indented');
  });

  suite.test('getComplexity handles indented format', () => {
    const result = parser.getComplexity(INDENTED_PROGRESS);
    assertEqual(result, 'medium', 'complexity from indented');
  });

  suite.test('findActivePlan auto-normalizes and finds indented plan', () => {
    const dir = createTempProject();
    try {
      createPlanDir(path.join(dir, 'docs', 'plans'), 'P100-indented', INDENTED_PROGRESS);
      const result = parser.findActivePlan(dir);
      assertOk(result !== null, 'found active plan');
      assertContains(result.dir, 'P100-indented', 'correct plan dir');
      // After findActivePlan, the file should be normalized on disk
      const diskContent = fs.readFileSync(
        path.join(dir, 'docs', 'plans', 'P100-indented', 'progress.md'), 'utf8'
      );
      // No leading whitespace on key-value lines
      const lines = diskContent.split('\n');
      for (const line of lines) {
        if (line.trim() === '' || /^- /.test(line)) continue;
        assertOk(!/^\s+/.test(line), `disk file should be normalized: "${line.substring(0, 40)}"`);
      }
    } finally {
      removeTempProject(dir);
    }
  });
});

// ── Grilling state tests (Feature 1A) ────────────────────────────────

describe('plan-parser: getGrillingState', suite => {
  const parser = require(PLAN_PARSER_PATH);

  suite.test('getGrillingState is exported', () => {
    assertOk(typeof parser.getGrillingState === 'function', 'getGrillingState exported');
  });

  suite.test('returns "none" when grilling: none', () => {
    const content = '# Progress: Test\ngrilling: none\ncomplexity: simple\n';
    assertEqual(parser.getGrillingState(content), 'none', 'grilling none');
  });

  suite.test('returns "in_progress" when grilling: in_progress', () => {
    const content = '# Progress: Test\ngrilling: in_progress\ncomplexity: medium\n';
    assertEqual(parser.getGrillingState(content), 'in_progress', 'grilling in_progress');
  });

  suite.test('returns "completed" when grilling: completed', () => {
    const content = '# Progress: Test\ngrilling: completed\ncomplexity: complex\n';
    assertEqual(parser.getGrillingState(content), 'completed', 'grilling completed');
  });

  suite.test('defaults to "completed" when grilling field missing (backward compat)', () => {
    const content = '# Progress: Test\ncomplexity: simple\n';
    assertEqual(parser.getGrillingState(content), 'completed', 'defaults to completed for backward compat');
  });

  suite.test('defaults to "completed" for empty content', () => {
    assertEqual(parser.getGrillingState(''), 'completed', 'empty content defaults to completed');
  });

  suite.test('defaults to "completed" for null content', () => {
    assertEqual(parser.getGrillingState(null), 'completed', 'null defaults to completed');
  });
});

// ── Configurable pipeline tests (Feature 1D + 1F) ────────────────────

describe('quality-config: planWorkflow defaults', suite => {
  const { DEFAULTS } = require(path.join(projectRoot(), 'scripts', 'lib', 'quality-config'));

  suite.test('DEFAULTS has planWorkflow', () => {
    assertOk(DEFAULTS.planWorkflow, 'planWorkflow exists in DEFAULTS');
  });

  suite.test('planWorkflow has enforceGrilling default true', () => {
    assertEqual(DEFAULTS.planWorkflow.enforceGrilling, true, 'enforceGrilling defaults to true');
  });

  suite.test('planWorkflow does NOT contain pipelines (moved to global templates)', () => {
    assertOk(!DEFAULTS.planWorkflow.pipelines, 'pipelines removed from DEFAULTS (global)');
  });

  suite.test('loadGlobalPipelines returns new 8-pipeline structure', () => {
    const { loadGlobalPipelines } = require(QUALITY_CONFIG_PATH);
    const pipelines = loadGlobalPipelines();
    assertOk(pipelines, 'pipelines exists');
    assertOk(Array.isArray(pipelines['s-feature']), 's-feature is array');
    assertOk(Array.isArray(pipelines['m-feature']), 'm-feature is array');
    assertOk(Array.isArray(pipelines['l-feature']), 'l-feature is array');
    assertOk(Array.isArray(pipelines['hotfix']), 'hotfix is array');
  });

  suite.test('s-bugfix and hotfix are tasks-only', () => {
    const { loadGlobalPipelines } = require(QUALITY_CONFIG_PATH);
    const pipelines = loadGlobalPipelines();
    assertEqual(JSON.stringify(pipelines['s-bugfix']), JSON.stringify(['tasks']), 's-bugfix pipeline');
    assertEqual(JSON.stringify(pipelines['hotfix']), JSON.stringify(['tasks']), 'hotfix pipeline');
  });

  suite.test('m-feature is requirements, design, tasks', () => {
    const { loadGlobalPipelines } = require(QUALITY_CONFIG_PATH);
    const pipelines = loadGlobalPipelines();
    assertEqual(JSON.stringify(pipelines['m-feature']), JSON.stringify(['requirements', 'design', 'tasks']), 'm-feature pipeline');
  });

  suite.test('l-feature includes test-plan and deployment', () => {
    const { loadGlobalPipelines } = require(QUALITY_CONFIG_PATH);
    const pipelines = loadGlobalPipelines();
    assertOk(pipelines['l-feature'].indexOf('requirements') >= 0, 'l-feature has requirements');
    assertOk(pipelines['l-feature'].indexOf('design') >= 0, 'l-feature has design');
    assertOk(pipelines['l-feature'].indexOf('test-plan') >= 0, 'l-feature has test-plan');
    assertOk(pipelines['l-feature'].indexOf('deployment') >= 0, 'l-feature has deployment');
    assertOk(pipelines['l-feature'].indexOf('tasks') >= 0, 'l-feature has tasks');
  });
});

// ── approval-sequence: grilling gate logic (Feature 1C) ──────────────

describe('approval-sequence: grilling gate integration', suite => {
  const parser = require(PLAN_PARSER_PATH);

  suite.test('grilling in_progress is detected for medium plan', () => {
    const progressWithGrilling = `# Progress: Test
complexity: medium
grilling: in_progress

## Task Stats
total: 3
completed: 0
in_progress: 0
pending: 3

## Approval State
requirements: none
design: none
tasks: none

## Active Task
none

## Blockers
- none`;
    const grilling = parser.getGrillingState(progressWithGrilling);
    assertEqual(grilling, 'in_progress', 'grilling state is in_progress');
  });

  suite.test('grilling completed allows first doc in pipeline', () => {
    const progressCompleted = `# Progress: Test
complexity: medium
grilling: completed

## Task Stats
total: 3
completed: 0
in_progress: 0
pending: 3

## Approval State
requirements: none
design: none
tasks: none

## Active Task
none

## Blockers
- none`;
    const grilling = parser.getGrillingState(progressCompleted);
    assertEqual(grilling, 'completed', 'grilling state is completed');
  });

  suite.test('old plans without grilling field default to completed (not blocked)', () => {
    const oldProgress = `# Progress: Old Plan
complexity: medium

## Task Stats
total: 3
completed: 0
in_progress: 0
pending: 3

## Approval State
requirements: none
design: none
tasks: none

## Active Task
none

## Blockers
- none`;
    const grilling = parser.getGrillingState(oldProgress);
    assertEqual(grilling, 'completed', 'old plans default to completed');
  });
});

describe('approval-sequence hook: executable behavior', suite => {
  suite.test('blocks first document when grilling is in_progress', () => {
    const tmp = createTempProject();
    try {
      fs.mkdirSync(path.join(tmp, '.claude', 'config'), { recursive: true });
      const plansDir = path.join(tmp, 'docs', 'plans');
      const planDir = createPlanDir(plansDir, 'P010-grilling', `# Progress: Grilling
complexity: medium
grilling: in_progress

## Task Stats
total: 1
completed: 0
in_progress: 0
pending: 1

## Approval State
requirements: none
design: none
tasks: none
`);
      const result = runApprovalSequence(path.join(planDir, 'requirements.md'), tmp);
      assertEqual(result.status, 2, 'requirements.md blocked while grilling in_progress');
      assertContains(result.stderr, 'grilling: completed', 'message tells how to unblock');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('allows first document when grilling is completed', () => {
    const tmp = createTempProject();
    try {
      fs.mkdirSync(path.join(tmp, '.claude', 'config'), { recursive: true });
      const plansDir = path.join(tmp, 'docs', 'plans');
      const planDir = createPlanDir(plansDir, 'P011-grilling-done', `# Progress: Grilling Done
complexity: medium
grilling: completed

## Task Stats
total: 1
completed: 0
in_progress: 0
pending: 1

## Approval State
requirements: none
design: none
tasks: none
`);
      const result = runApprovalSequence(path.join(planDir, 'requirements.md'), tmp);
      assertEqual(result.status, 0, 'requirements.md allowed after grilling completed');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('blocks next document until previous pipeline document is approved', () => {
    const tmp = createTempProject();
    try {
      fs.mkdirSync(path.join(tmp, '.claude', 'config'), { recursive: true });
      const plansDir = path.join(tmp, 'docs', 'plans');
      const planDir = createPlanDir(plansDir, 'P012-pipeline', `# Progress: Pipeline
complexity: complex
grilling: completed

## Task Stats
total: 1
completed: 0
in_progress: 0
pending: 1

## Approval State
requirements: approved
design: draft
tasks: none
`);
      const result = runApprovalSequence(path.join(planDir, 'tasks.md'), tmp);
      assertEqual(result.status, 2, 'tasks.md blocked until design approved');
      assertContains(result.stderr, 'design.md', 'message names previous document');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('uses global pipeline (ignores project-level pipeline config)', () => {
    const tmp = createTempProject();
    try {
      fs.mkdirSync(path.join(tmp, '.claude', 'config'), { recursive: true });
      // Project config tries to customize pipelines — should be ignored
      fs.writeFileSync(path.join(tmp, '.claude', 'config', 'quality.json'), JSON.stringify({
        planWorkflow: {
          enforceGrilling: true,
          pipelines: {
            complex: ['requirements', 'tasks', 'test-plan']
          }
        }
      }, null, 2));
      const plansDir = path.join(tmp, 'docs', 'plans');
      const planDir = createPlanDir(plansDir, 'P013-global-pipeline', `# Progress: Global Pipeline
complexity: complex
grilling: completed

## Task Stats
total: 1
completed: 0
in_progress: 0
pending: 1

## Approval State
requirements: approved
tasks: draft
test-plan: none
`);
      // Global complex pipeline is: requirements, design, tasks
      // 'test-plan' is NOT in global pipeline → allowed (outside pipeline)
      const result = runApprovalSequence(path.join(planDir, 'test-plan.md'), tmp);
      assertEqual(result.status, 0, 'test-plan.md allowed — not in global pipeline');
    } finally {
      removeTempProject(tmp);
    }
  });
});

// ── Run standalone ─────────────────────────────────────────────────
process.exit(printSummary());
