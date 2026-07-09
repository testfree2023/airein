#!/usr/bin/env bash
# run-hook.sh — Resolve node binary and exec the given hook script
#
# macOS non-login shells may not have node in PATH.
# This wrapper resolves node before executing the hook.
# Usage: bash run-hook.sh <script.js> [args...]
#
# stdin is passed through to the target script.

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
