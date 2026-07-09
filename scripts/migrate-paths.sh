#!/usr/bin/env bash
# migrate-paths.sh — 项目目录结构迁移脚本
#
# 将旧路径的文件迁移到新的 .claude/{config,memory}/ 结构。
# 对每个已有项目运行一次即可：
#   cd /path/to/your-project
#   bash ~/.claude/scripts/migrate-paths.sh
#
# 新项目不需要运行此脚本。
#
# 说明：此脚本针对旧的全局 self-improving 目录机制（~/self-improving/）。
# 自学习现已改为三层流转，不再使用全局 ~/self-improving/ 目录；
# 本脚本仅为兼容历史数据迁移而保留，找不到源目录会自动跳过。

set -e

PROJECT_DIR="$(pwd)"
HOME_DIR="$HOME"
MIGRATED=0

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  路径迁移（目录结构规范化）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  项目: $PROJECT_DIR"
echo ""

# 迁移函数：
#   旧文件存在 + 新文件不存在 → mv（迁移）
#   旧文件存在 + 新文件是空模板（≤3行）→ 用旧文件覆盖
#   旧文件存在 + 新文件有内容 → 删旧文件（保留新的）
migrate_file() {
  local old="$1"
  local new="$2"
  local label="$3"

  if [ ! -f "$old" ]; then
    return
  fi

  if [ ! -f "$new" ]; then
    mkdir -p "$(dirname "$new")"
    mv "$old" "$new"
    MIGRATED=$((MIGRATED + 1))
    echo "  ✅ $label"
  else
    # 检查新文件是否只是空模板（≤3 行）
    local new_lines
    new_lines=$(wc -l < "$new" 2>/dev/null || echo 999)
    if [ "$new_lines" -le 3 ]; then
      mv "$old" "$new"
      MIGRATED=$((MIGRATED + 1))
      echo "  ✅ $label (覆盖空模板)"
    else
      rm "$old"
      echo "  ✅ 清理旧文件: $label (新路径已有真实内容)"
    fi
  fi
}

# ── 项目级迁移 ──────────────────────────────────────────────────
echo "📦 项目级文件迁移..."

migrate_file \
  "$PROJECT_DIR/.claude/quality.json" \
  "$PROJECT_DIR/.claude/config/quality.json" \
  "quality.json → .claude/config/"

migrate_file \
  "$PROJECT_DIR/.claude/session-state.md" \
  "$PROJECT_DIR/.claude/memory/session-state.md" \
  "session-state.md → .claude/memory/"

if [ $MIGRATED -eq 0 ]; then
  echo "  ✅ 项目文件已是最新路径（无需迁移）"
fi

# ── 全局 → 项目级迁移 ──────────────────────────────────────────
PROJECT_MIGRATED=0
echo ""
echo "📦 全局 → 项目级迁移..."

project_name=$(basename "$PROJECT_DIR" | sed 's/[^a-zA-Z0-9_-]/_/g')

migrate_file \
  "$HOME_DIR/self-improving/memory.md" \
  "$PROJECT_DIR/.claude/memory/memory.md" \
  "~/self-improving/memory.md → .claude/memory/"

migrate_file \
  "$HOME_DIR/self-improving/projects/${project_name}.md" \
  "$PROJECT_DIR/.claude/memory/project-knowledge.md" \
  "~/self-improving/projects/${project_name}.md → .claude/memory/"

migrate_file \
  "$HOME_DIR/self-improving/error-patterns/${project_name}.md" \
  "$PROJECT_DIR/.claude/memory/error-patterns.md" \
  "~/self-improving/error-patterns/${project_name}.md → .claude/memory/"

if [ $PROJECT_MIGRATED -eq 0 ] && [ $MIGRATED -eq 0 ]; then
  echo "  ✅ 无全局文件需要迁移"
fi

TOTAL=$((MIGRATED + PROJECT_MIGRATED))

# ── 清理空目录 ──────────────────────────────────────────────────
echo ""
echo "🧹 清理旧目录..."

CLEANED=0
for old_dir in \
  "$HOME_DIR/self-improving/error-patterns" \
  "$HOME_DIR/self-improving/projects" \
  "$HOME_DIR/self-improving/archive"; do
  if [ -d "$old_dir" ]; then
    if [ -z "$(ls -A "$old_dir" 2>/dev/null)" ]; then
      rmdir "$old_dir"
      echo "  ✅ 删除空目录: $(basename "$old_dir")/"
      CLEANED=$((CLEANED + 1))
    else
      echo "  ⏭️  保留非空目录: $(basename "$old_dir")/ (其他项目文件尚未迁移)"
    fi
  fi
done

if [ $CLEANED -gt 0 ]; then
  echo "  💡 提示: 在每个项目都运行过 migrate-paths.sh 后，旧目录会自动清空并删除"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $TOTAL -eq 0 ]; then
  echo "  ✅ 此项目已完成迁移（无需操作）"
else
  echo "  ✅ 迁移完成！共迁移 $TOTAL 个文件"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
