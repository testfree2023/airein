#!/usr/bin/env node
/**
 * PreToolUse Hook: Approval Guard (3-Mode)
 *
 * Protects approval state fields (requirements:, design:, tasks:) in
 * progress.md from silent modification. Supports 3 configurable modes
 * via quality.json → approvalGuard.mode:
 *
 *   'advisory'        — 仅提醒，不拦截（stderr 警告，exit 0 放行）
 *   'console-confirm' — 拦截 + 允许通过 .claude/approval-confirmed.json 绕过（默认）
 *   'manual-only'     — 严格拦截，必须在外部编辑器中修改 progress.md
 *
 * Console-confirm bypass flow:
 *   1. First attempt → blocked (exit 2) with advisory message
 *   2. Model asks user for confirmation in CC chat
 *   3. User confirms → model creates .claude/approval-confirmed.json
 *   4. Model retries the edit → guard reads confirmation, allows through
 *
 * Exit code 2 = block + advisory message (visible to model)
 * Exit code 0 = allow (no approval state change, or not a progress.md file)
 */

'use strict';

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

// Pattern: docs/plans/P{NNN}-{slug}/progress.md
const PROGRESS_PATTERN = /docs[\\/]plans[\\/]P\d{3}-[^\\/]+[\\/]progress\.md$/i;

function allow() {
  process.stdout.write(stdinData);
  process.exit(0);
}

function block(msg) {
  console.error(msg);
  process.exit(2);
}

/**
 * Load approval guard mode from quality config.
 */
function getMode() {
  try {
    const { loadQualityConfig } = require('../lib/quality-config');
    const config = loadQualityConfig();
    const mode = config.approvalGuard && config.approvalGuard.mode;
    if (mode === 'advisory' || mode === 'console-confirm' || mode === 'manual-only') {
      return mode;
    }
  } catch {}
  return 'console-confirm';
}

/**
 * Get the confirmation file path.
 *
 * The project root is already known — Claude Code (and every supported host via
 * P001 stdin normalization + host-runner.resolveCwd) launches hooks with
 * process.cwd() set to the project root. Resolve it through the shared
 * getProjectDir() helper, which also guards the CC edge case where cwd is
 * ~/.claude/ rather than the project, and falls back via session lookup.
 *
 * Earlier this walked upward from the edited file looking for
 * `.git`/`package.json`/`.claude` markers, which (a) silently locked non-git,
 * non-node projects (dogfood 2026-07-10: airein-test had neither marker) and
 * (b) was host-coupled — any filesystem marker is at best a heuristic for a
 * fact the host already hands us via cwd. The project root is given, not guessed.
 */
function getConfirmationFile() {
  try {
    const { getProjectDir } = require('../lib/utils');
    const { projectDataSubpath, projectDataSubpathForRead } = require('../lib/project-paths');
    const projectDir = getProjectDir();
    if (!projectDir) return null;
    const readPath = projectDataSubpathForRead(projectDir, 'approval-confirmed.json');
    if (fs.existsSync(readPath)) return readPath;
    return projectDataSubpath(projectDir, 'approval-confirmed.json');
  } catch {
    return null;
  }
}

/**
 * Check if there's a valid confirmation for the given changes.
 * Returns true if the confirmation file exists, is <120s old, and matches the changes.
 */
function checkConfirmation(confirmFile, changes) {
  if (!confirmFile || !fs.existsSync(confirmFile)) return false;

  try {
    const stat = fs.statSync(confirmFile);
    const age = Date.now() - stat.mtimeMs;
    if (age > 120000) {
      fs.unlinkSync(confirmFile);
      return false;
    }

    const data = JSON.parse(fs.readFileSync(confirmFile, 'utf8'));
    for (const change of changes) {
      if (data[change.key] !== change.newValue) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Consume (delete) the confirmation file after use.
 */
function consumeConfirmation(confirmFile) {
  try { fs.unlinkSync(confirmFile); } catch {}
}

/**
 * Extract approval key-value pairs from content.
 */
function extractApprovalFields(content) {
  const fields = {};
  if (!content) return fields;
  const re = /^(requirements|design|tasks):\s*(none|draft|approved)/gm;
  let m;
  while ((m = re.exec(content)) !== null) {
    fields[m[1]] = m[2];
  }
  return fields;
}

/**
 * Compare two approval field sets. Returns array of {key, oldValue, newValue}.
 */
function findApprovalChanges(oldFields, newFields) {
  const changed = [];
  for (const key of ['requirements', 'design', 'tasks']) {
    if (oldFields[key] !== newFields[key]) {
      changed.push({ key, oldValue: oldFields[key] || 'none', newValue: newFields[key] || 'none' });
    }
  }
  return changed;
}

/**
 * Handle detected approval state change, dispatching by configured mode.
 */
function handleApprovalChange(filePath, changes) {
  // Only changes involving `approved` need guarding: `* → approved` is the
  // self-approval risk, and `approved → *` (downgrade/removal) bypasses an
  // already-granted approval. Pure `none ↔ draft` transitions are the AI's
  // normal doc-creation steps in the new-plan skill flow (AI marks `draft` →
  // user approves → AI marks `approved`) and must pass without a confirmation
  // file. Filter to approval-touching changes only.
  const approvalChanges = changes.filter(c => c.oldValue === 'approved' || c.newValue === 'approved');
  if (approvalChanges.length === 0) return;

  const mode = getMode();
  const details = approvalChanges.map(c => `${c.key}: ${c.oldValue} → ${c.newValue}`).join(', ');

  // ── Advisory mode: warn but allow ──────────────────────────────
  if (mode === 'advisory') {
    console.error(`[Approval Guard] ⚠️ 提醒: progress.md 审批状态变更: ${details} (advisory 模式，已放行)`);
    return; // exit 0 via allow()
  }

  // ── Manual-only mode: strict block, no bypass ──────────────────
  if (mode === 'manual-only') {
    block(
      `[Approval Guard] 🚫 progress.md 审批状态变更被拒绝: ${details}\n` +
      `当前模式: manual-only（严格模式），无法通过 CC 控制台修改审批状态。\n` +
      `请在外部编辑器中手动修改 progress.md 的审批字段。`
    );
  }

  // ── Console-confirm mode (default): block + confirmation file bypass ──
  const confirmFile = getConfirmationFile();

  if (checkConfirmation(confirmFile, approvalChanges)) {
    consumeConfirmation(confirmFile);
    return; // exit 0 via allow()
  }

  const confirmData = {};
  for (const c of approvalChanges) {
    confirmData[c.key] = c.newValue;
  }
  const confirmPath = confirmFile
    ? confirmFile.replace(/\\/g, '/')
    : '.airein/approval-confirmed.json';

  block(
    `[Approval Guard] ⚠️ progress.md 审批状态变更: ${details}\n` +
    `请确认是否批准此变更。如果用户已确认，请创建确认文件后重试：\n` +
    `  Write(${confirmPath}) 内容: ${JSON.stringify(confirmData)}\n` +
    `创建后重新执行编辑即可通过。（确认文件 120 秒后自动过期）`
  );
}

function main() {
  let input;
  try { input = JSON.parse(stdinData); } catch { allow(); }

  const filePath = input.tool_input?.file_path || input.input?.file_path || '';
  if (!filePath) allow();

  const normalizedPath = filePath.replace(/\\/g, '/');
  if (!PROGRESS_PATTERN.test(normalizedPath)) allow();

  const toolName = (input.tool_name || '').toLowerCase();

  if (toolName === 'edit') {
    handleEdit(input, filePath);
  } else if (toolName === 'write') {
    handleWrite(input, filePath);
  } else {
    allow();
  }
}

function handleEdit(input, filePath) {
  const oldString = input.tool_input?.old_string || '';
  const newString = input.tool_input?.new_string || '';

  const oldHasApproval = /^(requirements|design|tasks):/m.test(oldString);
  const newHasApproval = /^(requirements|design|tasks):/m.test(newString);

  if (!oldHasApproval && !newHasApproval) allow();

  let currentContent = '';
  try {
    currentContent = fs.readFileSync(filePath, 'utf8');
  } catch {
    allow();
  }

  const editedContent = currentContent.replace(oldString, newString);

  const oldFields = extractApprovalFields(currentContent);
  const newFields = extractApprovalFields(editedContent);
  const changes = findApprovalChanges(oldFields, newFields);

  if (changes.length > 0) {
    handleApprovalChange(filePath, changes);
  }

  allow();
}

function handleWrite(input, filePath) {
  const newContent = input.tool_input?.content || '';

  let currentContent = '';
  try {
    currentContent = fs.readFileSync(filePath, 'utf8');
  } catch {
    // File doesn't exist yet — new progress.md creation is allowed
    allow();
  }

  const oldFields = extractApprovalFields(currentContent);
  const newFields = extractApprovalFields(newContent);
  const changes = findApprovalChanges(oldFields, newFields);

  if (changes.length > 0) {
    handleApprovalChange(filePath, changes);
  }

  allow();
}
