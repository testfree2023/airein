/**
 * progress-completion-gate — progress.md may claim task completion only after
 * tasks.md **Status** is already completed. Pure functions.
 */

'use strict';

const {
  parseTasksMarkdown,
  extractCompletedIdsFromProgress,
} = require('./parse-tasks-panel');

function classifyProgressDoc(filePath) {
  if (!filePath) return false;
  const n = String(filePath).replace(/\\/g, '/').replace(/\/+/g, '/');
  return /\/docs\/plans\/[^/]+\/progress\.md$/i.test(n);
}

function indexTaskStatus(parsedTasks) {
  const map = Object.create(null);
  const known = Object.create(null);
  const stages = (parsedTasks && parsedTasks.tasks) || [];
  for (let si = 0; si < stages.length; si++) {
    const tasks = stages[si].tasks || [];
    for (let ti = 0; ti < tasks.length; ti++) {
      const t = tasks[ti];
      map[t.id] = t.status || 'pending';
      known[t.id] = true;
    }
  }
  return { statusById: map, known: known };
}

function setDiff(newer, older) {
  const oldSet = Object.create(null);
  for (let i = 0; i < older.length; i++) oldSet[older[i]] = true;
  return newer.filter(function (id) { return !oldSet[id]; });
}

/**
 * @param {object} opts
 * @param {boolean} opts.enabled
 * @param {'strict'|'advisory'} [opts.mode]
 * @param {string} opts.filePath
 * @param {string} opts.newContent
 * @param {string|null} [opts.oldContent]
 * @param {string} opts.tasksMdContent
 * @returns {{ allow: boolean, advisory: boolean, violations: object[], message: string|null }}
 */
function evaluateProgressCompletionGate(opts) {
  const enabled = opts && opts.enabled === true;
  const mode = (opts && opts.mode) || 'strict';
  const advisory = mode === 'advisory';
  const emptyOk = { allow: true, advisory: false, violations: [], message: null };

  if (!enabled) return emptyOk;
  if (!classifyProgressDoc(opts.filePath)) return emptyOk;

  const parsed = parseTasksMarkdown(opts.tasksMdContent || '');
  if (!parsed || parsed.unsupported || !parsed.total) {
    // No tasks.md contract → cannot enforce
    return emptyOk;
  }

  const idx = indexTaskStatus(parsed);
  const oldContent = opts.oldContent == null ? '' : String(opts.oldContent);
  const newContent = opts.newContent == null ? '' : String(opts.newContent);

  const oldIds = extractCompletedIdsFromProgress(oldContent, idx.known);
  const newIds = extractCompletedIdsFromProgress(newContent, idx.known);
  const newlyClaimed = setDiff(newIds, oldIds);
  if (!newlyClaimed.length) return emptyOk;

  const violations = [];
  for (let i = 0; i < newlyClaimed.length; i++) {
    const taskId = newlyClaimed[i];
    const st = idx.statusById[taskId] || 'pending';
    if (st !== 'completed') {
      violations.push({
        taskId: taskId,
        tasksStatus: st,
        reason: 'tasks_md_not_completed',
      });
    }
  }

  if (!violations.length) return emptyOk;

  const ids = violations.map(function (v) { return v.taskId; }).join(', ');
  const message =
    '[progress-completion-gate] 写 progress 完成记录前，tasks.md 对应任务必须已是 Status=completed。\n' +
    '未就绪: ' + ids + '（请先改 tasks.md 的 **Status**，再写 progress Completed / Completed Log）。\n' +
    '或设 quality.json progressCompletionGate.enabled=false 关闭门禁。';

  return {
    allow: advisory,
    advisory: advisory,
    violations: violations,
    message: message,
  };
}

module.exports = {
  classifyProgressDoc: classifyProgressDoc,
  evaluateProgressCompletionGate: evaluateProgressCompletionGate,
};
