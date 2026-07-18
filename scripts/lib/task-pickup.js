/**
 * task-pickup — select next ready task / apply in_progress (P007).
 * Pure functions. Never writes completed or blocked.
 */

'use strict';

const IN_PROGRESS_EMOJI = '\uD83D\uDD04'; // 🔄
const STATUS_EMOJI_RE = /[\u23F3\u2705\uD83D\uDD04\u274C\u26A0\uFE0F]\uFE0F?\s*/g;

function flattenTasks(parsed) {
  if (!parsed || parsed.unsupported || !Array.isArray(parsed.tasks)) return [];
  const out = [];
  for (let i = 0; i < parsed.tasks.length; i++) {
    const stage = parsed.tasks[i];
    const list = stage && stage.tasks ? stage.tasks : [];
    for (let j = 0; j < list.length; j++) out.push(list[j]);
  }
  return out;
}

function findInProgress(tasks) {
  if (!tasks || !tasks.length) return null;
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].status === 'in_progress') return tasks[i];
  }
  return null;
}

function indexById(tasks) {
  const map = Object.create(null);
  for (let i = 0; i < tasks.length; i++) {
    map[tasks[i].id] = tasks[i];
  }
  return map;
}

function depsSatisfied(task, byId) {
  const deps = task.dependsOn || [];
  if (!deps.length) return true;
  for (let i = 0; i < deps.length; i++) {
    const dep = byId[deps[i]];
    if (!dep || dep.status !== 'completed') return false;
  }
  return true;
}

function findNextReady(tasks) {
  if (!tasks || !tasks.length) return null;
  const byId = indexById(tasks);
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (t.status !== 'pending') continue;
    if (depsSatisfied(t, byId)) return t;
  }
  return null;
}

function isAllCompleted(tasks) {
  if (!tasks || !tasks.length) return false;
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].status !== 'completed') return false;
  }
  return true;
}

function resolveBlockedPolicy(task, onBlocked) {
  const global = onBlocked === 'model_recommend' ? 'model_recommend' : 'wait_user';
  if (!task || !task.details) return global;
  const raw = task.details.Blocked != null ? task.details.Blocked : task.details.blocked;
  if (raw == null || raw === '') return global;
  const s = String(raw).trim().toLowerCase();
  if (/model-ok|model_ok|model\s*recommend/.test(s)) return 'model_recommend';
  if (/\buser\b/.test(s)) return 'wait_user';
  return global;
}

function firstUnreadyPending(tasks) {
  if (!tasks || !tasks.length) return null;
  const byId = indexById(tasks);
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (t.status !== 'pending') continue;
    if (!depsSatisfied(t, byId)) return t;
  }
  return null;
}

function buildBlockedHint(tasks, options) {
  const opts = options || {};
  const candidate = firstUnreadyPending(tasks);
  const policy = resolveBlockedPolicy(candidate, opts.onBlocked);
  const deps = candidate && candidate.dependsOn ? candidate.dependsOn.join(', ') : '?';
  let message;
  if (candidate) {
    message = '任务 ' + candidate.id + ' 依赖未满足（Depends on: ' + deps + '）';
  } else {
    message = '无 ready 任务（依赖未齐或无可执行 pending）';
  }
  if (policy === 'wait_user') {
    message += '。策略 wait_user：请停下来与用户确认后再继续。';
  } else {
    message += '。策略 model_recommend：可按推荐方案继续（用户已授权此类策略）；勿由 hook 自动改 Status。';
  }
  return { policy: policy, task: candidate || null, message: message };
}

function stripStatusEmojis(name) {
  return String(name || '').replace(STATUS_EMOJI_RE, '').trim();
}

function buildActiveTaskPointer(task) {
  if (!task) return 'none';
  const title = stripStatusEmojis(task.name);
  return task.id + (title ? ' ' + title : '');
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrite markdown so taskId becomes in_progress (Status + heading emoji).
 * Does not touch completed/blocked.
 */
function applyInProgress(markdown, taskId) {
  if (markdown == null || !taskId) return markdown == null ? '' : String(markdown);
  const text = String(markdown);
  const idRe = escapeRegExp(taskId);
  const headingRe = new RegExp(
    '^(#{3,4}\\s+)' + idRe + '(\\s*[' + '\u2014' + '\\-:·]?\\s*|\\s+)(.+)$',
    'm'
  );
  let matched = false;
  let out = text.replace(headingRe, function (_m, hashes, sep, rest) {
    matched = true;
    const clean = stripStatusEmojis(rest);
    return hashes + taskId + ' ' + IN_PROGRESS_EMOJI + ' ' + clean;
  });
  if (!matched) return text;

  // Replace Status only within this task's section (until next ###/#### or ##)
  const sectionRe = new RegExp(
    '(^#{3,4}\\s+' + idRe + '[^\\n]*\\n)([\\s\\S]*?)(?=^#{2,4}\\s+|$)',
    'm'
  );
  out = out.replace(sectionRe, function (_m, head, body) {
    const statusRe = /^(\s*-\s+\*\*(?:Status|\u72b6\u6001)\*\*[\s:\uFF1A\u2014\-]*)(.+)$/im;
    if (statusRe.test(body)) {
      body = body.replace(statusRe, '$1' + IN_PROGRESS_EMOJI + ' in_progress');
    } else {
      body = '- **Status**: ' + IN_PROGRESS_EMOJI + ' in_progress\n' + body;
    }
    return head + body;
  });
  return out;
}

/**
 * Decide pickup action from a parse result.
 * @returns {{ action, task, markdown, activeTaskPointer, hint, nextReady }}
 */
function planPickup(parsed, options) {
  const opts = options || {};
  const markdown = opts.markdown != null ? String(opts.markdown) : null;
  const empty = {
    action: 'noop',
    task: null,
    markdown: null,
    activeTaskPointer: 'none',
    hint: null,
    nextReady: null,
  };

  if (!parsed || parsed.unsupported) {
    return Object.assign({}, empty, { action: 'unsupported' });
  }

  const tasks = flattenTasks(parsed);
  if (!tasks.length) {
    return Object.assign({}, empty, { action: 'done' });
  }

  if (isAllCompleted(tasks)) {
    return Object.assign({}, empty, {
      action: 'done',
      hint: {
        policy: null,
        message: '全部任务已完成：停止派工，进入下一阶段（归档 / verify / 更新 roadmap）。',
      },
    });
  }

  const current = findInProgress(tasks);
  const nextReady = findNextReady(tasks);

  if (current) {
    return {
      action: 'noop',
      task: current,
      markdown: null,
      activeTaskPointer: buildActiveTaskPointer(current),
      hint: nextReady
        ? { policy: null, message: '下一 ready: ' + buildActiveTaskPointer(nextReady) }
        : null,
      nextReady: nextReady,
    };
  }

  if (nextReady) {
    const newMd = markdown != null ? applyInProgress(markdown, nextReady.id) : null;
    return {
      action: 'advance',
      task: nextReady,
      markdown: newMd,
      activeTaskPointer: buildActiveTaskPointer(
        Object.assign({}, nextReady, {
          name: IN_PROGRESS_EMOJI + ' ' + stripStatusEmojis(nextReady.name),
          status: 'in_progress',
        })
      ),
      hint: {
        policy: null,
        message: '当前任务 = ' + buildActiveTaskPointer(nextReady),
      },
      nextReady: nextReady,
    };
  }

  const blocked = buildBlockedHint(tasks, { onBlocked: opts.onBlocked });
  return {
    action: 'blocked',
    task: blocked.task,
    markdown: null,
    activeTaskPointer: 'none',
    hint: blocked,
    nextReady: null,
  };
}

module.exports = {
  flattenTasks: flattenTasks,
  findInProgress: findInProgress,
  findNextReady: findNextReady,
  isAllCompleted: isAllCompleted,
  depsSatisfied: depsSatisfied,
  resolveBlockedPolicy: resolveBlockedPolicy,
  buildBlockedHint: buildBlockedHint,
  buildActiveTaskPointer: buildActiveTaskPointer,
  applyInProgress: applyInProgress,
  planPickup: planPickup,
  IN_PROGRESS_EMOJI: IN_PROGRESS_EMOJI,
};
