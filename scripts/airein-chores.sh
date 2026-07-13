#!/usr/bin/env bash
# airein-chores.sh — 打杂脚本：目录创建、模板初始化、验证
#
# 被 airein setup / airein-chores 调用。
# 也可独立运行：bash scripts/airein-chores.sh [CLAUDE_DIR] [PROJECT_DIR]
#
# 功能：
#   1. 创建项目目录（.airein/{config,memory,logs}；CC 项目额外 shim .claude/rules）
#   2. 补缺模板文件
#   3. 语法验证

CLAUDE_DIR="${1:-$HOME/.claude}"
PROJECT_DIR="${2:-$(pwd)}"
CHORES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KERNEL_ROOT="$(cd "$CHORES_DIR/.." && pwd)"
HELPERS_LIB="$CHORES_DIR/lib/install-helpers.sh"
if [ -f "$HELPERS_LIB" ]; then
  # shellcheck source=lib/install-helpers.sh
  . "$HELPERS_LIB"
  NODE_BIN="$(resolve_node_bin)"
else
  # Degraded mode (half-installed state): fall back to the old inline resolve
  # so chores keeps working when the shared lib is absent.
  NODE_BIN="$(command -v node 2>/dev/null || true)"
  if [ -z "$NODE_BIN" ]; then
    for candidate in "$HOME/.homebrew/bin/node" /opt/homebrew/bin/node /usr/local/bin/node; do
      if [ -x "$candidate" ]; then
        NODE_BIN="$candidate"
        break
      fi
    done
  fi
fi
CREATED=0
ERRORS=0
CC_SHIM=0
for arg in "$@"; do
  if [[ "$arg" == "--cc-shim" ]]; then
    CC_SHIM=1
    break
  fi
done

# ── 1. 创建目录 ──────────────────────────────────────────────────
ensure_dirs() {
  echo "📁 创建目录..."

  mkdir -p "$PROJECT_DIR/.airein/config"
  mkdir -p "$PROJECT_DIR/.airein/memory"
  mkdir -p "$PROJECT_DIR/.airein/logs"
  echo "  ✅ .airein/{config,memory,logs}"

  # CC 专属：仅 --cc-shim 时创建 .claude/rules → .airein/rules（Cursor 等项目禁止）
  if [[ "$CC_SHIM" -eq 1 && -n "$NODE_BIN" && -f "$CHORES_DIR/lib/project-shim.js" ]]; then
    if ! "$NODE_BIN" -e "
      const { ensureCcRulesShim } = require(process.argv[1]);
      const r = ensureCcRulesShim(process.argv[2], { ccShim: true });
      if (!r.ok) process.exit(1);
    " "$CHORES_DIR/lib/project-shim.js" "$PROJECT_DIR" 2>/dev/null; then
      echo "  ⚠️  CC rules shim 失败（可稍后重试）"
    else
      echo "  ✅ .claude/rules shim → <项目>/.airein/rules (CC only)"
    fi
  fi
}

# ── 2. 补缺模板文件 ──────────────────────────────────────────────
init_template() {
  local file="$1"
  local content="$2"
  local label="$3"

  if [ ! -f "$file" ] || [ ! -s "$file" ]; then
    mkdir -p "$(dirname "$file")"
    echo "$content" > "$file"
    CREATED=$((CREATED + 1))
    echo "  ✅ 创建: $label"
  fi
}

init_templates() {
  echo ""
  echo "📋 检查模板文件..."

  # 注意：memory.md 不在此处创建
  # 由 migrate-paths.sh（已有项目）或 session-start（新项目）按需创建

  if [ $CREATED -eq 0 ]; then
    echo "  ✅ 所有模板文件已存在"
  else
    echo "  ✅ 新建了 $CREATED 个模板文件"
  fi
}

# ── 3. 语法验证 ──────────────────────────────────────────────────
validate() {
  echo ""
  echo "🔍 验证文件完整性..."

  local JS_COUNT=0

  if [ -z "$NODE_BIN" ]; then
    echo "  ⚠️  Node.js 未找到，跳过语法验证"
    return
  fi

  for jsonfile in "$KERNEL_ROOT/hooks/hooks.json" "$KERNEL_ROOT/templates/quality.json"; do
    if [ -f "$jsonfile" ]; then
      if ! "$NODE_BIN" -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$jsonfile" 2>/dev/null; then
        echo "  ❌ $(basename "$jsonfile") — JSON 语法错误"
        ERRORS=$((ERRORS + 1))
      fi
    fi
  done

  for jsfile in "$KERNEL_ROOT"/scripts/hooks/*.js "$KERNEL_ROOT"/scripts/lib/*.js; do
    [ -f "$jsfile" ] || continue
    JS_COUNT=$((JS_COUNT + 1))
    if ! "$NODE_BIN" -c "$jsfile" 2>/dev/null; then
      echo "  ❌ $(basename "$jsfile") — JS 语法错误"
      ERRORS=$((ERRORS + 1))
    fi
  done

  echo "  ✅ $JS_COUNT 个脚本通过语法检查"
  [ $ERRORS -gt 0 ] && echo "  ⚠️  有 $ERRORS 个文件验证失败"
}

# ── 运行 ──────────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Airein Chores — 初始化 & 验证"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ensure_dirs
init_templates
validate

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Chores 完成"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  新建: $CREATED 模板"
echo "  错误: $ERRORS"
echo ""
