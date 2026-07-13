#!/usr/bin/env bash
# install-dashboard.sh — 安装/更新 Dashboard 管理面板（P004：内核 ~/.airein/dashboard/）
#
# Dashboard 是 airein 内核的一部分，与 skills/hooks 同驻 ~/.airein/。
# airein update 的 sync 已复制 dashboard/；本脚本在需要时补拷贝、写 config、重启。
#
# 用法:
#   bash install-dashboard.sh <airein_src> [--with-dashboard|--skip-dashboard]
#
# 参数:
#   airein_src:  airein 源码或内核目录（含 dashboard/ 子目录）
#   --with-dashboard:  非交互，直接安装/更新
#   --skip-dashboard:  跳过

set -euo pipefail

AIREIN_SRC="${1:?用法: install-dashboard.sh <airein_src> [--with-dashboard|--skip-dashboard]}"
shift || true

KERNEL_ROOT="${AIREIN_KERNEL:-$HOME/.airein}"
DASHBOARD_DIR="$KERNEL_ROOT/dashboard"
DASHBOARD_SRC="$AIREIN_SRC/dashboard"

if [ ! -d "$DASHBOARD_SRC" ]; then
  echo "  ⏭️  源码中无 Dashboard，跳过"
  exit 0
fi

INSTALL_MODE="interactive"
for arg in "$@"; do
  case "$arg" in
    --with-dashboard) INSTALL_MODE="yes" ;;
    --skip-dashboard) INSTALL_MODE="no" ;;
  esac
done

if [ "$INSTALL_MODE" = "yes" ]; then
  DO_INSTALL="y"
elif [ "$INSTALL_MODE" = "no" ]; then
  DO_INSTALL="n"
elif [ -d "$DASHBOARD_DIR" ]; then
  echo "🖥️  检测到已有 Dashboard（$DASHBOARD_DIR），自动更新..."
  DO_INSTALL="y"
else
  echo "🖥️  是否安装 Dashboard 管理面板到 $DASHBOARD_DIR ？(y/N)"
  read -r DO_INSTALL
fi

if [ "$DO_INSTALL" != "y" ] && [ "$DO_INSTALL" != "Y" ]; then
  echo "  ⏭️  跳过 Dashboard"
  exit 0
fi

abs_path() {
  (cd "$1" 2>/dev/null && pwd) || echo ""
}

SRC_P="$(abs_path "$DASHBOARD_SRC")"
mkdir -p "$DASHBOARD_DIR"
DST_P="$(abs_path "$DASHBOARD_DIR")"

echo "🖥️  Dashboard → $DASHBOARD_DIR"

if [ -n "$SRC_P" ] && [ -n "$DST_P" ] && [ "$SRC_P" != "$DST_P" ]; then
  COPIED=0
  while IFS= read -r -d '' file; do
    rel="${file#$DASHBOARD_SRC/}"
    dst="$DASHBOARD_DIR/$rel"
    mkdir -p "$(dirname "$dst")"
    cp "$file" "$dst"
    COPIED=$((COPIED + 1))
  done < <(find "$DASHBOARD_SRC" -type f -print0)
  echo "  ✅ 复制了 $COPIED 个文件"
else
  echo "  ✅ 已与内核 sync 同步（跳过重复复制）"
fi

# kernelRoot：dashboard 的上一级即 ~/.airein
NODE_BIN="$(command -v node 2>/dev/null || true)"
CONFIG_FILE="$DASHBOARD_DIR/config.json"
if [ -n "$NODE_BIN" ]; then
  "$NODE_BIN" -e "
    const fs = require('fs');
    const cfgPath = process.argv[1];
    const kernelRoot = process.argv[2];
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch {}
    cfg.kernelRoot = kernelRoot;
    if (!cfg.dashboard) cfg.dashboard = {};
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  " "$CONFIG_FILE" "$KERNEL_ROOT"
  echo "  ✅ kernelRoot → $KERNEL_ROOT"
fi

if [ -d "$HOME/dashboard" ] && [ "$(abs_path "$HOME/dashboard")" != "$DST_P" ]; then
  echo "  ℹ️  遗留独立安装 ~/dashboard 可删除: rm -rf ~/dashboard"
fi

echo ""
echo "  📌 启动: bash $DASHBOARD_DIR/start.sh --bg --lan"
echo "  📌 停止: bash $DASHBOARD_DIR/start.sh stop"

if [ -f "$DASHBOARD_DIR/dashboard.pid" ]; then
  OLD_PID="$(head -n1 "$DASHBOARD_DIR/dashboard.pid" 2>/dev/null | tr -d '[:space:]' || true)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "  🔄 检测到 Dashboard 正在运行，自动重启..."
    (cd "$DASHBOARD_DIR" && bash start.sh restart 2>/dev/null) || true
  fi
fi
