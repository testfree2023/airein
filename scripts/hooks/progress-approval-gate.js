#!/usr/bin/env node
/**
 * PreToolUse Hook: Progress Approval Gate
 *
 * When progress.md marks a phase approved, require that phase doc's
 * ## Status is already approved. For tasks, also require panel format.
 * Does NOT parse tasks.md on every edit — only when approving.
 *
 * quality.json → progressApprovalGate.enabled (default true)
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { loadQualityConfig } = require('../lib/quality-config');
const {
  evaluateProgressApprovalGate,
  classifyProgressDoc,
  newlyApprovedPhases,
} = require('../lib/progress-approval-gate');

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
  const gateCfg = cfg.progressApprovalGate || {};
  const enabled = gateCfg.enabled !== false;
  if (!enabled) allow();

  const filePath = input.tool_input?.file_path || input.input?.file_path || '';
  if (!filePath || !classifyProgressDoc(filePath)) allow();

  const resolved = resolveNewContent(input, filePath);
  if (!resolved) allow();

  const phases = newlyApprovedPhases(resolved.oldContent, resolved.newContent);
  if (!phases.length) allow();

  const planDir = planDirFromFile(path.resolve(filePath));
  if (!planDir) allow();

  const phaseDocs = {};
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    try {
      phaseDocs[phase] = fs.readFileSync(path.join(planDir, phase + '.md'), 'utf8');
    } catch {
      phaseDocs[phase] = null;
    }
  }

  const result = evaluateProgressApprovalGate({
    enabled: true,
    mode: gateCfg.mode === 'advisory' ? 'advisory' : 'strict',
    filePath: filePath,
    oldContent: resolved.oldContent,
    newContent: resolved.newContent,
    phaseDocs: phaseDocs,
  });

  if (result.message) console.error(result.message);
  if (!result.allow) block(result.message || '[progress-approval-gate] blocked');
  allow();
}
