#!/usr/bin/env bash
# setup-airein.sh — DEPRECATED (P004): use `airein setup` instead.
echo "⚠️  setup-airein.sh 已弃用，请改用: airein setup（见 README）" >&2
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AIREIN_BIN="$SCRIPT_DIR/airein"
if [[ ! -f "$AIREIN_BIN" ]]; then
  AIREIN_BIN="$HOME/.airein/airein"
fi
if [[ ! -f "$AIREIN_BIN" ]]; then
  echo "❌ 找不到 airein 命令。请先 clone 仓库或安装内核到 ~/.airein" >&2
  exit 1
fi
exec bash "$AIREIN_BIN" setup "$@"
