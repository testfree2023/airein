#!/usr/bin/env bash
# setup-airein.sh - 新机器一键初始化 Airein 环境（完全自包含）
#
# 不管从哪里运行，脚本会自动 clone 仓库并合并到 ~/.claude
#
# 用法:
#   # 方式 1: 先 clone 再执行（任意目录）
#   git clone git@github.com:testfree2023/airein.git /tmp/airein
#   bash /tmp/airein/setup-airein.sh [可选: ANTHROPIC_BASE_URL] [可选: ANTHROPIC_API_KEY]
#
#   # 方式 2: 直接下载脚本执行（如果已有脚本文件）
#   bash setup-airein.sh   # 不传参则后续手动编辑 ~/.claude/settings.json

set -e

PROXY_URL="${1:-}"
API_KEY="${2:-}"
REPO="git@github.com:testfree2023/airein.git"
CLAUDE_DIR="$HOME/.claude"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMP_CLONE=""
# Shared installer helpers (node resolution + remote check). The lib is part
# of the installer tree; if it is missing the install is broken — abort early
# with a clear message rather than failing mysteriously later.
HELPERS_LIB="$SCRIPT_DIR/scripts/lib/install-helpers.sh"
if [ ! -f "$HELPERS_LIB" ]; then
  echo "❌ 安装器残缺：缺少 $HELPERS_LIB" >&2
  exit 1
fi
# shellcheck source=scripts/lib/install-helpers.sh
. "$HELPERS_LIB"
# Resolve node robustly across nvm/fnm/volta/homebrew (see install-helpers.sh).
NODE_BIN="$(resolve_node_bin)"
HOOK_COUNT=0
JS_COUNT=0

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Airein — 一键初始化"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. 检查前置条件 ──────────────────────────────────────────────
echo "🔍 检查前置条件..."

MISSING=0

if ! command -v git &>/dev/null; then
  echo "  ❌ git 未安装"
  MISSING=1
else
  echo "  ✅ git $(git --version 2>/dev/null | cut -d' ' -f3)"
fi

if [ -z "$NODE_BIN" ]; then
  echo "  ❌ Node.js 未安装 (hook 脚本需要)"
  MISSING=1
else
  echo "  ✅ Node.js $("$NODE_BIN" --version)"
fi

if ! command -v claude &>/dev/null; then
  echo "  ⚠️  claude CLI 未找到 (安装后才能使用)"
else
  echo "  ✅ claude CLI 已安装"
fi

if [ $MISSING -eq 1 ]; then
  echo ""
  echo "❌ 缺少必要依赖，请先安装后重试。"
  exit 1
fi

# ── 2. 确定 Airein 源文件位置 ───────────────────────────────────
# 脚本可能从仓库内运行，也可能从任意位置运行
# 需要确保 Airein 文件可用

IS_FROM_REPO=false
if [ -f "$SCRIPT_DIR/rules/00-iron-rules.md" ] && [ -f "$SCRIPT_DIR/hooks/hooks.json" ]; then
  IS_FROM_REPO=true
fi

if [ "$IS_FROM_REPO" = true ] && [ "$CLAUDE_DIR" != "$SCRIPT_DIR" ]; then
  # 从仓库目录运行，但不是 ~/.claude → 需要合并
  AIREIN_SRC="$SCRIPT_DIR"
  echo ""
  echo "📂 从仓库目录运行: $SCRIPT_DIR"
elif [ -d "$CLAUDE_DIR/.git" ]; then
  # ~/.claude 已是 git 仓库 → 先校验 remote 是否 airein 自己的，再 pull。
  # 不校验会静默 pull 外来 harness 的仓库（Bug 2026-07-09 首次部署命中）。
  REMOTE_URL="$(git -C "$CLAUDE_DIR" config --get remote.origin.url 2>/dev/null || true)"
  if is_airein_remote_url "$REMOTE_URL"; then
    echo ""
    echo "📦 ~/.claude 已是 airein 仓库，更新到最新..."
    git -C "$CLAUDE_DIR" pull origin main 2>/dev/null || echo "  ⚠️  pull 失败，继续使用现有内容"
    AIREIN_SRC="$CLAUDE_DIR"
  else
    # 外来 harness 的 git 仓库 → 不能 pull（会拉取错误仓库而非安装 airein）。
    # 不自动删除用户的 .git：提示备份 + 移除旧 harness 后重装，由用户决策。
    echo ""
    echo "❌ ~/.claude 已是 git 仓库，但来源不是 airein："
    echo "     remote.origin.url = ${REMOTE_URL:-（无 origin remote）}"
    echo "   直接 pull 会拉取错误仓库而非安装 airein。"
    echo "   请先备份个人数据并移除旧 harness（含 ~/.claude/.git），再重新运行 setup-airein.sh。"
    exit 1
  fi
else
  # 需要 clone → 临时目录
  echo ""
  echo "📥 下载 Airein 文件..."
  TEMP_CLONE=$(mktemp -d)
  if git clone --depth 1 "$REPO" "$TEMP_CLONE/airein" 2>/dev/null; then
    AIREIN_SRC="$TEMP_CLONE/airein"
    echo "  ✅ 下载完成"
  else
    echo "  ❌ 下载失败，请检查网络和 SSH key"
    echo "     确保 SSH key 已添加到 github.com"
    rm -rf "$TEMP_CLONE"
    exit 1
  fi
fi

# ── 3. 合并到 ~/.claude ──────────────────────────────────────────
if [ "$AIREIN_SRC" != "$CLAUDE_DIR" ]; then
  echo ""
  if [ -d "$CLAUDE_DIR" ]; then
    echo "📦 合并 Airein 文件到 ~/.claude（不覆盖已有配置）..."
  else
    echo "📦 安装 Airein 文件到 ~/.claude..."
    mkdir -p "$CLAUDE_DIR"
  fi

  # 用 rsync 或 cp 合并（不覆盖已有文件）
  if command -v rsync &>/dev/null; then
    rsync -a --ignore-existing "$AIREIN_SRC/" "$CLAUDE_DIR/"
    # 始终更新的关键文件（即使用户有旧版本）
    rsync -a "$AIREIN_SRC/hooks/hooks.json" "$AIREIN_SRC/setup-airein.sh" "$CLAUDE_DIR/"
    rsync -a "$AIREIN_SRC/airein-pack.sh" "$AIREIN_SRC/airein-unpack.sh" "$CLAUDE_DIR/" 2>/dev/null
    rsync -a "$AIREIN_SRC/README.md" "$CLAUDE_DIR/" 2>/dev/null
    rsync -a "$AIREIN_SRC/scripts/" "$CLAUDE_DIR/scripts/" 2>/dev/null
    rsync -a "$AIREIN_SRC/skills/init-project/" "$CLAUDE_DIR/skills/init-project/" 2>/dev/null
    rsync -a "$AIREIN_SRC/skills/stuck-recovery/" "$CLAUDE_DIR/skills/stuck-recovery/" 2>/dev/null
    rsync -a "$AIREIN_SRC/skills/model-guide/" "$CLAUDE_DIR/skills/model-guide/" 2>/dev/null
    rsync -a "$AIREIN_SRC/skills/status/" "$CLAUDE_DIR/skills/status/" 2>/dev/null
    rsync -a "$AIREIN_SRC/skills/next/" "$CLAUDE_DIR/skills/next/" 2>/dev/null
    rsync -a "$AIREIN_SRC/skills/new-plan/" "$CLAUDE_DIR/skills/new-plan/" 2>/dev/null
    rsync -a "$AIREIN_SRC/skills/log-change/" "$CLAUDE_DIR/skills/log-change/" 2>/dev/null
    rsync -a "$AIREIN_SRC/skills/archive-plan/" "$CLAUDE_DIR/skills/archive-plan/" 2>/dev/null
    rsync -a "$AIREIN_SRC/skills/writing-plans/" "$CLAUDE_DIR/skills/writing-plans/" 2>/dev/null
    rsync -a "$AIREIN_SRC/skills/tdd-workflow/" "$CLAUDE_DIR/skills/tdd-workflow/" 2>/dev/null
    rsync -a "$AIREIN_SRC/skills/verification-loop/" "$CLAUDE_DIR/skills/verification-loop/" 2>/dev/null
    rsync -a "$AIREIN_SRC/skills/self-learning/" "$CLAUDE_DIR/skills/self-learning/" 2>/dev/null
    rsync -a "$AIREIN_SRC/rules/" "$CLAUDE_DIR/rules/" 2>/dev/null
    rsync -a "$AIREIN_SRC/templates/" "$CLAUDE_DIR/templates/" 2>/dev/null
    echo "  ✅ 合并完成"
  else
    # 没有 rsync 时用 cp -n（不覆盖）
    cp -rn "$AIREIN_SRC/"* "$CLAUDE_DIR/" 2>/dev/null
    cp -rn "$AIREIN_SRC/".[!.]* "$CLAUDE_DIR/" 2>/dev/null
    # 强制更新核心文件
    cp -f "$AIREIN_SRC/hooks/hooks.json" "$CLAUDE_DIR/hooks/" 2>/dev/null
    echo "  ✅ 合并完成"
  fi
fi

# 清理临时目录（脚本内部 clone 的）
if [ -n "$TEMP_CLONE" ] && [ -d "$TEMP_CLONE" ]; then
  rm -rf "$TEMP_CLONE"
fi

# 清理脚本所在的临时 clone 目录（精确匹配 /tmp/airein*）
case "$SCRIPT_DIR" in
  /tmp/airein*)
    if [ "$IS_FROM_REPO" = true ] && [ "$SCRIPT_DIR" != "$CLAUDE_DIR" ]; then
      echo "  🧹 清理临时文件: $SCRIPT_DIR"
      # 先退出待删目录：调用方常 `cd /tmp/airein* && bash setup-airein.sh`，
      # 当前 shell 的 cwd 仍在 SCRIPT_DIR，rm 后后续 merge-hooks/chores/verify
      # 子进程 getcwd 失效（Bug 2026-07-10 双机重装发现）。
      cd "$HOME" 2>/dev/null || cd / 2>/dev/null || true
      rm -rf "$SCRIPT_DIR"
    fi
    ;;
esac

# ── 4. 配置 settings.json ────────────────────────────────────────
echo ""
echo "⚙️  配置 settings.json..."

if [ -f "$CLAUDE_DIR/settings.json" ]; then
  echo "  ✅ settings.json 已存在，保留当前配置"
else
  cat > "$CLAUDE_DIR/settings.json" << 'SETTINGS_EOF'
{
  "env": {
    "ANTHROPIC_API_KEY": "your-api-key"
  },
  "permissions": {
    "allow": [],
    "deny": []
  }
}
SETTINGS_EOF

  # 如果命令行提供了参数，直接写入
  if [ -n "$PROXY_URL" ]; then
    "$NODE_BIN" -e "
      const fs = require('fs');
      const p = '$CLAUDE_DIR/settings.json';
      const s = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (s.env) s.env.ANTHROPIC_BASE_URL = '$PROXY_URL';
      if (s.env && '$API_KEY') s.env.ANTHROPIC_API_KEY = '$API_KEY';
      fs.writeFileSync(p, JSON.stringify(s, null, 2));
    "
    echo "  ✅ 已配置代理地址: $PROXY_URL"
  else
    echo ""
    echo "  ⚠️  需要手动编辑 settings.json:"
    echo "     vi $CLAUDE_DIR/settings.json"
    echo "     设置 ANTHROPIC_BASE_URL 和 ANTHROPIC_API_KEY"
  fi
fi

# ── 4b. 注册 Hooks 到 settings.json ────────────────────────────────
echo ""
echo "🪝 注册 Hooks 到 settings.json..."

if [ -f "$CLAUDE_DIR/scripts/merge-hooks.sh" ]; then
  HOOK_COUNT=$(bash "$CLAUDE_DIR/scripts/merge-hooks.sh" "$CLAUDE_DIR" "$(pwd)" | tail -1)
else
  echo "  ⚠️  merge-hooks.sh 不存在，跳过 Hook 注册"
fi

# ── 5. 运行打杂脚本（迁移 + 目录 + 模板 + 验证）───────────────────
echo ""
echo "🔧 运行 Chores（迁移 + 初始化 + 验证）..."

if [ -f "$CLAUDE_DIR/scripts/airein-chores.sh" ]; then
  bash "$CLAUDE_DIR/scripts/airein-chores.sh" "$CLAUDE_DIR" "$(pwd)"
else
  echo "  ⚠️  airein-chores.sh 不存在，手动创建目录..."
  mkdir -p "$(pwd)/.claude/config" "$(pwd)/.claude/memory" "$(pwd)/.claude/logs"
fi

if [ -d "$CLAUDE_DIR/scripts/hooks" ]; then
  JS_COUNT=$(find "$CLAUDE_DIR/scripts/hooks" -maxdepth 1 -name '*.js' 2>/dev/null | wc -l | tr -d ' ')
fi

# ── 5b. 深度验证（动态解析 hooks.json）──────────────────────────
if [ -f "$CLAUDE_DIR/scripts/update/verify-airein.sh" ]; then
  echo ""
  echo "🔍 深度验证 Airein 完整性..."
  if bash "$CLAUDE_DIR/scripts/update/verify-airein.sh" "$CLAUDE_DIR"; then
    echo "  ✅ 深度验证通过"
  else
    echo "  ⚠️  深度验证发现问题，请检查上方错误信息"
    echo "  修复建议: 重新运行 bash setup-airein.sh"
  fi
fi

# ── 6. 安装结果 ──────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Airein 初始化完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  已安装:"
echo "    📋 rules/           — L0 铁律/架构/工作流 (3 文件: 00/10/20, CC 原生加载)"
echo "    🪝 hooks            — 已注册到 settings.json ($HOOK_COUNT 个)"
echo "    🛠️  scripts/hooks/   — Hook 脚本 ($JS_COUNT 个)"
echo "    📚 skills/          — 自定义技能 (12 个)"
echo "    📁 templates/       — 项目模板"
echo "    📝 logs/            — 运行日志 (按日切割)"
echo "    📁 .claude/memory/  — 项目级记忆（session-state + memory + chat）"
echo ""

if grep -q "your-api-key\|your.key" "$CLAUDE_DIR/settings.json" 2>/dev/null; then
  echo "  ⚠️  下一步（必须）:"
  echo "     编辑 ~/.claude/settings.json"
  echo "     设置 ANTHROPIC_BASE_URL 和 ANTHROPIC_API_KEY"
  echo ""
fi

echo "  开始使用:"
echo "     cd /path/to/your-project"
echo "     claude"
echo ""
echo "  新项目: 直接启动，模型自动初始化"
echo "  进行中项目: 启动后输入 /init-project 自动分析并迁移"
echo ""
