#!/usr/bin/env node
/**
 * PostToolUse Hook: Read Dedup
 *
 * Tracks files read within a session and warns when the same file
 * is read again. Session-scoped — no persistence beyond session.
 *
 * Always exits 0 (warn only, never blocks).
 */

const os = require('os');
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

// Use CLAUDE_SESSION_ID if available, else PID to avoid cross-session contamination
const sessionId = process.env.CLAUDE_SESSION_ID || `pid-${process.pid}`;
const SESSION_TRACK_FILE = path.join(os.tmpdir(), `.read-dedup-${sessionId}.tmp`);

function main() {
  let input;
  try { input = JSON.parse(stdinData); } catch { process.exit(0); }

  const filePath = input.tool_input?.file_path || input.input?.file_path || '';
  if (!filePath) process.exit(0);

  // Load existing tracked files
  let tracked = new Set();
  try {
    if (fs.existsSync(SESSION_TRACK_FILE)) {
      const data = fs.readFileSync(SESSION_TRACK_FILE, 'utf8');
      tracked = new Set(data.split('\n').filter(Boolean));
    }
  } catch {}

  const normalizedPath = path.resolve(filePath);

  if (tracked.has(normalizedPath)) {
    // Already read — warn
    console.error(
      `[Read Dedup] ⚠️ 此文件已在本 session 中读取过，考虑使用缓存内容。`
    );
  } else {
    // First read — track it
    tracked.add(normalizedPath);
    try {
      fs.writeFileSync(SESSION_TRACK_FILE, Array.from(tracked).join('\n'), 'utf8');
    } catch {}
  }

  // Always passthrough stdin
  process.stdout.write(stdinData);
  process.exit(0);
}
