#!/usr/bin/env node
/**
 * PostToolUse Hook: Archive Trigger
 *
 * When a plan's progress.md is edited and the plan is fully complete
 * (isPlanCompleted && status≠archived), nudge the model to run /archive-plan.
 *
 * - Non-blocking: always exit 0.
 * - Per-plan, per-session dedup: nudges each completed plan at most once per
 *   session (avoids re-nagging on every subsequent progress.md save).
 * - Visibility: stderr (console.error) is the channel the model sees for
 *   PostToolUse hooks (stdout is invisible) — see read-dedup.js precedent.
 *
 * Archive EXECUTION still requires user confirmation inside archive-plan;
 * this hook only suggests entering the archive flow.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const { isPlanCompleted, getStatus } = require('../lib/plan-parser');

const MAX_STDIN = 1024 * 1024;
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (stdinData.length < MAX_STDIN) stdinData += chunk;
});
process.stdin.on('end', () => {
  try { main(); } catch { done(); }
});

const sessionId = process.env.CLAUDE_SESSION_ID || `pid-${process.pid}`;
const DEDUP_FILE = path.join(os.tmpdir(), `.archive-trigger-${sessionId}.tmp`);

function done() {
  // Passthrough stdin (defensive, matches read-dedup), never block.
  try { process.stdout.write(stdinData); } catch {}
  process.exit(0);
}

function loadNudged() {
  try {
    if (fs.existsSync(DEDUP_FILE)) {
      return new Set(fs.readFileSync(DEDUP_FILE, 'utf8').split('\n').filter(Boolean));
    }
  } catch {}
  return new Set();
}

function saveNudged(set) {
  try { fs.writeFileSync(DEDUP_FILE, Array.from(set).join('\n'), 'utf8'); } catch {}
}

function main() {
  let input;
  try { input = JSON.parse(stdinData); } catch { return done(); }

  const filePath = input.tool_input?.file_path || input.input?.file_path || '';
  if (!filePath) return done();

  // Only react to progress.md writes.
  if (path.basename(filePath) !== 'progress.md') return done();

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch { return done(); } // file may not exist yet (PreToolUse race) — ignore

  if (!isPlanCompleted(content)) return done();
  if (getStatus(content) === 'archived') return done();

  const planId = path.basename(path.dirname(filePath));

  const nudged = loadNudged();
  if (nudged.has(planId)) return done();

  console.error(
    `[Archive Trigger] ✅ 计划 ${planId} 全部任务已完成。` +
    `运行 \`/archive-plan ${planId}\` 归档（执行前仍会请求用户确认）。`
  );

  nudged.add(planId);
  saveNudged(nudged);
  done();
}
