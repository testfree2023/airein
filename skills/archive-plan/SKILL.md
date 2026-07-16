---
name: archive-plan
description: Archive a completed plan's documents into project-level docs, or standardize existing project docs to the 4-core format. Integrates plan outputs (requirements, design, etc.) into the project's permanent knowledge base at docs/. Use when a plan's tasks are all done and documents are approved, or when standardizing project docs. May be invoked automatically after the archive-trigger hook detects completion, or manually via /archive-plan or /archive-plan --standard.
---

# Archive Plan

Archive a completed plan by integrating its documents into the project's permanent documentation. This is the knowledge-consolidation step that keeps project docs current after each plan.

## Two Modes

### Plan Archive Mode (default)
**Invocation**: `/archive-plan {planId}` or automatically via `archive-trigger` hook

归档已完成计划的文档到项目级文档。适用于计划完成后整合需求、设计、测试、部署文档。

### Project Standardization Mode (--standard)
**Invocation**: `/archive-plan --standard`

标准化项目现有文档到 4 核心格式（requirements、design、test-plan、deployment）。
- 扫描 `docs/` 下的所有文档
- 识别非标准命名的文档并分类
- 生成合并后的标准文档预览
- 确认后替换为标准文档

> **Either way, user confirmation is mandatory before execution.**

## Prerequisites (MUST validate before proceeding)

Read `docs/plans/{planId}/progress.md` and verify ALL of:

1. **Status is not already archived**: `status` field must NOT be `archived`
2. **All tasks completed**: `completed` === `total` and `pending` === `0` and `in_progress` === `0`
3. **All pipeline docs approved**: Every doc in the `## Approval State` section must be `approved`

If ANY prerequisite fails:
- Report the specific failure reason to the user
- **Do NOT proceed** with archiving

## Archive Process

### Step 1: Read plan documents

Read all documents in the plan directory `docs/plans/{planId}/`:
- `progress.md` — task stats, approval state
- `requirements.md` — if exists
- `design.md` + `design-*.md` sub-documents — if exists
- `test-plan.md` — strategy doc if exists (l-*)
- `tests.md` — **plan test ledger** (tdd skill); see archive rules below
- `deployment.md` — if exists
- `tasks.md` — if exists
- Any other `.md` files in the plan directory

**`tests.md` archive rules（防负债）：**
- **Do NOT** dump the whole ledger into `docs/test-plan.md`
- Leave `tests.md` in the plan directory as historical working record
- From the ledger, only merge rows that are still **product-invariant Critical** into the sparse Critical Acceptance Index in project `docs/test-plan.md` (path + one-line behavior + command)
- Merge strategy deltas from plan `test-plan.md` (if any) into project `docs/test-plan.md` Strategy sections only

### Step 2: Read existing project docs

Read all existing documents in `docs/` (excluding `docs/plans/`):
- **需求文档**: `docs/requirements.md`（唯一标准命名；prd.md、product.md 等应合并到此）
- **设计文档**: `docs/design.md`（主文档；复杂项目可有 design-architecture.md、design-conventions.md、design-database.md、design-security.md、design-*-domain-model.md 等子文档）
- **规范文档**: `docs/conventions-{scope}.md`（多 scope，如 conventions-javascript.md、conventions-bash.md；或 legacy conventions.md）
- **测试文档**: `docs/test-plan.md`（唯一标准命名）
- **部署文档**: `docs/deployment.md`（唯一标准命名）
- Any other project-level docs

**标准命名规则（P029）**：
- 需求文档统一为 `requirements.md`（prd.md、product.md 等合并到 requirements.md）
- 设计文档主文档为 `design.md`，子文档为 `design-*.md`
- 测试文档统一为 `test-plan.md`
- 部署文档统一为 `deployment.md`

If `docs/` doesn't exist or is empty, this is a first-time archive — all plan docs will create new project docs.

### Step 3: Analyze impact and propose archive plan

Compare plan documents with existing project docs. Determine which project docs are affected by this plan's work. Output an archive proposal:

```
## 归档方案

**计划**: P001-{slug}
**归档范围**: {N} 个项目文档受影响

| 项目文档 | 操作 | 变更摘要 |
|---------|------|---------|
| docs/architecture.md | 更新 | 加入 Auth 模块架构描述 |
| docs/database.md | 更新 | 加入 users/sessions 表结构 |
| docs/conventions.md | 不变 | 本次计划未涉及规范变更 |
| docs/deployment.md | 新建 | 首次归档部署方案 |

**不受影响的文档**: docs/security.md（认证相关变更已在 architecture.md 中覆盖）

是否执行此归档方案？
```

**Rules for analysis**:
- If a project doc doesn't exist and the plan has relevant content → propose creating it
- If a project doc exists and the plan modifies/extends its scope → propose updating it
- If the plan doesn't affect a project doc → mark as "不变" (unchanged), do NOT rewrite it
- Be conservative: only update docs that are genuinely affected by the plan's scope

### Step 4: Wait for user confirmation

Present the archive proposal. Do NOT execute until the user confirms.

The user may:
- Approve the full proposal → proceed
- Adjust the scope (exclude some docs) → update proposal and proceed
- Cancel → abort, do not archive

### Step 5: Execute archive

For each affected project doc:

1. Read the existing content (if any)
2. Read the relevant plan document content
3. **Integrate**: Merge new information into the existing document
   - Preserve existing content that is still valid
   - Add new sections/content from the plan
   - Update sections that the plan has changed
   - Remove content that is now outdated (rare — be conservative)
4. Write the updated content to `docs/{filename}.md`

**Integration rules**:
- Project docs should be comprehensive living documents, not just copies of plan docs
- Each project doc should be self-contained (readable without the plan)
- Keep the doc's existing structure when possible, integrate new content into appropriate sections
- For compound documents: if the plan has `design.md` + `design-architecture.md` + `design-database.md`, consider archiving as separate `docs/architecture.md` and `docs/database.md`

**Conventions archiving (P018 multi-scope + thin-shell)**:

When the plan's `design-conventions.md` is being archived, conventions live as
**multi-scope** files plus a **thin-shell** rule that injects them via CC's
native conditional-rule mechanism (replacing the deleted `conventions-trigger`
hook). For each language scope the plan covers:

1. **Determine scope**: use the plan's primary backend language token, matching
   the `design-conventions` template filename (`javascript`/`bash`/`python`/
   `typescript`/`go`/`rust`/`kotlin`/`java`). This token becomes both the
   `docs/conventions-{scope}.md` filename and the thin-shell filename.

2. **Archive content to `docs/conventions-{scope}.md`** — NOT the legacy single
   `docs/conventions.md`. Integrate the plan's `design-conventions.md` into the
   scope-specific file (merge if it exists, create if not). `docs/` is the
   single source of truth for convention content.

3. **Generate/update the thin-shell `.airein/rules/conventions-{scope}.md`** —
   (CC projects: readable via `.claude/rules` shim if `--cc-shim` was run)
   this is the pointer CC auto-injects when editing matching source files:
   - Read skeleton `~/.airein/templates/rules/conventions-scope.md`
   - Replace `{scope}` → language token
   - Replace `{paths-globs}` → source file globs for that scope (see table)
   - Write to `.airein/rules/conventions-{scope}.md`. The frontmatter `---` MUST
     be the first line (CC's conditional-rule loader anchors on `^---`).
   - Validate: `node ~/.airein/scripts/lib/conventions-shell.js .airein/rules/conventions-{scope}.md`
     must report `"valid": true` before considering the archive done.

   **scope → paths-globs reference** (adjust to the project's actual source tree):

   | scope | paths-globs |
   |-------|-------------|
   | javascript | `scripts/**/*.js`, `hooks/**/*.js` |
   | typescript | `src/**/*.ts`, `scripts/**/*.ts` |
   | python | `**/*.py` |
   | java | `src/**/*.java` |
   | go | `**/*.go` |
   | rust | `src/**/*.rs` |
   | kotlin | `src/**/*.kt` |
   | bash | `**/*.sh` |

4. **Legacy coexistence**: if a legacy `docs/conventions.md` already exists,
   leave it in place — the resolver still recognizes it. Do not force-rewrite
   legacy single-file to multi-scope; only add new scope files going forward.

### Step 6: Update status

1. Update `docs/plans/{planId}/progress.md`:
   - Change `status: in_progress` → `status: archived`
   - Update `updated:` to current date

2. Update `docs/roadmap.md`:
   - Change the plan entry status to indicate archived

3. Optionally update `docs/roadmap.md` ## Recent Changes section with archive note

## 规则

- **每个计划都应该归档** — 归档是计划完成后的标准收尾动作
- **AI 判断影响范围，用户审核后执行** — 不可跳过用户审核步骤
- **保守原则** — 不受影响的文档不碰，不确定是否受影响的文档不碰
- **整合而非覆盖** — 项目文档是积累的，每次归档是增量更新
- **进度文件是验证依据** — 必须通过 progress.md 验证完成状态，不可凭记忆判断

---

## Project Standardization Mode (--standard)

当调用 `/archive-plan --standard` 时，执行项目文档标准化流程。

### Step 1: 扫描现有文档

扫描 `docs/` 目录（排除 `docs/plans/`），列出所有 `.md` 文件：

```bash
ls docs/*.md
ls docs/*/*.md  # 子目录如 adr/、steering/ 等
```

### Step 2: 分类文档

按以下标准命名规则分类：

| 标准文档 | 合并来源 | 说明 |
|---------|---------|------|
| `requirements.md` | prd.md、product.md、PRD.md 等 | 所有需求类文档 |
| `design.md` | architecture.md、conventions.md、cc-context-loading-principles.md、dashboard-security.md 等 | 所有设计类文档 |
| `test-plan.md` | *-e2e-report.md、testing.md、旧测试策略文档等 | 策略/报告类；**不含**计划台账 `docs/plans/*/tests.md`（台账不搬家） |
| `deployment.md` | deploy.md、operations.md、运维.md 等 | 所有部署类文档 |

**不处理的文档**（保持原样）：
- `roadmap.md` — 项目状态文档
- `adr/` — 架构决策记录
- `steering/` — 指导文档
- `temp.md` — 临时文件（可建议删除）

### Step 3: 生成合并预览

对每个核心文档，生成合并后的预览版本：

```
## 标准化预览

### docs/requirements.md
**合并来源**: PRD.md + product.md
**预览内容**: [显示前 50 行]

### docs/design.md
**合并来源**: architecture.md + conventions-javascript.md + conventions-bash.md + cc-context-loading-principles.md + dashboard-security.md
**预览内容**: [显示前 50 行]

### docs/test-plan.md
**合并来源**: dashboard-e2e-report.md + dashboard-e2e-report-2.0.md
**预览内容**: [显示前 50 行]

### docs/deployment.md
**新建文档**，无来源
**预览内容**: [显示前 50 行]

---

**建议删除的文档**:
- PRD.md（已合并到 requirements.md）
- product.md（已合并到 requirements.md）
- architecture.md（已合并到 design.md）
- ...（其他已合并文档）

**保持不变的文档**:
- roadmap.md
- adr/
- steering/

是否执行此标准化方案？
```

### Step 4: 等待用户确认

用户可以选择：
- **全部执行** → 创建/替换所有 4 个核心文档，删除已合并的旧文档
- **部分执行** → 选择特定文档执行
- **取消** → 不做任何更改

### Step 5: 执行标准化

对用户确认的文档执行：

1. 读取所有来源文档的内容
2. 按标准模板结构合并内容
3. 写入新的标准文档 `docs/{requirements|design|test-plan|deployment}.md`
4. 删除已合并的旧文档（仅用户确认的情况下）

### Step 6: 验证结果

验证：
- 4 个核心文档已创建/更新
- 旧文档已删除（如果用户确认）
- 访问 Dashboard 验证"归档文档"分类显示 4 个核心文档

---

## 标准命名规则（P029）

归档文档标准命名：

| 文档类型 | 标准命名 | 说明 |
|---------|---------|------|
| 需求文档 | `requirements.md` | 唯一，prd.md、product.md 等合并到此 |
| 设计文档 | `design.md` | 主文档；子文档为 `design-*.md`（architecture、conventions、database、security、domain-model 等） |
| 测试文档 | `test-plan.md` | 唯一 |
| 部署文档 | `deployment.md` | 唯一 |

**其他文档处理**：
- roadmap.md — 保持不变（系统文档）
- adr/ — 保持不变（系统文档）
- conventions-*.md — 合并到 design.md 或保留为 design-conventions.md
- 其他非标准文档 — 合并到对应核心文档
