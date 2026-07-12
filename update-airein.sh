#!/usr/bin/env bash
# update-airein.sh — DEPRECATED (P004): use `airein update` instead.
echo "⚠️  update-airein.sh 已弃用，请改用: airein update（见 README）" >&2
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AIREIN_BIN="$SCRIPT_DIR/airein"
KERNEL="${AIREIN_HOME:-$HOME/.airein}"
if [[ ! -f "$AIREIN_BIN" ]]; then
  AIREIN_BIN="$KERNEL/airein"
fi
if [[ ! -f "$AIREIN_BIN" ]]; then
  echo "❌ 找不到 airein 命令。请先运行 airein setup" >&2
  exit 1
fi
exec bash "$AIREIN_BIN" update "$@"
