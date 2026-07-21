/**
 * Spec: progress.md may mark a phase approved only after the phase doc
 * ## Status is already approved. For tasks, also require panel-contract format.
 * Gate runs at approval time only (not on every tasks.md edit).
 */

'use strict';

const path = require('path');
const {
  describe, assertEqual, assertOk, assertContains, projectRoot,
} = require('./helpers');

const {
  getDocStatus,
} = require(path.join(projectRoot(), 'scripts', 'lib', 'plan-parser.js'));

const {
  evaluateProgressApprovalGate,
} = require(path.join(projectRoot(), 'scripts', 'lib', 'progress-approval-gate.js'));

const PANEL_TASKS = `# Tasks: Demo

## 1.0 Implement

### 1.1 Build
- **Status**: pending
- **Kind**: implement
- **Depends on**: none

## Status: approved
`;

const PANEL_TASKS_DRAFT = PANEL_TASKS.replace('## Status: approved', '## Status: draft');

const LEGACY_TASKS = `# Tasks: Demo

- [ ] old item
- [x] done

## Status: approved
`;

const PROGRESS_BASE = `# Progress: Demo
status: in_progress

## Approval State
requirements: approved
design: approved
tasks: draft
`;

describe('getDocStatus', suite => {
  suite.test('reads ## Status footer', () => {
    assertEqual(getDocStatus('# X\n\n## Status: draft\n'), 'draft');
    assertEqual(getDocStatus('# X\n\n## Status: approved\n'), 'approved');
  });

  suite.test('missing Status → none', () => {
    assertEqual(getDocStatus('# X\n\nbody\n'), 'none');
  });
});

describe('evaluateProgressApprovalGate', suite => {
  const progressPath = '/proj/docs/plans/P001/progress.md';

  suite.test('disabled allows', () => {
    const r = evaluateProgressApprovalGate({
      enabled: false,
      filePath: progressPath,
      oldContent: PROGRESS_BASE,
      newContent: PROGRESS_BASE.replace('tasks: draft', 'tasks: approved'),
      phaseDocs: { tasks: PANEL_TASKS_DRAFT },
    });
    assertEqual(r.allow, true);
  });

  suite.test('non-progress file allows', () => {
    const r = evaluateProgressApprovalGate({
      enabled: true,
      filePath: '/proj/docs/plans/P001/tasks.md',
      newContent: 'x',
      phaseDocs: {},
    });
    assertEqual(r.allow, true);
  });

  suite.test('tasks→approved while Status still draft → block', () => {
    const r = evaluateProgressApprovalGate({
      enabled: true,
      mode: 'strict',
      filePath: progressPath,
      oldContent: PROGRESS_BASE,
      newContent: PROGRESS_BASE.replace('tasks: draft', 'tasks: approved'),
      phaseDocs: { tasks: PANEL_TASKS_DRAFT },
    });
    assertEqual(r.allow, false, 'blocked');
    assertOk(r.violations.some(v => v.reason === 'doc_status_not_approved'), 'status reason');
    assertContains(r.message, 'Status', 'mentions Status');
  });

  suite.test('tasks→approved with Status approved + panel format → allow', () => {
    const r = evaluateProgressApprovalGate({
      enabled: true,
      filePath: progressPath,
      oldContent: PROGRESS_BASE,
      newContent: PROGRESS_BASE.replace('tasks: draft', 'tasks: approved'),
      phaseDocs: { tasks: PANEL_TASKS },
    });
    assertEqual(r.allow, true);
    assertEqual(r.violations.length, 0);
  });

  suite.test('tasks→approved with Status approved but legacy format → block', () => {
    const r = evaluateProgressApprovalGate({
      enabled: true,
      mode: 'strict',
      filePath: progressPath,
      oldContent: PROGRESS_BASE,
      newContent: PROGRESS_BASE.replace('tasks: draft', 'tasks: approved'),
      phaseDocs: { tasks: LEGACY_TASKS },
    });
    assertEqual(r.allow, false);
    assertOk(r.violations.some(v => v.reason === 'tasks_format_invalid'), 'format reason');
    assertContains(r.message, '格式', 'mentions format');
  });

  suite.test('design→approved while design.md Status draft → block', () => {
    const oldP = PROGRESS_BASE.replace('design: approved', 'design: draft');
    const r = evaluateProgressApprovalGate({
      enabled: true,
      filePath: progressPath,
      oldContent: oldP,
      newContent: oldP.replace('design: draft', 'design: approved'),
      phaseDocs: { design: '# Design\n\n## Status: draft\n' },
    });
    assertEqual(r.allow, false);
    assertOk(r.violations.some(v => v.phase === 'design'), 'design phase');
  });

  suite.test('none→draft does not trigger gate', () => {
    const oldP = PROGRESS_BASE.replace('tasks: draft', 'tasks: none');
    const r = evaluateProgressApprovalGate({
      enabled: true,
      filePath: progressPath,
      oldContent: oldP,
      newContent: PROGRESS_BASE,
      phaseDocs: { tasks: PANEL_TASKS_DRAFT },
    });
    assertEqual(r.allow, true);
  });
});
