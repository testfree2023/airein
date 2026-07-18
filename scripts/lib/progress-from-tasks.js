/**
 * progress-from-tasks — sync progress.md (+ optional tasks advance) from tasks.md (P007).
 * Pure functions.
 */

'use strict';

const { parseTasksMarkdown } = require('./parse-tasks-panel');
const {
  planPickup,
  flattenTasks,
  buildActiveTaskPointer,
  findInProgress,
} = require('./task-pickup');

function statsFromParsed(parsed) {
  if (!parsed || parsed.unsupported) {
    return { total: 0, completed: 0, inProgress: 0, pending: 0 };
  }
  return {
    total: parsed.total || 0,
    completed: parsed.completed || 0,
    inProgress: parsed.inProgress || 0,
    pending: parsed.pending || 0,
  };
}

/**
 * Update progress.md body with stats + Active Task short pointer.
 */
function updateProgressMarkdown(content, fields) {
  const { normalizeProgressFormat } = require('./plan-parser');
  let out = normalizeProgressFormat(content == null ? '' : String(content));
  const today = new Date().toISOString().split('T')[0];
  const stats = fields || {};

  out = out.replace(/^updated:\s*\S+/m, 'updated: ' + today);
  if (typeof stats.total === 'number') {
    out = out.replace(/^total:\s*\d+/m, 'total: ' + stats.total);
  }
  if (typeof stats.completed === 'number') {
    out = out.replace(/^completed:\s*\d+/m, 'completed: ' + stats.completed);
  }
  if (typeof stats.inProgress === 'number') {
    out = out.replace(/^in_progress:\s*\d+/m, 'in_progress: ' + stats.inProgress);
  }
  if (typeof stats.pending === 'number') {
    out = out.replace(/^pending:\s*\d+/m, 'pending: ' + stats.pending);
  }

  const active = stats.activeTaskPointer != null ? String(stats.activeTaskPointer) : 'none';
  out = out.replace(/^## Active Task\n.+/m, '## Active Task\n' + active);

  if (stats.total > 0 && stats.completed === stats.total) {
    out = out.replace(/^status:\s*\S+/m, 'status: completed');
  }

  return out;
}

/**
 * Full sync: optional advance in_progress on tasks, then refresh progress.
 * @returns {{ unsupported, pickup, tasksMarkdown, progressMarkdown, hint }}
 */
function syncFromTasksMarkdown(tasksContent, progressContent, options) {
  const opts = options || {};
  const parsed = parseTasksMarkdown(tasksContent);

  if (!parsed || parsed.unsupported) {
    return {
      unsupported: true,
      pickup: null,
      tasksMarkdown: null,
      progressMarkdown: null,
      hint: parsed && parsed.unsupportedMessage
        ? { message: parsed.unsupportedMessage }
        : null,
    };
  }

  const pickup = planPickup(parsed, {
    markdown: tasksContent,
    onBlocked: opts.onBlocked,
  });

  let tasksMarkdown = null;
  let effectiveContent = tasksContent;
  if (pickup.action === 'advance' && pickup.markdown) {
    tasksMarkdown = pickup.markdown;
    effectiveContent = pickup.markdown;
  }

  const reparsed = tasksMarkdown ? parseTasksMarkdown(effectiveContent) : parsed;
  const stats = statsFromParsed(reparsed);
  const tasks = flattenTasks(reparsed);
  const current = findInProgress(tasks);
  let activeTaskPointer = 'none';
  if (current) {
    activeTaskPointer = buildActiveTaskPointer(current);
  } else if (pickup.action === 'done') {
    activeTaskPointer = 'none';
  }

  const progressMarkdown = updateProgressMarkdown(progressContent, {
    total: stats.total,
    completed: stats.completed,
    inProgress: stats.inProgress,
    pending: stats.pending,
    activeTaskPointer: activeTaskPointer,
  });

  return {
    unsupported: false,
    pickup: pickup,
    tasksMarkdown: tasksMarkdown,
    progressMarkdown: progressMarkdown,
    hint: pickup.hint,
  };
}

module.exports = {
  statsFromParsed: statsFromParsed,
  updateProgressMarkdown: updateProgressMarkdown,
  syncFromTasksMarkdown: syncFromTasksMarkdown,
};
