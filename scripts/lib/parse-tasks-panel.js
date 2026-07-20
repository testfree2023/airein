/**
 * parse-tasks-panel — tasks.md parser for Dashboard Progress panel (P006).
 * Pure functions. unsupported=true → do not render a fake progress graph.
 *
 * Supports:
 *   - Standard: ## 1.0 / ### 1.1 + **Status** / **Depends on**
 *   - Lifecycle: ## T0 … / ### T0-1 — … / ### T1-mall-1 — …
 * Missing Status soft-defaults to pending. progress.md Completed Log can overlay.
 */

'use strict';

const UNSUPPORTED_MESSAGE = '老的任务模板暂不支持';

const TASK_ID_RE = /^[A-Za-z]?\d+(?:[.\-][A-Za-z0-9]+)*$/;
const EM = '\u2014';
const STAGE_NUM_RE = new RegExp(
  '^##\\s+(?:Stage\\s+)?(\\d+)(?:\\.0)?\\s*[' + EM + '\\-:]?\\s*(.+)$', 'i'
);
const STAGE_ALPHA_RE = new RegExp(
  '^##\\s+Stage\\s+([A-Z0-9]+)\\s*[' + EM + '\\-:]\\s*(.+)$', 'i'
);
// Lifecycle phases: ## T0 Prep (not ## Status:)
const STAGE_PHASE_RE = /^##\s+(T\d+)\s+(.+)$/;
// Task headings: ### 1.1 / #### 1.7 / ### T0-1 / ### T1-mall-1
const TASK_RE = new RegExp(
  '^#{3,4}\\s+([A-Za-z]?\\d+(?:[.\\-][A-Za-z0-9]+)*)(?:\\s*[' + EM + '\\-:·]\\s*|\\s+)(.+)$'
);
const STATUS_RE = new RegExp(
  '^-\\s+\\*\\*(?:Status|\\u72b6\\u6001)\\*\\*[\\s:\\uFF1A' + EM + '\\-]+(.+)$', 'i'
);
const DETAIL_RE = /^-\s+\*\*([^*]+)\*\*[\s:\uFF1A]+(.+)$/;

function normalizeStatus(raw) {
  if (raw == null) return null;
  const original = String(raw).trim();
  if (!original) return null;
  const s = original.toLowerCase();

  if (/^\u2705/.test(original) || /^✅/.test(original)) return 'completed';
  if (/^\uD83D\uDD04/.test(original) || /^🔄/.test(original)) return 'in_progress';
  if (/^\uD83D\uDFE1/.test(original) || /^🟡/.test(original)) return 'in_progress';
  if (/^\u23F3/.test(original) || /^⏳/.test(original)) return 'pending';
  if (/^\u23F8/.test(original) || /^⏸/.test(original)) return 'blocked';

  if (/\bin_progress\b/.test(s) || s.indexOf('进行中') >= 0) return 'in_progress';
  if (/\bcompleted\b/.test(s) || /\bcomplete\b/.test(s) || /\bdone\b/.test(s)) return 'completed';
  if (s.indexOf('已完成') >= 0 || (s.indexOf('完成') >= 0 && s.indexOf('未完成') < 0)) {
    if (!/^🟡/.test(original)) return 'completed';
  }
  if (/\bpending\b/.test(s) || s.indexOf('待处理') >= 0) return 'pending';
  if (/\bblocked\b/.test(s) || s.indexOf('阻塞') >= 0 || s.indexOf('受阻') >= 0) return 'blocked';

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

const KIND_ENUM = {
  implement: true,
  verify: true,
  deploy: true,
  accept: true,
};

function normalizeKind(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (KIND_ENUM[s]) return s;
  return null;
}

function inferKindFromStageName(stageName) {
  if (stageName == null) return null;
  const s = String(stageName);
  if (/\bimplement\b/i.test(s) || s.indexOf('开发') >= 0) return 'implement';
  if (/\bverify\b/i.test(s) || s.indexOf('测试') >= 0) return 'verify';
  if (/\bdeploy\b/i.test(s)) return 'deploy';
  if (/\baccept\b/i.test(s)) return 'accept';
  return null;
}

function emptyResult(extra) {
  return Object.assign({
    tasks: [],
    total: 0,
    completed: 0,
    inProgress: 0,
    pending: 0,
    blocked: 0,
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

function recount(stages) {
  let total = 0;
  let completed = 0;
  let inProgress = 0;
  let pending = 0;
  let blocked = 0;
  for (let si = 0; si < stages.length; si++) {
    const tasks = stages[si].tasks || [];
    for (let ti = 0; ti < tasks.length; ti++) {
      total++;
      const st = tasks[ti].status;
      if (st === 'completed') completed++;
      else if (st === 'in_progress') inProgress++;
      else if (st === 'blocked') blocked++;
      else pending++;
    }
  }
  return { total: total, completed: completed, inProgress: inProgress, pending: pending, blocked: blocked };
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
    const line = lines[li].replace(/\r$/, '');
    let stageMatch = line.match(STAGE_NUM_RE);
    if (!stageMatch) stageMatch = line.match(STAGE_ALPHA_RE);
    if (!stageMatch) stageMatch = line.match(STAGE_PHASE_RE);
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
        kind: null,
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
      let st = normalizeStatus(value);
      if (st == null) st = 'blocked';
      currentTask.status = st;
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
      if (/^kind$/i.test(key)) {
        currentTask.kind = normalizeKind(value);
      }
    }
  }

  const allTasks = [];
  for (let si = 0; si < stages.length; si++) {
    const stageKind = inferKindFromStageName(stages[si].name);
    for (let ti = 0; ti < stages[si].tasks.length; ti++) {
      const t = stages[si].tasks[ti];
      if (t.kind == null && stageKind) t.kind = stageKind;
      allTasks.push(t);
    }
  }

  // Soft default: structured tasks without Status → pending
  for (let di = 0; di < allTasks.length; di++) {
    if (allTasks[di].status == null) allTasks[di].status = 'pending';
  }

  const contractOk =
    sawStructuredTask &&
    allTasks.length > 0 &&
    allTasks.every(function (t) { return t.status != null; });

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

  const counts = recount(stages);
  return {
    tasks: stages,
    total: counts.total,
    completed: counts.completed,
    inProgress: counts.inProgress,
    pending: counts.pending,
    blocked: counts.blocked,
    panelCompatible: true,
    unsupported: false,
    unsupportedMessage: null,
  };
}


/**
 * Extract completed task ids from progress.md Completed / Completed Log sections.
 * @param {string} progressContent
 * @param {object} knownIdSet — map id → true (only return known ids)
 * @returns {string[]}
 */
function extractCompletedIdsFromProgress(progressContent, knownIdSet) {
  const ids = [];
  const seen = Object.create(null);
  const known = knownIdSet || Object.create(null);
  const text = String(progressContent || '');
  const logMatch = text.match(/##\s*Completed(?:\s+Log)?\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  const logBody = logMatch ? logMatch[1] : '';
  // - 1.1 …  |  - **1.0a** …  |  - [x] 1.1 …
  const lineRe = /^[-*]\s+(?:\[[^\]]*\]\s+)?(?:\*\*)?([A-Za-z]?\d+(?:[.\-][A-Za-z0-9]+)*)(?:\*\*)?\b/gm;
  let m;
  while ((m = lineRe.exec(logBody)) !== null) {
    const id = m[1];
    if (!known[id] || seen[id]) continue;
    seen[id] = true;
    ids.push(id);
  }
  return ids;
}

/**
 * Overlay statuses from progress.md Completed Log onto parsed tasks.
 * Only marks IDs present in the parse result (avoids date false positives).
 * @param {object} parsed
 * @param {string} progressContent
 * @returns {object}
 */
function applyProgressTaskStatuses(parsed, progressContent) {
  if (!parsed || parsed.unsupported || !progressContent) return parsed;

  const known = Object.create(null);
  const stagesIn = parsed.tasks || [];
  for (let si = 0; si < stagesIn.length; si++) {
    const tasks = stagesIn[si].tasks || [];
    for (let ti = 0; ti < tasks.length; ti++) known[tasks[ti].id] = true;
  }

  const completedList = extractCompletedIdsFromProgress(progressContent, known);
  const completedIds = Object.create(null);
  for (let ci = 0; ci < completedList.length; ci++) completedIds[completedList[ci]] = true;
  const text = String(progressContent);

  let activeId = null;
  const activeMatch = text.match(/##\s*Active Task\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  if (activeMatch) {
    const am = activeMatch[1].match(/\*\*\s*([A-Za-z]?\d+(?:[.\-][A-Za-z0-9]+)*)\b/);
    if (am && known[am[1]] && !completedIds[am[1]]) activeId = am[1];
  }

  const stages = stagesIn.map(function (stage) {
    return {
      num: stage.num,
      name: stage.name,
      tasks: (stage.tasks || []).map(function (t) {
        let status = t.status || 'pending';
        if (completedIds[t.id]) status = 'completed';
        else if (activeId && t.id === activeId) status = 'in_progress';
        return Object.assign({}, t, { status: status });
      }),
    };
  });

  const counts = recount(stages);
  return Object.assign({}, parsed, {
    tasks: stages,
    total: counts.total,
    completed: counts.completed,
    inProgress: counts.inProgress,
    pending: counts.pending,
    blocked: counts.blocked,
  });
}

module.exports = {
  parseTasksMarkdown: parseTasksMarkdown,
  normalizeStatus: normalizeStatus,
  normalizeKind: normalizeKind,
  inferKindFromStageName: inferKindFromStageName,
  parseDependsOn: parseDependsOn,
  extractCompletedIdsFromProgress: extractCompletedIdsFromProgress,
  applyProgressTaskStatuses: applyProgressTaskStatuses,
  emptyResult: emptyResult,
  looksTaskish: looksTaskish,
  UNSUPPORTED_MESSAGE: UNSUPPORTED_MESSAGE,
};
