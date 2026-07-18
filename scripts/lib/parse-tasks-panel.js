/**
 * parse-tasks-panel — tasks.md parser for Dashboard Progress panel (P006).
 * Pure functions. unsupported=true → do not render a fake progress graph.
 */

'use strict';

const UNSUPPORTED_MESSAGE = '老的任务模板暂不支持';

const TASK_ID_RE = /^[A-Za-z]?\d+(?:\.\d+)*$/;
const EM = '\u2014';
const STAGE_NUM_RE = new RegExp(
  '^##\\s+(?:Stage\\s+)?(\\d+)(?:\\.0)?\\s*[' + EM + '\\-:]?\\s*(.+)$', 'i'
);
const STAGE_ALPHA_RE = new RegExp(
  '^##\\s+Stage\\s+([A-Z0-9]+)\\s*[' + EM + '\\-:]\\s*(.+)$', 'i'
);
// Task headings must carry an explicit Task ID (### 1.1 / #### 1.7 / ### T1).
// Group headers without an ID must NOT become synthetic tasks.
const TASK_RE = new RegExp(
  '^#{3,4}\\s+([A-Za-z]?\\d+(?:\\.\\d+)*)(?:\\s*[' + EM + '\\-:·]\\s*|\\s+)(.+)$'
);
const STATUS_RE = new RegExp(
  '^-\\s+\\*\\*(?:Status|\\u72b6\\u6001)\\*\\*[\\s:\\uFF1A' + EM + '\\-]+(.+)$', 'i'
);
const DETAIL_RE = /^-\s+\*\*([^*]+)\*\*[\s:\uFF1A]+(.+)$/;

function normalizeStatus(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (/\bin_progress\b/.test(s) || s.indexOf('进行中') >= 0) return 'in_progress';
  if (/\bcompleted\b/.test(s) || /\bcomplete\b/.test(s) || /\bdone\b/.test(s)) return 'completed';
  if (s.indexOf('已完成') >= 0 || (s.indexOf('完成') >= 0 && s.indexOf('未完成') < 0)) return 'completed';
  if (/\bpending\b/.test(s) || s.indexOf('待处理') >= 0) return 'pending';
  if (s.indexOf('\u2705') >= 0) return 'completed';
  if (s.indexOf('\uD83D\uDD04') >= 0) return 'in_progress';
  if (s.indexOf('\u23F3') >= 0) return 'pending';
  return null;
}

function parseDependsOn(raw) {
  if (raw == null) return [];
  let s = String(raw).trim();
  if (!s || /^none$/i.test(s) || /^n\/a$/i.test(s) || s === '-' || s === '\u2014') return [];
  s = s.split(/\s+[·\u2014]\s+/)[0];
  s = s.replace(/\*\*[^*]+\*\*[\s\S]*$/, '').trim();
  s = s.replace(/\([^)]*\)/g, '');
  const parts = s.split(/[,;|]+/).map(function (p) { return p.trim(); }).filter(Boolean);
  const ids = [];
  const seen = Object.create(null);
  for (let i = 0; i < parts.length; i++) {
    const cleaned = parts[i].replace(/^[\s`'"\[\(]+|[\s`'\"\]\)]+$/g, '').trim();
    if (!TASK_ID_RE.test(cleaned)) continue;
    if (seen[cleaned]) continue;
    seen[cleaned] = true;
    ids.push(cleaned);
  }
  return ids;
}

function emptyResult(extra) {
  return Object.assign({
    tasks: [],
    total: 0,
    completed: 0,
    inProgress: 0,
    pending: 0,
    panelCompatible: true,
    unsupported: false,
    unsupportedMessage: null,
  }, extra || {});
}

function looksTaskish(content) {
  if (!content || !String(content).trim()) return false;
  const c = String(content);
  if (/^#{2,3}\s+/m.test(c)) return true;
  if (/^\s*-\s+\[[ xX]\]/m.test(c)) return true;
  if (/\*\*(?:Status|Depends on)\*\*/i.test(c)) return true;
  if (/\*\*\u72b6\u6001\*\*/.test(c)) return true;
  if (/^#\s*Tasks/im.test(c)) return true;
  return false;
}

function parseTasksMarkdown(content) {
  const text = content == null ? '' : String(content);
  if (!text.trim()) return emptyResult();

  const lines = text.split('\n');
  const stages = [];
  let currentStage = null;
  let currentTask = null;
  let sawStructuredTask = false;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    let stageMatch = line.match(STAGE_NUM_RE);
    if (!stageMatch) stageMatch = line.match(STAGE_ALPHA_RE);
    if (stageMatch) {
      const numRaw = stageMatch[1];
      const num = Number.isNaN(parseInt(numRaw, 10)) ? numRaw : parseInt(numRaw, 10);
      currentStage = { num: num, name: stageMatch[2].trim(), tasks: [] };
      stages.push(currentStage);
      currentTask = null;
      continue;
    }

    const taskMatch = line.match(TASK_RE);
    if (taskMatch && currentStage && taskMatch[1]) {
      sawStructuredTask = true;
      currentTask = {
        id: taskMatch[1],
        name: taskMatch[2].trim(),
        status: null,
        hasStatusField: false,
        dependsOn: [],
        details: {},
      };
      currentStage.tasks.push(currentTask);
      continue;
    }

    // ### group headers (no Task ID) — reset current task so details do not stick
    if (/^###\s+/.test(line) && currentStage) {
      currentTask = null;
      continue;
    }

    if (!currentTask) continue;

    const statusMatch = line.match(STATUS_RE);
    if (statusMatch) {
      const value = statusMatch[1].trim();
      currentTask.details.Status = value;
      currentTask.hasStatusField = true;
      currentTask.status = normalizeStatus(value);
      continue;
    }

    const detailMatch = line.match(DETAIL_RE);
    if (detailMatch) {
      const key = detailMatch[1].trim();
      const value = detailMatch[2].trim();
      currentTask.details[key] = value;
      if (/^depends\s*on$/i.test(key) || key === '\u4f9d\u8d56') {
        currentTask.dependsOn = parseDependsOn(value);
      }
    }
  }

  const allTasks = [];
  for (let si = 0; si < stages.length; si++) {
    for (let ti = 0; ti < stages[si].tasks.length; ti++) {
      allTasks.push(stages[si].tasks[ti]);
    }
  }

  const contractOk =
    sawStructuredTask &&
    allTasks.length > 0 &&
    allTasks.every(function (t) { return t.hasStatusField && t.status != null; });

  if (!contractOk) {
    if (looksTaskish(text) || stages.length > 0 || allTasks.length > 0) {
      return emptyResult({
        panelCompatible: false,
        unsupported: true,
        unsupportedMessage: UNSUPPORTED_MESSAGE,
      });
    }
    return emptyResult();
  }

  let total = 0;
  let completed = 0;
  let inProgress = 0;
  let pending = 0;
  for (let i = 0; i < allTasks.length; i++) {
    total++;
    if (allTasks[i].status === 'completed') completed++;
    else if (allTasks[i].status === 'in_progress') inProgress++;
    else pending++;
  }

  return {
    tasks: stages,
    total: total,
    completed: completed,
    inProgress: inProgress,
    pending: pending,
    panelCompatible: true,
    unsupported: false,
    unsupportedMessage: null,
  };
}

module.exports = {
  parseTasksMarkdown: parseTasksMarkdown,
  normalizeStatus: normalizeStatus,
  parseDependsOn: parseDependsOn,
  emptyResult: emptyResult,
  looksTaskish: looksTaskish,
  UNSUPPORTED_MESSAGE: UNSUPPORTED_MESSAGE,
};
