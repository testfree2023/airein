#!/usr/bin/env bash
# airein-pack.sh - 打包 Airein 配置
# 用法: bash airein-pack.sh [输出目录]

set -e

OUTPUT_DIR="${1:-.}"
OUTPUT_FILE="$OUTPUT_DIR/airein-$(date +%Y%m%d).tar.gz"

TEMP_DIR=$(mktemp -d)
mkdir -p "$TEMP_DIR/.claude"

echo "📦 打包 Airein 配置..."

# ── 1. 核心配置 ──────────────────────────────────────────────────
# 不打包 ~/.claude/CLAUDE.md（用户领土，airein 不拥有）
cp ~/.claude/hooks/hooks.json "$TEMP_DIR/.claude/hooks.json" 2>/dev/null
mkdir -p "$TEMP_DIR/.claude/hooks"
cp ~/.claude/hooks/README.md "$TEMP_DIR/.claude/hooks/" 2>/dev/null

# ── 2. 规则 (L0: CC 原生加载 ~/.claude/rules/*.md) ───────────────
# rules/ 收归顶层 00/10/20（铁律/架构/工作流）。
mkdir -p "$TEMP_DIR/.claude/rules"
cp ~/.claude/rules/00-iron-rules.md "$TEMP_DIR/.claude/rules/" 2>/dev/null
cp ~/.claude/rules/10-architecture.md "$TEMP_DIR/.claude/rules/" 2>/dev/null
cp ~/.claude/rules/20-workflow.md "$TEMP_DIR/.claude/rules/" 2>/dev/null

# ── 3. 自定义技能 (12个) ────────────────────────────────────────
CUSTOM_SKILLS="stuck-recovery model-guide status next new-plan log-change init-project archive-plan writing-plans tdd-workflow verification-loop self-learning"
for skill in $CUSTOM_SKILLS; do
  if [ -d ~/.claude/skills/$skill ]; then
    mkdir -p "$TEMP_DIR/.claude/skills/$skill"
    cp ~/.claude/skills/$skill/SKILL.md "$TEMP_DIR/.claude/skills/$skill/" 2>/dev/null
  fi
done

# ── 4. Hook 脚本 (7个自建) ──────────────────────────────────────
mkdir -p "$TEMP_DIR/.claude/scripts/hooks"
CUSTOM_HOOKS="stop-test-gate pre-commit-gate quality-sentinel regression-test-gate contract-sentinel pre-edit-impact session-start session-end"
for hook in $CUSTOM_HOOKS; do
  cp ~/.claude/scripts/hooks/${hook}.js "$TEMP_DIR/.claude/scripts/hooks/" 2>/dev/null
done

# ── 5. 共享库 ────────────────────────────────────────────────────
mkdir -p "$TEMP_DIR/.claude/scripts/lib"
cp ~/.claude/scripts/lib/quality-config.js "$TEMP_DIR/.claude/scripts/lib/" 2>/dev/null
cp ~/.claude/scripts/lib/language-config.js "$TEMP_DIR/.claude/scripts/lib/" 2>/dev/null

# ── 6. 模板 ──────────────────────────────────────────────────────
mkdir -p "$TEMP_DIR/.claude/templates/docs"
mkdir -p "$TEMP_DIR/.claude/templates/language-profiles"
mkdir -p "$TEMP_DIR/.claude/templates/rules"
cp ~/.claude/templates/quality.json "$TEMP_DIR/.claude/templates/" 2>/dev/null
cp ~/.claude/templates/pipelines.json "$TEMP_DIR/.claude/templates/" 2>/dev/null
cp ~/.claude/templates/language-profiles/*.json "$TEMP_DIR/.claude/templates/language-profiles/" 2>/dev/null
cp ~/.claude/templates/docs/*.md "$TEMP_DIR/.claude/templates/docs/" 2>/dev/null
# per-language design subdocs + thin-shell skeleton（design-architecture/、design-conventions/ 子目录 + rules/ 薄壳骨架）
cp -r ~/.claude/templates/docs/design-architecture "$TEMP_DIR/.claude/templates/docs/" 2>/dev/null
cp -r ~/.claude/templates/docs/design-conventions "$TEMP_DIR/.claude/templates/docs/" 2>/dev/null
cp ~/.claude/templates/rules/*.md "$TEMP_DIR/.claude/templates/rules/" 2>/dev/null

# ── 7. settings.json 模板（清空敏感字段，用户自行填写）────────────
if [ -f ~/.claude/settings.json ]; then
  cat ~/.claude/settings.json | \
    sed -e 's|"ANTHROPIC_BASE_URL": ".*"|"ANTHROPIC_BASE_URL": ""|' \
        -e 's|"ANTHROPIC_API_KEY": ".*"|"ANTHROPIC_API_KEY": ""|' \
        -e 's|"apiKey": ".*"|"apiKey": ""|' \
        -e 's|"AUTH_TOKEN": ".*"|"AUTH_TOKEN": ""|' \
    > "$TEMP_DIR/.claude/settings.json.template"
fi

# ── 打包 ─────────────────────────────────────────────────────────
tar -czf "$OUTPUT_FILE" -C "$TEMP_DIR" .claude
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Airein 打包完成: $OUTPUT_FILE"
echo ""
echo "包含文件:"
tar -tzf "$OUTPUT_FILE" | head -40
echo "..."
echo ""
echo "总文件数: $(tar -tzf "$OUTPUT_FILE" | wc -l)"
echo ""
echo "迁移到新电脑: bash airein-unpack.sh $OUTPUT_FILE"
