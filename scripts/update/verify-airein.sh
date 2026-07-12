#!/usr/bin/env bash
# verify-airein.sh — Post-sync integrity verification
#
# 两模式：
#   1) CC 模式（既有）：bash verify-airein.sh <install_dir>
#      解析 hooks.json → 校验脚本就位 → node --check 依赖 → settings.json 注册 → lib/ + rules/
#   2) --host 模式（P001 T10 · deployment §6.2）：bash verify-airein.sh --host <X> --root <dir>
#      按 deployment §3 产物矩阵校验指定宿主产物就位（K1 skills / K2 rules / K3 hook 配置 /
#      归一化入口）+ install-manifest 存在。各宿主 install 后回归门禁。
#
# Usage:
#   bash verify-airein.sh <install_dir>              # CC 模式（install_dir 通常 ~/.claude 或仓库根）
#   bash verify-airein.sh --host <cursor|codex|codebuddy|opencode> --root <dir>

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ── argv 解析（--host/--root 提取，余位置参数 → INSTALL_DIR for CC 模式）──
HOST=""
ROOT_DIR=""
INSTALL_DIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST="${2:-}"; shift 2 ;;
    --root) ROOT_DIR="${2:-}"; shift 2 ;;
    *) INSTALL_DIR="$1"; shift ;;
  esac
done

# check_* helpers：echo 结果 + return 0/1（调用方用 `||` 累加 errors）。
check_file() {
  if [ -f "$1" ]; then echo "  ✅ $2: $1"; return 0; else echo "  ❌ 缺 $2: $1"; return 1; fi
}
check_dir_nonempty() {
  if [ -d "$1" ] && [ -n "$(ls -A "$1" 2>/dev/null)" ]; then echo "  ✅ $2: $1"; return 0; else echo "  ❌ 缺/空 $2: $1"; return 1; fi
}

# ── --host 模式：按 deployment §3 产物矩阵校验 ──
verify_host() {
  local host="$1"
  local target="$2"
  local errors=0

  echo ""
  echo "🔍 verify-airein.sh --host $host（deployment §3 产物矩阵）..."

  case "$host" in
    cursor|codex|codebuddy|opencode) ;;
    *)
      echo "❌ 未知 host: $host（已知: cursor/codex/codebuddy/opencode)"
      echo "  用法: verify-airein.sh --host <X> --root <dir>"
      exit 1
      ;;
  esac

  if [ -z "$target" ]; then
    echo "❌ 缺 --root <dir>（install 时的 targetRoot，通常项目根）"
    echo "  用法: verify-airein.sh --host $host --root <dir>"
    exit 1
  fi
  if [ ! -d "$target" ]; then
    echo "❌ --root 目录不存在: $target"
    exit 1
  fi

  # install-manifest（install-host.js install 写盘，deployment §2）
  if [ ! -f "$target/.airein-install-state.json" ]; then
    echo "❌ 缺 install-manifest: $target/.airein-install-state.json"
    echo "  → 先 install: node \"$REPO_ROOT/scripts/install-host.js\" install --host $host --root \"$target\""
    exit 1
  fi
  echo "  ✅ install-manifest: $target/.airein-install-state.json"

  echo ""
  echo "  📦 $host 产物矩阵（deployment §3）..."
  case "$host" in
    cursor)
      check_dir_nonempty "$target/.cursor/skills" "K1 skills" || errors=$((errors + 1))
      check_dir_nonempty "$target/.cursor/rules" "K2 rules (.mdc 目录)" || errors=$((errors + 1))
      check_file "$target/.cursor/hooks.json" "K3 hook 配置" || errors=$((errors + 1))
      check_dir_nonempty "$target/.cursor/commands" "K4 commands" || errors=$((errors + 1))
      check_file "$REPO_ROOT/scripts/hooks/host/cursor.js" "归一化入口 cursor.js" || errors=$((errors + 1))
      ;;
    codex)
      check_dir_nonempty "$target/.agents/skills" "K1 skills (.agents 复数)" || errors=$((errors + 1))
      check_file "$target/AGENTS.md" "K2 rules AGENTS.md" || errors=$((errors + 1))
      check_file "$target/.codex/config.toml" "K3 hook 配置 config.toml" || errors=$((errors + 1))
      check_file "$REPO_ROOT/scripts/hooks/host/codex.js" "归一化入口 codex.js" || errors=$((errors + 1))
      ;;
    codebuddy)
      check_dir_nonempty "$target/.codebuddy/skills" "K1 skills" || errors=$((errors + 1))
      check_file "$target/CODEBUDDY.md" "K2 CODEBUDDY.md (root)" || errors=$((errors + 1))
      check_dir_nonempty "$target/.codebuddy/rules" "K2 L0 rules 目录" || errors=$((errors + 1))
      check_file "$target/.codebuddy/settings.json" "K3 hook 配置 settings.json" || errors=$((errors + 1))
      check_dir_nonempty "$target/.codebuddy/commands" "K4 commands" || errors=$((errors + 1))
      check_file "$REPO_ROOT/scripts/hooks/host/codebuddy.js" "归一化入口 codebuddy.js" || errors=$((errors + 1))
      ;;
    opencode)
      # OC 零 skill 放置（原生搜 .claude/skills/，deployment §3）；校验 K2/K3/K4 + bridge.ts
      check_file "$target/AGENTS.md" "K2 rules AGENTS.md" || errors=$((errors + 1))
      check_file "$target/opencode.json" "K3 plugin 注册 opencode.json" || errors=$((errors + 1))
      check_dir_nonempty "$target/commands" "K4 commands (项目根 commands/)" || errors=$((errors + 1))
      check_file "$target/.opencode/plugin/airein-bridge.ts" "OC bridge.ts 实体" || errors=$((errors + 1))
      check_file "$REPO_ROOT/opencode/bridge.ts" "归一化入口 bridge.ts (源)" || errors=$((errors + 1))
      ;;
  esac

  echo ""
  if [ "$errors" -eq 0 ]; then
    echo "✅ verify $host 通过: 产物完整（deployment §3 矩阵）"
    exit 0
  else
    echo "❌ verify $host 失败: $errors 个缺失"
    echo "  修复: node \"$REPO_ROOT/scripts/install-host.js\" install --host $host --root \"$target\""
    exit 1
  fi
}

if [ -n "$HOST" ]; then
  verify_host "$HOST" "$ROOT_DIR"
  exit $?
fi

# ════════════════════════════════════════════════════════════════════
# CC 模式（既有 · 位置参数 <install_dir>）—— 以下逻辑保留不变
# ════════════════════════════════════════════════════════════════════
set -e

INSTALL_DIR="${INSTALL_DIR:?用法: verify-airein.sh <install_dir> | --host <X> [--root <dir>]}"

if [ ! -d "$INSTALL_DIR" ]; then
  echo "❌ 安装目录不存在: $INSTALL_DIR"
  exit 1
fi

ERRORS=0
WARNINGS=0
CHECKS=0

echo ""
echo "🔍 Post-sync 验证..."

# ── 1. Parse hooks.json for all referenced script paths ──────────
HOOKS_JSON="$INSTALL_DIR/hooks/hooks.json"

if [ ! -f "$HOOKS_JSON" ]; then
  echo "❌ hooks.json 不存在: $HOOKS_JSON"
  ERRORS=$((ERRORS + 1))
  echo ""
  echo "❌ 验证失败: $ERRORS 个错误, $WARNINGS 个警告"
  exit 1
fi

# Extract .js and .sh paths from hook commands
# Handles patterns like: bash ".../scripts/hooks/run-hook.sh" ".../scripts/hooks/XXX.js"
# and direct: node ".../scripts/hooks/XXX.js"
SCRIPT_PATHS=$(node -e "
  const fs = require('fs');
  const hooks = JSON.parse(fs.readFileSync(process.argv[1], 'utf8')).hooks || {};
  const paths = new Set();
  const varPattern = /^\\\$\{[^}]+\}\/?/;
  for (const group of Object.values(hooks)) {
    for (const entry of group || []) {
      for (const hook of entry.hooks || []) {
        const cmd = hook.command || '';
        const matches = cmd.matchAll(/\"([^\"]+\.(js|sh))\"/g);
        for (const m of matches) {
          let p = m[1].replace(varPattern, '');
          if (p.startsWith('/') || p.includes('$') || p.includes('*')) continue;
          if (!p.startsWith('scripts/') && !p.startsWith('hooks/')) continue;
          paths.add(p);
        }
      }
    }
  }
  for (const p of paths) console.log(p);
" "$HOOKS_JSON" 2>/dev/null)

if [ -z "$SCRIPT_PATHS" ]; then
  echo "⚠️  无法从 hooks.json 提取脚本路径（可能格式变更）"
  WARNINGS=$((WARNINGS + 1))
fi

# ── 2. Check each referenced script exists ──────────────────────

echo ""
echo "  📄 检查 hooks.json 引用的脚本..."

MISSING_SCRIPTS=""

while IFS= read -r rel_path; do
  [ -z "$rel_path" ] && continue
  CHECKS=$((CHECKS + 1))
  full_path="$INSTALL_DIR/$rel_path"

  if [ ! -f "$full_path" ]; then
    echo "    ❌ 缺失: $rel_path"
    ERRORS=$((ERRORS + 1))
    MISSING_SCRIPTS="$MISSING_SCRIPTS\n    $rel_path"
  fi
done <<< "$SCRIPT_PATHS"

if [ -z "$MISSING_SCRIPTS" ]; then
  echo "    ✅ 全部 $CHECKS 个 hook 脚本就位"
fi

# ── 3. Node.js require() check — catches missing deps ───────────

echo ""
echo "  🔗 检查 Node.js 依赖加载..."

# Collect all .js hook scripts (not shell wrappers)
JS_SCRIPTS=$(echo "$SCRIPT_PATHS" | grep '\.js$' || true)
REQUIRE_FAILS=""

while IFS= read -r rel_path; do
  [ -z "$rel_path" ] && continue
  full_path="$INSTALL_DIR/$rel_path"
  [ ! -f "$full_path" ] && continue

  # Only check direct hook scripts (skip run-with-flags.js which requires args)
  if echo "$rel_path" | grep -q "run-with-flags.js\|run-hook.sh\|check-hook-enabled.js"; then
    continue
  fi

  # Test that the script can parse without errors (syntax check)
  if ! node --check "$full_path" 2>/dev/null; then
    echo "    ❌ 语法错误: $rel_path"
    ERRORS=$((ERRORS + 1))
    REQUIRE_FAILS="$REQUIRE_FAILS\n    $rel_path (syntax)"
    continue
  fi

  # Test that require() works for the main lib dependencies
  # Run in the script's directory context to resolve relative paths
  REQUIRES=$(grep -oE "require\(['\"][^'\"]+['\"]\)" "$full_path" 2>/dev/null | grep -v "node_modules\|child_process\|path\|fs\|os\|util\|events\|stream" || true)

  while IFS= read -r req; do
    [ -z "$req" ] && continue
    # Extract the path from require('...')
    req_path=$(echo "$req" | sed "s/require(['\"]//;s/['\"])//")
    # Resolve relative to the script's directory
    script_dir=$(dirname "$full_path")
    resolved="$script_dir/$req_path"
    # Try .js extension if not present
    if [ ! -f "$resolved" ] && [ ! -f "${resolved}.js" ] && [ ! -d "$resolved" ]; then
      echo "    ❌ 依赖缺失: $rel_path → $req_path"
      ERRORS=$((ERRORS + 1))
      REQUIRE_FAILS="$REQUIRE_FAILS\n    $rel_path → $req_path"
    fi
  done <<< "$REQUIRES"

done <<< "$JS_SCRIPTS"

if [ -z "$REQUIRE_FAILS" ]; then
  echo "    ✅ 全部脚本依赖完整"
fi

# ── 4. Verify hooks registered in settings.json ─────────────────

SETTINGS_JSON="$INSTALL_DIR/settings.json"

echo ""
echo "  🪝 检查 settings.json hook 注册..."

if [ ! -f "$SETTINGS_JSON" ]; then
  echo "    ⚠️  settings.json 不存在（首次安装前正常）"
  WARNINGS=$((WARNINGS + 1))
else
  # Check that key hooks are registered
  EXPECTED_HOOKS=("test-guard.js" "plan-gate.js" "stop-test-gate.js" "session-start.js")
  for expected in "${EXPECTED_HOOKS[@]}"; do
    if grep -q "$expected" "$SETTINGS_JSON" 2>/dev/null; then
      true  # registered
    else
      echo "    ❌ 未注册: $expected"
      ERRORS=$((ERRORS + 1))
    fi
  done
  echo "    ✅ 关键 hooks 注册状态已检查"
fi

# ── 5. Verify lib/ modules exist ────────────────────────────────

echo ""
echo "  📦 检查 lib/ 核心模块..."

REQUIRED_LIBS=(
  "scripts/lib/utils.js"
  "scripts/lib/quality-config.js"
  "scripts/lib/airein-logger.js"
  "scripts/lib/plan-parser.js"
  "scripts/lib/hook-flags.js"
  "scripts/lib/shell-split.js"
)

for lib in "${REQUIRED_LIBS[@]}"; do
  if [ -f "$INSTALL_DIR/$lib" ]; then
    if ! node --check "$INSTALL_DIR/$lib" 2>/dev/null; then
      echo "    ❌ 语法错误: $lib"
      ERRORS=$((ERRORS + 1))
    fi
  else
    echo "    ❌ 缺失: $lib"
    ERRORS=$((ERRORS + 1))
  fi
done
echo "    ✅ lib/ 模块验证完成"

# ── 6. Verify L0 rules/ three files (P017) ──────────────────────

echo ""
echo "  📜 检查 L0 rules/ 三文件 (00/10/20)..."

REQUIRED_RULES=(
  "rules/00-iron-rules.md"
  "rules/10-architecture.md"
  "rules/20-workflow.md"
)

for rule in "${REQUIRED_RULES[@]}"; do
  if [ ! -f "$INSTALL_DIR/$rule" ]; then
    echo "    ❌ 缺失: $rule"
    ERRORS=$((ERRORS + 1))
  fi
done
echo "    ✅ L0 rules/ 验证完成"

# ── Summary ─────────────────────────────────────────────────────

echo ""
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ 验证通过: $CHECKS 个检查, $WARNINGS 个警告"
  exit 0
else
  echo "❌ 验证失败: $ERRORS 个错误, $WARNINGS 个警告"
  echo ""
  echo "缺失文件列表:"
  echo -e "$MISSING_SCRIPTS"
  echo -e "$REQUIRE_FAILS"
  echo ""
  echo "修复建议: 重新运行 airein update 或手动复制缺失文件"
  exit 1
fi
