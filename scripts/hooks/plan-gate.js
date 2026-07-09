#!/usr/bin/env node
/**
 * PreToolUse Hook: Plan Gate
 *
 * Checks whether source file edits have an approved plan.
 * Modes: strict (exit 2 block) | advisory (exit 2 block with softer message) | disabled (exit 0)
 *
 * Both strict and advisory use exit 2 (block) to ensure the model sees the message.
 * CC does not show hook output to the model on exit 0 (invisible advisory).
 *
 * Exit code 2 = block the tool call
 * Exit code 0 = allow (stdout must passthrough original stdin)
 */

const path = require('path');
const fs = require('fs');
const { loadQualityConfig } = require('../lib/quality-config');
const { extractRedirectPaths } = require('../lib/shell-split');
const { getSourceExtensions, isTestFile, isExemptFile } = require('../lib/language-config');

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

function isSourceFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return getSourceExtensions().has(ext);
}

function isExempt(filePath) {
  return isExemptFile(filePath);
}

function isInExemptPath(filePath, exemptPaths) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return exemptPaths.some(ep => normalizedPath.includes('/' + ep) || normalizedPath.startsWith(ep));
}

function findProjectRoot(filePath) {
  let dir = path.dirname(path.resolve(filePath));
  let fallback = null;
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    if (!fallback && fs.existsSync(path.join(dir, 'package.json'))) fallback = dir;
    const parent = path.dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  return fallback || dir;
}

function main() {
  let input;
  try { input = JSON.parse(stdinData); } catch { allow(); }

  const filePath = input.tool_input?.file_path || input.input?.file_path || '';
  const command = input.tool_input?.command || input.input?.command || '';

  // Collect source file paths to check
  let pathsToCheck = [];

  if (filePath) {
    // Write/Edit: single file path
    pathsToCheck = [filePath];
  } else if (command) {
    // Bash: extract file paths from command
    pathsToCheck = extractRedirectPaths(command);
  }

  if (pathsToCheck.length === 0) allow();

  const config = loadQualityConfig();
  const gateConfig = config.planGate || {};
  const mode = gateConfig.mode || 'advisory';
  const exemptPaths = gateConfig.exemptPaths || ['docs/', '.claude/', 'scripts/hooks/', 'test/'];

  // Disabled mode: allow everything
  if (mode === 'disabled') {
    allow();
    return;
  }

  // Filter to source files only, then check each
  for (const fp of pathsToCheck) {
    if (!isSourceFile(fp)) continue;
    if (isTestFile(fp)) continue;
    if (isExempt(fp)) continue;
    if (isInExemptPath(fp, exemptPaths)) continue;

    // Find project root and check for active plan
    const projectRoot = findProjectRoot(fp);
    const plansDir = path.join(projectRoot, 'docs', 'plans');

    let hasPlanAllowingEdits = false;
    try {
      if (fs.existsSync(plansDir)) {
        const { findActivePlan, getApprovalState } = require('../lib/plan-parser');
        const active = findActivePlan(projectRoot);
        if (active) {
          const approval = getApprovalState(active.progress);
          if (approval.requirements === 'approved' || approval.requirements === 'none') {
            hasPlanAllowingEdits = true;
          }
        }
      }
    } catch {
      // plan-parser unavailable — don't block
      allow();
    }

    if (hasPlanAllowingEdits) continue;

    // No approved plan — block
    const fileName = path.basename(fp);
    if (mode === 'strict') {
      console.error(
        `[Plan Gate] 🚫 ${fileName}: 源文件编辑被拦截 — 无已批准的计划。\n` +
        `请先使用 /new-plan 创建计划并获得审批，或在 quality.json 中调整 planGate.mode。`
      );
      process.exit(2);
    } else {
      console.error(
        `[Plan Gate] ⚠️ ${fileName}: 源文件编辑但无已批准的计划（advisory 模式）。\n` +
        `建议先使用 /new-plan 创建计划。设 planGate.mode='strict' 启用硬拦截。\n` +
        `注意：advisory 模式也会拦截，你可以选择继续或创建计划。`
      );
      process.exit(2);
    }
  }

  // All paths passed checks
  allow();
}
