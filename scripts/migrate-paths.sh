#!/usr/bin/env bash
# migrate-paths.sh — legacy 包装器（转发到 P004 migrate-project-to-airein.js）
#
# 旧脚本仅迁 .claude 内部子路径；P004 统一迁到 .airein/ + CC rules shim。
#
# 用法（在项目根）：
#   bash ~/.airein/scripts/migrate-paths.sh
#   bash ~/.airein/scripts/migrate-paths.sh --dry-run

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATE_JS="$SCRIPT_DIR/migrate-project-to-airein.js"

if [ ! -f "$MIGRATE_JS" ]; then
  echo "❌ 未找到 $MIGRATE_JS — 请先 airein setup / update 刷新内核" >&2
  exit 1
fi

NODE_BIN="${NODE_BIN:-$(command -v node 2>/dev/null || true)}"
if [ -z "$NODE_BIN" ]; then
  echo "❌ 需要 Node.js" >&2
  exit 1
fi

exec "$NODE_BIN" "$MIGRATE_JS" "$@"
