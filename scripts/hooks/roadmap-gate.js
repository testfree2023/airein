#!/usr/bin/env node
/**
 * PreToolUse Hook: Roadmap Gate
 *
 * When quality.json → roadmapGate.enabled, validate Write/Edit of docs/roadmap.md.
 * Default mode advisory (stderr warn, allow). strict → exit 2.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { loadQualityConfig } = require('../lib/quality-config');
const { evaluateRoadmapGate } = require('../lib/roadmap-gate');
const { isRoadmapPath } = require('../lib/roadmap-contract');

const MAX_STDIN = 1024 * 1024;
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (stdinData.length < MAX_STDIN) stdinData += chunk;
});
process.stdin.on('end', () => {
  try { main(); } catch { allow(); }
});

function allow() {
  process.stdout.write(stdinData);
  process.exit(0);
}

function block(msg) {
  console.error(msg);
  process.exit(2);
}

function resolveNewContent(input, filePath) {
  const toolName = String(input.tool_name || '').toLowerCase();
  if (toolName === 'write') {
    return input.tool_input?.content || input.input?.content || '';
  }
  if (toolName === 'edit') {
    const oldString = input.tool_input?.old_string || input.input?.old_string || '';
    const newString = input.tool_input?.new_string || input.input?.new_string || '';
    let current = '';
    try { current = fs.readFileSync(filePath, 'utf8'); } catch { return null; }
    if (oldString && current.indexOf(oldString) < 0) return null;
    return oldString ? current.replace(oldString, newString) : current;
  }
  return null;
}

function main() {
  let input;
  try { input = JSON.parse(stdinData); } catch { allow(); }

  const cfg = loadQualityConfig();
  const gateCfg = cfg.roadmapGate || {};
  if (gateCfg.enabled !== true) allow();

  const filePath = input.tool_input?.file_path || input.input?.file_path || '';
  if (!filePath || !isRoadmapPath(filePath)) allow();

  const newContent = resolveNewContent(input, path.resolve(filePath));
  if (newContent == null) allow();

  const result = evaluateRoadmapGate({
    enabled: true,
    mode: gateCfg.mode === 'strict' ? 'strict' : 'advisory',
    filePath: filePath,
    newContent: newContent,
  });

  if (result.message) console.error(result.message);
  if (!result.allow) block(result.message || '[roadmap-gate] blocked');
  allow();
}
