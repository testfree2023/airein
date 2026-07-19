/**
 * Spec: progress.md may only claim task completion after tasks.md Status=completed.
 */

'use strict';

const path = require('path');
const {
  describe, assertEqual, assertOk, assertContains, projectRoot,
} = require('./helpers');

const {
  extractCompletedIdsFromProgress,
} = require(path.join(projectRoot(), 'scripts', 'lib', 'parse-tasks-panel.js'));

const {
  evaluateProgressCompletionGate,
} = require(path.join(projectRoot(), 'scripts', 'lib', 'progress-completion-gate.js'));

const TASKS = `# Tasks: Demo

## 1.0 Implement

### 1.1 Build
- **Status**: pending
- **Kind**: implement
- **Depends on**: none

### 1.2 Wire
- **Status**: completed
- **Kind**: implement
- **Depends on**: 1.1
`;

describe('extractCompletedIdsFromProgress', suite => {
  suite.test('Completed Log plain id', () => {
    const ids = extractCompletedIdsFromProgress(
      '## Completed Log\n\n- 1.1 done\n- 1.2 also\n',
      { '1.1': true, '1.2': true }
    );
    assertEqual(ids.sort().join(','), '1.1,1.2');
  });

  suite.test('## Completed with bold id (P001 shape)', () => {
    const ids = extractCompletedIdsFromProgress(
      '## Completed\n\n- **1.0a** {infra} — DONE\n- **1.0b** security\n',
      { '1.0a': true, '1.0b': true }
    );
    assertEqual(ids.sort().join(','), '1.0a,1.0b');
  });
});

describe('evaluateProgressCompletionGate', suite => {
  const progressPath = '/proj/docs/plans/P001/progress.md';

  suite.test('disabled allows', () => {
    const r = evaluateProgressCompletionGate({
      enabled: false,
      filePath: progressPath,
      oldContent: '## Completed Log\n\n',
      newContent: '## Completed Log\n\n- 1.1 done\n',
      tasksMdContent: TASKS,
    });
    assertEqual(r.allow, true);
  });

  suite.test('non-progress file allows', () => {
    const r = evaluateProgressCompletionGate({
      enabled: true,
      filePath: '/proj/docs/plans/P001/tasks.md',
      newContent: 'x',
      tasksMdContent: TASKS,
    });
    assertEqual(r.allow, true);
  });

  suite.test('claim complete in progress while tasks.md still pending → block', () => {
    const r = evaluateProgressCompletionGate({
      enabled: true,
      mode: 'strict',
      filePath: progressPath,
      oldContent: '# P\n\n## Completed Log\n\n',
      newContent: '# P\n\n## Completed Log\n\n- 1.1 Build done\n',
      tasksMdContent: TASKS,
    });
    assertEqual(r.allow, false);
    assertEqual(r.violations[0].taskId, '1.1');
    assertEqual(r.violations[0].tasksStatus, 'pending');
    assertContains(r.message, '1.1');
  });

  suite.test('claim complete when tasks.md already completed → allow', () => {
    const r = evaluateProgressCompletionGate({
      enabled: true,
      filePath: progressPath,
      oldContent: '# P\n\n## Completed Log\n\n',
      newContent: '# P\n\n## Completed Log\n\n- 1.2 Wire done\n',
      tasksMdContent: TASKS,
    });
    assertEqual(r.allow, true);
    assertEqual(r.violations.length, 0);
  });

  suite.test('P001 ## Completed bold id still gated', () => {
    const r = evaluateProgressCompletionGate({
      enabled: true,
      filePath: progressPath,
      oldContent: '# P\n\n## Completed\n\n',
      newContent: '# P\n\n## Completed\n\n- **1.1** {x} — DONE\n',
      tasksMdContent: TASKS,
    });
    assertEqual(r.allow, false);
    assertOk(r.violations.some((v) => v.taskId === '1.1'));
  });

  suite.test('advisory allows with violations', () => {
    const r = evaluateProgressCompletionGate({
      enabled: true,
      mode: 'advisory',
      filePath: progressPath,
      oldContent: '## Completed Log\n\n',
      newContent: '## Completed Log\n\n- 1.1 done\n',
      tasksMdContent: TASKS,
    });
    assertEqual(r.allow, true);
    assertEqual(r.advisory, true);
    assertOk(r.violations.length > 0);
  });

  suite.test('no new completed ids → allow', () => {
    const r = evaluateProgressCompletionGate({
      enabled: true,
      filePath: progressPath,
      oldContent: '## Completed Log\n\n- 1.2 done\n',
      newContent: '## Completed Log\n\n- 1.2 done\n\n## Notes\nx\n',
      tasksMdContent: TASKS,
    });
    assertEqual(r.allow, true);
  });
});
