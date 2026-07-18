#!/usr/bin/env node
/**
 * PostToolUse Hook: Progress Sync (P007)
 *
 * When tasks.md is edited: optionally advance next ready → in_progress,
 * then refresh progress.md Stats + Active Task short pointer from the same
 * parse-tasks-panel semantics as the Dashboard.
 *
 * Always exits 0.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { syncFromTasksMarkdown } = require('../lib/progress-from-tasks');

const MAX_STDIN = 1024 * 1024;
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (stdinData.length < MAX_STDIN) stdinData += chunk;
});
process.stdin.on('end', () => {
  try { main(); } catch { process.exit(0); }
});

const TASKS_FILE_PATTERN = /docs[\\/]plans[\\/]P\d{3}-[^\\/]+[\\/]tasks\.md$/i;

function resolveOnBlocked() {
  try {
    const { loadQualityConfig } = require('../lib/quality-config');
    const cfg = loadQualityConfig();
    const v = cfg && cfg.taskPickup && cfg.taskPickup.onBlocked;
    return v === 'model_recommend' ? 'model_recommend' : 'wait_user';
  } catch {
    return 'wait_user';
  }
}

function main() {
  let input;
  try { input = JSON.parse(stdinData); } catch { process.exit(0); }

  const filePath = input.tool_input?.file_path || input.input?.file_path || '';
  if (!filePath) process.exit(0);

  const normalizedPath = filePath.replace(/\\/g, '/');
  if (!TASKS_FILE_PATTERN.test(normalizedPath)) process.exit(0);

  if (!fs.existsSync(filePath)) process.exit(0);
  let tasksContent;
  try { tasksContent = fs.readFileSync(filePath, 'utf8'); } catch { process.exit(0); }

  const planDir = path.dirname(filePath);
  const progressPath = path.join(planDir, 'progress.md');
  if (!fs.existsSync(progressPath)) process.exit(0);

  let progressContent;
  try { progressContent = fs.readFileSync(progressPath, 'utf8'); } catch { process.exit(0); }

  const result = syncFromTasksMarkdown(tasksContent, progressContent, {
    onBlocked: resolveOnBlocked(),
  });

  if (result.unsupported) process.exit(0);

  if (result.tasksMarkdown) {
    try { fs.writeFileSync(filePath, result.tasksMarkdown, 'utf8'); } catch { /* ignore */ }
  }
  if (result.progressMarkdown) {
    try { fs.writeFileSync(progressPath, result.progressMarkdown, 'utf8'); } catch { /* ignore */ }
  }

  process.exit(0);
}
