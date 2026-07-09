#!/usr/bin/env node
/**
 * PostToolUse Hook: Progress Sync
 *
 * Automatically updates progress.md Task Stats and Active Task
 * when tasks.md is edited. Runs async — never blocks the workflow.
 *
 * Always exits 0.
 */

const path = require('path');
const fs = require('fs');

const MAX_STDIN = 1024 * 1024;
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (stdinData.length < MAX_STDIN) stdinData += chunk;
});
process.stdin.on('end', () => {
  try { main(); } catch { process.exit(0); }
});

// Pattern: docs/plans/P{NNN}-{slug}/tasks.md
const TASKS_FILE_PATTERN = /docs[\\/]plans[\\/]P\d{3}-[^\\/]+[\\/]tasks\.md$/i;

function main() {
  let input;
  try { input = JSON.parse(stdinData); } catch { process.exit(0); }

  const filePath = input.tool_input?.file_path || input.input?.file_path || '';
  if (!filePath) process.exit(0);

  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, '/');

  // Only process tasks.md files inside plan directories
  if (!TASKS_FILE_PATTERN.test(normalizedPath)) process.exit(0);

  // Read the tasks file
  if (!fs.existsSync(filePath)) process.exit(0);
  let tasksContent;
  try { tasksContent = fs.readFileSync(filePath, 'utf8'); } catch { process.exit(0); }

  // Parse task statuses from tasks.md
  const stats = parseTasksStats(tasksContent);

  // Find first in-progress task as active task
  const activeTask = findActiveTask(tasksContent);

  // Resolve progress.md path
  const planDir = path.dirname(filePath);
  const progressPath = path.join(planDir, 'progress.md');
  if (!fs.existsSync(progressPath)) process.exit(0);

  // Read and update progress.md
  let progressContent;
  try { progressContent = fs.readFileSync(progressPath, 'utf8'); } catch { process.exit(0); }

  const updated = updateProgress(progressContent, stats, activeTask);
  try { fs.writeFileSync(progressPath, updated, 'utf8'); } catch { process.exit(0); }

  process.exit(0);
}

/**
 * Parse task stats from tasks.md content.
 * Counts ✅ completed, 🔄 in-progress, ⏳ pending status markers.
 */
function parseTasksStats(content) {
  const completed = (content.match(/✅\s*completed/g) || []).length;
  const inProgress = (content.match(/🔄\s*in-progress/g) || []).length;
  const pending = (content.match(/⏳\s*pending/g) || []).length;
  const total = completed + inProgress + pending;

  return { total, completed, inProgress, pending };
}

/**
 * Find the first in-progress task from tasks.md.
 * Returns task ID + name, e.g. "1.2 Task B"
 */
function findActiveTask(content) {
  // Match ### 1.2 Task B followed by Status: in-progress
  const lines = content.split('\n');
  let currentTask = null;

  for (let i = 0; i < lines.length; i++) {
    const taskMatch = lines[i].match(/^###\s+(\d+\.\d+)\s+(.+)/);
    if (taskMatch) {
      currentTask = `${taskMatch[1]} ${taskMatch[2].trim()}`;
      continue;
    }
    if (currentTask && lines[i].includes('🔄') && lines[i].includes('in-progress')) {
      return currentTask;
    }
  }

  return null;
}

/**
 * Update progress.md content with new stats and active task.
 * Normalizes format before applying updates to ensure regex matching works.
 */
function updateProgress(content, stats, activeTask) {
  const { normalizeProgressFormat } = require('../lib/plan-parser');

  // Normalize: strip leading whitespace so regex patterns match reliably
  content = normalizeProgressFormat(content);

  const today = new Date().toISOString().split('T')[0];

  // Update date
  content = content.replace(/^updated:\s*\S+/m, `updated: ${today}`);

  // Update Task Stats
  content = content.replace(/^total:\s*\d+/m, `total: ${stats.total}`);
  content = content.replace(/^completed:\s*\d+/m, `completed: ${stats.completed}`);
  content = content.replace(/^in_progress:\s*\d+/m, `in_progress: ${stats.inProgress}`);
  content = content.replace(/^pending:\s*\d+/m, `pending: ${stats.pending}`);

  // Update Active Task — clear when no in-progress task found
  const activeTaskValue = activeTask || 'none';
  content = content.replace(
    /^## Active Task\n.+/m,
    `## Active Task\n${activeTaskValue}`
  );

  // Auto-advance plan status when all tasks completed
  // If all tasks are done (completed === total && total > 0), set status to completed
  if (stats.total > 0 && stats.completed === stats.total) {
    content = content.replace(/^status:\s*\S+/m, 'status: completed');
  }
  // Also update status if there are no in-progress tasks and some pending tasks (should stay in_progress)
  // No change needed - already defaults to in_progress

  return content;
}
