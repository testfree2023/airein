/**
 * Spec: scripts/lib/roadmap-gate.js
 */
'use strict';

const path = require('path');
const {
  describe, assertOk, assertEqual, assertContains, printSummary, projectRoot,
} = require('./helpers');

const { evaluateRoadmapGate } = require(path.join(projectRoot(), 'scripts', 'lib', 'roadmap-gate.js'));

const GOOD = `# 项目状态：Demo
> 最后更新：2026-07-18

## 项目概况
- **名称**：Demo

### 活跃工作
- **[P001-demo](plans/P001-demo/)** — 短摘要。状态：\`planning\` | Priority: P2 | s-feature

## Issues
## Recent Changes
## 已完成
## 搁置
`;

const BAD_TABLE = `# 项目状态：Demo
### 活跃工作
| Plan | Status |
|------|--------|
| P001 | active |

## Issues
`;

describe('roadmap-gate: evaluateRoadmapGate', suite => {
  suite.test('disabled always allows', () => {
    const r = evaluateRoadmapGate({
      enabled: false,
      mode: 'strict',
      filePath: '/x/docs/roadmap.md',
      newContent: BAD_TABLE,
    });
    assertEqual(r.allow, true, 'allow when disabled');
  });

  suite.test('non-roadmap path allows', () => {
    const r = evaluateRoadmapGate({
      enabled: true,
      mode: 'strict',
      filePath: '/x/docs/other.md',
      newContent: BAD_TABLE,
    });
    assertEqual(r.allow, true, 'allow non-roadmap');
  });

  suite.test('good content allows', () => {
    const r = evaluateRoadmapGate({
      enabled: true,
      mode: 'strict',
      filePath: 'docs/roadmap.md',
      newContent: GOOD,
    });
    assertEqual(r.allow, true, 'allow good');
    assertEqual(r.message, null, 'no message');
  });

  suite.test('advisory warns but allows', () => {
    const r = evaluateRoadmapGate({
      enabled: true,
      mode: 'advisory',
      filePath: '/proj/docs/roadmap.md',
      newContent: BAD_TABLE,
    });
    assertEqual(r.allow, true, 'advisory allow');
    assertEqual(r.advisory, true, 'advisory flag');
    assertOk(r.violations.length > 0, 'has violations');
    assertContains(r.message, 'roadmap-gate', 'message tag');
  });

  suite.test('strict blocks table active section', () => {
    const r = evaluateRoadmapGate({
      enabled: true,
      mode: 'strict',
      filePath: 'C:\\\\proj\\\\docs\\\\roadmap.md',
      newContent: BAD_TABLE,
    });
    assertEqual(r.allow, false, 'strict deny');
    assertOk(r.violations.some(v => /表/.test(v)), 'table violation');
  });
});

process.exit(printSummary());
