#!/usr/bin/env bash
# verify-airein.sh — Post-install / post-update integrity verification
#
# 三层检查（P004 部署模型）：
#   ① 内核层   ~/.airein/     hooks/lib/rules 真相源
#   ② CC 注册层 ~/.claude/     symlink + settings.json hooks
#   ③ 宿主注册层 ~/.cursor/ 等 install-host 产物矩阵
#
# 推荐：bash verify-airein.sh --full   （按 install-profile.json 自动跑全部层）

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ── argv ──
MODE=""
HOST=""
KERNEL_DIR=""
HOME_DIR=""
ROOT_DIR=""
WANT_HELP=false

while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) WANT_HELP=true; shift ;;
    --full) MODE="full"; shift ;;
    --cc-registration) MODE="cc-registration"; shift ;;
    --kernel) KERNEL_DIR="${2:-}"; shift 2 ;;
    --home) HOME_DIR="${2:-}"; shift 2 ;;
    --host) HOST="${2:-}"; shift 2 ;;
    --root) ROOT_DIR="${2:-}"; shift 2 ;;
    *)
      if [ -z "$KERNEL_DIR" ]; then KERNEL_DIR="$1"; fi
      shift
      ;;
  esac
done

DEFAULT_HOME="${HOME_DIR:-${HOME:-}}"
DEFAULT_KERNEL="${KERNEL_DIR:-${HOME:+$HOME/.airein}}"

# check_* helpers：echo 结果 + return 0/1
check_file() {
  if [ -f "$1" ]; then echo "  ✅ $2: $1"; return 0; else echo "  ❌ 缺 $2: $1"; return 1; fi
}
check_dir_nonempty() {
  if [ -d "$1" ] && [ -n "$(ls -A "$1" 2>/dev/null)" ]; then echo "  ✅ $2: $1"; return 0; else echo "  ❌ 缺/空 $2: $1"; return 1; fi
}

print_usage() {
  cat <<'EOF'
verify-airein.sh — Airein 安装完整性校验

三层含义（不要混用）：
  ① 内核层     检查 ~/.airein/ 内 hooks/lib/rules 等真相源是否完整
  ② CC 注册层  检查 ~/.claude/ symlink + settings.json 是否指向内核
  ③ 宿主注册层 检查 install-host 写入的 .cursor/ 等产物矩阵

推荐（安装/升级后一条命令验全部）：
  bash ~/.airein/scripts/update/verify-airein.sh --full
  bash ~/.airein/scripts/update/verify-airein.sh --full --home "$HOME" --kernel ~/.airein

分层手动检查（排查问题时用）：
  # ① 仅内核（sync/update 后脚本是否就位）
  bash ~/.airein/scripts/update/verify-airein.sh --kernel ~/.airein
  bash ~/.airein/scripts/update/verify-airein.sh ~/.airein          # 同上（兼容旧写法）

  # ② 仅 Claude Code 注册层（symlink + hooks 是否写入 settings.json）
  bash ~/.airein/scripts/update/verify-airein.sh --cc-registration \
    --home "$HOME" --kernel ~/.airein

  # ③ 仅 Cursor 注册层（全局安装时 targetRoot=$HOME → ~/.cursor/）
  bash ~/.airein/scripts/update/verify-airein.sh --host cursor --root "$HOME"

  # ③ 仅 Cursor 注册层（项目级安装时 targetRoot=项目根 → <项目>/.cursor/）
  bash ~/.airein/scripts/update/verify-airein.sh --host cursor --root /path/to/project

为何有两条看似相似的命令？
  --kernel ~/.airein     → 验「仓库内核」，不管 CC/Cursor 有没有注册成功
  --host cursor --root   → 验「Cursor 侧产物」，不管内核是否最新
  --full                 → 读 install-profile.json，按已装宿主依次跑 ①②③

修复建议：bash ~/.airein/airein update  或  bash ./airein setup --yes
EOF
}

# ── ① 内核层 ──
verify_kernel() {
  local install_dir="$1"
  local errors=0
  local warnings=0
  local checks=0
  local missing_scripts=""
  local require_fails=""

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "① 内核层验证"
  echo "   目录: $install_dir"
  echo "   检查: hooks.json 引用脚本 / 依赖 / lib / L0 rules"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [ ! -d "$install_dir" ]; then
    echo "❌ 内核目录不存在: $install_dir"
    return 1
  fi

  local hooks_json="$install_dir/hooks/hooks.json"
  if [ ! -f "$hooks_json" ]; then
    echo "❌ hooks.json 不存在: $hooks_json"
    return 1
  fi
  echo "  ✅ hooks.json 存在"

  local script_paths
  script_paths=$(node -e "
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
  " "$hooks_json" 2>/dev/null)

  if [ -z "$script_paths" ]; then
    echo "  ⚠️  无法从 hooks.json 提取脚本路径（可能格式变更）"
    warnings=$((warnings + 1))
  fi

  echo ""
  echo "  📄 检查 hooks.json 引用的脚本..."
  while IFS= read -r rel_path; do
    [ -z "$rel_path" ] && continue
    checks=$((checks + 1))
    local full_path="$install_dir/$rel_path"
    if [ ! -f "$full_path" ]; then
      echo "    ❌ 缺失: $rel_path"
      errors=$((errors + 1))
      missing_scripts="${missing_scripts}\n    ${rel_path}"
    fi
  done <<< "$script_paths"
  if [ "$errors" -eq 0 ] && [ -n "$script_paths" ]; then
    echo "    ✅ 全部 $checks 个 hook 脚本就位"
  fi

  echo ""
  echo "  🔗 检查 Node.js 依赖加载..."
  local js_scripts
  js_scripts=$(echo "$script_paths" | grep '\.js$' || true)
  while IFS= read -r rel_path; do
    [ -z "$rel_path" ] && continue
    local full_path="$install_dir/$rel_path"
    [ ! -f "$full_path" ] && continue
    if echo "$rel_path" | grep -q "run-with-flags.js\|run-hook.sh\|check-hook-enabled.js"; then
      continue
    fi
    if ! node --check "$full_path" 2>/dev/null; then
      echo "    ❌ 语法错误: $rel_path"
      errors=$((errors + 1))
      require_fails="${require_fails}\n    ${rel_path} (syntax)"
      continue
    fi
    local requires
    requires=$(grep -oE "require\(['\"][^'\"]+['\"]\)" "$full_path" 2>/dev/null | grep -v "node_modules\|child_process\|path\|fs\|os\|util\|events\|stream" || true)
    while IFS= read -r req; do
      [ -z "$req" ] && continue
      local req_path
      req_path=$(echo "$req" | sed "s/require(['\"]//;s/['\"])//")
      local script_dir resolved
      script_dir=$(dirname "$full_path")
      resolved="$script_dir/$req_path"
      if [ ! -f "$resolved" ] && [ ! -f "${resolved}.js" ] && [ ! -d "$resolved" ]; then
        echo "    ❌ 依赖缺失: $rel_path → $req_path"
        errors=$((errors + 1))
        require_fails="${require_fails}\n    ${rel_path} → ${req_path}"
      fi
    done <<< "$requires"
  done <<< "$js_scripts"
  if [ -z "$require_fails" ] && [ -n "$js_scripts" ]; then
    echo "    ✅ 全部脚本依赖完整"
  fi

  echo ""
  echo "  📦 检查 lib/ 核心模块..."
  local required_libs=(
    "scripts/lib/utils.js"
    "scripts/lib/quality-config.js"
    "scripts/lib/airein-logger.js"
    "scripts/lib/plan-parser.js"
    "scripts/lib/hook-flags.js"
    "scripts/lib/shell-split.js"
  )
  for lib in "${required_libs[@]}"; do
    if [ -f "$install_dir/$lib" ]; then
      if ! node --check "$install_dir/$lib" 2>/dev/null; then
        echo "    ❌ 语法错误: $lib"
        errors=$((errors + 1))
      fi
    else
      echo "    ❌ 缺失: $lib"
      errors=$((errors + 1))
    fi
  done
  echo "    ✅ lib/ 模块验证完成"

  echo ""
  echo "  📜 检查 L0 rules/ 三文件 (00/10/20)..."
  local required_rules=(
    "rules/00-iron-rules.md"
    "rules/10-architecture.md"
    "rules/20-workflow.md"
  )
  for rule in "${required_rules[@]}"; do
    if [ ! -f "$install_dir/$rule" ]; then
      echo "    ❌ 缺失: $rule"
      errors=$((errors + 1))
    fi
  done
  echo "    ✅ L0 rules/ 验证完成"

  local settings_json="$install_dir/settings.json"
  if [ -f "$settings_json" ]; then
    echo ""
    echo "  🪝 内核内 settings.json（legacy 布局）..."
    local expected_hooks=("test-guard.js" "plan-gate.js" "stop-test-gate.js" "session-start.js")
    for expected in "${expected_hooks[@]}"; do
      if ! grep -q "$expected" "$settings_json" 2>/dev/null; then
        echo "    ❌ 未注册: $expected"
        errors=$((errors + 1))
      fi
    done
  else
    echo ""
    echo "  ℹ️  内核无 settings.json（P004 正常：hooks 在 ~/.claude/settings.json，用 --cc-registration 或 --full 检查）"
  fi

  echo ""
  if [ "$errors" -eq 0 ]; then
    echo "✅ ① 内核层通过: $checks 个脚本检查, $warnings 个警告"
    return 0
  fi
  echo "❌ ① 内核层失败: $errors 个错误, $warnings 个警告"
  [ -n "$missing_scripts" ] && echo -e "缺失脚本:$missing_scripts"
  [ -n "$require_fails" ] && echo -e "依赖问题:$require_fails"
  return 1
}

# ── ② CC 注册层 ──
verify_cc_registration() {
  local home="$1"
  local kernel="$2"
  local errors=0
  local cc_home="$home/.claude"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "② Claude Code 注册层验证"
  echo "   CC 目录: $cc_home"
  echo "   内核:    $kernel"
  echo "   检查: skills/commands/rules symlink → 内核 + settings.json hooks"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [ ! -d "$kernel" ]; then
    echo "❌ 内核目录不存在: $kernel"
    return 1
  fi

  local shim
  for shim in skills commands rules; do
    local link="$cc_home/$shim"
    local expected="$kernel/$shim"
    if [ -L "$link" ]; then
      local real_link real_expected
      real_link=$(node -e "const fs=require('fs');try{console.log(fs.realpathSync(process.argv[1]))}catch{process.exit(1)}" "$link" 2>/dev/null || echo "")
      real_expected=$(node -e "const fs=require('fs');try{console.log(fs.realpathSync(process.argv[1]))}catch{process.exit(1)}" "$expected" 2>/dev/null || echo "")
      if [ -n "$real_link" ] && [ "$real_link" = "$real_expected" ]; then
        echo "  ✅ $shim symlink → $real_link"
      else
        echo "  ❌ $shim symlink 指向错误: $link → $real_link（期望 $real_expected）"
        errors=$((errors + 1))
      fi
    elif [ -e "$link" ]; then
      echo "  ❌ $shim 是实体路径而非 symlink（应指向 $expected）"
      errors=$((errors + 1))
    else
      echo "  ❌ 缺 $shim symlink: $link"
      errors=$((errors + 1))
    fi
  done

  local settings="$cc_home/settings.json"
  echo ""
  echo "  🪝 检查 settings.json hook 注册..."
  if [ ! -f "$settings" ]; then
    echo "  ❌ 缺 settings.json: $settings"
    errors=$((errors + 1))
  else
    echo "  ✅ settings.json 存在"
    local expected_hooks=("test-guard.js" "plan-gate.js" "stop-test-gate.js" "session-start.js")
    for expected in "${expected_hooks[@]}"; do
      if grep -q "$expected" "$settings" 2>/dev/null; then
        echo "    ✅ hook 已注册: $expected"
      else
        echo "    ❌ hook 未注册: $expected"
        errors=$((errors + 1))
      fi
    done
  fi

  echo ""
  if [ "$errors" -eq 0 ]; then
    echo "✅ ② CC 注册层通过"
    return 0
  fi
  echo "❌ ② CC 注册层失败: $errors 个错误"
  echo "  修复: bash ~/.airein/airein setup --hosts claude-code --yes"
  return 1
}

# ── ③ 宿主注册层（产物矩阵）──
verify_host_checks() {
  local host="$1"
  local target="$2"
  local errors=0

  case "$host" in
    cursor|codex|codebuddy|opencode) ;;
    *)
      echo "❌ 未知 host: $host（已知: cursor/codex/codebuddy/opencode)"
      return 1
      ;;
  esac

  if [ -z "$target" ]; then
    echo "❌ 缺 --root <dir>（install 时的 targetRoot）"
    return 1
  fi
  if [ ! -d "$target" ]; then
    echo "❌ --root 目录不存在: $target"
    return 1
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "③ 宿主注册层验证 — $host"
  echo "   targetRoot: $target"
  echo "   检查: deployment §3 产物矩阵 + install-manifest"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [ ! -f "$target/.airein-install-state.json" ]; then
    echo "❌ 缺 install-manifest: $target/.airein-install-state.json"
    echo "  → 先 install: node \"$REPO_ROOT/scripts/install-host.js\" install --host $host --root \"$target\""
    return 1
  fi
  echo "  ✅ install-manifest: $target/.airein-install-state.json"

  echo ""
  echo "  📦 $host 产物矩阵..."
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
      check_file "$target/AGENTS.md" "K2 rules AGENTS.md" || errors=$((errors + 1))
      check_file "$target/opencode.json" "K3 plugin 注册 opencode.json" || errors=$((errors + 1))
      check_dir_nonempty "$target/commands" "K4 commands (项目根 commands/)" || errors=$((errors + 1))
      check_file "$target/.opencode/plugin/airein-bridge.ts" "OC bridge.ts 实体" || errors=$((errors + 1))
      check_file "$REPO_ROOT/opencode/bridge.ts" "归一化入口 bridge.ts (源)" || errors=$((errors + 1))
      ;;
  esac

  echo ""
  if [ "$errors" -eq 0 ]; then
    echo "✅ ③ $host 注册层通过"
    return 0
  fi
  echo "❌ ③ $host 注册层失败: $errors 个缺失"
  echo "  修复: node \"$REPO_ROOT/scripts/install-host.js\" install --host $host --root \"$target\""
  return 1
}

verify_host() {
  verify_host_checks "$1" "$2"
  exit $?
}

# ── --full：按 install-profile 跑全部层 ──
verify_full() {
  local kernel="${1:-}"
  local home="${2:-}"
  [ -z "$kernel" ] && kernel="$DEFAULT_KERNEL"
  [ -z "$home" ] && home="$DEFAULT_HOME"
  local failed=0
  local layers=0
  local passed=0

  if [ -z "$kernel" ]; then
    echo "❌ --full 需要 --kernel <dir>（默认 ~/.airein）"
    return 1
  fi
  if [ -z "$home" ]; then
    echo "❌ --full 需要 --home <dir>（默认 \$HOME）"
    return 1
  fi

  echo ""
  echo "════════════════════════════════════════"
  echo "🔍 Airein 完整安装验证 (--full)"
  echo "   内核: $kernel"
  echo "   HOME: $home"
  echo "════════════════════════════════════════"

  layers=$((layers + 1))
  if verify_kernel "$kernel"; then passed=$((passed + 1)); else failed=$((failed + 1)); fi

  local profile="$kernel/install-profile.json"
  if [ ! -f "$profile" ]; then
    echo ""
    echo "⚠️  无 install-profile.json，跳过注册层（仅完成内核检查）"
    echo "  → 若已 setup，请检查 $profile 是否存在"
  else
    echo ""
    echo "  📋 读取 install-profile.json..."
    local host_ids
    host_ids=$(node -e "
      const fs=require('fs');
      const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
      for (const h of d.hosts||[]) console.log(h.id);
    " "$profile" 2>/dev/null || true)

    if [ -z "$host_ids" ]; then
      echo "  ⚠️  profile.hosts 为空，跳过注册层"
    else
      while IFS= read -r hid; do
        [ -z "$hid" ] && continue
        echo "  · 已注册宿主: $hid"
      done <<< "$host_ids"

      if echo "$host_ids" | grep -q '^claude-code$'; then
        layers=$((layers + 1))
        if verify_cc_registration "$home" "$kernel"; then passed=$((passed + 1)); else failed=$((failed + 1)); fi
      fi

      while IFS= read -r hid; do
        [ -z "$hid" ] && continue
        case "$hid" in
          claude-code) ;;
          cursor|codex|codebuddy|opencode)
            layers=$((layers + 1))
            if verify_host_checks "$hid" "$home"; then passed=$((passed + 1)); else failed=$((failed + 1)); fi
            ;;
          *)
            echo ""
            echo "  ⚠️  跳过未知宿主 $hid（无 verify 规则）"
            ;;
        esac
      done <<< "$host_ids"
    fi
  fi

  echo ""
  echo "════════════════════════════════════════"
  if [ "$failed" -eq 0 ]; then
    echo "✅ 完整验证通过: $passed/$layers 层全部 OK"
    return 0
  fi
  echo "❌ 完整验证失败: $passed/$layers 层通过, $failed 层失败"
  echo "  修复: bash \"$kernel/airein\" update  或  bash ./airein setup --yes"
  return 1
}

# ── 调度 ──
if [ "$WANT_HELP" = true ]; then
  print_usage
  exit 0
fi

if [ "$MODE" = "full" ]; then
  verify_full "${KERNEL_DIR:-}" "${HOME_DIR:-}"
  exit $?
fi

if [ -n "$HOST" ]; then
  verify_host "$HOST" "$ROOT_DIR"
fi

if [ "$MODE" = "cc-registration" ]; then
  if [ -z "$DEFAULT_HOME" ] || [ -z "$KERNEL_DIR" ]; then
    echo "❌ --cc-registration 需要 --home <dir> --kernel <dir>"
    echo "  示例: verify-airein.sh --cc-registration --home \"\$HOME\" --kernel ~/.airein"
    exit 1
  fi
  verify_cc_registration "$DEFAULT_HOME" "$KERNEL_DIR"
  exit $?
fi

if [ -z "$KERNEL_DIR" ]; then
  print_usage
  exit 1
fi

verify_kernel "$KERNEL_DIR"
exit $?
