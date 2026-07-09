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

# Resolve node binary (not in default PATH on some macOS setups)
NODE_BIN="$(command -v node 2>/dev/null || echo /usr/local/bin/node)"

exec "$NODE_BIN" "$SCRIPT_DIR/merge-hooks.js" "$HOOKS_FILE" "$CLAUDE_DIR" "$SETTINGS_FILE"
