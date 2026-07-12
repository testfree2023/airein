#!/usr/bin/env bash
# merge-hooks.sh — Register hooks into GLOBAL settings.json
#
# Usage:
#   bash scripts/merge-hooks.sh [airein-kernel-root] [project-dir]
#
# Arg1: airein kernel (~/.airein) — ${CLAUDE_PLUGIN_ROOT} resolves here (P004).
# settings.json target: ~/.claude/settings.json (CC registration layer).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AIREIN_ROOT="${1:-$HOME/.airein}"
PROJECT_DIR="${2:-$(pwd)}"
HOOKS_FILE="$AIREIN_ROOT/hooks/hooks.json"
CC_HOME="${CLAUDE_DIR:-$HOME/.claude}"

if [ ! -f "$HOOKS_FILE" ]; then
  echo "  ⚠️  hooks.json not found: $HOOKS_FILE"
  exit 1
fi

SETTINGS_FILE="$CC_HOME/settings.json"

HELPERS_LIB="$SCRIPT_DIR/lib/install-helpers.sh"
if [ -f "$HELPERS_LIB" ]; then
  # shellcheck source=lib/install-helpers.sh
  . "$HELPERS_LIB"
  NODE_BIN="$(resolve_node_bin)"
else
  NODE_BIN="$(command -v node 2>/dev/null || echo /usr/local/bin/node)"
fi

exec "$NODE_BIN" "$SCRIPT_DIR/merge-hooks.js" "$HOOKS_FILE" "$AIREIN_ROOT" "$SETTINGS_FILE"
