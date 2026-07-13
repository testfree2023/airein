#!/usr/bin/env bash
# clean-airein.sh — 清理目标目录中的废弃文件
#
# 在 sync-airein.sh 之前运行，确保目标目录干净。
# 只删除明确的废弃文件列表，不猜测。
#
# 用法: bash clean-airein.sh <target_dir>
#   target_dir: 通常是 ~/.claude

set -euo pipefail

TARGET_DIR="${1:?用法: clean-airein.sh <target_dir>}"

if [ ! -d "$TARGET_DIR" ]; then
  echo "❌ 目标目录不存在: $TARGET_DIR"
  exit 1
fi

echo "🧹 清理废弃文件..."

# ── 已知的废弃文件（从 airein 中移除或重命名的）─────────────────
STALE_FILES=(
  # 曾经存在但已移除的文件，添加到这里
  # 格式: 相对于 TARGET_DIR 的路径
  # 例如: "scripts/hooks/old-hook.js"
  # P018: conventions-trigger hook 退役 — L1 conventions 改走 CC 原生条件规则（薄壳）
  "scripts/hooks/conventions-trigger.js"
  # P004: 统一入口 airein CLI，旧顶层安装脚本退役
  "setup-airein.sh"
  "update-airein.sh"
)

STALE_DIRS=(
  "templates/project-docs"
  "templates/knowledge"
  "skills/onboard-project"
  "skills/lookup"
  "skills/update-knowledge"
  # P016: rules/ 退场 — 通用语言规范改由 design-conventions 体系承载
  "rules/python"
  "rules/typescript"
  # P017: rules/ 收归顶层 00/10/20，common/ 子目录（含 core-rules.md）退役
  "rules/common"
  # P019: self-improving → self-learning（旧 skill 目录残留）
  "skills/self-improving"
  # P004: 用户运行时 skill 根（应在 ~/.claude/skills/learned|imported，不在内核 skills/）
  "skills/learned"
  "skills/imported"
  # P004: Dashboard 独立安装到 ~/dashboard，内核内残留副本删除
  "dashboard"
)

REMOVED=0

if [ ${#STALE_FILES[@]} -gt 0 ]; then
  for file in "${STALE_FILES[@]}"; do
    target="$TARGET_DIR/$file"
    if [ -f "$target" ]; then
      rm -f "$target"
      echo "  🗑️  删除: $file"
      REMOVED=$((REMOVED + 1))
    fi
  done
fi

if [ ${#STALE_DIRS[@]} -gt 0 ]; then
  for dir in "${STALE_DIRS[@]}"; do
    target="$TARGET_DIR/$dir"
    if [ -d "$target" ]; then
      rm -rf "$target"
      echo "  🗑️  删除目录: $dir"
      REMOVED=$((REMOVED + 1))
    fi
  done
fi

# ── 清理 ~/.claude 的 git 关联（不应该存在）─────────────────────
if [ -d "$TARGET_DIR/.git" ]; then
  echo "  ⚠️  发现 .git 目录（~/.claude 不应该是 git 仓库）"
  echo "     保留不删除，但更新不会使用 git pull"
fi

if [ "$REMOVED" -gt 0 ]; then
  echo "  ✅ 清理了 $REMOVED 个废弃文件"
else
  echo "  ✅ 无废弃文件需要清理"
fi
