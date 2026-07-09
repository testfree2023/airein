#!/usr/bin/env node
/**
 * PreToolUse Hook: Doc file warning
 *
 * Warns about non-standard documentation files BEFORE they are created.
 * Uses exit 2 + stderr so the model sees the warning (same pattern as plan-gate).
 *
 * Previously tried PostToolUse + console.log (stdout invisible to model).
 * Previously tried PreToolUse + additionalContext (also invisible for plugin hooks).
 * Only exit 2 + stderr is reliably visible to the model in PreToolUse.
 *
 * Exit code 2 = block with visible warning (model can choose to continue)
 * Exit code 0 = allow (stdin passthrough)
 */

'use strict';

const path = require('path');

const MAX_STDIN = 1024 * 1024;
let data = '';

function isAllowedDocPath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const basename = path.basename(filePath);

  if (!/\.(md|txt)$/i.test(filePath)) return true;

  if (/^(README|CLAUDE|AGENTS|CONTRIBUTING|CHANGELOG|RELEASES|LICENSE|SKILL|MEMORY|WORKLOG|CONTEXT)\.md$/i.test(basename)) {
    return true;
  }

  if (/\.claude\/(commands|plans|projects|self-learning)\//.test(normalized)) {
    return true;
  }

  if (/(^|\/)(docs|skills|templates|\.history|memory|rules)\//.test(normalized)) {
    return true;
  }

  if (/\.plan\.md$/i.test(basename)) {
    return true;
  }

  return false;
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', c => {
  if (data.length < MAX_STDIN) {
    const remaining = MAX_STDIN - data.length;
    data += c.substring(0, remaining);
  }
});
process.stdin.on('end', () => {
  // Default: allow (passthrough stdin)
  function allow() {
    process.stdout.write(data);
    process.exit(0);
  }

  try {
    const input = JSON.parse(data);
    const filePath = String(input.tool_input?.file_path || '');

    if (filePath && !isAllowedDocPath(filePath)) {
      // PreToolUse exit 2 + stderr: visible to the model
      console.error(
        `[Doc Warning] ⚠️ ${path.basename(filePath)}: 非标准文档文件位置。\n` +
        `建议将文档放在 docs/ 目录下，或使用标准命名（README.md、CHANGELOG.md 等）。\n` +
        `注意：此文件可以创建，但建议确认位置是否合理。`
      );
      process.exit(2);
    }
  } catch {
    // ignore parse errors
  }

  allow();
});
