/**
 * Spec: scripts/lib/roadmap-contract.js — roadmap positioning contract.
 */

'use strict';

const path = require('path');
const {
  describe, assertEqual, assertOk, assertContains, projectRoot, printSummary,
} = require('./helpers');

const {
  ACTIVE_STATUSES,
  MAX_ACTIVE_SUMMARY_CHARS,
  MAX_LEAD_BLOCKQUOTE_CHARS,
  MAX_RECENT_ENTRY_CHARS,
  extractActiveSection,
  parseActiveEntries,
  formatActiveEntry,
  validateRoadmap,
  normalizeSectionAliases,
} = require(path.join(projectRoot(), 'scripts', 'lib', 'roadmap-contract.js'));

describe('roadmap-contract: formatActiveEntry', (suite) => {
  suite.test('formats one-line bullet with status/priority/complexity', () => {
    const line = formatActiveEntry({
      id: 'P008',
      slug: 'pipeline-roles',
      title: 'Agent Teams v0',
      status: 'in_progress',
      priority: 'P2',
      complexity: 'm-feature',
      summary: 'PM + specialists',
    });
    assertContains(line, '- **[P008-pipeline-roles](plans/P008-pipeline-roles/)**', 'link');
    assertContains(line, '状态：`in_progress`', 'status');
    assertContains(line, 'Priority: P2', 'priority');
    assertContains(line, 'm-feature', 'complexity');
    assertOk(!line.includes('\n'), 'single line');
  });
});

describe('roadmap-contract: extractActiveSection', (suite) => {
  suite.test('finds ### 活跃工作 under 项目状态', () => {
    const md = [
      '## 项目状态',
      '',
      '### 活跃工作',
      '',
      '- **[P001-x](plans/P001-x/)** — hi。状态：`planning` | Priority: P1 | s-feature',
      '',
      '### Issues',
      '',
    ].join('\n');
    const sec = extractActiveSection(md);
    assertOk(sec && sec.body.indexOf('P001-x') >= 0, 'body has entry');
  });

  suite.test('aliases Active Plans heading', () => {
    const md = '## Active Plans\n\n- **[P002-y](plans/P002-y/)** — x。状态：`planning` | Priority: P2 | s-feature\n\n## Issues\n';
    const sec = extractActiveSection(md);
    assertOk(sec && sec.body.indexOf('P002-y') >= 0, 'Active Plans alias');
  });
});

describe('roadmap-contract: validateRoadmap', (suite) => {
  suite.test('ok for template-shaped short bullets', () => {
    const md = [
      '# Roadmap',
      '',
      '> 最后更新: 2026-07-19',
      '',
      '## 项目概况',
      '- **Name**: Demo',
      '',
      '## 项目状态',
      '',
      '### 活跃工作',
      '',
      '- **[P001-demo](plans/P001-demo/)** — short。状态：`in_progress` | Priority: P1 | s-feature',
      '',
      '### Issues',
      '',
      '### Recent Changes',
      '',
      '- **2026-07-19** plan start P001',
      '',
      '## 已完成',
      '',
      '## 搁置',
      '',
    ].join('\n');
    const r = validateRoadmap(md);
    assertEqual(r.ok, true, 'ok');
    assertEqual(r.violations.length, 0, 'no violations');
  });

  suite.test('rejects active section markdown table (JuXu-style)', () => {
    const md = [
      '## 项目状态',
      '',
      '### 活跃工作',
      '',
      '| 计划 | 状态 | 优先级 | 说明 |',
      '|------|------|--------|------|',
      '| P103 | accepted | P2 | long essay |',
      '',
      '### Issues',
      '',
      '### Recent Changes',
      '',
    ].join('\n');
    const r = validateRoadmap(md);
    assertEqual(r.ok, false, 'not ok');
    assertOk(r.violations.some((v) => /table|表/i.test(v)), 'table violation');
  });

  suite.test('rejects overlong active summary', () => {
    const long = '字'.repeat(MAX_ACTIVE_SUMMARY_CHARS + 5);
    const md = [
      '## 项目状态',
      '',
      '### 活跃工作',
      '',
      `- **[P001-x](plans/P001-x/)** — ${long}。状态：\`planning\` | Priority: P1 | s-feature`,
      '',
      '### Issues',
      '',
      '### Recent Changes',
      '',
    ].join('\n');
    const r = validateRoadmap(md);
    assertEqual(r.ok, false, 'not ok');
    assertOk(r.violations.some((v) => /80|摘要|summary/i.test(v)), 'length violation');
  });

  suite.test('rejects lead blockquote longer than cap', () => {
    const md = [
      '# X',
      '',
      '> ' + '前序:'.repeat(MAX_LEAD_BLOCKQUOTE_CHARS),
      '',
      '## 项目状态',
      '',
      '### 活跃工作',
      '',
      '### Issues',
      '',
      '### Recent Changes',
      '',
    ].join('\n');
    const r = validateRoadmap(md);
    assertEqual(r.ok, false, 'not ok');
    assertOk(r.violations.some((v) => /blockquote|文首/i.test(v)), 'bq violation');
  });

  suite.test('ACTIVE_STATUSES includes planning and on_hold', () => {
    assertOk(ACTIVE_STATUSES.indexOf('planning') >= 0, 'planning');
    assertOk(ACTIVE_STATUSES.indexOf('on_hold') >= 0, 'on_hold');
    assertOk(MAX_RECENT_ENTRY_CHARS >= 200, 'recent cap');
  });

  suite.test('parseActiveEntries reads plan ids', () => {
    const body = '- **[P007-task-pickup](plans/P007-task-pickup/)** — sync。状态：`completed` | Priority: P2 | s-feature\n';
    const entries = parseActiveEntries(body);
    assertEqual(entries.length, 1, 'one');
    assertEqual(entries[0].id, 'P007', 'id');
    assertEqual(entries[0].status, 'completed', 'status');
  });
});

describe('roadmap-contract: normalizeSectionAliases', (suite) => {
  suite.test('rewrites Active Plans and Project Overview', () => {
    const md = '# X\n\n## Project Overview\n\n## Active Plans\n\n- item\n\n## Completed\n\n## On Hold\n';
    const out = normalizeSectionAliases(md);
    assertContains(out, '## 项目概况', 'overview');
    assertContains(out, '### 活跃工作', 'active');
    assertContains(out, '## 已完成', 'done');
    assertContains(out, '## 搁置', 'hold');
    assertOk(!/## Active Plans/i.test(out), 'no Active Plans');
  });
});

process.exit(printSummary());
