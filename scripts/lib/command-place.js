/**
 * command-place — K4 commands 放置策略（P003-multi-host-commands · requirements）
 *
 * 纯函数：给定源 commands/ 目录 + 宿主 + 安装根，返回「放置动作」列表（不执行 IO）。
 * airein command 内容零改动；分发层（install-host.js）据此执行 copy。
 *
 * 单一真相源不变量：每宿主放置的 *.md 内容逐字节等同源 —— 这里只决定「放到哪 / 放不放」。
 *
 * 宿主 commands 发现路径：
 *   cursor    → .cursor/commands/<name>.md
 *   codebuddy → .codebuddy/commands/<name>.md
 *   opencode  → commands/<name>.md（项目根；OC 官方 docs/commands/）
 *   codex     → N/A（prompts deprecated + bug #15941）
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 宿主 → commands 发现子路径（相对安装根）。codex 不在此表（N/A）。
 * @type {Record<string,string>}
 */
const HOST_COMMANDS_DIR = {
  cursor: '.cursor/commands',
  codebuddy: '.codebuddy/commands',
  opencode: 'commands',
};

const CODEX_NA_ERROR =
  'codex: commands N/A (prompts deprecated, OpenAI bug #15941 — use skills/hooks only)';

/**
 * List flat *.md command files in srcCommandsDir (no nested subdirs).
 * @param {string} srcCommandsDir
 * @returns {string[]} Basenames sorted for idempotency.
 */
function listCommandFiles(srcCommandsDir) {
  if (!fs.existsSync(srcCommandsDir)) return [];
  return fs.readdirSync(srcCommandsDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name)
    .sort();
}

/**
 * Compute command placement actions for a host.
 *
 * @param {string} srcCommandsDir - Source commands/ directory (truth source).
 * @param {string} host - One of: cursor/codex/codebuddy/opencode.
 * @param {string} targetRoot - Installation root (project dir).
 * @returns {{ actions: Array<{type:string,name:string,src:string,dest:string|null}>, errors: string[] }}
 * @throws {Error} if `host` is not supported.
 */
function commandPlace(srcCommandsDir, host, targetRoot) {
  if (host === 'codex') {
    return { actions: [], errors: [CODEX_NA_ERROR] };
  }

  if (!(host in HOST_COMMANDS_DIR)) {
    throw new Error(
      `commandPlace: unknown host "${host}" (known: cursor/codex/codebuddy/opencode)`,
    );
  }

  const hostDir = HOST_COMMANDS_DIR[host];
  const actions = [];
  const errors = [];

  for (const file of listCommandFiles(srcCommandsDir)) {
    const name = path.basename(file, '.md');
    const src = path.join(srcCommandsDir, file);
    // dest 用 POSIX 分隔，保持跨平台一致的描述；install-host 执行时再按平台落盘。
    const dest = [targetRoot, hostDir, file].join('/');
    actions.push({ type: 'copy', name, src, dest });
  }

  if (actions.length === 0 && fs.existsSync(srcCommandsDir)) {
    errors.push(`${host}: no commands/*.md found in source — skipped`);
  }

  return { actions, errors };
}

module.exports = {
  commandPlace,
  HOST_COMMANDS_DIR,
  listCommandFiles,
  CODEX_NA_ERROR,
};
