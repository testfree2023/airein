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
 * Exit code 2 = block Write this turn; model must change path/naming and retry
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

  if (/^(README|CLAUDE|AGENTS|CONTRIBUTING|CHANGELOG|RELEASES|LICENSE|SKILL|MEMORY|WORKLOG|CONTEXT|SECURITY|CODE_OF_CONDUCT|SUPPORT)\.md$/i.test(basename)) {
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
      // PreToolUse exit 2 + stderr: visible to the model.
      // Wording must match the hard-block semantics — never imply "可以创建"
      // (dogfood-found 2026-07-10: earlier wording said the file could be
      // created, contradicting exit 2 and misleading the model into retrying).
      console.error(
        `[Doc Warning] ⚠️ ${path.basename(filePath)}: 非标准文档文件位置,已阻断写入。\n` +
        `请改放到 docs/ 目录下,或使用标准命名（README.md、CHANGELOG.md 等）。`
      );
      process.exit(2);
    }
  } catch {
    // ignore parse errors
  }

  allow();
});
