#!/usr/bin/env node
/**
 * PreToolUse Hook: Tests Ledger Gate
 *
 * When quality.json → testsLedger.enabled, block marking Kind=implement
 * tasks completed unless plan tests.md has a qualifying Status=pass row.
 *
 * Exit 2 = block; Exit 0 = allow (stdout passthrough stdin).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { loadQualityConfig } = require('../lib/quality-config');
const { evaluateTestsLedgerGate, classifyPlanDoc } = require('../lib/tests-ledger-gate');

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
    return {
      oldContent: fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '',
      newContent: input.tool_input?.content || input.input?.content || '',
    };
  }
  if (toolName === 'edit') {
    const oldString = input.tool_input?.old_string || input.input?.old_string || '';
    const newString = input.tool_input?.new_string || input.input?.new_string || '';
    let current = '';
    try { current = fs.readFileSync(filePath, 'utf8'); } catch { return null; }
    if (oldString && current.indexOf(oldString) < 0) return null;
    return {
      oldContent: current,
      newContent: oldString ? current.replace(oldString, newString) : current,
    };
  }
  return null;
}

function planDirFromFile(filePath) {
  const n = String(filePath).replace(/\\/g, '/');
  const m = n.match(/^(.*\/docs\/plans\/[^/]+)\//i);
  return m ? m[1] : null;
}

function main() {
  let input;
  try { input = JSON.parse(stdinData); } catch { allow(); }

  const cfg = loadQualityConfig();
  const ledgerCfg = cfg.testsLedger || {};
  if (ledgerCfg.enabled !== true) allow();

  const filePath = input.tool_input?.file_path || input.input?.file_path || '';
  if (!filePath) allow();

  const docKind = classifyPlanDoc(filePath);
  if (docKind !== 'tasks' && docKind !== 'progress') allow();

  const resolved = resolveNewContent(input, filePath);
  if (!resolved) allow();

  const planDir = planDirFromFile(path.resolve(filePath));
  if (!planDir) allow();

  const tasksPath = path.join(planDir, 'tasks.md');
  const testsPath = path.join(planDir, 'tests.md');

  let tasksMdContent = '';
  if (docKind === 'tasks') {
    tasksMdContent = resolved.newContent;
  } else {
    try { tasksMdContent = fs.readFileSync(tasksPath, 'utf8'); } catch { allow(); }
  }

  let testsMdContent = null;
  try {
    testsMdContent = fs.readFileSync(testsPath, 'utf8');
  } catch {
    testsMdContent = null;
  }

  const result = evaluateTestsLedgerGate({
    enabled: true,
    mode: ledgerCfg.mode === 'advisory' ? 'advisory' : 'strict',
    filePath: filePath,
    oldContent: resolved.oldContent,
    newContent: resolved.newContent,
    tasksMdContent: tasksMdContent,
    testsMdContent: testsMdContent,
  });

  if (result.message) console.error(result.message);
  if (!result.allow) block(result.message || '[tests-ledger-gate] blocked');
  allow();
}
