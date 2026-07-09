/**
 * Test: Iron Rules + Per-Task Review + Worktree Isolation (F2/F3/F4)
 *
 * Verifies:
 *   - rules/00-iron-rules.md has 铁律 section with 5 iron rules
 *   - rules/20-workflow.md 流程豁免 table has 不可豁免 column
 *   - quality-config DEFAULTS.flowControl has both switches, both false
 *   - tdd-workflow has Step 7.5 conditional review logic
 *   - rules/20-workflow.md has worktree isolation section referencing flowControl
 *
 * P017: 铁律/流程豁免/分支策略 content relocated CLAUDE.md → rules/00-iron-rules.md + rules/20-workflow.md.
 */

const fs = require('fs');
const path = require('path');
const {
  describe, assertOk, assertEqual, assertContains, projectRoot, readSkill
} = require('./helpers');

const { DEFAULTS } = require(path.join(projectRoot(), 'scripts', 'lib', 'quality-config'));
const RULES_00 = fs.readFileSync(path.join(projectRoot(), 'rules', '00-iron-rules.md'), 'utf8');
const RULES_20 = fs.readFileSync(path.join(projectRoot(), 'rules', '20-workflow.md'), 'utf8');

describe('Iron Rules in rules/00-iron-rules.md', suite => {
  suite.test('00-iron-rules.md has 铁律 section', () => {
    assertContains(RULES_00, '## 铁律', 'iron rules heading');
  });

  suite.test('铁律 1: no production code without tests', () => {
    assertContains(RULES_00, '禁止无测试的生产代码', 'iron rule 1');
  });

  suite.test('铁律 2: tests before implementation', () => {
    assertContains(RULES_00, '测试必须先于实现', 'iron rule 2');
  });

  suite.test('铁律 3: perTaskReview check', () => {
    assertContains(RULES_00, 'perTaskReview', 'iron rule 3 references perTaskReview');
  });

  suite.test('铁律 4: worktreeIsolation for refactoring', () => {
    assertContains(RULES_00, 'worktreeIsolation', 'iron rule 4 references worktreeIsolation');
  });

  suite.test('铁律 5: user conflict must be refused, not confirmed', () => {
    assertContains(RULES_00, '铁律不可通过用户确认豁免', 'iron rule 5 conflict resolution');
    assertContains(RULES_00, '拒绝执行', 'iron rule 5 requires refusal');
    assertContains(RULES_00, '多次重复要求', 'iron rule 5 covers repeat requests');
  });

  suite.test('流程豁免 table has 不可豁免 column', () => {
    assertContains(RULES_20, '不可豁免', 'column header');
    assertContains(RULES_20, '铁律 1', 'iron rule reference in table');
  });
});

describe('F3: Per-task review switch', suite => {
  suite.test('DEFAULTS.flowControl.perTaskReview exists and defaults to false', () => {
    assertOk('perTaskReview' in DEFAULTS.flowControl, 'perTaskReview key exists');
    assertEqual(DEFAULTS.flowControl.perTaskReview, false, 'defaults to false');
  });

  suite.test('tdd-workflow has Step 7.5 section', () => {
    const content = readSkill('tdd-workflow');
    if (!content) return;
    assertContains(content, '7.5', 'step 7.5 reference');
  });

  suite.test('Step 7.5 is conditional on quality.json', () => {
    const content = readSkill('tdd-workflow');
    if (!content) return;
    assertContains(content, 'perTaskReview', 'references perTaskReview config');
    assertContains(content, 'code-reviewer', 'mentions code-reviewer subagent');
  });

  suite.test('Step 7.5 mentions default behavior (disabled)', () => {
    const content = readSkill('tdd-workflow');
    if (!content) return;
    assertContains(content, 'Default', 'documents default behavior');
  });

  suite.test('writing-plans also references perTaskReview', () => {
    const content = readSkill('writing-plans');
    if (!content) return;
    assertContains(content, 'perTaskReview', 'plan handoff mentions perTaskReview');
  });
});

describe('F4: Worktree isolation switch', suite => {
  suite.test('DEFAULTS.flowControl.worktreeIsolation exists and defaults to false', () => {
    assertOk('worktreeIsolation' in DEFAULTS.flowControl, 'worktreeIsolation key exists');
    assertEqual(DEFAULTS.flowControl.worktreeIsolation, false, 'defaults to false');
  });

  suite.test('20-workflow.md has 分支策略 section', () => {
    assertContains(RULES_20, '分支策略', 'branch strategy heading');
    assertContains(RULES_20, 'worktreeIsolation', 'references worktreeIsolation');
  });

  suite.test('20-workflow.md has 流程豁免 section', () => {
    assertContains(RULES_20, '流程豁免', 'flow exemption heading');
  });

  suite.test('流程豁免 table covers key scenarios', () => {
    assertContains(RULES_20, 'hotfix', 'hotfix scenario');
    assertContains(RULES_20, 'POC', 'POC scenario');
  });
});

// ── Run standalone ─────────────────────────────────────────────────
const { printSummary } = require('./helpers');
process.exit(printSummary());
