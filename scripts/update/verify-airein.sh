#!/usr/bin/env bash
# verify-airein.sh — Post-sync integrity verification
#
# After sync-airein.sh copies files, this script:
#   1. Parses hooks.json to extract ALL referenced script paths
#   2. Verifies every script exists at the install target
#   3. Runs `node -e "require()"` on each to catch missing dependencies
#   4. Cross-checks hooks are registered in settings.json
#   5. Returns non-zero if any check fails
#
# Usage: bash verify-airein.sh <install_dir>
#   install_dir: the airein install target (usually ~/.claude)

set -euo pipefail

INSTALL_DIR="${1:?用法: verify-airein.sh <install_dir>}"

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
  echo "修复建议: 重新运行 update-airein.sh 或手动复制缺失文件"
  exit 1
fi
