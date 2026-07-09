#!/usr/bin/env bash
# airein-unpack.sh - 在新电脑上解包 Airein 配置
# 用法: bash airein-unpack.sh <打包文件.tar.gz>

set -e

if [ -z "$1" ]; then
  echo "用法: bash airein-unpack.sh <airein-YYYYMMDD.tar.gz>"
  exit 1
fi

PACK_FILE="$1"

if [ ! -f "$PACK_FILE" ]; then
  echo "❌ 文件不存在: $PACK_FILE"
  exit 1
fi

# ── 1. 备份现有配置 ──────────────────────────────────────────────
if [ -d ~/.claude ]; then
  BACKUP=~/.claude.backup.$(date +%Y%m%d%H%M%S)
  echo "📦 备份现有 ~/.claude 到: $BACKUP"
  cp -r ~/.claude "$BACKUP"
fi

# ── 2. 解包 Airein ──────────────────────────────────────────────
echo "📦 解包 Airein 配置..."
tar -xzf "$PACK_FILE" -C ~/

# ── 3. settings.json 处理 ────────────────────────────────────────
if [ ! -f ~/.claude/settings.json ]; then
  if [ -f ~/.claude/settings.json.template ]; then
    echo ""
    echo "⚠️  需要配置 settings.json:"
    echo "   cp ~/.claude/settings.json.template ~/.claude/settings.json"
    echo "   然后填入你的 Claude API 配置"
  fi
else
  echo "✅ settings.json 已存在，保留当前配置"
  rm -f ~/.claude/settings.json.template
fi

# ── 4. 语法验证 ──────────────────────────────────────────────────
echo ""
echo "🔍 验证文件完整性..."

ERRORS=0

# 验证 JSON 文件
for jsonfile in ~/.claude/hooks/hooks.json ~/.claude/templates/quality.json; do
  if [ -f "$jsonfile" ]; then
    if node -e "JSON.parse(require('fs').readFileSync('$jsonfile','utf8'))" 2>/dev/null; then
      echo "  ✅ $(basename $jsonfile)"
    else
      echo "  ❌ $(basename $jsonfile) — JSON 语法错误"
      ERRORS=$((ERRORS + 1))
    fi
  fi
done

# 验证 JS 文件
for jsfile in ~/.claude/scripts/hooks/*.js ~/.claude/scripts/lib/*.js; do
  if [ -f "$jsfile" ]; then
    if node -c "$jsfile" 2>/dev/null; then
      true
    else
      echo "  ❌ $(basename $jsfile) — JS 语法错误"
      ERRORS=$((ERRORS + 1))
    fi
  fi
done

JS_COUNT=$(ls ~/.claude/scripts/hooks/*.js 2>/dev/null | wc -l)
echo "  ✅ $JS_COUNT hook 脚本通过语法检查"

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "⚠️  有 $ERRORS 个文件验证失败，请检查"
fi

# ── 5. 安装结果 ──────────────────────────────────────────────────
echo ""
echo "✅ Airein 安装完成！"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  安装内容:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

[ -f ~/.claude/hooks/hooks.json ] && echo "  ✅ hooks.json"
[ -d ~/.claude/rules ] && echo "  ✅ rules/ ($(find ~/.claude/rules -name '*.md' | wc -l) 文件)"
[ -d ~/.claude/skills ] && echo "  ✅ skills/ ($(find ~/.claude/skills -name 'SKILL.md' | wc -l) 文件)"
[ -d ~/.claude/scripts/hooks ] && echo "  ✅ scripts/hooks/ ($(ls ~/.claude/scripts/hooks/*.js | wc -l) 脚本)"
[ -d ~/.claude/scripts/lib ] && echo "  ✅ scripts/lib/ ($(ls ~/.claude/scripts/lib/*.js | wc -l) 库)"
[ -d ~/.claude/templates ] && echo "  ✅ templates/ ($(find ~/.claude/templates -type f | wc -l) 文件)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  下一步:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  1. 配置 settings.json:"
echo "     cp ~/.claude/settings.json.template ~/.claude/settings.json"
echo "     填入你的 Claude API 配置"
echo ""
echo "  2. 进入项目目录开始工作:"
echo "     cd /path/to/your-project"
echo "     claude"
echo ""
echo "  3. 新项目会自动初始化项目状态管理"
echo "     进行中项目会自动恢复上次工作位置"
echo ""
