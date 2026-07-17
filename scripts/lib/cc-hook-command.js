/**
 * cc-hook-command — Rewrite Claude Code hook command lines for the host OS.
 *
 * Why: hooks.json historically shipped Unix-friendly:
 *   bash "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/run-hook.sh" ".../hook.js"
 * run-hook.sh exists so macOS non-login shells still find `node`.
 *
 * On Windows, `bash` resolves to System32\bash.exe (WSL). Those processes often
 * hang on stdin and leak hundreds of wsl/bash PIDs. Cursor already uses
 * `node .../host/cursor.js`; CC merge path must do the same: drop the bash
 * wrapper and invoke node on the target .js directly.
 *
 * Residual (2026-07-16): long-lived CC --resume sessions and leftover
 * ~/.claude/projects/<slug>/hooks/hooks.json can still register the bash form.
 * purgeStaleCcBashHooks rewrites those landmines on win32; run-hook.sh
 * fail-opens under WSL so a stale session cannot keep leaking.
 *
 * Pure where noted. purgeStaleCcBashHooks does filesystem IO (injectable).
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * @param {string} command
 * @param {string} [platform] process.platform value (`win32` | `darwin` | `linux` | …)
 * @returns {string}
 */
function rewriteCcHookCommand(command, platform = process.platform) {
  const cmd = String(command || '');
  if (platform !== 'win32') return cmd;

  // Quoted: bash "<any>/scripts/hooks/run-hook.sh" "<script.js>" [args...]
  let m = cmd.match(
    /^bash\s+"([^"]*\/scripts\/hooks\/run-hook\.sh)"\s+"([^"]+\.js)"(.*)$/,
  );
  if (m) {
    return `node "${m[2]}"${m[3] || ''}`;
  }

  // Unquoted (some writers / process listings strip quotes)
  m = cmd.match(
    /^bash\s+(\S*\/scripts\/hooks\/run-hook\.sh)\s+(\S+\.js)(.*)$/,
  );
  if (m) {
    return `node "${m[2]}"${m[3] || ''}`;
  }

  return cmd;
}

/**
 * Deep-walk a resolved hooks object and rewrite each command in place.
 * @param {Object<string, Array<{hooks?: Array<{command?: string}>}>>} hooks
 * @param {string} [platform]
 * @returns {typeof hooks}
 */
function rewriteResolvedHooks(hooks, platform = process.platform) {
  if (!hooks || typeof hooks !== 'object') return hooks;
  for (const list of Object.values(hooks)) {
    for (const group of list || []) {
      for (const h of group.hooks || []) {
        if (typeof h.command === 'string') {
          h.command = rewriteCcHookCommand(h.command, platform);
        }
      }
    }
  }
  return hooks;
}

/**
 * Discover candidate JSON files under a Claude home that may still register
 * bash … run-hook.sh (global settings + project landmines).
 * @param {string} claudeHome
 * @returns {string[]}
 */
function listCcHookCandidateFiles(claudeHome) {
  const out = [];
  if (!claudeHome) return out;

  for (const name of ['settings.json', 'settings.local.json', path.join('hooks', 'hooks.json')]) {
    const p = path.join(claudeHome, name);
    if (fs.existsSync(p)) out.push(p);
  }

  const projectsDir = path.join(claudeHome, 'projects');
  if (!fs.existsSync(projectsDir)) return out;

  let projectNames;
  try {
    projectNames = fs.readdirSync(projectsDir);
  } catch {
    return out;
  }

  for (const name of projectNames) {
    const base = path.join(projectsDir, name);
    for (const rel of [
      'settings.json',
      'settings.local.json',
      path.join('hooks', 'hooks.json'),
    ]) {
      const p = path.join(base, rel);
      if (fs.existsSync(p)) out.push(p);
    }
  }
  return out;
}

/**
 * On win32, rewrite any discovered CC JSON that still uses bash run-hook.sh.
 * No-op on non-Windows. IO injectable for tests.
 *
 * @param {string} claudeHome e.g. ~/.claude
 * @param {{
 *   platform?: string,
 *   listFiles?: (home: string) => string[],
 *   readFile?: (p: string) => string,
 *   writeFile?: (p: string, c: string) => void,
 * }} [opts]
 * @returns {{ fixed: string[] }}
 */
function purgeStaleCcBashHooks(claudeHome, opts = {}) {
  const platform = opts.platform || process.platform;
  if (platform !== 'win32') return { fixed: [] };

  const listFiles = opts.listFiles || listCcHookCandidateFiles;
  const readFile = opts.readFile || ((p) => fs.readFileSync(p, 'utf8'));
  const writeFile = opts.writeFile || ((p, c) => fs.writeFileSync(p, c, 'utf8'));

  const fixed = [];
  for (const file of listFiles(claudeHome) || []) {
    let raw;
    try {
      raw = readFile(file);
    } catch {
      continue;
    }
    if (!raw || !raw.includes('run-hook.sh')) continue;

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!data || typeof data.hooks !== 'object') continue;

    const before = JSON.stringify(data.hooks);
    rewriteResolvedHooks(data.hooks, platform);
    // Also rewrite unresolved placeholders still in bash form
    const afterWalk = JSON.stringify(data.hooks);
    // Placeholders: bash "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/run-hook.sh" "..."
    // rewriteCcHookCommand only matches resolved paths with /scripts/hooks/ —
    // ${CLAUDE_PLUGIN_ROOT}/scripts/... still matches because of \/scripts\/hooks
    if (before === afterWalk) continue;

    data.hooks = data.hooks;
    writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
    fixed.push(file);
  }
  return { fixed };
}

module.exports = {
  rewriteCcHookCommand,
  rewriteResolvedHooks,
  purgeStaleCcBashHooks,
  listCcHookCandidateFiles,
};
