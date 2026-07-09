#!/usr/bin/env node
/**
 * Test: Compound Documents (LLD Sub-document Splitting)
 *
 * Verifies that the l-feature/l-bugfix pipeline's Compound Documents feature
 * works correctly:
 *
 *   1. SKILL.md has Compound Documents section with correct LLD splitting rules
 *   2. approval-sequence.js allows design-*.md sub-documents (not blocked)
 *   3. design.md template has Sub-documents section with LLD guidance
 *   4. approval-sequence.js allows requirements-*.md sub-documents too
 *   5. progress.md design: approved conceptually covers all design-*.md
 *   6. design-conventions/architecture generation driven by establishing vs referencing (not tier); module sub-docs l-only
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  describe, assertOk, assertEqual, assertContains, assertNotContains,
  projectRoot, readSkill, printSummary
} = require('./helpers');

const APPROVAL_SEQ_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'approval-sequence.js');
const PIPELINES_JSON_PATH = path.join(projectRoot(), 'templates', 'pipelines.json');
const DESIGN_TEMPLATE_PATH = path.join(projectRoot(), 'templates', 'docs', 'design.md');

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

function createPipelineProject(opts = {}) {
  const {
    complexity = 'l-feature',
    grilling = 'completed',
    approval = {},
    pipeline = 'auto',
  } = opts;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lld-test-'));
  fs.mkdirSync(path.join(dir, '.claude', 'config'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude', 'memory'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });

  const quality = {
    planGate: { mode: 'strict' },
    testGuard: { mode: 'strict', enabled: true },
    planWorkflow: { pipeline },
  };
  fs.writeFileSync(path.join(dir, '.claude', 'config', 'quality.json'), JSON.stringify(quality));

  const planDir = path.join(dir, 'docs', 'plans', 'P001-test-plan');
  fs.mkdirSync(planDir, { recursive: true });

  const raw = JSON.parse(fs.readFileSync(PIPELINES_JSON_PATH, 'utf8'));
  const def = raw.definitions[complexity];
  const allDocs = def ? def.docs : ['tasks'];
  const approvalLines = allDocs.map(doc => `${doc}: ${approval[doc] || 'none'}`).join('\n');

  const progressContent = [
    '# Progress: Test Plan',
    `updated: 2026-06-13`,
    `plan: P001-test-plan`,
    `complexity: ${complexity}`,
    `grilling: ${grilling}`,
    '',
    '## Task Stats',
    'total: 1', 'completed: 0', 'in_progress: 0', 'pending: 1',
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

// ════════════════════════════════════════════════════════════════════
// 1. SKILL.md: Compound Documents section
// ════════════════════════════════════════════════════════════════════

describe('SKILL.md: Compound Documents section', suite => {
  const content = readSkill('new-plan');

  suite.test('new-plan SKILL.md exists', () => {
    assertOk(content, 'new-plan/SKILL.md should exist');
  });

  if (!content) return;

  suite.test('has Compound Documents section heading', () => {
    assertContains(content, '## Compound Documents', 'Compound Documents heading');
  });

  suite.test('mentions design sub-document naming convention', () => {
    assertContains(content, 'design-', 'design- sub-document prefix');
    assertContains(content, '.md', '.md extension reference');
  });

  suite.test('lists typical LLD sub-documents', () => {
    assertContains(content, 'design-architecture', 'design-architecture.md');
    assertContains(content, 'design-conventions', 'design-conventions.md');
    assertContains(content, 'design-database', 'design-database.md');
    assertContains(content, 'design-security', 'design-security.md');
    assertContains(content, 'design-deployment', 'design-deployment.md');
    assertContains(content, 'design-domain-model', 'design-domain-model.md');
  });

  suite.test('states naming convention: {doc}-{subname}.md', () => {
    assertContains(content, '{doc}-{subname}', 'naming pattern');
  });

  suite.test('requires design.md to have Sub-documents section', () => {
    assertContains(content, '## Sub-documents', 'Sub-documents section requirement');
  });

  suite.test('states sub-documents share parent approval', () => {
    // The key rule: one design: approved covers all design-*.md
    assertContains(content, 'share the same approval', 'shared approval rule');
  });

  suite.test('limits compound docs to l-feature and l-bugfix', () => {
    assertContains(content, 'l-feature', 'l-feature mentioned');
    assertContains(content, 'l-bugfix', 'l-bugfix mentioned');
  });

  suite.test('design-conventions/architecture driven by establishing vs referencing, not tier', () => {
    // P016: generation of design-conventions.md + design-architecture.md is gated on
    // establishing vs referencing (project-level docs exist?), NOT on s/m/l complexity.
    assertContains(content, 'establishing vs referencing', 'establishing vs referencing rule');
    assertContains(content, 'NOT by complexity tier', 'tier-independent generation');
  });

  suite.test('module sub-documents remain l-feature/l-bugfix only', () => {
    assertContains(content, 'l-feature / l-bugfix only', 'module sub-docs gated to large projects');
  });

  suite.test('mentions requirements can also be split', () => {
    assertContains(content, 'requirements-{topic}', 'requirements sub-document pattern');
  });
});

// ════════════════════════════════════════════════════════════════════
// 2. design.md template: has Sub-documents section
// ════════════════════════════════════════════════════════════════════

describe('design.md template: LLD sub-document structure', suite => {
  const template = fs.readFileSync(DESIGN_TEMPLATE_PATH, 'utf8');

  suite.test('design.md template exists', () => {
    assertOk(template, 'design.md template should exist');
  });

  suite.test('has Sub-documents section', () => {
    assertContains(template, '## Sub-documents', 'Sub-documents heading in template');
  });

  suite.test('mentions splitting condition (3+ independent concerns)', () => {
    assertContains(template, '3+', '3+ concerns threshold');
  });

  suite.test('lists design-architecture.md example', () => {
    assertContains(template, 'design-architecture', 'architecture sub-document');
  });

  suite.test('lists design-database.md example', () => {
    assertContains(template, 'design-database', 'database sub-document');
  });

  suite.test('lists design-security.md example', () => {
    assertContains(template, 'design-security', 'security sub-document');
  });

  // P029: deployment 不再是 design 子文档，已升为独立核心文档（docs/deployment.md）
  // 故 design.md 模板不再列举 design-deployment.md 示例。

  suite.test('lists design-conventions.md example', () => {
    assertContains(template, 'design-conventions', 'conventions sub-document');
  });

  suite.test('lists design-domain-model.md example', () => {
    assertContains(template, 'design-domain-model', 'domain model sub-document');
  });

  suite.test('states shared approval rule', () => {
    assertContains(template, 'design: approved', 'shared approval in template');
  });

  suite.test('mentions naming convention design-{subname}.md', () => {
    assertContains(template, 'design-{subname}', 'naming pattern in template');
  });
});

// ════════════════════════════════════════════════════════════════════
// 3. approval-sequence: design-*.md sub-documents pass through (l-feature)
// ════════════════════════════════════════════════════════════════════

describe('approval-sequence: LLD sub-documents pass through for l-feature', suite => {

  // design.md (parent) must be in the pipeline and approved
  // design-architecture.md etc. are sub-documents that bypass sequence check
  // because their fileType ('design-architecture') doesn't match any pipeline doc

  const SUB_DOCS = [
    'design-architecture',
    'design-conventions',
    'design-database',
    'design-security',
    'design-deployment',
    'design-domain-model',
  ];

  for (const subDoc of SUB_DOCS) {
    suite.test(`${subDoc}.md allowed when design is not yet approved`, () => {
      const project = createPipelineProject({
        complexity: 'l-feature',
        approval: { requirements: 'approved' },
        // design: none (not yet approved)
      });
      const result = runApprovalSequence({
        tool_name: 'Write',
        tool_input: { file_path: path.join(project.planDir, `${subDoc}.md`), content: '# LLD' }
      }, project.dir);
      // Sub-documents pass through because their fileType doesn't match pipeline
      assertEqual(result.exitCode, 0, `${subDoc}.md should pass through (exit 0)`);
      cleanup(project.dir);
    });
  }

  suite.test('design.md itself is still blocked before requirements', () => {
    const project = createPipelineProject({
      complexity: 'l-feature',
      approval: {},
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'design.md'), content: '# HLD' }
    }, project.dir);
    // design.md is blocked because it IS in the pipeline
    assertEqual(result.exitCode, 2, 'design.md itself is blocked before requirements');
    cleanup(project.dir);
  });

  suite.test('design.md allowed after requirements approved', () => {
    const project = createPipelineProject({
      complexity: 'l-feature',
      approval: { requirements: 'approved' },
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'design.md'), content: '# HLD' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'design.md allowed after requirements');
    cleanup(project.dir);
  });
});

// ════════════════════════════════════════════════════════════════════
// 4. approval-sequence: requirements-*.md sub-documents pass through
// ════════════════════════════════════════════════════════════════════

describe('approval-sequence: requirements sub-documents pass through', suite => {

  suite.test('requirements-api.md allowed even before grilling', () => {
    // requirements-api.md fileType = 'requirements-api', not in pipeline → allow
    const project = createPipelineProject({
      complexity: 'l-feature',
      grilling: 'in_progress',
      approval: {},
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'requirements-api.md'), content: '# API Req' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'requirements-api.md passes through');
    cleanup(project.dir);
  });

  suite.test('requirements-performance.md allowed freely', () => {
    const project = createPipelineProject({
      complexity: 'l-feature',
      approval: {},
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'requirements-performance.md'), content: '# Perf' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'requirements-performance.md passes through');
    cleanup(project.dir);
  });

  suite.test('requirements.md itself still blocked by grilling gate', () => {
    const project = createPipelineProject({
      complexity: 'l-feature',
      grilling: 'in_progress',
      approval: {},
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'requirements.md'), content: '# Req' }
    }, project.dir);
    assertEqual(result.exitCode, 2, 'requirements.md blocked by grilling');
    cleanup(project.dir);
  });
});

// ════════════════════════════════════════════════════════════════════
// 5. approval-sequence: test-plan-*.md sub-documents pass through
// ════════════════════════════════════════════════════════════════════

describe('approval-sequence: test-plan sub-documents pass through', suite => {

  suite.test('test-plan-integration.md allowed before test-plan approved', () => {
    const project = createPipelineProject({
      complexity: 'l-feature',
      approval: { requirements: 'approved', design: 'approved' },
      // test-plan: none
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'test-plan-integration.md'), content: '# Integration' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'test-plan-integration.md passes through');
    cleanup(project.dir);
  });

  suite.test('test-plan.md itself still blocked before design approved', () => {
    const project = createPipelineProject({
      complexity: 'l-feature',
      approval: { requirements: 'approved' },
      // design: none
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'test-plan.md'), content: '# Test Plan' }
    }, project.dir);
    assertEqual(result.exitCode, 2, 'test-plan.md blocked before design');
    cleanup(project.dir);
  });
});

// ════════════════════════════════════════════════════════════════════
// 6. approval-sequence: l-bugfix also supports compound docs
// ════════════════════════════════════════════════════════════════════

describe('approval-sequence: l-bugfix compound documents', suite => {

  suite.test('design-architecture.md passes through for l-bugfix', () => {
    const project = createPipelineProject({
      complexity: 'l-bugfix',
      approval: { requirements: 'approved' },
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'design-architecture.md'), content: '# Arch' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'design-architecture.md passes through for l-bugfix');
    cleanup(project.dir);
  });

  suite.test('test-plan-regression.md passes through for l-bugfix', () => {
    const project = createPipelineProject({
      complexity: 'l-bugfix',
      approval: { requirements: 'approved', design: 'approved' },
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'test-plan-regression.md'), content: '# Regression' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'test-plan-regression.md passes through for l-bugfix');
    cleanup(project.dir);
  });
});

// ════════════════════════════════════════════════════════════════════
// 7. m/s pipelines: sub-documents also pass through (single file expected)
// ════════════════════════════════════════════════════════════════════

describe('approval-sequence: sub-documents pass through for s/m pipelines too', suite => {

  suite.test('design-architecture.md passes through for m-feature (single design expected)', () => {
    const project = createPipelineProject({
      complexity: 'm-feature',
      approval: { requirements: 'approved' },
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'design-architecture.md'), content: '# Arch' }
    }, project.dir);
    // Even though m-feature expects single design.md, sub-docs still pass through
    // (the hook doesn't enforce "no sub-docs" — that's a SKILL.md guideline)
    assertEqual(result.exitCode, 0, 'sub-doc passes through for m-feature');
    cleanup(project.dir);
  });

  suite.test('design-database.md passes through for s-feature (no design in pipeline)', () => {
    const project = createPipelineProject({
      complexity: 's-feature',
      approval: {},
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'design-database.md'), content: '# DB' }
    }, project.dir);
    // s-feature has [requirements, tasks] — design not in pipeline at all
    assertEqual(result.exitCode, 0, 'design sub-doc passes for s-feature (design not in pipeline)');
    cleanup(project.dir);
  });
});

// ════════════════════════════════════════════════════════════════════
// 8. Edge cases
// ════════════════════════════════════════════════════════════════════

describe('approval-sequence: compound document edge cases', suite => {

  suite.test('tasks-frontend.md passes through (tasks sub-document)', () => {
    const project = createPipelineProject({
      complexity: 'l-feature',
      approval: { requirements: 'approved', design: 'approved', 'test-plan': 'approved', deployment: 'approved' },
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'tasks-frontend.md'), content: '# FE Tasks' }
    }, project.dir);
    // tasks-frontend != 'tasks' in pipeline → passes through
    assertEqual(result.exitCode, 0, 'tasks-frontend.md passes through');
    cleanup(project.dir);
  });

  suite.test('deployment-kubernetes.md passes through (deployment sub-document)', () => {
    const project = createPipelineProject({
      complexity: 'l-feature',
      approval: { requirements: 'approved', design: 'approved', 'test-plan': 'approved' },
    });
    const result = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'deployment-kubernetes.md'), content: '# K8s' }
    }, project.dir);
    assertEqual(result.exitCode, 0, 'deployment-kubernetes.md passes through');
    cleanup(project.dir);
  });

  suite.test('design.md HLD with index content + sub-docs simultaneously', () => {
    // Write design.md (allowed) and design-architecture.md (allowed) together
    const project = createPipelineProject({
      complexity: 'l-feature',
      approval: { requirements: 'approved' },
    });

    // design.md is the 2nd doc in pipeline, should be allowed after requirements
    const r1 = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'design.md'), content: '# Design\n\n## Sub-documents\n- [Architecture](design-architecture.md)\n- [Database](design-database.md)' }
    }, project.dir);
    assertEqual(r1.exitCode, 0, 'design.md (HLD) allowed after requirements');

    // design-architecture.md is a sub-document, passes through
    const r2 = runApprovalSequence({
      tool_name: 'Write',
      tool_input: { file_path: path.join(project.planDir, 'design-architecture.md'), content: '# Architecture\n\n## Module Relationships\nIoT → Alert → User' }
    }, project.dir);
    assertEqual(r2.exitCode, 0, 'design-architecture.md (LLD) passes through');

    cleanup(project.dir);
  });
});

// ── Run ────────────────────────────────────────────────────────────
process.exit(printSummary());
