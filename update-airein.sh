#!/usr/bin/env bash
# update-airein.sh — 一键更新 Airein
#
# 薄编排器：clone → clean → sync → dashboard → verify
# 实际逻辑在 scripts/update/ 子脚本中，方便独立升级。
#
# 用法:
#   bash ~/.claude/update-airein.sh          # 标准更新
#   bash update-airein.sh                    # 从 clone 目录运行

set -euo pipefail

REPO="git@github.com:testfree2023/airein.git"
CLAUDE_DIR="$HOME/.claude"
TEMP_CLONE=""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Airein — 更新"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. 克隆最新代码到临时目录 ──────────────────────────────────
echo "📥 获取最新版本..."

TEMP_CLONE=$(mktemp -d /tmp/airein-update-XXXXXX)
git clone --depth 1 "$REPO" "$TEMP_CLONE/airein" 2>/dev/null || {
  echo "  ❌ clone 失败，请检查网络和 SSH key"
  echo "     REPO: $REPO"
  rm -rf "$TEMP_CLONE"
  exit 1
}
AIREIN_SRC="$TEMP_CLONE/airein"
echo "  ✅ 下载完成 → $TEMP_CLONE/airein"

# ── 2. 清理废弃文件 ──────────────────────────────────────────
echo ""
if [ -f "$AIREIN_SRC/scripts/update/clean-airein.sh" ]; then
  bash "$AIREIN_SRC/scripts/update/clean-airein.sh" "$CLAUDE_DIR"
else
  echo "🧹 clean-airein.sh 不存在，跳过清理"
fi

# ── 3. 同步文件 ──────────────────────────────────────────────
echo ""
if [ -f "$AIREIN_SRC/scripts/update/sync-airein.sh" ]; then
  bash "$AIREIN_SRC/scripts/update/sync-airein.sh" "$AIREIN_SRC" "$CLAUDE_DIR" "$(pwd)"
else
  echo "❌ sync-airein.sh 不存在，无法同步"
  rm -rf "$TEMP_CLONE"
  exit 1
fi

# ── 4. Dashboard 安装（委托给独立脚本）────────────────────────
echo ""
if [ -f "$AIREIN_SRC/scripts/dashboard/install-dashboard.sh" ]; then
  bash "$AIREIN_SRC/scripts/dashboard/install-dashboard.sh" "$AIREIN_SRC" "$@"
fi

# ── 5. 自我更新（最后一步）────────────────────────────────────
if [ -f "$AIREIN_SRC/update-airein.sh" ]; then
  cp "$AIREIN_SRC/update-airein.sh" "$CLAUDE_DIR/update-airein.sh" 2>/dev/null || true
fi

# ── 6. 清理临时目录 ──────────────────────────────────────────
rm -rf "$TEMP_CLONE"

# ── 7. 结果 ──────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Airein 更新完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  配置文件未覆盖（settings/quality/memory）"
echo "  如需查看更新内容: cat ~/.claude/RELEASES.md"
echo ""
