#!/usr/bin/env bash
# run-hook.sh — Resolve node binary and exec the given hook script
#
# macOS non-login shells may not have node in PATH.
# This wrapper resolves node before executing the hook.
# Usage: bash run-hook.sh <script.js> [args...]
#
# stdin is passed through to the target script.
#
# Windows / WSL: System32\bash.exe launches this inside WSL. Claude Code's
# stdin pipe across the WSL boundary often never closes → hung bash+wsl
# orphans by the hundreds. On win32, airein registers `node hook.js` directly;
# if this script is still reached (stale --resume session / landmine hooks.json),
# fail-open immediately — never exec node under WSL for CC hooks.

if [ -n "${WSL_DISTRO_NAME:-}" ] || { [ -f /proc/version ] && grep -qi microsoft /proc/version 2>/dev/null; }; then
  echo "[airein] run-hook.sh refused under WSL/Windows bash (prevents process leak). Re-run airein update and restart Claude Code so hooks use node directly." >&2
  exit 0
fi

NODE_BIN="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE_BIN" ]; then
  for candidate in "$HOME/.homebrew/bin/node" /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$candidate" ]; then
      NODE_BIN="$candidate"
      break
    fi
  done
fi

if [ -z "$NODE_BIN" ]; then
  echo "[Hook] ERROR: node not found, skipping $1" >&2
  exit 0  # Don't block CC on missing node
fi

exec "$NODE_BIN" "$@"
