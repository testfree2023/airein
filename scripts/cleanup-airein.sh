#!/usr/bin/env bash
# cleanup-airein.sh - 清理旧版 airein 残留文件
#
# 扫描 ~/.claude/ 中 airein 管理的文件，删除源中已不存在的旧文件，
# 报告源中有但目标中没有的新文件。
#
# 用法:
#   bash scripts/cleanup-airein.sh                   # 自动检测源目录
#   bash scripts/cleanup-airein.sh /path/to/repo     # 指定源目录
#   bash scripts/cleanup-airein.sh --dry-run         # 只报告不删除
#
# 通常在 update-airein.sh 之后运行。

set -e

REPO="git@github.com:testfree2023/airein.git"
CLAUDE_DIR="$HOME/.claude"
DRY_RUN=false
TEMP_CLONE=""

# ── 参数解析 ───────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --dry-run|-n) DRY_RUN=true ;;
    -*) echo "未知选项: $arg"; exit 1 ;;
    *) AIREIN_SRC="$arg" ;;
  esac
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Airein 清理工具"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo "  🔍 DRY RUN 模式（仅报告，不删除）"
  echo ""
fi

# ── 1. 确定源目录 ─────────────────────────────────────────────
if [ -z "$AIREIN_SRC" ]; then
  # 自动检测：当前目录是 airein 仓库？（P017: 用 rules/00 作 marker，CLAUDE.md 不再由 airein 拥有）
  if [ -f "rules/00-iron-rules.md" ] && [ -f "hooks/hooks.json" ] && [ -d "scripts/hooks" ]; then
    AIREIN_SRC="$(pwd)"
    echo "📂 源目录: $AIREIN_SRC（当前目录）"
  elif [ -d "$CLAUDE_DIR/.git" ]; then
    AIREIN_SRC="$CLAUDE_DIR"
    echo "📂 源目录: $AIREIN_DIR（~/.claude git 仓库）"
  else
    echo "📥 Clone 最新版本用于对比..."
    TEMP_CLONE=$(mktemp -d)
    git clone --depth 1 "$REPO" "$TEMP_CLONE/airein" 2>/dev/null || {
      echo "  ❌ clone 失败，请检查网络和 SSH key"
      rm -rf "$TEMP_CLONE"
      exit 1
    }
    AIREIN_SRC="$TEMP_CLONE/airein"
    echo "  ✅ 已下载到临时目录"
  fi
else
  echo "📂 源目录: $AIREIN_SRC"
fi

# 验证源目录（P017: marker 改用 rules/00-iron-rules.md）
if [ ! -f "$AIREIN_SRC/rules/00-iron-rules.md" ] || [ ! -d "$AIREIN_SRC/scripts/hooks" ]; then
  echo "❌ 源目录无效：缺少 rules/00-iron-rules.md 或 scripts/hooks/"
  [ -n "$TEMP_CLONE" ] && rm -rf "$TEMP_CLONE"
  exit 1
fi

echo "🎯 目标目录: $CLAUDE_DIR"
echo ""

# ── 2. 构建源文件集合（相对路径）──────────────────────────────
# 扫描 airein 管理的路径模式，收集所有期望存在的相对路径

SOURCE_FILES=""  # 换行分隔的相对路径列表

# 顶层文件（P017: 不含 CLAUDE.md —— 用户领土，airein 不管理）
for f in README.md RELEASES.md; do
  [ -f "$AIREIN_SRC/$f" ] && SOURCE_FILES="$SOURCE_FILES
$f"
done

# 安装/更新/打包脚本（顶层）
for f in setup-airein.sh update-airein.sh; do
  [ -f "$AIREIN_SRC/$f" ] && SOURCE_FILES="$SOURCE_FILES
$f"
done

# hooks/
[ -f "$AIREIN_SRC/hooks/hooks.json" ] && SOURCE_FILES="$SOURCE_FILES
hooks/hooks.json"
[ -f "$AIREIN_SRC/hooks/README.md" ] && SOURCE_FILES="$SOURCE_FILES
hooks/README.md"

# rules/**/*.md
if [ -d "$AIREIN_SRC/rules" ]; then
  while IFS= read -r f; do
    rel="${f#$AIREIN_SRC/}"
    SOURCE_FILES="$SOURCE_FILES
$rel"
  done < <(find "$AIREIN_SRC/rules" -name '*.md' -type f 2>/dev/null)
fi

# scripts/hooks/*.{js,sh}
if [ -d "$AIREIN_SRC/scripts/hooks" ]; then
  while IFS= read -r f; do
    rel="${f#$AIREIN_SRC/}"
    SOURCE_FILES="$SOURCE_FILES
$rel"
  done < <(find "$AIREIN_SRC/scripts/hooks" -maxdepth 1 \( -name '*.js' -o -name '*.sh' \) -type f 2>/dev/null)
fi

# scripts/lib/*.js
if [ -d "$AIREIN_SRC/scripts/lib" ]; then
  while IFS= read -r f; do
    rel="${f#$AIREIN_SRC/}"
    SOURCE_FILES="$SOURCE_FILES
$rel"
  done < <(find "$AIREIN_SRC/scripts/lib" -maxdepth 1 -name '*.js' -type f 2>/dev/null)
fi

# scripts/*.sh 和 scripts/*.js（顶层脚本）
if [ -d "$AIREIN_SRC/scripts" ]; then
  while IFS= read -r f; do
    rel="${f#$AIREIN_SRC/}"
    SOURCE_FILES="$SOURCE_FILES
$rel"
  done < <(find "$AIREIN_SRC/scripts" -maxdepth 1 \( -name '*.sh' -o -name '*.js' \) -type f 2>/dev/null)
fi

# skills — 只扫描 airein 管理的 skill 列表（与 update-airein.sh SKILL_DIRS 一致）
MANAGED_SKILLS=(
  "init-project"
  "new-plan"
  "next"
  "status"
  "log-change"
  "stuck-recovery"
  "model-guide"
  "writing-plans"
  "tdd-workflow"
  "verification-loop"
  "code-review"
  "quality-gate"
  "refactor-clean"
  "self-learning"
  "regression-test-gate"
)
for skill in "${MANAGED_SKILLS[@]}"; do
  f="skills/$skill/SKILL.md"
  [ -f "$AIREIN_SRC/$f" ] && SOURCE_FILES="$SOURCE_FILES
$f"
done

# 清理空行，排序去重
SOURCE_FILES=$(echo "$SOURCE_FILES" | sed '/^$/d' | sort -u)

SOURCE_COUNT=$(echo "$SOURCE_FILES" | wc -l | tr -d ' ')
echo "📋 源文件集合: $SOURCE_COUNT 个文件"
echo ""

# ── 3. 扫描目标目录中 airein 管理的文件 ─────────────────────

TARGET_FILES=""

# 用相同的路径模式扫描目标（P017: 不含 CLAUDE.md —— 用户领土，不扫描避免误判 stale/missing）
for f in README.md RELEASES.md CHANGELOG.md; do
  [ -f "$CLAUDE_DIR/$f" ] && TARGET_FILES="$TARGET_FILES
$f"
done

for f in setup-airein.sh update-airein.sh; do
  [ -f "$CLAUDE_DIR/$f" ] && TARGET_FILES="$TARGET_FILES
$f"
done

[ -f "$CLAUDE_DIR/hooks/hooks.json" ] && TARGET_FILES="$TARGET_FILES
hooks/hooks.json"
[ -f "$CLAUDE_DIR/hooks/README.md" ] && TARGET_FILES="$TARGET_FILES
hooks/README.md"

if [ -d "$CLAUDE_DIR/rules" ]; then
  while IFS= read -r f; do
    rel="${f#$CLAUDE_DIR/}"
    TARGET_FILES="$TARGET_FILES
$rel"
  done < <(find "$CLAUDE_DIR/rules" -name '*.md' -type f 2>/dev/null)
fi

if [ -d "$CLAUDE_DIR/scripts/hooks" ]; then
  while IFS= read -r f; do
    rel="${f#$CLAUDE_DIR/}"
    TARGET_FILES="$TARGET_FILES
$rel"
  done < <(find "$CLAUDE_DIR/scripts/hooks" -maxdepth 1 \( -name '*.js' -o -name '*.sh' \) -type f 2>/dev/null)
fi

if [ -d "$CLAUDE_DIR/scripts/lib" ]; then
  while IFS= read -r f; do
    rel="${f#$CLAUDE_DIR/}"
    TARGET_FILES="$TARGET_FILES
$rel"
  done < <(find "$CLAUDE_DIR/scripts/lib" -maxdepth 1 -name '*.js' -type f 2>/dev/null)
fi

if [ -d "$CLAUDE_DIR/scripts" ]; then
  while IFS= read -r f; do
    rel="${f#$CLAUDE_DIR/}"
    TARGET_FILES="$TARGET_FILES
$rel"
  done < <(find "$CLAUDE_DIR/scripts" -maxdepth 1 \( -name '*.sh' -o -name '*.js' \) -type f 2>/dev/null)
fi

# skills — 只扫描 airein 管理的 skill
for skill in "${MANAGED_SKILLS[@]}"; do
  f="skills/$skill/SKILL.md"
  [ -f "$CLAUDE_DIR/$f" ] && TARGET_FILES="$TARGET_FILES
$f"
done

TARGET_FILES=$(echo "$TARGET_FILES" | sed '/^$/d' | sort -u)

# ── 4. 对比：找出多余和缺失 ───────────────────────────────────

STALE_FILES=""
MISSING_FILES=""

# 目标中有但源中没有 → 旧文件需清理
while IFS= read -r target; do
  [ -z "$target" ] && continue
  if ! echo "$SOURCE_FILES" | grep -qxF "$target"; then
    STALE_FILES="$STALE_FILES
$target"
  fi
done <<< "$TARGET_FILES"

# 源中有但目标中没有 → 新文件缺失
while IFS= read -r source; do
  [ -z "$source" ] && continue
  if [ ! -f "$CLAUDE_DIR/$source" ]; then
    MISSING_FILES="$MISSING_FILES
$source"
  fi
done <<< "$SOURCE_FILES"

# 清理
STALE_FILES=$(echo "$STALE_FILES" | sed '/^$/d')
MISSING_FILES=$(echo "$MISSING_FILES" | sed '/^$/d')

STALE_COUNT=$(echo "$STALE_FILES" | grep -c . 2>/dev/null || echo 0)
MISSING_COUNT=$(echo "$MISSING_FILES" | grep -c . 2>/dev/null || echo 0)

# ── 5. 报告和清理 ─────────────────────────────────────────────

if [ "$STALE_COUNT" -gt 0 ]; then
  echo "🗑️  旧文件 ($STALE_COUNT 个):"
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if [ "$DRY_RUN" = true ]; then
      echo "    [将删除] $f"
    else
      rm -f "$CLAUDE_DIR/$f" && echo "    ✅ 已删除: $f" || echo "    ❌ 删除失败: $f"
    fi
  done <<< "$STALE_FILES"
  echo ""
fi

if [ "$MISSING_COUNT" -gt 0 ]; then
  echo "📦 缺失新文件 ($MISSING_COUNT 个):"
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    echo "    $f"
  done <<< "$MISSING_FILES"
  echo "  → 运行 bash ~/.claude/update-airein.sh 补齐"
  echo ""
fi

if [ "$STALE_COUNT" -eq 0 ] && [ "$MISSING_COUNT" -eq 0 ]; then
  echo "✅ ~/.claude/ 中无多余文件，也无缺失文件。一切正常。"
  echo ""
fi

# ── 6. 清理临时目录 ───────────────────────────────────────────
if [ -n "$TEMP_CLONE" ] && [ -d "$TEMP_CLONE" ]; then
  rm -rf "$TEMP_CLONE"
fi

# ── 7. 结果 ───────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$DRY_RUN" = true ]; then
  echo "  🔍 DRY RUN 完成"
else
  echo "  ✅ 清理完成"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  旧文件: $STALE_COUNT 个$([ "$DRY_RUN" = true ] && echo '（未删除）' || echo '已清理')"
echo "  缺失文件: $MISSING_COUNT 个"
echo ""
