/**
 * Spec: scripts/lib/tests-ledger-gate.js — implement completion requires tests.md pass row.
 */

'use strict';

const path = require('path');
const {
  describe, assertEqual, assertOk, assertContains, projectRoot,
} = require('./helpers');

const {
  classifyPlanDoc,
  isQualifyingLedgerRow,
  evaluateTestsLedgerGate,
} = require(path.join(projectRoot(), 'scripts', 'lib', 'tests-ledger-gate.js'));

const TASKS = `# Tasks: Demo

## 1.0 Implement — Core

### 1.1 Build parser
- **Status**: pending
- **Kind**: implement
- **Depends on**: none

### 1.2 Wire UI
- **Status**: pending
- **Kind**: implement
- **Depends on**: 1.1

## 2.0 Verify — Spec

### 2.1 Parser tests
- **Status**: pending
- **Kind**: verify
- **Depends on**: 1.1
`;

const LEDGER_PASS = `# Tests

## Ledger

| Req | Task | Behavior | Test | Command | Status |
|-----|------|----------|------|---------|--------|
| R1 | 1.1 | parse rows | test/test-a.js | node test/test-a.js | pass |
`;

const LEDGER_WRITTEN = `# Tests

## Ledger

| Req | Task | Behavior | Test | Command | Status |
|-----|------|----------|------|---------|--------|
| R1 | 1.1 | parse rows | test/test-a.js | node test/test-a.js | written |
`;

describe('classifyPlanDoc', suite => {
  suite.test('detects plan docs', () => {
    assertEqual(classifyPlanDoc('/p/docs/plans/P1/tasks.md'), 'tasks');
    assertEqual(classifyPlanDoc('C:/x/docs/plans/P1/progress.md'), 'progress');
    assertEqual(classifyPlanDoc('C:\\x\\docs\\plans\\P1\\progress.md'), 'progress');
    assertEqual(classifyPlanDoc('/p/docs/plans/P1/tests.md'), 'tests');
    assertEqual(classifyPlanDoc('/p/src/foo.js'), null);
  });
});

describe('isQualifyingLedgerRow', suite => {
  suite.test('requires behavior/test/command and pass', () => {
    assertOk(isQualifyingLedgerRow({
      taskId: '1.1', behavior: 'x', test: 't', command: 'c', status: 'pass',
    }, '1.1'));
    assertEqual(isQualifyingLedgerRow({
      taskId: '1.1', behavior: 'x', test: 't', command: 'c', status: 'written',
    }, '1.1'), false);
    assertEqual(isQualifyingLedgerRow({
      taskId: '1.1', behavior: '', test: 't', command: 'c', status: 'pass',
    }, '1.1'), false);
  });
});

describe('evaluateTestsLedgerGate', suite => {
  const planTasks = '/proj/docs/plans/P100/tasks.md';
  const planProgress = '/proj/docs/plans/P100/progress.md';

  suite.test('disabled always allows', () => {
    const r = evaluateTestsLedgerGate({
      enabled: false,
      filePath: planTasks,
      oldContent: TASKS,
      newContent: TASKS.replace(
        '### 1.1 Build parser\n- **Status**: pending',
        '### 1.1 Build parser\n- **Status**: completed'
      ),
      tasksMdContent: TASKS,
      testsMdContent: null,
    });
    assertEqual(r.allow, true);
    assertEqual(r.violations.length, 0);
  });

  suite.test('tests.md edits exempt', () => {
    const r = evaluateTestsLedgerGate({
      enabled: true,
      filePath: '/proj/docs/plans/P100/tests.md',
      newContent: LEDGER_PASS,
      tasksMdContent: TASKS,
      testsMdContent: LEDGER_PASS,
    });
    assertEqual(r.allow, true);
  });

  suite.test('implement completed without ledger blocks', () => {
    const newTasks = TASKS.replace(
      '### 1.1 Build parser\n- **Status**: pending',
      '### 1.1 Build parser\n- **Status**: completed'
    );
    const r = evaluateTestsLedgerGate({
      enabled: true,
      mode: 'strict',
      filePath: planTasks,
      oldContent: TASKS,
      newContent: newTasks,
      tasksMdContent: newTasks,
      testsMdContent: null,
    });
    assertEqual(r.allow, false);
    assertEqual(r.violations.length, 1);
    assertEqual(r.violations[0].taskId, '1.1');
    assertContains(r.message, '1.1');
  });

  suite.test('implement completed with written status still blocks', () => {
    const newTasks = TASKS.replace(
      '### 1.1 Build parser\n- **Status**: pending',
      '### 1.1 Build parser\n- **Status**: completed'
    );
    const r = evaluateTestsLedgerGate({
      enabled: true,
      filePath: planTasks,
      oldContent: TASKS,
      newContent: newTasks,
      tasksMdContent: newTasks,
      testsMdContent: LEDGER_WRITTEN,
    });
    assertEqual(r.allow, false);
  });

  suite.test('implement completed with pass row allows', () => {
    const newTasks = TASKS.replace(
      '### 1.1 Build parser\n- **Status**: pending',
      '### 1.1 Build parser\n- **Status**: completed'
    );
    const r = evaluateTestsLedgerGate({
      enabled: true,
      filePath: planTasks,
      oldContent: TASKS,
      newContent: newTasks,
      tasksMdContent: newTasks,
      testsMdContent: LEDGER_PASS,
    });
    assertEqual(r.allow, true);
    assertEqual(r.violations.length, 0);
  });

  suite.test('verify completed without ledger allows', () => {
    const newTasks = TASKS.replace(
      '### 2.1 Parser tests\n- **Status**: pending',
      '### 2.1 Parser tests\n- **Status**: completed'
    );
    const r = evaluateTestsLedgerGate({
      enabled: true,
      filePath: planTasks,
      oldContent: TASKS,
      newContent: newTasks,
      tasksMdContent: newTasks,
      testsMdContent: null,
    });
    assertEqual(r.allow, true);
  });

  suite.test('progress Completed Log for implement without ledger blocks', () => {
    const oldProg = '# Progress\n\n## Completed Log\n\n';
    const newProg = '# Progress\n\n## Completed Log\n\n- 1.1 Build parser done\n';
    const r = evaluateTestsLedgerGate({
      enabled: true,
      filePath: planProgress,
      oldContent: oldProg,
      newContent: newProg,
      tasksMdContent: TASKS,
      testsMdContent: null,
    });
    assertEqual(r.allow, false);
    assertEqual(r.violations[0].taskId, '1.1');
  });

  suite.test('advisory mode allows with message', () => {
    const newTasks = TASKS.replace(
      '### 1.1 Build parser\n- **Status**: pending',
      '### 1.1 Build parser\n- **Status**: completed'
    );
    const r = evaluateTestsLedgerGate({
      enabled: true,
      mode: 'advisory',
      filePath: planTasks,
      oldContent: TASKS,
      newContent: newTasks,
      tasksMdContent: newTasks,
      testsMdContent: null,
    });
    assertEqual(r.allow, true);
    assertEqual(r.advisory, true);
    assertOk(r.violations.length > 0);
  });
});
