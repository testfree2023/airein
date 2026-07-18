/**
 * Spec: scripts/lib/task-pickup.js — P007 UC-S2-01 / UC-S3-01
 */

'use strict';

const path = require('path');
const {
  describe, assertEqual, assertOk, projectRoot, printSummary,
} = require('./helpers');

const { parseTasksMarkdown } = require(path.join(
  projectRoot(), 'scripts', 'lib', 'parse-tasks-panel.js'
));
const pickup = require(path.join(projectRoot(), 'scripts', 'lib', 'task-pickup.js'));

const SAMPLE = `# Tasks: Demo

## 1.0 Implement — Core

### 1.1 Build parser
- **Status**: ✅ completed
- **Kind**: implement
- **Depends on**: none

### 1.2 Wire UI
- **Status**: ⏳ pending
- **Kind**: implement
- **Depends on**: 1.1

### 1.3 Blocked next
- **Status**: ⏳ pending
- **Kind**: implement
- **Depends on**: 1.2
- **Blocked**: user
`;

const SAMPLE_IN_PROGRESS = `# Tasks: Demo

## 1.0 Implement — Core

### 1.1 Build parser
- **Status**: ✅ completed
- **Depends on**: none

### 1.2 Wire UI
- **Status**: 🔄 in_progress
- **Depends on**: 1.1

### 1.3 Next
- **Status**: ⏳ pending
- **Depends on**: 1.2
`;

const SAMPLE_ALL_DONE = `# Tasks: Demo

## 1.0 Implement — Core

### 1.1 A
- **Status**: ✅ completed
- **Depends on**: none

### 1.2 B
- **Status**: ✅ completed
- **Depends on**: 1.1
`;

const SAMPLE_BLOCKED_DEPS = `# Tasks: Demo

## 1.0 Implement — Core

### 1.1 A
- **Status**: ⏳ pending
- **Depends on**: none

### 1.2 B
- **Status**: ⏳ pending
- **Depends on**: 1.1
`;

describe('task-pickup flatten + selectors', suite => {
  suite.test('findNextReady picks first pending with deps satisfied', () => {
    const parsed = parseTasksMarkdown(SAMPLE);
    const tasks = pickup.flattenTasks(parsed);
    const ready = pickup.findNextReady(tasks);
    assertOk(ready, 'has ready');
    assertEqual(ready.id, '1.2');
  });

  suite.test('findInProgress returns current', () => {
    const parsed = parseTasksMarkdown(SAMPLE_IN_PROGRESS);
    assertEqual(parsed.unsupported, false, 'fixture panel-compatible');
    const tasks = pickup.flattenTasks(parsed);
    assertEqual(tasks.length, 3, 'three tasks');
    assertEqual(tasks[1].status, 'in_progress', '1.2 status');
    const cur = pickup.findInProgress(tasks);
    assertOk(cur, 'has in_progress');
    assertEqual(cur.id, '1.2');
    // 1.3 depends on in_progress 1.2 → not ready until 1.2 completed
    assertEqual(pickup.findNextReady(tasks), null, 'no ready while dep in_progress');
  });

  suite.test('isAllCompleted', () => {
    assertEqual(pickup.isAllCompleted(pickup.flattenTasks(parseTasksMarkdown(SAMPLE_ALL_DONE))), true);
    assertEqual(pickup.isAllCompleted(pickup.flattenTasks(parseTasksMarkdown(SAMPLE))), false);
  });
});

describe('task-pickup onBlocked', suite => {
  suite.test('default wait_user when deps block next after advance candidate missing', () => {
    // After 1.1 pending is ready; for blocked-only graph with no ready when 1.1 not done:
    // make 1.1 completed-less: only 1.2 pending depending on incomplete — wait
    const md = `# Tasks: X

## 1.0 Implement

### 1.1 Gate
- **Status**: ⏳ pending
- **Depends on**: none

### 1.2 Waiter
- **Status**: ⏳ pending
- **Depends on**: 1.1
- **Blocked**: user
`;
    // If somehow no ready (unsupported edge): empty pending ready with incomplete deps
    const tasks = pickup.flattenTasks(parseTasksMarkdown(md));
    // 1.1 is ready — not blocked case. Use graph where first pending depends on incomplete:
    const onlyDep = `# Tasks: X

## 1.0 Implement

### 1.1 Gate
- **Status**: 🔄 in_progress
- **Depends on**: none

### 1.2 Waiter
- **Status**: ⏳ pending
- **Depends on**: 1.1
- **Blocked**: user
`;
    const t2 = pickup.flattenTasks(parseTasksMarkdown(onlyDep));
    // no ready while 1.1 in progress — pick blocked candidate for hint
    const hint = pickup.buildBlockedHint(t2, { onBlocked: 'wait_user' });
    assertEqual(hint.policy, 'wait_user');
    assertOk(hint.message.indexOf('1.2') >= 0 || hint.message.indexOf('依赖') >= 0, 'mentions block');
  });

  suite.test('Blocked model-ok overrides global wait_user', () => {
    const md = `# Tasks: X

## 1.0 Implement

### 1.1 Gate
- **Status**: 🔄 in_progress
- **Depends on**: none

### 1.2 Waiter
- **Status**: ⏳ pending
- **Depends on**: 1.1
- **Blocked**: model-ok
`;
    const tasks = pickup.flattenTasks(parseTasksMarkdown(md));
    const hint = pickup.buildBlockedHint(tasks, { onBlocked: 'wait_user' });
    assertEqual(hint.policy, 'model_recommend');
  });
});

describe('task-pickup applyInProgress + planPickup', suite => {
  suite.test('applyInProgress sets Status and heading emoji', () => {
    const out = pickup.applyInProgress(SAMPLE, '1.2');
    assertOk(/### 1\.2[^\n]*\uD83D\uDD04/.test(out) || /### 1\.2[^\n]*🔄/.test(out), 'heading has in_progress emoji');
    assertOk(/\*\*Status\*\*[^\n]*in_progress/i.test(out), 'status field updated');
    // 1.1 stays completed
    assertOk(/### 1\.1[\s\S]*?\*\*Status\*\*[^\n]*completed/i.test(out), '1.1 still completed');
  });

  suite.test('planPickup advances when no in_progress', () => {
    const parsed = parseTasksMarkdown(SAMPLE);
    const plan = pickup.planPickup(parsed, { onBlocked: 'wait_user', markdown: SAMPLE });
    assertEqual(plan.action, 'advance');
    assertEqual(plan.task.id, '1.2');
    assertOk(plan.markdown, 'returns markdown');
    assertOk(plan.activeTaskPointer.indexOf('1.2') >= 0, 'short pointer');
  });

  suite.test('planPickup noop when already in_progress', () => {
    const parsed = parseTasksMarkdown(SAMPLE_IN_PROGRESS);
    const plan = pickup.planPickup(parsed, {
      onBlocked: 'wait_user',
      markdown: SAMPLE_IN_PROGRESS,
    });
    assertEqual(plan.action, 'noop');
    assertEqual(plan.task.id, '1.2');
    assertEqual(plan.markdown, null);
  });

  suite.test('planPickup done when all completed', () => {
    const plan = pickup.planPickup(parseTasksMarkdown(SAMPLE_ALL_DONE), {
      markdown: SAMPLE_ALL_DONE,
    });
    assertEqual(plan.action, 'done');
    assertEqual(plan.task, null);
  });

  suite.test('planPickup blocked when no ready and no in_progress', () => {
    // All pending but first has unmet deps — impossible if first has none.
    // Use: only task depends on missing id → never ready
    const md = `# Tasks: X

## 1.0 Implement

### 1.1 Orphan
- **Status**: ⏳ pending
- **Depends on**: 9.9
`;
    const plan = pickup.planPickup(parseTasksMarkdown(md), { markdown: md, onBlocked: 'wait_user' });
    assertEqual(plan.action, 'blocked');
    assertEqual(plan.markdown, null);
  });

  suite.test('never writes completed or blocked statuses via applyInProgress', () => {
    const out = pickup.applyInProgress(SAMPLE, '1.2');
    assertOk(!/\*\*Status\*\*[^\n]*\bblocked\b/i.test(out.split('### 1.2')[1].split('###')[0]));
    const body = out.split('### 1.2')[1].split('###')[0];
    assertOk(!/\*\*Status\*\*[^\n]*completed/i.test(body), 'target not completed');
  });
});

describe('task-pickup buildActiveTaskPointer', suite => {
  suite.test('short pointer', () => {
    const t = { id: '1.8', name: '🔄 Wire sync' };
    const p = pickup.buildActiveTaskPointer(t);
    assertEqual(p, '1.8 Wire sync');
  });
});

process.exit(printSummary());
