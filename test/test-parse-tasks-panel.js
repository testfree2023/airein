/**
 * Spec: scripts/lib/parse-tasks-panel.js — panel contract (P006).
 */

'use strict';

const path = require('path');
const {
  describe, assertEqual, assertOk, projectRoot,
} = require('./helpers');

const {
  parseTasksMarkdown,
  normalizeStatus,
  parseDependsOn,
} = require(path.join(projectRoot(), 'scripts', 'lib', 'parse-tasks-panel.js'));

function assertArrEqual(actual, expected, msg) {
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), msg || 'arrays equal');
}

const CONTRACT_SAMPLE = `# Tasks: Demo

## 1.0 Implement — Core

### 1.1 Build parser
- **Status**: ⏳ pending
- **Kind**: implement
- **Depends on**: none

### 1.2 Wire UI
- **Status**: 🔄 in_progress
- **Kind**: implement
- **Depends on**: 1.1

## 2.0 Verify — Spec

### 2.1 Parser tests
- **Status**: ✅ completed
- **Kind**: verify
- **Depends on**: 1.1, 1.2
`;

describe('normalizeStatus', suite => {
  suite.test('maps decorated pending/in_progress/completed', () => {
    assertEqual(normalizeStatus('⏳ pending'), 'pending');
    assertEqual(normalizeStatus('🔄 in_progress'), 'in_progress');
    assertEqual(normalizeStatus('✅ completed'), 'completed');
  });

  suite.test('rejects unknown values', () => {
    assertEqual(normalizeStatus('blocked'), null);
    assertEqual(normalizeStatus(''), null);
  });
});

describe('parseDependsOn', suite => {
  suite.test('none and empty', () => {
    assertArrEqual(parseDependsOn('none'), []);
    assertArrEqual(parseDependsOn(''), []);
  });

  suite.test('task id list', () => {
    assertArrEqual(parseDependsOn('1.1'), ['1.1']);
    assertArrEqual(parseDependsOn('1.1, 1.2'), ['1.1', '1.2']);
  });

  suite.test('prose ignored', () => {
    assertArrEqual(parseDependsOn('after design is done'), []);
  });

  suite.test('parenthetical INV annotations do not yield A2/A3 ghosts', () => {
    assertArrEqual(
      parseDependsOn('1.3(A1/A2), 1.4(A1/A3), 1.5(A3/A5), 1.7(A4) · **Ledger**: done'),
      ['1.3', '1.4', '1.5', '1.7']
    );
  });

  suite.test('slash inside parens is not a task separator', () => {
    assertArrEqual(parseDependsOn('1.1(A1/A2), 1.2'), ['1.1', '1.2']);
  });
});

describe('parseTasksMarkdown panel contract OK', suite => {
  suite.test('order edges counts', () => {
    const r = parseTasksMarkdown(CONTRACT_SAMPLE);
    assertEqual(r.panelCompatible, true);
    assertEqual(r.unsupported, false);
    assertEqual(r.total, 3);
    assertEqual(r.pending, 1);
    assertEqual(r.inProgress, 1);
    assertEqual(r.completed, 1);
    assertEqual(r.tasks[0].tasks[1].status, 'in_progress');
    assertArrEqual(r.tasks[0].tasks[1].dependsOn, ['1.1']);
    assertArrEqual(r.tasks[1].tasks[0].dependsOn, ['1.1', '1.2']);
  });

  suite.test('empty compatible', () => {
    const r = parseTasksMarkdown('');
    assertEqual(r.panelCompatible, true);
    assertEqual(r.unsupported, false);
    assertEqual(r.total, 0);
  });
});

describe('parseTasksMarkdown nested #### tasks (P100 shape)', suite => {
  const NESTED = `# Tasks: Nested

## 1.0 Implement — phases

### 阶段 0 · group header (not a task)

#### 1.1 First
- **Status**: ✅ completed
- **Depends on**: none

### 阶段 1 · another group

#### 1.7 Outbox path
- **Status**: ⏳ pending
- **Depends on**: 1.8

#### 1.8 Handlers
- **Status**: 🔨 in_progress（slice done）
- **Depends on**: none
`;

  suite.test('parses #### N.M tasks; skips ### group headers', () => {
    const r = parseTasksMarkdown(NESTED);
    assertEqual(r.panelCompatible, true);
    assertEqual(r.unsupported, false);
    assertEqual(r.total, 3);
    assertEqual(r.completed, 1);
    assertEqual(r.inProgress, 1);
    assertEqual(r.pending, 1);
    const ids = r.tasks[0].tasks.map(function (t) { return t.id; });
    assertArrEqual(ids, ['1.1', '1.7', '1.8']);
    assertOk(ids.indexOf('T1') < 0, 'no synthetic T1 from group header');
  });
});

describe('parseTasksMarkdown legacy unsupported', suite => {
  suite.test('checkbox-only unsupported', () => {
    const r = parseTasksMarkdown('# Tasks\n\n- [ ] old item\n- [x] done item\n');
    assertEqual(r.unsupported, true);
    assertEqual(r.panelCompatible, false);
    assertOk(/老的任务模板暂不支持/.test(r.unsupportedMessage || ''), 'message');
    assertEqual(r.tasks.length, 0);
  });

  suite.test('missing Status unsupported', () => {
    const md = '## 1.0 Implement\n\n### 1.1 Do thing\n- **Kind**: implement\n- **Depends on**: none\n';
    const r = parseTasksMarkdown(md);
    assertEqual(r.unsupported, true);
    assertEqual(r.tasks.length, 0);
  });
});
