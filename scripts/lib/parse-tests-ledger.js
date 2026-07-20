/**
 * parse-tests-ledger — plan tests.md ledger parser for Dashboard Progress tab.
 * Pure functions. Supports template table + task-section variants (e.g. JuXu P100).
 */

'use strict';

const TASK_ID_RE = /^[A-Za-z]?\d+(?:[.\-][A-Za-z0-9]+)*$/;
const HEADING_TASK_RE = new RegExp(
  '^#{2,4}\\s+([A-Za-z]?\\d+(?:[.\\-][A-Za-z0-9]+)*)(?:\\s*[\\u2014\\-:·]\\s*|\\s+)(.+)$'
);

function emptyResult(extra) {
  return Object.assign({
    format: null,
    entries: [],
    panelCompatible: true,
  }, extra || {});
}

function splitPipeRow(line) {
  let s = String(line || '').trim();
  if (!s.startsWith('|')) return null;
  s = s.replace(/^\|/, '').replace(/\|$/, '');
  return s.split('|').map(function (c) { return c.trim(); });
}

function isSeparatorRow(cells) {
  if (!cells || !cells.length) return false;
  return cells.every(function (c) { return /^:?-+:?$/.test(c.replace(/\s/g, '')); });
}

function normalizeLedgerStatus(raw) {
  if (raw == null) return 'pending';
  const original = String(raw).trim();
  if (!original) return 'pending';
  const s = original.toLowerCase();
  if (/^✅/.test(original) || /\bpass\b/.test(s) || /\bgreen\b/.test(s) || s.indexOf('通过') >= 0) {
    return 'pass';
  }
  if (/\bfail\b/.test(s) || /\bred\b/.test(s) || s.indexOf('失败') >= 0) return 'fail';
  if (/\bwritten\b/.test(s) || s.indexOf('已写') >= 0) return 'written';
  if (/\bdropped\b/.test(s) || s.indexOf('废弃') >= 0) return 'dropped';
  if (/\bpending\b/.test(s) || s.indexOf('待') >= 0) return 'pending';
  return original;
}

/**
 * Parse standard ## Ledger pipe table (Req | Task | Behavior | Test | Command | Status).
 * @param {string} content
 * @returns {object|null}
 */
function parseStandardLedgerTable(content) {
  const lines = String(content).split(/\r?\n/);
  let inLedger = false;
  let headers = null;
  const entries = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^##\s+Ledger\b/i.test(line)) {
      inLedger = true;
      headers = null;
      continue;
    }
    if (inLedger && /^##\s+/.test(line)) break;
    if (!inLedger) continue;
    if (!line.startsWith('|')) continue;

    const cells = splitPipeRow(line);
    if (!cells) continue;
    if (isSeparatorRow(cells)) continue;

    if (!headers) {
      headers = cells.map(function (h) { return h.toLowerCase(); });
      continue;
    }

    const get = function (names) {
      for (let n = 0; n < names.length; n++) {
        const idx = headers.indexOf(names[n]);
        if (idx >= 0 && cells[idx] != null) return cells[idx];
      }
      return '';
    };

    const taskId = get(['task', '任务']);
    const entry = {
      taskId: taskId,
      taskName: '',
      req: get(['req', 'requirement', '需求']),
      behavior: get(['behavior', '行为', 'spec', '意图']),
      test: get(['test', '测试', '测试类']),
      command: get(['command', '命令', 'prove']),
      status: normalizeLedgerStatus(get(['status', '状态'])),
    };
    if (entry.taskId || entry.test || entry.behavior) entries.push(entry);
  }

  if (!entries.length) return null;
  return emptyResult({ format: 'table', entries: entries });
}

/**
 * Parse ### {taskId} sections with nested markdown tables (P100-style).
 * @param {string} content
 * @returns {object|null}
 */
function parseTaskSectionLedger(content) {
  const lines = String(content).split(/\r?\n/);
  const entries = [];
  let currentTaskId = null;
  let currentTaskName = '';
  let tableHeaders = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\r$/, '');
    const hm = line.match(HEADING_TASK_RE);
    if (hm && TASK_ID_RE.test(hm[1])) {
      currentTaskId = hm[1];
      currentTaskName = hm[2].trim();
      tableHeaders = null;
      continue;
    }

    if (!currentTaskId) continue;
    if (!line.trim().startsWith('|')) {
      if (tableHeaders && line.trim() === '') {
        // keep headers for multi-row tables; blank line alone ok
      } else if (tableHeaders && !line.trim().startsWith('|')) {
        tableHeaders = null;
      }
      continue;
    }

    const cells = splitPipeRow(line.trim());
    if (!cells) continue;
    if (isSeparatorRow(cells)) continue;

    if (!tableHeaders) {
      tableHeaders = cells.map(function (h) { return h.toLowerCase(); });
      continue;
    }

    const get = function (names) {
      for (let n = 0; n < names.length; n++) {
        for (let hi = 0; hi < tableHeaders.length; hi++) {
          if (tableHeaders[hi].indexOf(names[n]) >= 0 && cells[hi] != null) {
            return cells[hi];
          }
        }
      }
      return '';
    };

    entries.push({
      taskId: currentTaskId,
      taskName: currentTaskName,
      req: get(['uc', 'req', '需求']),
      behavior: get(['spec', '意图', 'behavior', '行为']),
      test: get(['测试类', 'test', '测试']),
      command: get(['prove', 'command', '命令']),
      status: normalizeLedgerStatus(get(['状态', 'status'])),
    });
  }

  if (!entries.length) return null;
  return emptyResult({ format: 'task-sections', entries: entries });
}

/**
 * @param {string} content - tests.md body
 * @returns {{ format: string|null, entries: object[], panelCompatible: boolean }}
 */
function parseTestsLedger(content) {
  if (content == null || !String(content).trim()) return emptyResult();

  const standard = parseStandardLedgerTable(content);
  if (standard) return standard;

  const sections = parseTaskSectionLedger(content);
  if (sections) return sections;

  // File exists but no parseable rows — still compatible; UI shows empty / raw note
  return emptyResult({ format: 'empty' });
}

/**
 * Group entries by taskId for Progress tab rendering.
 * @param {object[]} entries
 * @returns {{ taskId: string, taskName: string, entries: object[] }[]}
 */
function groupLedgerByTask(entries) {
  const order = [];
  const map = Object.create(null);
  const list = entries || [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const id = e.taskId || '(unscoped)';
    if (!map[id]) {
      map[id] = { taskId: id, taskName: e.taskName || '', entries: [] };
      order.push(id);
    }
    if (!map[id].taskName && e.taskName) map[id].taskName = e.taskName;
    map[id].entries.push(e);
  }
  return order.map(function (id) { return map[id]; });
}

module.exports = {
  parseTestsLedger: parseTestsLedger,
  groupLedgerByTask: groupLedgerByTask,
  normalizeLedgerStatus: normalizeLedgerStatus,
  emptyResult: emptyResult,
};
