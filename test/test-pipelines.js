#!/usr/bin/env node
/**
 * Test: Pipeline System — 8 differentiated pipelines
 *
 * Covers:
 *   - approval-sequence.js enforces correct doc order for each pipeline
 *   - loadGlobalPipelines() reads templates/pipelines.json correctly
 *   - plan-parser getComplexity/getApprovalState with pipeline-aware fields
 *   - Legacy complexity mapping (simple → s-bugfix, medium → m-bugfix, complex → m-feature)
 *   - quality.json pipeline override (auto / fixed pipeline)
 *   - Grilling gate enforcement
 *   - Non-plan file passthrough
 *   - pipelines.json structure validation
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  describe, assertOk, assertEqual, assertContains,
  projectRoot, printSummary
} = require('./helpers');

const APPROVAL_SEQ_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'approval-sequence.js');
const QUALITY_CONFIG_PATH = path.join(projectRoot(), 'scripts', 'lib', 'quality-config.js');
const PLAN_PARSER_PATH = path.join(projectRoot(), 'scripts', 'lib', 'plan-parser.js');
const PIPELINES_JSON_PATH = path.join(projectRoot(), 'templates', 'pipelines.json');

// ── Helpers ────────────────────────────────────────────────────────

function runApprovalSequence(inputObj, cwd) {
  const input = JSON.stringify(inputObj);
  const result = spawnSync(process.execPath, [APPROVAL_SEQ_PATH], {
    input,
    cwd: cwd || projectRoot(),
    timeout: 10000,
    encoding: 'utf8',
  });
  return {
    exitCode: result.status === null ? 1 : result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * Create a temp project with a plan directory and progress.md.
 * IMPORTANT: Caller must call cleanup(dir) when done (inside a suite.test).
 */
function createPipelineProject(opts = {}) {
  const {
    complexity = 'm-feature',
    grilling = 'completed',
    approval = {},
    qualityOverrides = {},
    pipeline = 'auto',
  } = opts;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-test-'));
  fs.mkdirSync(path.join(dir, '.claude', 'config'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude', 'memory'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });

  // quality.json
  const quality = {
    planGate: { mode: 'strict' },
    testGuard: { mode: 'strict', enabled: true },
    planWorkflow: { pipeline },
    ...qualityOverrides,
  };
  fs.writeFileSync(path.join(dir, '.claude', 'config', 'quality.json'), JSON.stringify(quality));

  // Plan directory
  const planDir = path.join(dir, 'docs', 'plans', 'P001-test-plan');
  fs.mkdirSync(planDir, { recursive: true });

  // progress.md — build approval state section dynamically
  const allDocs = getAllDocTypes(complexity);
  const approvalLines = allDocs.map(doc => `${doc}: ${approval[doc] || 'none'}`).join('\n');

  const progressContent = [
    '# Progress: Test Plan',
    `updated: 2026-06-13`,
    `plan: P001-test-plan`,
    `complexity: ${complexity}`,
    `grilling: ${grilling}`,
    '',
    '## Task Stats',
    'total: 1',
    'completed: 0',
    'in_progress: 0',
    'pending: 1',
    '',
    '## Approval State',
    approvalLines,
    '',
    '## Active Task',
    'none',
    '',
    '## Blockers',
    '- none',
    '',
  ].join('\n');

  const progressPath = path.join(planDir, 'progress.md');
  fs.writeFileSync(progressPath, progressContent);

  return { dir, planDir, progressPath };
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function getAllDocTypes(pipelineName) {
  const raw = JSON.parse(fs.readFileSync(PIPELINES_JSON_PATH, 'utf8'));
  const def = raw.definitions[pipelineName];
  if (!def) return ['tasks'];
  return def.docs;
}

// ════════════════════════════════════════════════════════════════════
// 1. loadGlobalPipelines — unit tests
// ════════════════════════════════════════════════════════════════════

describe('loadGlobalPipelines: reads templates/pipelines.json', suite => {
  const { loadGlobalPipelines } = require(QUALITY_CONFIG_PATH);

  suite.test('returns all 8 pipelines', () => {
    const pipelines = loadGlobalPipelines();
    const keys = Object.keys(pipelines);
    assertEqual(keys.length, 8, 'should have 8 pipeline definitions');
  });

  suite.test('s-feature has [requirements, tasks]', () => {
    const pipelines = loadGlobalPipelines();
    assertEqual(JSON.stringify(pipelines['s-feature']), JSON.stringify(['requirements', 'tasks']),
      's-feature docs');
  });

  suite.test('s-bugfix has [tasks] only', () => {
    const pipelines = loadGlobalPipelines();
    assertEqual(JSON.stringify(pipelines['s-bugfix']), JSON.stringify(['tasks']),
      's-bugfix docs');
  });

  suite.test('m-feature has [requirements, design, test-plan, tasks]', () => {
    const pipelines = loadGlobalPipelines();
    assertEqual(JSON.stringify(pipelines['m-feature']), JSON.stringify(['requirements', 'design', 'test-plan', 'tasks']),
      'm-feature docs');
  });

  suite.test('m-bugfix has [requirements, tasks]', () => {
    const pipelines = loadGlobalPipelines();
    assertEqual(JSON.stringify(pipelines['m-bugfix']), JSON.stringify(['requirements', 'tasks']),
      'm-bugfix docs');
  });

  suite.test('m-urgent has [tasks] only', () => {
    const pipelines = loadGlobalPipelines();
    assertEqual(JSON.stringify(pipelines['m-urgent']), JSON.stringify(['tasks']),
      'm-urgent docs');
  });

  suite.test('l-feature has [requirements, design, test-plan, deployment, tasks]', () => {
    const pipelines = loadGlobalPipelines();
    assertEqual(
      JSON.stringify(pipelines['l-feature']),
      JSON.stringify(['requirements', 'design', 'test-plan', 'deployment', 'tasks']),
      'l-feature docs'
    );
  });

  suite.test('l-bugfix has [requirements, design, test-plan, tasks]', () => {
    const pipelines = loadGlobalPipelines();
    assertEqual(
      JSON.stringify(pipelines['l-bugfix']),
      JSON.stringify(['requirements', 'design', 'test-plan', 'tasks']),
      'l-bugfix docs'
    );
  });

  suite.test('hotfix has [tasks] only', () => {
    const pipelines = loadGlobalPipelines();
    assertEqual(JSON.stringify(pipelines['hotfix']), JSON.stringify(['tasks']),
      'hotfix docs');
  });
});

// ════════════════════════════════════════════════════════════════════
// 2. plan-parser: getComplexity with pipeline names
// ════════════════════════════════════════════════════════════════════

describe('plan-parser: getComplexity returns pipeline names', suite => {
  const { getComplexity } = require(PLAN_PARSER_PATH);

  const cases = [
    { value: 's-feature', expected: 's-feature' },
    { value: 's-bugfix', expected: 's-bugfix' },
    { value: 'm-feature', expected: 'm-feature' },
    { value: 'm-bugfix', expected: 'm-bugfix' },
    { value: 'm-urgent', expected: 'm-urgent' },
    { value: 'l-feature', expected: 'l-feature' },
    { value: 'l-bugfix', expected: 'l-bugfix' },
    { value: 'hotfix', expected: 'hotfix' },
  ];

  for (const c of cases) {
    suite.test(`complexity: ${c.value} → ${c.expected}`, () => {
      const content = `complexity: ${c.value}`;
      assertEqual(getComplexity(content), c.expected, `getComplexity for ${c.value}`);
    });
  }

  suite.test('missing complexity defaults to m-feature', () => {
    assertEqual(getComplexity('# empty'), 'm-feature', 'default is m-feature');
  });

  suite.test('empty string defaults to m-feature', () => {
    assertEqual(getComplexity(''), 'm-feature', 'empty content defaults to m-feature');
  });
});

// ════════════════════════════════════════════════════════════════════
// 3. plan-parser: getApprovalState with pipeline-aware fields
// ════════════════════════════════════════════════════════════════════

describe('plan-parser: getApprovalState with pipeline doc types', suite => {
  const { getApprovalState } = require(PLAN_PARSER_PATH);

  suite.test('parses ## Approval State section with all standard docs', () => {
    const content = [
      '# Progress',
      '## Approval State',
      'requirements: approved',
      'design: draft',
      'tasks: none',
    ].join('\n');
    const state = getApprovalState(content);
    assertEqual(state.requirements, 'approved', 'requirements state');
    assertEqual(state.design, 'draft', 'design state');
    assertEqual(state.tasks, 'none', 'tasks state');
  });

  suite.test('parses flat key-value format', () => {
    const content = 'requirements: approved\ndesign: none\ntasks: none';
    const state = getApprovalState(content);
    assertEqual(state.requirements, 'approved', 'flat requirements');
    assertEqual(state.design, 'none', 'flat design');
    assertEqual(state.tasks, 'none', 'flat tasks');
  });

  suite.test('parses pipeline-specific docs: test-plan, deployment', () => {
    const content = [
      '## Approval State',
      'requirements: approved',
      'design: approved',
      'test-plan: draft',
      'deployment: none',
      'tasks: none',
    ].join('\n');
    const state = getApprovalState(content);
    assertEqual(state['test-plan'], 'draft', 'test-plan state');
    assertEqual(state.deployment, 'none', 'deployment state');
  });

  suite.test('defaults all to none for empty content', () => {
    const state = getApprovalState('');
    assertEqual(state.requirements, 'none', 'default requirements');
    assertEqual(state.design, 'none', 'default design');
    assertEqual(state.tasks, 'none', 'default tasks');
  });
});

// ════════════════════════════════════════════════════════════════════
// 4. approval-sequence: pipeline enforcement for each type
//    Each test is self-contained (creates + cleans up its own project)
// ════════════════════════════════════════════════════════════════════

// --- s-feature: [requirements, tasks] ---

describe('approval-sequence: s-feature pipeline [requirements → tasks]', suite => {

  suite.test('allows requirements.md as first doc (grilling completed)', () => {
    const project = createPipelineProject({ complexity: 's-feature', approval: {} });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'requirements.md'), content: '# Req' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'requirements.md allowed as first doc');
    cleanup(project.dir);
  });

  suite.test('blocks tasks.md before requirements is approved', () => {
    const project = createPipelineProject({ complexity: 's-feature', approval: {} });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'tasks.md'), content: '# Tasks' }
    }, project.dir);
    assertEqual(result.exitCode, 2, 'tasks.md blocked before requirements approved');
    assertContains(result.stderr, 'requirements', 'error mentions requirements');
    cleanup(project.dir);
  });

  suite.test('allows tasks.md after requirements is approved', () => {
    const project = createPipelineProject({ complexity: 's-feature', approval: {} });
    const progress = fs.readFileSync(project.progressPath, 'utf8')
      .replace('requirements: none', 'requirements: approved');
    fs.writeFileSync(project.progressPath, progress);

    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'tasks.md'), content: '# Tasks' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'tasks.md allowed after requirements approved');
    cleanup(project.dir);
  });

  suite.test('allows design.md (outside pipeline) without restriction', () => {
    const project = createPipelineProject({ complexity: 's-feature', approval: {} });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'design.md'), content: '# Design' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'design.md not in s-feature pipeline, allowed freely');
    cleanup(project.dir);
  });
});

// --- s-bugfix: [tasks] ---

describe('approval-sequence: s-bugfix pipeline [tasks only]', suite => {

  suite.test('allows tasks.md directly (only doc in pipeline)', () => {
    const project = createPipelineProject({ complexity: 's-bugfix', approval: {} });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'tasks.md'), content: '# Tasks' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'tasks.md allowed directly');
    cleanup(project.dir);
  });

  suite.test('allows requirements.md freely (outside pipeline)', () => {
    const project = createPipelineProject({ complexity: 's-bugfix', approval: {} });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'requirements.md'), content: '# Req' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'requirements.md outside s-bugfix pipeline');
    cleanup(project.dir);
  });
});

// --- m-feature: [requirements, design, test-plan, tasks] ---

describe('approval-sequence: m-feature pipeline [requirements → design → test-plan → tasks]', suite => {

  suite.test('allows requirements.md as first doc', () => {
    const project = createPipelineProject({ complexity: 'm-feature', approval: {} });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'requirements.md'), content: '# Req' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'requirements.md allowed first');
    cleanup(project.dir);
  });

  suite.test('blocks design.md before requirements approved', () => {
    const project = createPipelineProject({ complexity: 'm-feature', approval: {} });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'design.md'), content: '# Design' }
    }, project.dir);
    assertEqual(result.exitCode, 2, 'design.md blocked before requirements');
    assertContains(result.stderr, 'requirements', 'error mentions requirements');
    cleanup(project.dir);
  });

  suite.test('allows design.md after requirements approved', () => {
    const project = createPipelineProject({
      complexity: 'm-feature',
      approval: { requirements: 'approved' },
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'design.md'), content: '# Design' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'design.md allowed after requirements');
    cleanup(project.dir);
  });

  suite.test('blocks test-plan.md before design approved', () => {
    const project = createPipelineProject({
      complexity: 'm-feature',
      approval: { requirements: 'approved' },
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'test-plan.md'), content: '# Test' }
    }, project.dir);
    assertEqual(result.exitCode, 2, 'test-plan.md blocked before design');
    assertContains(result.stderr, 'design', 'error mentions design');
    cleanup(project.dir);
  });

  suite.test('allows test-plan.md after design approved', () => {
    const project = createPipelineProject({
      complexity: 'm-feature',
      approval: { requirements: 'approved', design: 'approved' },
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'test-plan.md'), content: '# Test' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'test-plan.md allowed after design');
    cleanup(project.dir);
  });

  suite.test('blocks tasks.md before test-plan approved', () => {
    const project = createPipelineProject({
      complexity: 'm-feature',
      approval: { requirements: 'approved', design: 'approved' },
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'tasks.md'), content: '# Tasks' }
    }, project.dir);
    assertEqual(result.exitCode, 2, 'tasks.md blocked before test-plan');
    assertContains(result.stderr, 'test-plan', 'error mentions test-plan');
    cleanup(project.dir);
  });

  suite.test('allows tasks.md after test-plan approved', () => {
    const project = createPipelineProject({
      complexity: 'm-feature',
      approval: { requirements: 'approved', design: 'approved', 'test-plan': 'approved' },
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'tasks.md'), content: '# Tasks' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'tasks.md allowed after test-plan');
    cleanup(project.dir);
  });
});

// --- m-bugfix: [requirements, tasks] ---

describe('approval-sequence: m-bugfix pipeline [requirements → tasks]', suite => {

  suite.test('allows requirements.md as first doc', () => {
    const project = createPipelineProject({ complexity: 'm-bugfix', approval: {} });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'requirements.md'), content: '# Req' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'requirements.md allowed first');
    cleanup(project.dir);
  });

  suite.test('blocks tasks.md before requirements approved', () => {
    const project = createPipelineProject({ complexity: 'm-bugfix', approval: {} });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'tasks.md'), content: '# Tasks' }
    }, project.dir);
    assertEqual(result.exitCode, 2, 'tasks.md blocked');
    cleanup(project.dir);
  });

  suite.test('allows tasks.md after requirements approved', () => {
    const project = createPipelineProject({
      complexity: 'm-bugfix',
      approval: { requirements: 'approved' },
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'tasks.md'), content: '# Tasks' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'tasks.md allowed after requirements');
    cleanup(project.dir);
  });
});

// --- m-urgent: [tasks] ---

describe('approval-sequence: m-urgent pipeline [tasks only]', suite => {

  suite.test('allows tasks.md directly (urgent, no ceremony)', () => {
    const project = createPipelineProject({ complexity: 'm-urgent', approval: {} });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'tasks.md'), content: '# Tasks' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'tasks.md allowed directly for m-urgent');
    cleanup(project.dir);
  });

  suite.test('allows design.md freely (outside pipeline)', () => {
    const project = createPipelineProject({ complexity: 'm-urgent', approval: {} });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'design.md'), content: '# Design' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'design.md not in m-urgent pipeline');
    cleanup(project.dir);
  });
});

// --- l-feature: [requirements, design, test-plan, deployment, tasks] ---

describe('approval-sequence: l-feature pipeline [requirements → design → test-plan → deployment → tasks]', suite => {

  suite.test('allows deployment.md after test-plan approved', () => {
    const project = createPipelineProject({
      complexity: 'l-feature',
      approval: { requirements: 'approved', design: 'approved', 'test-plan': 'approved', deployment: 'none' },
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'deployment.md'), content: '# Deploy' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'deployment.md allowed after test-plan');
    cleanup(project.dir);
  });

  suite.test('blocks tasks.md before deployment approved', () => {
    const project = createPipelineProject({
      complexity: 'l-feature',
      approval: { requirements: 'approved', design: 'approved', 'test-plan': 'approved', deployment: 'none' },
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'tasks.md'), content: '# Tasks' }
    }, project.dir);
    assertEqual(result.exitCode, 2, 'tasks.md blocked before deployment');
    assertContains(result.stderr, 'deployment', 'error mentions deployment');
    cleanup(project.dir);
  });

  suite.test('allows tasks.md after all previous docs approved', () => {
    const project = createPipelineProject({
      complexity: 'l-feature',
      approval: { requirements: 'approved', design: 'approved', 'test-plan': 'approved', deployment: 'approved' },
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'tasks.md'), content: '# Tasks' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'tasks.md allowed after all 4 previous docs');
    cleanup(project.dir);
  });

  suite.test('blocks design.md when requirements not approved', () => {
    const project = createPipelineProject({ complexity: 'l-feature', approval: {} });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'design.md'), content: '# Design' }
    }, project.dir);
    assertEqual(result.exitCode, 2, 'l-feature blocks design before requirements');
    cleanup(project.dir);
  });

  suite.test('blocks test-plan.md before design approved', () => {
    const project = createPipelineProject({
      complexity: 'l-feature',
      approval: { requirements: 'approved' },
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'test-plan.md'), content: '# Test' }
    }, project.dir);
    assertEqual(result.exitCode, 2, 'l-feature blocks test-plan before design');
    assertContains(result.stderr, 'design', 'error mentions design');
    cleanup(project.dir);
  });
});

// --- l-bugfix: [requirements, design, test-plan, tasks] ---

describe('approval-sequence: l-bugfix pipeline [requirements → design → test-plan → tasks]', suite => {

  suite.test('allows test-plan.md after design approved', () => {
    const project = createPipelineProject({
      complexity: 'l-bugfix',
      approval: { requirements: 'approved', design: 'approved', 'test-plan': 'none' },
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'test-plan.md'), content: '# Test' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'test-plan.md allowed after design');
    cleanup(project.dir);
  });

  suite.test('blocks tasks.md before test-plan approved', () => {
    const project = createPipelineProject({
      complexity: 'l-bugfix',
      approval: { requirements: 'approved', design: 'approved', 'test-plan': 'none' },
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'tasks.md'), content: '# Tasks' }
    }, project.dir);
    assertEqual(result.exitCode, 2, 'tasks.md blocked before test-plan');
    assertContains(result.stderr, 'test-plan', 'error mentions test-plan');
    cleanup(project.dir);
  });

  suite.test('allows tasks.md after test-plan approved', () => {
    const project = createPipelineProject({
      complexity: 'l-bugfix',
      approval: { requirements: 'approved', design: 'approved', 'test-plan': 'approved' },
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'tasks.md'), content: '# Tasks' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'tasks.md allowed after test-plan');
    cleanup(project.dir);
  });

  suite.test('deployment.md not in l-bugfix pipeline, allowed freely', () => {
    const project = createPipelineProject({
      complexity: 'l-bugfix',
      approval: { requirements: 'approved', design: 'approved' },
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'deployment.md'), content: '# Deploy' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'deployment.md outside l-bugfix pipeline');
    cleanup(project.dir);
  });
});

// --- hotfix: [tasks] ---

describe('approval-sequence: hotfix pipeline [tasks only]', suite => {

  suite.test('allows tasks.md directly (hotfix skips ceremony)', () => {
    const project = createPipelineProject({ complexity: 'hotfix', approval: {} });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'tasks.md'), content: '# Tasks' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'tasks.md allowed directly for hotfix');
    cleanup(project.dir);
  });

  suite.test('allows requirements.md freely (outside pipeline)', () => {
    const project = createPipelineProject({ complexity: 'hotfix', approval: {} });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'requirements.md'), content: '# Req' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'requirements.md outside hotfix pipeline');
    cleanup(project.dir);
  });
});

// ════════════════════════════════════════════════════════════════════
// 5. Grilling gate — blocks first doc when grilling not completed
// ════════════════════════════════════════════════════════════════════

describe('approval-sequence: grilling gate', suite => {

  suite.test('blocks first doc when grilling: in_progress (m-feature)', () => {
    const project = createPipelineProject({
      complexity: 'm-feature',
      grilling: 'in_progress',
      approval: {},
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'requirements.md'), content: '# Req' }
    }, project.dir);
    assertEqual(result.exitCode, 2, 'blocked when grilling in_progress');
    assertContains(result.stderr, 'grilling', 'error mentions grilling');
    cleanup(project.dir);
  });

  suite.test('allows first doc when grilling: completed (m-feature)', () => {
    const project = createPipelineProject({
      complexity: 'm-feature',
      grilling: 'completed',
      approval: {},
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'requirements.md'), content: '# Req' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'allowed when grilling completed');
    cleanup(project.dir);
  });

  suite.test('grilling gate works for s-feature first doc', () => {
    const project = createPipelineProject({
      complexity: 's-feature',
      grilling: 'in_progress',
      approval: {},
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'requirements.md'), content: '# Req' }
    }, project.dir);
    assertEqual(result.exitCode, 2, 's-feature also blocks on grilling');
    cleanup(project.dir);
  });

  suite.test('grilling gate applies to hotfix tasks.md (docIndex 0)', () => {
    const project = createPipelineProject({
      complexity: 'hotfix',
      grilling: 'in_progress',
      approval: {},
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'tasks.md'), content: '# Tasks' }
    }, project.dir);
    assertEqual(result.exitCode, 2, 'even hotfix blocks tasks when grilling not done');
    assertContains(result.stderr, 'grilling', 'error mentions grilling');
    cleanup(project.dir);
  });
});

// ════════════════════════════════════════════════════════════════════
// 6. Legacy complexity mapping
// ════════════════════════════════════════════════════════════════════

describe('approval-sequence: legacy complexity mapping', suite => {

  suite.test('simple → s-bugfix: allows tasks.md directly', () => {
    const project = createPipelineProject({ complexity: 'simple', approval: {} });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'tasks.md'), content: '# Tasks' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'legacy simple allows tasks directly');
    cleanup(project.dir);
  });

  suite.test('medium → m-bugfix: blocks tasks before requirements', () => {
    const project = createPipelineProject({ complexity: 'medium', approval: {} });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'tasks.md'), content: '# Tasks' }
    }, project.dir);
    assertEqual(result.exitCode, 2, 'legacy medium blocks tasks before requirements');
    cleanup(project.dir);
  });

  suite.test('complex → m-feature: blocks tasks before design', () => {
    const project = createPipelineProject({
      complexity: 'complex',
      approval: { requirements: 'approved' },
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'tasks.md'), content: '# Tasks' }
    }, project.dir);
    assertEqual(result.exitCode, 2, 'legacy complex (m-feature) blocks tasks before design');
    cleanup(project.dir);
  });
});

// ════════════════════════════════════════════════════════════════════
// 7. quality.json pipeline override (non-auto)
// ════════════════════════════════════════════════════════════════════

describe('approval-sequence: quality.json pipeline override', suite => {

  suite.test('quality.json pipeline=l-feature overrides progress.md complexity', () => {
    const project = createPipelineProject({
      complexity: 's-bugfix',
      approval: {},
      pipeline: 'l-feature',
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'tasks.md'), content: '# Tasks' }
    }, project.dir);
    assertEqual(result.exitCode, 2, 'l-feature override blocks tasks when requirements not done');
    cleanup(project.dir);
  });

  suite.test('quality.json pipeline=hotfix overrides progress.md complexity', () => {
    const project = createPipelineProject({
      complexity: 'l-feature',
      approval: {},
      pipeline: 'hotfix',
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'tasks.md'), content: '# Tasks' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'hotfix override allows tasks directly');
    cleanup(project.dir);
  });

  suite.test('quality.json pipeline=auto falls back to progress.md complexity', () => {
    const project = createPipelineProject({
      complexity: 's-bugfix',
      approval: {},
      pipeline: 'auto',
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'tasks.md'), content: '# Tasks' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'auto resolves to s-bugfix, allows tasks directly');
    cleanup(project.dir);
  });
});

// ════════════════════════════════════════════════════════════════════
// 8. Non-plan files are never blocked
// ════════════════════════════════════════════════════════════════════

describe('approval-sequence: non-plan files pass through', suite => {

  suite.test('allows src/ files without restriction', () => {
    const project = createPipelineProject({ complexity: 'm-feature', approval: {} });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.dir, 'src', 'feature.ts'), content: 'export const x = 1;' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'src/ files not sequence-managed');
    cleanup(project.dir);
  });

  suite.test('allows docs/roadmap.md without restriction', () => {
    const project = createPipelineProject({ complexity: 'm-feature', approval: {} });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.dir, 'docs', 'roadmap.md'), content: '# Roadmap' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'roadmap.md not sequence-managed');
    cleanup(project.dir);
  });

  suite.test('allows random.md in plan dir without restriction', () => {
    const project = createPipelineProject({ complexity: 'm-feature', approval: {} });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'notes.md'), content: '# Notes' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'notes.md not a pipeline doc, allowed freely');
    cleanup(project.dir);
  });
});

// ════════════════════════════════════════════════════════════════════
// 9. pipelines.json structure validation
// ════════════════════════════════════════════════════════════════════

describe('pipelines.json: structure validation', suite => {
  const pipelinesJson = JSON.parse(fs.readFileSync(PIPELINES_JSON_PATH, 'utf8'));

  suite.test('has defaultComplexity field', () => {
    assertEqual(pipelinesJson.defaultComplexity, 'm-feature', 'default is m-feature');
  });

  suite.test('has definitions object', () => {
    assertOk(pipelinesJson.definitions, 'definitions exists');
    assertOk(typeof pipelinesJson.definitions === 'object', 'definitions is object');
  });

  const EXPECTED_PIPELINES = [
    's-feature', 's-bugfix', 'm-feature', 'm-bugfix', 'm-urgent',
    'l-feature', 'l-bugfix', 'hotfix',
  ];

  for (const name of EXPECTED_PIPELINES) {
    suite.test(`${name} definition exists and has valid structure`, () => {
      const def = pipelinesJson.definitions[name];
      assertOk(def, `${name} exists`);
      assertOk(def.label, `${name} has label`);
      assertOk(def.description, `${name} has description`);
      assertOk(Array.isArray(def.docs), `${name} docs is array`);
      assertOk(def.docs.length > 0, `${name} has at least one doc`);
      assertOk(def.docs.every(d => typeof d === 'string' && d.length > 0),
        `${name} all docs are non-empty strings`);
    });

    suite.test(`${name} ends with 'tasks' doc`, () => {
      const def = pipelinesJson.definitions[name];
      const lastDoc = def.docs[def.docs.length - 1];
      assertEqual(lastDoc, 'tasks', `${name} pipeline ends with tasks`);
    });
  }

  suite.test('duplicate doc lists count matches expectations', () => {
    const { loadGlobalPipelines } = require(QUALITY_CONFIG_PATH);
    const pipelines = loadGlobalPipelines();
    const signatures = new Set();
    let duplicates = 0;
    for (const docs of Object.values(pipelines)) {
      const sig = docs.join(',');
      if (signatures.has(sig)) {
        duplicates++;
      }
      signatures.add(sig);
    }
    // s-bugfix/m-urgent/hotfix share [tasks] (2 dup), s-feature/m-bugfix share [requirements,tasks] (1 dup),
    // m-feature/l-bugfix share [requirements,design,test-plan,tasks] (1 dup)
    assertEqual(duplicates, 4, `expected 4 duplicate doc lists, got ${duplicates}`);
  });
});

// ── Run ────────────────────────────────────────────────────────────
process.exit(printSummary());
