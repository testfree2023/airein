#!/usr/bin/env bash
# merge-hooks.sh — Register hooks into GLOBAL settings.json
#
# Usage:
#   bash scripts/merge-hooks.sh <claude-dir> [project-dir]
#
# Delegates to merge-hooks.js for cross-platform compatibility.
# Registers hooks to GLOBAL ~/.claude/settings.json because CC only reads
# hooks from there (not project-level settings.local.json).
#
# Self-heal: session-start.js detects when CC overwrites settings.json
# (e.g. on /model switch) and re-runs this script automatically.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="${1:-$HOME/.claude}"
PROJECT_DIR="${2:-$(pwd)}"
HOOKS_FILE="$CLAUDE_DIR/hooks/hooks.json"

if [ ! -f "$HOOKS_FILE" ]; then
  echo "  ⚠️  hooks.json not found: $HOOKS_FILE"
  exit 1
fi

# Target GLOBAL settings.json — CC only reads hooks from here.
# Project-level settings.local.json is NOT read for hooks by CC.
SETTINGS_FILE="$CLAUDE_DIR/settings.json"

# Resolve node binary robustly (nvm/fnm install node off the default PATH on
# macOS; a non-interactive shell misses it — see install-helpers.sh). Prefer
# the shared helper; fall back to the inline resolve only if the lib is absent
# (half-installed state) so hook registration never silently breaks.
HELPERS_LIB="$SCRIPT_DIR/lib/install-helpers.sh"
if [ -f "$HELPERS_LIB" ]; then
  # shellcheck source=lib/install-helpers.sh
  . "$HELPERS_LIB"
  NODE_BIN="$(resolve_node_bin)"
else
  NODE_BIN="$(command -v node 2>/dev/null || echo /usr/local/bin/node)"
fi

exec "$NODE_BIN" "$SCRIPT_DIR/merge-hooks.js" "$HOOKS_FILE" "$CLAUDE_DIR" "$SETTINGS_FILE"
