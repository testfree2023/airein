/**
 * cc-hook-command — Rewrite Claude Code hook command lines for the host OS.
 *
 * Why: hooks.json ships Unix-friendly:
 *   bash "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/run-hook.sh" ".../hook.js"
 * run-hook.sh exists so macOS non-login shells still find `node`.
 *
 * On Windows, `bash` resolves to System32\bash.exe (WSL). Those processes often
 * hang on stdin and leak hundreds of wsl/bash PIDs. Cursor already uses
 * `node .../host/cursor.js`; CC merge path must do the same: drop the bash
 * wrapper and invoke node on the target .js directly.
 *
 * Pure: (command, platform) → command. No IO.
 */

'use strict';

/**
 * @param {string} command
 * @param {string} [platform] process.platform value (`win32` | `darwin` | `linux` | …)
 * @returns {string}
 */
function rewriteCcHookCommand(command, platform = process.platform) {
  const cmd = String(command || '');
  if (platform !== 'win32') return cmd;

  // bash "<any>/scripts/hooks/run-hook.sh" "<script.js>" [args...]
  const m = cmd.match(
    /^bash\s+"([^"]*\/scripts\/hooks\/run-hook\.sh)"\s+"([^"]+\.js)"(.*)$/,
  );
  if (!m) return cmd;

  const script = m[2];
  const rest = m[3] || '';
  return `node "${script}"${rest}`;
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

module.exports = { rewriteCcHookCommand, rewriteResolvedHooks };