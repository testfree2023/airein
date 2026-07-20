/**
 * tests-ledger-gate — pure completion gate for plan tests.md ledger.
 * Only Kind=implement tasks need a qualifying pass row when marking completed.
 */

'use strict';

const path = require('path');
const {
  parseTasksMarkdown,
  applyProgressTaskStatuses,
  extractCompletedIdsFromProgress,
} = require('./parse-tasks-panel');
const {
  parseTestsLedger,
  normalizeLedgerStatus,
} = require('./parse-tests-ledger');

/**
 * @param {string} filePath
 * @returns {'tasks'|'progress'|'tests'|null}
 */
function classifyPlanDoc(filePath) {
  if (!filePath) return null;
  const n = String(filePath).replace(/\\/g, '/').replace(/\/+/g, '/');
  if (!/\/docs\/plans\//i.test(n)) return null;
  if (/\/tests\.md$/i.test(n)) return 'tests';
  if (/\/tasks\.md$/i.test(n)) return 'tasks';
  if (/\/progress\.md$/i.test(n)) return 'progress';
  return null;
}

function nonEmpty(v) {
  return v != null && String(v).trim().length > 0;
}

/**
 * Qualifying ledger row for an implement task completion.
 * @param {object} entry
 * @param {string} taskId
 * @returns {boolean}
 */
function isQualifyingLedgerRow(entry, taskId) {
  if (!entry || entry.taskId !== taskId) return false;
  if (!nonEmpty(entry.behavior)) return false;
  if (!nonEmpty(entry.test)) return false;
  if (!nonEmpty(entry.command)) return false;
  return normalizeLedgerStatus(entry.status) === 'pass';
}

/**
 * @param {object} parsedTasks — parseTasksMarkdown result
 * @returns {Map<string, { id: string, kind: string|null, status: string }>}
 */
function indexTasksById(parsedTasks) {
  const map = Object.create(null);
  const stages = (parsedTasks && parsedTasks.tasks) || [];
  for (let si = 0; si < stages.length; si++) {
    const tasks = stages[si].tasks || [];
    for (let ti = 0; ti < tasks.length; ti++) {
      const t = tasks[ti];
      map[t.id] = { id: t.id, kind: t.kind || null, status: t.status || 'pending' };
    }
  }
  return map;
}

/**
 * Completed task ids from tasks.md parse (status === completed).
 * @param {object} parsedTasks
 * @returns {string[]}
 */
function completedIdsFromTasks(parsedTasks) {
  const ids = [];
  const stages = (parsedTasks && parsedTasks.tasks) || [];
  for (let si = 0; si < stages.length; si++) {
    const tasks = stages[si].tasks || [];
    for (let ti = 0; ti < tasks.length; ti++) {
      if (tasks[ti].status === 'completed') ids.push(tasks[ti].id);
    }
  }
  return ids;
}

/**
 * Completed Log ids from progress.md (known task ids only).
 * @param {string} progressContent
 * @param {object} knownIdSet — object map id → true
 * @returns {string[]}
 */
function setDiff(newer, older) {
  const oldSet = Object.create(null);
  for (let i = 0; i < older.length; i++) oldSet[older[i]] = true;
  return newer.filter(function (id) { return !oldSet[id]; });
}

/**
 * Evaluate completion gate.
 *
 * @param {object} opts
 * @param {boolean} opts.enabled
 * @param {'strict'|'advisory'} [opts.mode]
 * @param {string} opts.filePath
 * @param {string} opts.newContent — content after Write/Edit
 * @param {string|null} [opts.oldContent] — before Edit; null for Write
 * @param {string} opts.tasksMdContent — always required for kind lookup when gating
 * @param {string|null} opts.testsMdContent — null if missing
 * @returns {{ allow: boolean, advisory: boolean, violations: object[], message: string|null }}
 */
function evaluateTestsLedgerGate(opts) {
  const enabled = opts && opts.enabled === true;
  const mode = (opts && opts.mode) || 'strict';
  const advisory = mode === 'advisory';

  const emptyOk = { allow: true, advisory: false, violations: [], message: null };
  if (!enabled) return emptyOk;

  const kind = classifyPlanDoc(opts.filePath);
  if (kind === 'tests' || kind == null) return emptyOk;

  const tasksParsed = parseTasksMarkdown(opts.tasksMdContent || '');
  if (!tasksParsed || tasksParsed.unsupported || !tasksParsed.total) {
    // No parsable tasks → cannot enforce by Kind
    return emptyOk;
  }

  const index = indexTasksById(tasksParsed);
  const known = Object.create(null);
  Object.keys(index).forEach(function (id) { known[id] = true; });

  let newlyCompleted = [];
  const oldContent = opts.oldContent == null ? '' : String(opts.oldContent);
  const newContent = opts.newContent == null ? '' : String(opts.newContent);

  if (kind === 'tasks') {
    const oldParsed = parseTasksMarkdown(oldContent);
    const oldIds = completedIdsFromTasks(oldParsed);
    const newIds = completedIdsFromTasks(parseTasksMarkdown(newContent));
    newlyCompleted = setDiff(newIds, oldIds);
  } else if (kind === 'progress') {
    // Prefer Completed Log delta; also accept tasks Status overlay via applyProgress
    const oldLog = extractCompletedIdsFromProgress(oldContent, known);
    const newLog = extractCompletedIdsFromProgress(newContent, known);
    newlyCompleted = setDiff(newLog, oldLog);

    // If Active Task / log empty but overlay would mark completed via full re-parse
    if (newlyCompleted.length === 0) {
      const oldOverlay = applyProgressTaskStatuses(tasksParsed, oldContent);
      const newOverlay = applyProgressTaskStatuses(tasksParsed, newContent);
      newlyCompleted = setDiff(
        completedIdsFromTasks(newOverlay),
        completedIdsFromTasks(oldOverlay)
      );
    }
  }

  if (!newlyCompleted.length) return emptyOk;

  const ledgerEntries = (opts.testsMdContent == null || opts.testsMdContent === '')
    ? []
    : (parseTestsLedger(opts.testsMdContent).entries || []);

  const violations = [];
  for (let i = 0; i < newlyCompleted.length; i++) {
    const taskId = newlyCompleted[i];
    const meta = index[taskId];
    if (!meta || meta.kind !== 'implement') continue;

    const ok = ledgerEntries.some(function (e) {
      return isQualifyingLedgerRow(e, taskId);
    });
    if (!ok) {
      violations.push({
        taskId: taskId,
        kind: 'implement',
        reason: 'missing_qualifying_ledger_row',
      });
    }
  }

  if (!violations.length) return emptyOk;

  const ids = violations.map(function (v) { return v.taskId; }).join(', ');
  const message =
    '[tests-ledger-gate] Kind=implement 任务标 completed 前须有 tests.md 合格台账行' +
    '（Task=' + ids + '；Behavior/Test/Command 非空且 Status=pass）。\n' +
    '更新计划 tests.md 后再标记完成；或设 quality.json testsLedger.enabled=false 关闭门禁。';

  return {
    allow: advisory,
    advisory: advisory,
    violations: violations,
    message: message,
  };
}

module.exports = {
  classifyPlanDoc: classifyPlanDoc,
  isQualifyingLedgerRow: isQualifyingLedgerRow,
  indexTasksById: indexTasksById,
  completedIdsFromTasks: completedIdsFromTasks,
  evaluateTestsLedgerGate: evaluateTestsLedgerGate,
};
