/**
 * Spec: scripts/lib/parse-tests-ledger.js — plan tests.md ledger for Progress tab.
 */

'use strict';

const path = require('path');
const {
  describe, assertEqual, assertOk, projectRoot, printSummary,
} = require('./helpers');

const {
  parseTestsLedger,
  groupLedgerByTask,
  normalizeLedgerStatus,
} = require(path.join(projectRoot(), 'scripts', 'lib', 'parse-tests-ledger.js'));

const STANDARD = `# Tests Ledger: Demo

## Ledger

| Req | Task | Behavior | Test | Command | Status |
|-----|------|----------|------|---------|--------|
| R1 | 1.1 | resolve template | test/test-foo.js | node test/test-foo.js | pass |
| R1 | 1.2 | wire UI | test/test-bar.js | node test/test-bar.js | pending |
`;

const P100_SHAPE = `# tests.md — P100

## 阶段 0

### 1.1 通道 SPI · UC-S1-01
| 测试类 | 模块 | Spec 意图（证伪点） | 状态 | Prove |
|--------|------|---------------------|------|------|
| \`ChannelRouterTest\` | pay-server | 路由 fail-fast | ✅ GREEN | \`mvn test -Dtest=ChannelRouterTest\` |

### 1.2 下一任务
| 测试类 | 模块 | Spec 意图（证伪点） | 状态 | Prove |
|--------|------|---------------------|------|------|
| \`FooTest\` | mall | 行为锁定 | pending | \`mvn test -Dtest=FooTest\` |
`;

describe('normalizeLedgerStatus', suite => {
  suite.test('maps pass/fail/pending', () => {
    assertEqual(normalizeLedgerStatus('pass'), 'pass');
    assertEqual(normalizeLedgerStatus('✅ GREEN'), 'pass');
    assertEqual(normalizeLedgerStatus('fail'), 'fail');
    assertEqual(normalizeLedgerStatus('pending'), 'pending');
  });
});

describe('parseTestsLedger standard table', suite => {
  suite.test('parses template Ledger table', () => {
    const r = parseTestsLedger(STANDARD);
    assertEqual(r.format, 'table');
    assertEqual(r.entries.length, 2);
    assertEqual(r.entries[0].taskId, '1.1');
    assertEqual(r.entries[0].test, 'test/test-foo.js');
    assertEqual(r.entries[0].status, 'pass');
    assertEqual(r.entries[1].status, 'pending');
  });
});

describe('parseTestsLedger task-sections (P100)', suite => {
  suite.test('parses ### task headings + nested tables', () => {
    const r = parseTestsLedger(P100_SHAPE);
    assertEqual(r.format, 'task-sections');
    assertEqual(r.entries.length, 2);
    assertEqual(r.entries[0].taskId, '1.1');
    assertOk(r.entries[0].test.indexOf('ChannelRouterTest') >= 0, 'test class');
    assertEqual(r.entries[0].status, 'pass');
    assertEqual(r.entries[1].taskId, '1.2');
  });
});

describe('groupLedgerByTask', suite => {
  suite.test('groups rows under task id', () => {
    const r = parseTestsLedger(STANDARD);
    const g = groupLedgerByTask(r.entries);
    assertEqual(g.length, 2);
    assertEqual(g[0].taskId, '1.1');
    assertEqual(g[0].entries.length, 1);
  });
});

describe('parseTestsLedger empty', suite => {
  suite.test('empty content', () => {
    const r = parseTestsLedger('');
    assertEqual(r.entries.length, 0);
  });
});

if (require.main === module) {
  const { failed } = printSummary();
  process.exit(failed > 0 ? 1 : 0);
}
