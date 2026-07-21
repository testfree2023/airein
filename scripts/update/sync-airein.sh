#!/usr/bin/env bash
# sync-airein.sh — 将 airein 文件同步到目标目录
#
# 包含完整的文件清单（manifest），负责：
#   1. 复制核心文件（总是覆盖）
#   2. 创建模板文件（仅当不存在时）
#   3. 更新 Skills（总是覆盖）
#   4. 报告结果
#
# 用法: bash sync-airein.sh <source_dir> <target_dir> [project_dir]
#   source_dir:  clone 下来的 airein 临时目录（如 /tmp/airein-xxx）
#   target_dir:  安装目标（通常是 ~/.claude）
#   project_dir: 当前项目目录（用于 merge-hooks，可选）

set -euo pipefail

SOURCE_DIR="${1:?用法: sync-airein.sh <source_dir> <target_dir> [project_dir]}"
TARGET_DIR="${2:?用法: sync-airein.sh <source_dir> <target_dir> [project_dir]}"
PROJECT_DIR="${3:-}"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "❌ 源目录不存在: $SOURCE_DIR"
  exit 1
fi

# ═══════════════════════════════════════════════════════════════════
# MANIFEST — airein 管理的所有文件
# ═══════════════════════════════════════════════════════════════════

# 强制更新：核心文件，总是覆盖
CORE_FILES=(
  # ── L0 rules (CC 原生加载 ~/.claude/rules/*.md) ──
  "rules/00-iron-rules.md"
  "rules/10-architecture.md"
  "rules/20-workflow.md"
  "hooks/hooks.json"
  "hooks/plugin-bridge.json"   # P009 L1 SessionStart bridge only (not full iron-law)
  "hooks/README.md"
  # ── hooks ──
  "scripts/hooks/pre-compact.js"
  "scripts/hooks/session-start.js"
  "scripts/hooks/plugin-kernel-bridge.js"  # P009 L1 thin SessionStart for plugin cache
  "scripts/hooks/session-end.js"
  "scripts/hooks/stop-test-gate.js"
  "scripts/hooks/pre-commit-gate.js"
  "scripts/hooks/quality-sentinel.js"
  "scripts/hooks/regression-test-gate.js"
  "scripts/hooks/contract-sentinel.js"
  "scripts/hooks/pre-edit-impact.js"
  "scripts/hooks/doc-file-warning.js"
  "scripts/hooks/post-edit-format.js"
  "scripts/hooks/post-edit-typecheck.js"
  "scripts/hooks/quality-gate.js"
  "scripts/hooks/run-with-flags.js"
  "scripts/hooks/run-hook.sh"
  "scripts/hooks/check-hook-enabled.js"
  "scripts/hooks/plan-gate.js"
  "scripts/hooks/approval-sequence.js"
  "scripts/hooks/approval-guard.js"
  "scripts/hooks/progress-sync.js"
  "scripts/hooks/structure-sync.js"
  "scripts/hooks/read-dedup.js"
  "scripts/hooks/test-guard.js"
  "scripts/hooks/archive-trigger.js"
  "scripts/hooks/self-learning-prompt.js"
  "scripts/hooks/tests-ledger-gate.js"
  "scripts/hooks/progress-completion-gate.js"
  "scripts/hooks/progress-approval-gate.js"
  "scripts/hooks/roadmap-gate.js"
  # ── lib ──
  "scripts/lib/utils.js"
  "scripts/lib/quality-config.js"
  "scripts/lib/language-config.js"
  "scripts/lib/airein-logger.js"
  "scripts/lib/plan-parser.js"
  "scripts/lib/hook-flags.js"
  "scripts/lib/shell-split.js"
  "scripts/lib/package-manager.js"
  "scripts/lib/session-aliases.js"
  "scripts/lib/design-doc-resolver.js"
  "scripts/lib/git-worktree-context.js"  # /new-plan preflight: warn if linked worktree
  "scripts/lib/kernel-ready.js"          # P009 B→C: detect ~/.airein kernel ready
  "scripts/lib/requirements-template.js"  # P005: resolve s/m/l PRD template by pipeline
  "scripts/lib/design-template.js"        # resolve s/m/l design template by pipeline
  "scripts/lib/test-plan-template.js"     # resolve m/l test-plan template by pipeline
  "scripts/lib/conventions-shell.js"
  "scripts/lib/self-learning.js"
  "scripts/lib/runtime-metrics.js"      # dashboard/server.js requires it (omission crashed dashboard on deploy)
  "scripts/lib/dashboard-projects.js"   # init-project → dashboard project registry
  "scripts/lib/resolve-formatter.js"    # hooks/post-edit-format.js + quality-gate.js require it
  "scripts/lib/commit-gate.js"          # hooks/pre-commit-gate.js requires it (classify staged files)
  "scripts/lib/install-helpers.sh"      # setup/chores/merge-hooks source it (node resolution + remote check)
  # ── P006/P007 task panel + pickup sync ──
  "scripts/lib/parse-tasks-panel.js"    # tasks.md panel parser (dashboard + pickup)
  "scripts/lib/task-pickup.js"          # auto-claim next pending → in_progress
  "scripts/lib/progress-from-tasks.js"  # progress.md Stats/Active Task from tasks.md
  # ── P008 tests ledger / progress completion / roadmap gates ──
  "scripts/lib/parse-tests-ledger.js"
  "scripts/lib/tests-ledger-gate.js"
  "scripts/lib/progress-completion-gate.js"
  "scripts/lib/progress-approval-gate.js"
  "scripts/lib/roadmap-contract.js"
  "scripts/lib/roadmap-gate.js"
  "scripts/lib/pipeline-roles-banner.js"
  # ── P004 unified install orchestrator ──
  "airein"
  "scripts/lib/install-orchestrator.js"
  "scripts/lib/install-profile.js"
  "scripts/lib/host-detect.js"
  "scripts/lib/cc-register.js"
  "scripts/lib/project-paths.js"
  "scripts/lib/project-shim.js"
  # ── templates: reference config (always overwrite) ──
  "templates/quality.json"
  "templates/language-profiles/_default.json"
  "templates/language-profiles/javascript.json"
  "templates/language-profiles/typescript.json"
  "templates/language-profiles/python.json"
  "templates/language-profiles/java.json"
  "templates/language-profiles/go.json"
  "templates/language-profiles/rust.json"
  "templates/language-profiles/kotlin.json"
  # ── update sub-scripts ──
  "scripts/update/clean-airein.sh"
  "scripts/update/sync-airein.sh"
  "scripts/update/verify-airein.sh"
  # ── scripts ──
  "scripts/merge-hooks.sh"
  "scripts/merge-hooks.js"
  "scripts/airein-chores.sh"
  "scripts/migrate-paths.sh"
  "scripts/migrate-project-to-airein.js"
  "scripts/lib/project-migrate.js"
  "scripts/diagnose-hooks.sh"
  "scripts/cleanup-airein.sh"
  "scripts/migrate-plans.js"
  "scripts/manage-profile.js"
  "scripts/manage-plugins.js"
  # ── top-level ──
  "VERSION"                          # P002: 版本守卫读（安装目标 VERSION 供下次升级比较）
  "CHANGELOG.md"                     # user-facing release notes (plan complete / archive-plan)
  "README.md"
  # ── P001 multi-host adaptation layer (v0.2) ──
  # install-host.js reads skills/hooks.json/opencode from repoRoot (= this install dir),
  # so all P001 source files must ship alongside the dispatcher or it breaks at runtime.
  "scripts/install-host.js"            # P001 dispatcher (install/plan/uninstall/verify CLI)
  "scripts/lib/hook-register.js"       # K3 hook registration translator (4 hosts)
  "scripts/lib/install-manifest.js"    # install-state JSON (no SQLite, decoupled from ECC)
  "scripts/lib/skill-place.js"         # K1 skill placement (copy/none + name invariant)
  "scripts/lib/rule-generate.js"       # K2 rule thin-shell generator (.mdc/AGENTS.md/...)
  "scripts/lib/stdin-normalize.js"     # K3 stdin → CC schema normalization
  "scripts/lib/host-adapter.js"        # K3 mapHookResult pure fn (block semantic mapping)
  "scripts/lib/hook-timing.js"         # hook duration observability (run-with-flags)
  "scripts/lib/cc-hook-command.js"    # win32: bash run-hook.sh -> node direct (avoid WSL leak)
  "scripts/hooks/host/host-runner.js"  # host entry IO runner (readStdin→norm→spawn→map)
  "scripts/hooks/host/cursor.js"       # CUR entry (camelCase events + permission:deny)
  "scripts/hooks/host/codex.js"        # CDX entry (stdin cwd resolve + permissionDecision)
  "scripts/hooks/host/codebuddy.js"    # CB entry (schema identical to CC, identity map)
  "opencode/bridge.ts"                 # OC TS plugin (install injects AIREIN_ROOT, throw to block)
)

# 文档模板：airein 结构模板源（new-plan/archive-plan 读取生成 plan 文档），随 airein 升级强制覆盖
# （P004 后 templates 只在内核 ~/.airein/templates/，不在 ~/.claude/templates/）
TEMPLATE_FILES=(
  # -- docs (structural templates) --
  "templates/docs/requirements.md"           # P005: compat stub (not authoritative PRD)
  "templates/docs/requirements/s.md"       # P005: S-tier PRD template
  "templates/docs/requirements/m.md"       # P005: M-tier PRD template
  "templates/docs/requirements/l.md"       # P005: L-tier PRD template
  "templates/docs/design.md"               # compat stub (not authoritative design)
  "templates/docs/design/s.md"             # S-tier design (detail-first)
  "templates/docs/design/m.md"             # M-tier design (HLD + key UC DD)
  "templates/docs/design/l.md"             # L-tier design (HLD + full UC response)
  "templates/docs/design-domain-model.md"  # LLD 领域模型子文档
  "templates/docs/design-database.md"      # 数据库设计子文档（语言无关）
  "templates/docs/design-security.md"      # 安全设计子文档（语言无关）
  "templates/docs/design-deployment.md"    # 部署设计子文档（语言无关）
  "templates/docs/test-plan.md"            # compat stub
  "templates/docs/test-plan/m.md"
  "templates/docs/test-plan/l.md"
  "templates/docs/tests.md"            # plan-level test ledger (tdd skill)
  "templates/docs/roadmap.md"          # project status index (roadmap contract)
  "templates/docs/pipeline-roles-banner.md"  # Agent Teams session-start banner
  "templates/docs/deployment.md"
  "templates/docs/tasks.md"
  "templates/docs/progress.md"
  # -- per-language architecture templates --
  "templates/docs/design-architecture/javascript.md"
  "templates/docs/design-architecture/typescript.md"
  "templates/docs/design-architecture/python.md"
  "templates/docs/design-architecture/java.md"
  "templates/docs/design-architecture/go.md"
  "templates/docs/design-architecture/rust.md"
  "templates/docs/design-architecture/kotlin.md"
  # -- per-language conventions templates --
  "templates/docs/design-conventions/javascript.md"
  "templates/docs/design-conventions/typescript.md"
  "templates/docs/design-conventions/python.md"
  "templates/docs/design-conventions/java.md"
  "templates/docs/design-conventions/go.md"
  "templates/docs/design-conventions/rust.md"
  "templates/docs/design-conventions/kotlin.md"
  "templates/docs/design-conventions/bash.md"   # P018: bash conventions（airein dogfood 缺口）
  # -- P018 thin-shell skeleton (CC native conditional rules, replaces conventions-trigger hook) --
  "templates/rules/conventions-scope.md"
)

# Skill 目录：总是更新
SKILL_DIRS=(
  "init-project"
  "new-plan"
  "next"
  "status"
  "log-change"
  "stuck-recovery"
  "model-guide"
  "archive-plan"
  "tdd"
  "self-learning"
)

# 关键文件：更新后验证
VERIFY_FILES=(
  "scripts/hooks/test-guard.js"
  "scripts/hooks/plan-gate.js"
  "scripts/hooks/approval-guard.js"
  "scripts/hooks/approval-sequence.js"
  "scripts/hooks/doc-file-warning.js"
  "scripts/hooks/run-hook.sh"
  "scripts/hooks/run-with-flags.js"
  "scripts/lib/quality-config.js"
  "scripts/lib/language-config.js"
  "scripts/lib/utils.js"
  "scripts/lib/plan-parser.js"
  "scripts/lib/hook-flags.js"
  "scripts/lib/roadmap-contract.js"
  "scripts/lib/tests-ledger-gate.js"
  "hooks/hooks.json"
  "scripts/update/clean-airein.sh"
  "scripts/update/sync-airein.sh"
  "scripts/update/verify-airein.sh"
  # ── P001 dispatch sentinels: install-host + host-runner present = multi-host chain live ──
  "scripts/install-host.js"
  "scripts/hooks/host/host-runner.js"
)

# ═══════════════════════════════════════════════════════════════════
# 辅助函数
# ═══════════════════════════════════════════════════════════════════

merge_pipelines_json() {
  local src="$1"
  local dst="$2"

  if [ ! -f "$src" ]; then
    echo "  ⚠️  源文件缺失: templates/pipelines.json"
    MISSING=$((MISSING + 1))
    return
  fi

  mkdir -p "$(dirname "$dst")"
  if [ ! -f "$dst" ]; then
    cp "$src" "$dst"
    UPDATED=$((UPDATED + 1))
    return
  fi

  node - "$src" "$dst" <<'NODE'
const fs = require('fs');
const srcPath = process.argv[2];
const dstPath = process.argv[3];
const src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
let dst;
try {
  dst = JSON.parse(fs.readFileSync(dstPath, 'utf8'));
} catch {
  dst = {};
}

const LEGACY_KEYS = ['simple', 'medium', 'complex'];
const merged = {
  ...src,
  definitions: {
    ...(src.definitions || {}),
    ...(dst.definitions || {})
  }
};

// Preserve target's top-level preferences only if still valid (not a legacy value)
if (dst.defaultComplexity && !LEGACY_KEYS.includes(dst.defaultComplexity)) {
  merged.defaultComplexity = dst.defaultComplexity;
}

// Remove legacy pipeline names that no longer exist in source
for (const key of LEGACY_KEYS) {
  if (!src.definitions?.[key]) {
    delete merged.definitions[key];
  }
}

// Built-in definitions always refresh from source
for (const key of ['s-feature', 's-bugfix', 'm-feature', 'm-bugfix', 'm-urgent', 'l-feature', 'l-bugfix', 'hotfix']) {
  if (src.definitions && src.definitions[key]) {
    merged.definitions[key] = src.definitions[key];
  }
}

fs.writeFileSync(dstPath, JSON.stringify(merged, null, 2) + '\n');
NODE
  UPDATED=$((UPDATED + 1))
}

# ═══════════════════════════════════════════════════════════════════
# 执行同步
# ═══════════════════════════════════════════════════════════════════

UPDATED=0
MISSING=0

echo ""
echo "📋 同步核心文件（${#CORE_FILES[@]} 个）..."

for file in "${CORE_FILES[@]}"; do
  src="$SOURCE_DIR/$file"
  dst="$TARGET_DIR/$file"

  if [ -f "$src" ]; then
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    UPDATED=$((UPDATED + 1))
  else
    echo "  ⚠️  源文件缺失: $file"
    MISSING=$((MISSING + 1))
  fi
done

merge_pipelines_json "$SOURCE_DIR/templates/pipelines.json" "$TARGET_DIR/templates/pipelines.json"

echo "  ✅ 复制/合并了 $UPDATED 个文件"
[ "$MISSING" -gt 0 ] && echo "  ⚠️  $MISSING 个源文件不存在"

# ── 模板文件（仅新增）─────────────────────────────────────────
CREATED=0

echo ""
echo "📋 检查模板文件..."

for file in "${TEMPLATE_FILES[@]}"; do
  src="$SOURCE_DIR/$file"
  dst="$TARGET_DIR/$file"
  if [ -f "$src" ]; then
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    CREATED=$((CREATED + 1))
  else
    echo "  ⚠️  源模板缺失: $file"
    MISSING=$((MISSING + 1))
  fi
done
echo "  ✅ 覆盖 $CREATED 个文档模板"

# ── Skills ─────────────────────────────────────────────────────
SKILL_UPDATED=0

echo ""
echo "📋 同步 Skills..."

for skill in "${SKILL_DIRS[@]}"; do
  src="$SOURCE_DIR/skills/$skill/SKILL.md"
  dst="$TARGET_DIR/skills/$skill/SKILL.md"
  if [ -f "$src" ]; then
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    SKILL_UPDATED=$((SKILL_UPDATED + 1))
  fi
done
echo "  ✅ 更新了 $SKILL_UPDATED 个 Skill"

# ── Agents（agent 定义，强制覆盖）─────────────────────────────
AGENT_UPDATED=0

echo ""
echo "📋 同步 Agents..."

shopt -s nullglob
for agent_src in "$SOURCE_DIR"/agents/*.md; do
  dst="$TARGET_DIR/agents/$(basename "$agent_src")"
  mkdir -p "$(dirname "$dst")"
  cp "$agent_src" "$dst"
  AGENT_UPDATED=$((AGENT_UPDATED + 1))
done
shopt -u nullglob
echo "  ✅ 更新了 $AGENT_UPDATED 个 Agent"

# ── merge-hooks ────────────────────────────────────────────────
HOOK_COUNT=0

if [ -n "$PROJECT_DIR" ] && [ -f "$TARGET_DIR/scripts/merge-hooks.sh" ]; then
  echo ""
  echo "🪝 同步 Hooks 到 settings.json..."
  HOOK_COUNT=$(bash "$TARGET_DIR/scripts/merge-hooks.sh" "$TARGET_DIR" "$PROJECT_DIR" | tail -1)
fi

# ── 验证 ──────────────────────────────────────────────────────
echo ""
echo "🔍 快速验证关键文件..."

VERIFY_OK=0
VERIFY_FAIL=0
for file in "${VERIFY_FILES[@]}"; do
  if [ -f "$TARGET_DIR/$file" ]; then
    VERIFY_OK=$((VERIFY_OK + 1))
  else
    echo "  ❌ 缺失: $file"
    VERIFY_FAIL=$((VERIFY_FAIL + 1))
  fi
done

if [ "$VERIFY_FAIL" -eq 0 ]; then
  echo "  ✅ 全部 $VERIFY_OK 个关键文件验证通过"
else
  echo "  ⚠️  $VERIFY_FAIL 个文件缺失，$VERIFY_OK 个正常"
fi

# ── 深度验证（动态解析 hooks.json）─────────────────────────────
if [ -f "$TARGET_DIR/scripts/update/verify-airein.sh" ]; then
  if ! bash "$TARGET_DIR/scripts/update/verify-airein.sh" "$TARGET_DIR"; then
    echo ""
    echo "⚠️  深度验证发现问题，请检查上方错误信息"
    # Don't fail the entire sync — just warn
  fi
fi

# ── 输出统计（供 airein update / 人工解析）────────────────────
echo ""
echo "STATS:updated=$UPDATED missing=$MISSING created=$CREATED skills=$SKILL_UPDATED hooks=$HOOK_COUNT verify_ok=$VERIFY_OK verify_fail=$VERIFY_FAIL"
