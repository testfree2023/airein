#!/usr/bin/env bash
# install-dashboard.sh — 安装/更新 Dashboard 管理面板
#
# 从 airein 源码复制 dashboard 文件到 ~/dashboard/。
# 可独立运行，也可被 airein update 流程调用。
#
# 用法:
#   bash install-dashboard.sh <airein_src> [--with-dashboard|--skip-dashboard]
#   bash install-dashboard.sh <airein_src>                    # 交互式提示
#
# 参数:
#   airein_src:    airein clone 目录路径
#   --with-dashboard:  非交互模式，直接安装/更新
#   --skip-dashboard:  非交互模式，跳过

set -euo pipefail

AIREIN_SRC="${1:?用法: install-dashboard.sh <airein_src> [--with-dashboard|--skip-dashboard]}"
shift || true

DASHBOARD_DIR="$HOME/dashboard"
DASHBOARD_SRC="$AIREIN_SRC/dashboard"

# 检查源码中是否有 dashboard
if [ ! -d "$DASHBOARD_SRC" ]; then
  echo "  ⏭️  源码中无 Dashboard，跳过"
  exit 0
fi

# 解析参数
INSTALL_MODE="interactive"
for arg in "$@"; do
  case "$arg" in
    --with-dashboard) INSTALL_MODE="yes" ;;
    --skip-dashboard) INSTALL_MODE="no" ;;
  esac
done

# 决定是否安装
if [ "$INSTALL_MODE" = "yes" ]; then
  DO_INSTALL="y"
elif [ "$INSTALL_MODE" = "no" ]; then
  DO_INSTALL="n"
elif [ -d "$DASHBOARD_DIR" ]; then
  echo "🖥️  检测到已有 Dashboard 安装，自动更新..."
  DO_INSTALL="y"
else
  echo "🖥️  是否安装 Dashboard 管理面板？(y/N)"
  read -r DO_INSTALL
fi

if [ "$DO_INSTALL" != "y" ] && [ "$DO_INSTALL" != "Y" ]; then
  echo "  ⏭️  跳过 Dashboard（以后可重新运行并选 y 安装）"
  exit 0
fi

# ── 安装/更新 ────────────────────────────────────────────────
echo "🖥️  安装 Dashboard → $DASHBOARD_DIR"
mkdir -p "$DASHBOARD_DIR"

COPIED=0
while IFS= read -r -d '' file; do
  rel="${file#$DASHBOARD_SRC/}"
  dst="$DASHBOARD_DIR/$rel"
  mkdir -p "$(dirname "$dst")"
  cp "$file" "$dst"
  COPIED=$((COPIED + 1))
done < <(find "$DASHBOARD_SRC" -type f -print0)

echo "  ✅ 复制了 $COPIED 个文件到 $DASHBOARD_DIR"
echo ""
echo "  📌 请始终使用: bash $DASHBOARD_DIR/start.sh"
echo "     （不要用 ~/.airein/dashboard/start.sh — 内核不同步 dashboard 副本）"

# ── 写入内核路径（P004：lib 在 ~/.airein，非 ~/.claude）────────────────
KERNEL_ROOT="$HOME/.airein"
if [ ! -f "$KERNEL_ROOT/scripts/lib/utils.js" ] && [ -f "$AIREIN_SRC/scripts/lib/utils.js" ]; then
  KERNEL_ROOT="$AIREIN_SRC"
elif [ ! -f "$KERNEL_ROOT/scripts/lib/utils.js" ] && [ -f "$HOME/.claude/scripts/lib/utils.js" ]; then
  KERNEL_ROOT="$HOME/.claude"
fi

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
  echo "  ✅ kernelRoot → $KERNEL_ROOT (config.json)"
else
  echo "  ⚠️  Node 不可用，未写入 config.json kernelRoot"
fi

# ── 自动重启 ──────────────────────────────────────────────────
# 如果 dashboard 正在运行，自动重启以加载新代码
if [ -f "$DASHBOARD_DIR/dashboard.pid" ]; then
  OLD_PID=$(cat "$DASHBOARD_DIR/dashboard.pid" 2>/dev/null || true)
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "  🔄 检测到 Dashboard 正在运行 (PID $OLD_PID)，自动重启..."
    (cd "$DASHBOARD_DIR" && bash start.sh restart 2>/dev/null) || true
  fi
fi
