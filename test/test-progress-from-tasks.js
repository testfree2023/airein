/**
 * Spec: scripts/lib/progress-from-tasks.js — P007 UC-S1-01 / UC-S2-01
 */

'use strict';

const path = require('path');
const {
  describe, assertEqual, assertOk, assertContains, projectRoot, printSummary,
} = require('./helpers');

const {
  syncFromTasksMarkdown,
  updateProgressMarkdown,
} = require(path.join(projectRoot(), 'scripts', 'lib', 'progress-from-tasks.js'));
const { DEFAULTS, deepMerge } = require(path.join(
  projectRoot(), 'scripts', 'lib', 'quality-config.js'
));

const PROGRESS = `# Progress: Demo
status: in_progress
updated: 2026-01-01
plan: P999-demo
complexity: s-feature
grilling: completed

## Task Stats
total: 0
completed: 0
in_progress: 0
pending: 0

## Approval State
requirements: approved
tasks: approved

## Active Task
some long prose that must be replaced

## Blockers
- none
`;

const TASKS_GAP = `# Tasks: Demo

## 1.0 Implement

### 1.1 Done
- **Status**: ✅ completed
- **Depends on**: none

### 1.2 Next
- **Status**: ⏳ pending
- **Depends on**: 1.1
`;

const TASKS_IP = `# Tasks: Demo

## 1.0 Implement

### 1.1 Done
- **Status**: ✅ completed
- **Depends on**: none

### 1.2 Work
- **Status**: 🔄 in_progress
- **Depends on**: 1.1

### 1.3 Later
- **Status**: ⏳ pending
- **Depends on**: 1.2
`;

describe('progress-from-tasks syncFromTasksMarkdown', suite => {
  suite.test('advances gap and syncs short Active Task + stats', () => {
    const r = syncFromTasksMarkdown(TASKS_GAP, PROGRESS, { onBlocked: 'wait_user' });
    assertEqual(r.unsupported, false);
    assertEqual(r.pickup.action, 'advance');
    assertOk(r.tasksMarkdown && r.tasksMarkdown !== TASKS_GAP, 'tasks rewritten');
    assertContains(r.tasksMarkdown, 'in_progress', 'marked in_progress');
    assertContains(r.progressMarkdown, 'total: 2', 'total');
    assertContains(r.progressMarkdown, 'in_progress: 1', 'ip count');
    assertContains(r.progressMarkdown, '## Active Task\n1.2', 'short pointer');
    assertOk(!/some long prose/.test(r.progressMarkdown), 'prose cleared');
  });

  suite.test('noop when in_progress keeps short pointer', () => {
    const r = syncFromTasksMarkdown(TASKS_IP, PROGRESS, { onBlocked: 'wait_user' });
    assertEqual(r.pickup.action, 'noop');
    assertEqual(r.tasksMarkdown, null);
    assertContains(r.progressMarkdown, 'total: 3');
    assertContains(r.progressMarkdown, '## Active Task\n1.2 Work');
  });

  suite.test('unsupported skips destructive rewrite', () => {
    const legacy = '# Tasks\n\n- [ ] old\n';
    const r = syncFromTasksMarkdown(legacy, PROGRESS, {});
    assertEqual(r.unsupported, true);
    assertEqual(r.tasksMarkdown, null);
    assertEqual(r.progressMarkdown, null);
  });
});

describe('progress-from-tasks updateProgressMarkdown', suite => {
  suite.test('writes stats and active', () => {
    const out = updateProgressMarkdown(PROGRESS, {
      total: 3,
      completed: 1,
      inProgress: 1,
      pending: 1,
      activeTaskPointer: '1.2 Wire',
    });
    assertContains(out, 'total: 3');
    assertContains(out, '## Active Task\n1.2 Wire');
  });
});

describe('quality-config taskPickup', suite => {
  suite.test('defaults wait_user', () => {
    assertEqual(DEFAULTS.taskPickup.onBlocked, 'wait_user');
  });

  suite.test('deepMerge overrides onBlocked', () => {
    const m = deepMerge(DEFAULTS, { taskPickup: { onBlocked: 'model_recommend' } });
    assertEqual(m.taskPickup.onBlocked, 'model_recommend');
  });
});

process.exit(printSummary());
