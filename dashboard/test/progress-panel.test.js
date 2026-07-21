/**
 * Spec: progress panel render helpers (P006 UC-S1-01).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  describe, assertEqual, assertOk, assertContains, projectRoot,
} = require('../../test/helpers');

const panel = require(path.join(projectRoot(), 'dashboard', 'public', 'progress-panel.js'));

describe('progress-panel helpers', suite => {
  suite.test('script is IIFE-wrapped (no top-level api/esc clash with index.html)', () => {
    const src = fs.readFileSync(
      path.join(projectRoot(), 'dashboard', 'public', 'progress-panel.js'),
      'utf8'
    );
    assertOk(/^\(function\s*\(/.test(src.trim()) || src.indexOf('(function (root)') >= 0, 'IIFE wrapper');
    assertOk(!/^const api\s*=/m.test(src), 'no top-level const api');
    assertOk(!/^function esc\s*\(/m.test(src), 'no top-level function esc');
  });

  suite.test('shouldShowTaskProgress: hide until tasks.md has nodes', () => {
    assertEqual(panel.shouldShowTaskProgress(null), false, 'null');
    assertEqual(panel.shouldShowTaskProgress({ hasTasksDoc: false, total: 3, tasks: [] }), false, 'progress fallback');
    assertEqual(panel.shouldShowTaskProgress({ hasTasksDoc: true, total: 0, tasks: [] }), false, 'empty tasks.md');
    assertEqual(panel.shouldShowTaskProgress({
      hasTasksDoc: true,
      unsupported: true,
      unsupportedMessage: 'legacy',
      tasks: [],
    }), true, 'unsupported still shows');
    assertEqual(panel.shouldShowTaskProgress({
      hasTasksDoc: true,
      total: 1,
      tasks: [{ num: 1, name: 'I', tasks: [{ id: '1.1', name: 'A', status: 'pending', dependsOn: [] }] }],
    }), true, 'real tasks');
  });

  suite.test('shouldShowTestsLedger: requires testsLedgerEnabled + tasks ready', () => {
    assertEqual(panel.shouldShowTestsLedger(null), false, 'null');
    assertEqual(panel.shouldShowTestsLedger({ hasTasksDoc: false, testsLedgerEnabled: true }), false, 'no tasks.md');
    assertEqual(panel.shouldShowTestsLedger({ hasTasksDoc: true, tasks: [], testsLedgerEnabled: true }), false, 'empty');
    assertEqual(panel.shouldShowTestsLedger({
      hasTasksDoc: true,
      testsLedgerEnabled: false,
      tasks: [{ num: 1, name: 'I', tasks: [{ id: '1.1', name: 'A', status: 'pending', dependsOn: [] }] }],
    }), false, 'opt-in off');
    assertEqual(panel.shouldShowTestsLedger({
      hasTasksDoc: true,
      testsLedgerEnabled: true,
      tasks: [{ num: 1, name: 'I', tasks: [{ id: '1.1', name: 'A', status: 'pending', dependsOn: [] }] }],
    }), true, 'opt-in on with tasks');
  });

  suite.test('unsupported message for legacy', () => {
    const html = panel.renderPanelBoard({
      unsupported: true,
      unsupportedMessage: '老的任务模板暂不支持',
      tasks: [],
      total: 0,
    }, function (k) { return k; });
    assertContains(html, '老的任务模板暂不支持', 'legacy message');
    assertOk(html.indexOf('progress-panel-node') < 0, 'no fake nodes');
  });

  suite.test('renders nodes and edges in document order', () => {
    const data = {
      unsupported: false,
      panelCompatible: true,
      total: 2,
      pending: 1,
      inProgress: 1,
      completed: 0,
      tasks: [{
        num: 1,
        name: 'Implement',
        tasks: [
          { id: '1.1', name: 'A', status: 'completed', dependsOn: [] },
          { id: '1.2', name: 'B', status: 'in_progress', dependsOn: ['1.1'] },
        ],
      }],
    };
    const html = panel.renderPanelBoard(data, function (k) { return k; });
    assertContains(html, 'progress-panel-node', 'has nodes');
    assertContains(html, 'data-task-id="1.1"', 'node 1.1');
    assertContains(html, 'data-task-id="1.2"', 'node 1.2');
    assertContains(html, 'data-edge="1.1->1.2"', 'dependency edge');
    assertContains(html, 'status-in_progress', 'status class');
    assertContains(html, 'is-current', 'current in_progress highlighted');
  });


  suite.test('buildDependencyMermaid emits flowchart from dependsOn', () => {
    const data = {
      tasks: [{
        num: 1,
        name: 'Implement',
        tasks: [
          { id: '1.1', name: 'A', status: 'completed', dependsOn: [] },
          { id: '1.2', name: 'B', status: 'in_progress', dependsOn: ['1.1'] },
          { id: '1.3', name: 'C', status: 'pending', dependsOn: ['1.1', '1.2'] },
        ],
      }],
    };
    const src = panel.buildDependencyMermaid(data);
    assertOk(src, 'has mermaid source');
    assertContains(src, 'flowchart', 'flowchart');
    assertContains(src, '-->', 'edge arrow');
    assertContains(src, '1.1', 'label keeps task id');
    assertContains(src, 'T1_1', 'safe node id');
    assertContains(src, 'T1_1', 'dep node');
    assertOk(/T1_1\s*-->\s*T1_2/.test(src) || src.indexOf('T1_1 --> T1_2') >= 0, '1.1->1.2 edge');
    assertOk(src.indexOf('T1_1 --> T1_3') >= 0 && src.indexOf('T1_2 --> T1_3') >= 0, 'multi-parent edges');
  });

  suite.test('buildDependencyMermaid returns null when no edges', () => {
    const src = panel.buildDependencyMermaid({
      tasks: [{ tasks: [{ id: '1.1', name: 'A', status: 'pending', dependsOn: [] }] }],
    });
    assertEqual(src, null, 'no edges → null');
  });

  suite.test('renderPanelBoard embeds mermaid DAG instead of plain edge list only', () => {
    const data = {
      unsupported: false,
      panelCompatible: true,
      total: 2,
      pending: 0,
      inProgress: 1,
      completed: 1,
      tasks: [{
        num: 1,
        name: 'Implement',
        tasks: [
          { id: '1.1', name: 'A', status: 'completed', dependsOn: [] },
          { id: '1.2', name: 'B', status: 'in_progress', dependsOn: ['1.1'] },
        ],
      }],
    };
    const html = panel.renderPanelBoard(data, function (k) { return k; });
    assertContains(html, 'progress-panel-mermaid', 'mermaid container');
    assertContains(html, 'flowchart', 'diagram source');
    assertContains(html, 'T1_1', 'safe id in html');
    assertContains(html, 'progress-panel-deps', 'deps section');
    assertOk(html.indexOf('data-edge="1.1->1.2"') >= 0, 'keeps data-edge for tests/a11y');
  });

  suite.test('does not invent orphan dep stubs for unknown ids', () => {
    const src = panel.buildDependencyMermaid({
      tasks: [{
        tasks: [
          { id: '2.10', name: 'INV', status: 'completed', dependsOn: ['1.3', 'A2', 'A3'] },
          { id: '1.3', name: 'X', status: 'completed', dependsOn: [] },
        ],
      }],
    });
    assertOk(src, 'has diagram');
    assertOk(src.indexOf('T1_3 --> T2_10') >= 0, 'known edge');
    assertOk(src.indexOf('TA2') < 0 && src.indexOf('A2') < 0, 'no A2 stub');
    assertOk(src.indexOf('TA3') < 0, 'no A3 stub');
  });

  suite.test('empty state when no tasks', () => {
    const html = panel.renderPanelBoard({
      unsupported: false,
      tasks: [],
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
    }, function (k) { return k === 'progress.noTasks' ? 'No tasks' : k; });
    assertContains(html, 'No tasks', 'empty');
  });

  suite.test('renderTestsLedger: not ready when no tests.md', () => {
    const html = panel.renderTestsLedger(
      { hasTestsDoc: false, entries: [] },
      function (k) { return k === 'progress.testsLedgerNotReady' ? 'No ledger yet' : k; },
      function (s) { return s; }
    );
    assertContains(html, 'No ledger yet', 'not ready');
  });

  suite.test('renderTestsLedger: empty when no rows', () => {
    const html = panel.renderTestsLedger(
      { hasTestsDoc: true, entries: [], groups: [] },
      function (k) { return k === 'progress.testsLedgerEmpty' ? 'Empty ledger' : k; },
      function (s) { return s; }
    );
    assertContains(html, 'Empty ledger', 'empty');
  });

  suite.test('renderTestsLedger: groups by task with status badge', () => {
    const html = panel.renderTestsLedger({
      hasTestsDoc: true,
      entries: [
        { taskId: '1.1', taskName: 'Write parser', behavior: 'parse rows', test: 'test-a', status: 'pass' },
        { taskId: '1.1', taskName: 'Write parser', behavior: 'empty file', test: 'test-b', status: 'pending' },
        { taskId: '1.2', taskName: 'Wire API', behavior: 'GET ledger', test: 'test-c', command: 'node t.js', status: 'written' },
      ],
      groups: [
        { taskId: '1.1', taskName: 'Write parser', entries: [
          { taskId: '1.1', behavior: 'parse rows', test: 'test-a', status: 'pass' },
          { taskId: '1.1', behavior: 'empty file', test: 'test-b', status: 'pending' },
        ]},
        { taskId: '1.2', taskName: 'Wire API', entries: [
          { taskId: '1.2', behavior: 'GET ledger', test: 'test-c', command: 'node t.js', status: 'written' },
        ]},
      ],
    }, function (k) { return k; }, function (s) { return String(s); });
    assertContains(html, 'progress-tests-ledger', 'root');
    assertContains(html, 'progress-ledger-task', 'per-task block');
    assertContains(html, '<table', 'table layout');
    assertContains(html, '1.1', 'task 1.1');
    assertContains(html, 'Write parser', 'task name');
    assertContains(html, 'parse rows', 'behavior');
    assertContains(html, 'badge-pass', 'pass badge');
    assertContains(html, 'node t.js', 'command');
    assertContains(html, 'progress.ledgerSummary', 'summary card');
  });

  suite.test('renderTestsLedger: strips backticks and enriches task name', () => {
    const html = panel.renderTestsLedger({
      hasTestsDoc: true,
      entries: [
        { taskId: '1.0a', behavior: 'save note', test: '`test/foo.js`', command: '`node test/foo.js`', status: 'pass' },
      ],
      groups: [
        { taskId: '1.0a', taskName: '', entries: [
          { taskId: '1.0a', behavior: 'save note', test: '`test/foo.js`', command: '`node test/foo.js`', status: 'pass' },
        ]},
      ],
    }, function (k) {
      if (k === 'progress.ledgerStatus.pass') return '通过';
      return k;
    }, function (s) { return String(s); }, {
      taskNameById: { '1.0a': 'Daily note CRUD' },
    });
    assertContains(html, '1.0a — Daily note CRUD', 'enriched title');
    assertContains(html, 'test/foo.js', 'stripped test path');
    assertContains(html, 'node test/foo.js', 'stripped command');
    assertOk(html.indexOf('`test/foo.js`') < 0, 'no raw backticks on test');
    assertContains(html, '通过', 'localized status');
  });
});
