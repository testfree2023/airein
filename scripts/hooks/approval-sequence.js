#!/usr/bin/env node
/**
 * PreToolUse Hook: Approval Sequence
 *
 * Enforces configured plan document creation order (default: R→D→T)
 * for plan documents. Blocks each document until the previous document in
 * the configured pipeline is approved. Also blocks the first document until
 * the grilling/brainstorming phase is completed.
 *
 * Exit code 2 = block the tool call
 * Exit code 0 = allow (stdout must passthrough original stdin)
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
  try { main(); } catch { allow(); }
});

// Pattern: docs/plans/P{NNN}-{slug}/filename.md
const PLAN_FILE_PATTERN = /docs[\\/]plans[\\/]P\d{3}-[^\\/]+[\\/]([^\\/]+)\.md$/i;

function allow() {
  process.stdout.write(stdinData);
  process.exit(0);
}

function block(message) {
  console.error(message);
  process.exit(2);
}

function main() {
  let input;
  try { input = JSON.parse(stdinData); } catch { allow(); }

  const filePath = input.tool_input?.file_path || input.input?.file_path || '';
  if (!filePath) allow();

  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, '/');

  // Only check plan document files
  const match = normalizedPath.match(PLAN_FILE_PATTERN);
  if (!match) allow();

  const fileType = match[1].toLowerCase(); // 'requirements', 'design', or 'tasks'

  // Resolve plan directory
  const planDirMatch = normalizedPath.match(/(.+docs[\\/]plans[\\/]P\d{3}-[^\\/]+)[\\/]/i);
  if (!planDirMatch) allow();

  const planDir = planDirMatch[1].replace(/\//g, path.sep);
  const progressPath = path.join(planDir, 'progress.md');

  // No progress.md yet — plan just being created, don't block
  if (!fs.existsSync(progressPath)) allow();

  let progressContent;
  try {
    progressContent = fs.readFileSync(progressPath, 'utf8');
  } catch { allow(); }

  // Parse progress to get approval state, complexity, and grilling state
  let approval, complexity, grilling, config, pipeline;
  try {
    const { getApprovalState, getComplexity, getGrillingState } = require('../lib/plan-parser');
    const { loadQualityConfig, loadGlobalPipelines } = require('../lib/quality-config');
    approval = getApprovalState(progressContent);
    complexity = getComplexity(progressContent);
    grilling = getGrillingState(progressContent);
    config = loadQualityConfig();

    const pipelines = loadGlobalPipelines();
    const LEGACY_MAP = { 'simple': 's-bugfix', 'medium': 'm-bugfix', 'complex': 'm-feature' };
    const choice = config?.planWorkflow?.pipeline;
    if (choice && choice !== 'auto' && pipelines[choice]) {
      pipeline = pipelines[choice].map(doc => String(doc).toLowerCase());
    } else {
      const resolved = pipelines[complexity] ? complexity : (LEGACY_MAP[complexity] || 'm-feature');
      pipeline = pipelines[resolved] || pipelines['m-feature'] || ['tasks'];
    }
  } catch { allow(); }

  const docIndex = pipeline.indexOf(fileType);

  // Documents outside the configured pipeline are not sequence-managed.
  if (docIndex === -1) allow();

  if (docIndex === 0 && config?.planWorkflow?.enforceGrilling !== false && grilling !== 'completed') {
    block(
      `[Approval Sequence] 🚫 ${fileType}.md: 需求沟通/头脑风暴阶段尚未完成。\n` +
      `请先完成沟通并在 progress.md 中设置 grilling: completed 后再创建第一份文档。当前状态: ${grilling || 'none'}`
    );
  }

  if (docIndex > 0) {
    const previousDoc = pipeline[docIndex - 1];
    const previousState = approval[previousDoc] || 'none';
    if (previousState !== 'approved') {
      block(
        `[Approval Sequence] 🚫 ${fileType}.md: 前置文档 (${previousDoc}.md) 尚未批准。\n` +
        `请先完成 ${previousDoc}.md 审批后再创建 ${fileType}.md。当前 ${previousDoc} 状态: ${previousState}`
      );
    }
  }

  allow();
}
