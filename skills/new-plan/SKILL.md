---
name: new-plan
description: Create a new plan directory (P{NNN}-{slug}/) through an interactive, approval-gated document pipeline. Use when starting a new feature, bugfix effort, or architectural change — any work that needs structured tracking across multiple sessions.
disable-model-invocation: false
---

# Create New Plan

**CRITICAL: This skill is the planning workflow. Do NOT call Claude Code `EnterPlanMode` or `ExitPlanMode`. Do NOT use built-in plan mode. Create files directly under `docs/plans/P{NNN}-{slug}/` following this document pipeline.**

Create a new plan directory and register it in the roadmap. The process is interactive: first complete a unified communication/brainstorming phase, then create each configured document one at a time with approval between documents.

## Global template root (P004 — kernel only)

Airein **global** templates live in the install **kernel**, not under `~/.claude/`:

| Asset | Path |
|-------|------|
| Pipeline definitions | `~/.airein/templates/pipelines.json` |
| Doc structure templates | `~/.airein/templates/docs/{doc-type}.md` |
| Design sub-doc templates | `~/.airein/templates/docs/design-*/` |
| Language profiles | `~/.airein/templates/language-profiles/{lang}.json` |
| Default quality.json | `~/.airein/templates/quality.json` |

**Do not** read `~/.claude/templates/` — that path is legacy / absent after P004 unified install. Hooks and lib code resolve templates from the kernel (`~/.airein/`).

Project config: `.airein/config/quality.json` (legacy fallback: `.claude/config/quality.json`).

## Phase 0: Context Gathering (l-feature / l-bugfix only)

For complex features, gather project intelligence before the communication phase:

1. **Read steering docs**: `docs/steering/product.md`, `docs/steering/tech.md`, `docs/steering/structure.md`
2. **Read lessons learned**: `docs/plans/*/progress.md` (Blockers section), `docs/roadmap.md` (## Issues section)
3. **Scan codebase**: Identify reusable modules and existing patterns

→ Output: Context Brief (embedded into the first document that needs it, usually `requirements.md`)

## Phase 1: Communication / Grilling / Brainstorming

Before creating any requirements/design/tasks document, align with the user through structured Q&A. This phase is the same role as `/openspec-explore`: clarify intent, challenge assumptions, and turn vague requests into concrete scope.

**Rules:**
- Ask **one question at a time**, wait for the user's answer before continuing
- If a question can be answered by exploring the codebase → explore instead of asking
- When a term conflicts with steering docs → call it out immediately
- When the user uses vague terms → propose a precise term
- When the user states how something works → check whether code agrees; surface contradictions
- Use concrete scenarios to stress-test: invent edge cases that force precise boundaries
- Only skip discussion if the user explicitly says to skip discussion / 跳过讨论

**Questions to resolve:**
1. What is the desired outcome? (Goal)
2. What triggers this? (Trigger — new feature, bug, requirement change?)
3. Priority? (P1=critical, P2=high, P3=medium, P4=low)
4. What tests will verify success? (Success Criteria)
5. Any related plans or issues? (Related)
6. What is the scope boundary? (What is NOT in scope)

**Progress state:**
- When creating `progress.md`, set `grilling: in_progress`
- After discussion is complete, update `progress.md` to `grilling: completed`
- Continue to create the first pipeline document after grilling completes (no mandatory pause between grilling and document creation)

**Complexity determination:**
- Read `quality.json` → `planWorkflow.pipeline` to get the pipeline name
- Read `~/.airein/templates/pipelines.json` → `definitions.{pipeline}` to get the doc list
- If `pipeline` is `"auto"` or missing, determine from project size and scenario
- The `complexity` field in `progress.md` should be the pipeline name (e.g. `m-feature`), not `simple/medium/complex`
- The `## Approval State` section must have one entry per pipeline doc
- Default pipelines (auto mode only, resolves to `m-feature`):
  - **s-feature**: `requirements`, `tasks` — 小型项目新功能
  - **s-bugfix**: `tasks` — 小型项目缺陷修复
  - **m-feature**: `requirements`, `design`, `tasks` — 中型项目新功能（默认）
  - **m-bugfix**: `requirements`, `tasks` — 中型项目缺陷修复
  - **m-urgent**: `tasks` — 中型项目紧急需求
  - **l-feature**: `requirements`, `design`, `test-plan`, `deployment`, `tasks` — 大型项目新功能
  - **l-bugfix**: `requirements`, `design`, `test-plan`, `tasks` — 大型项目缺陷修复
  - **hotfix**: `tasks` — 紧急修复（不限规模）

**⚠️ IMPORTANT**: Before writing `progress.md`, you MUST read both `quality.json` and `~/.airein/templates/pipelines.json` to determine the correct pipeline and approval keys. Never hardcode approval states.

## Phase 2: Create Plan Directory + progress.md

1. Determine the next plan ID from existing directories in `docs/plans/`
2. Create directory: `docs/plans/P{NNN}-{slug}/`
3. Create `progress.md` only at first, with `grilling: in_progress`
4. Append the plan entry to `docs/roadmap.md` active section
5. Add an entry to `docs/roadmap.md` ## Recent Changes section
6. Complete Phase 1 communication; then set `grilling: completed`

## Phase 3: Configured Document Pipeline

Read `quality.json` → `planWorkflow.pipelines.{complexity}` and create documents in that exact order.

**Mandatory document approval sequence (file-based, NOT Claude Code Plan Mode):**
1. Create only the next document in the pipeline
2. Mark its approval state as `draft` in `progress.md`
3. Present it to the user for approval
4. Wait for approval-guard / user approval
5. After approval, update that document's approval state to `approved`
6. Only then create the next document

Examples:
- `medium`: create `requirements.md` → approval → create `tasks.md`
- `complex`: create `requirements.md` → approval → create `design.md` → approval → create `tasks.md`
- custom: if `planWorkflow.pipelines.complex = ["requirements", "tasks", "test-plan"]`, follow that order

## Design Documents: Establishing vs Referencing

When the pipeline includes a `design` document, determine whether this plan
**establishes** or **references** the project's design docs. Run the resolver:

```bash
node ~/.airein/scripts/lib/design-doc-resolver.js
```

It checks two locations for existing project-level design docs and prints JSON:
- **Archived** (project-level, stable): `docs/conventions.md`, `docs/architecture.md`
- **In-flight plans**: `docs/plans/{plan}/design-conventions.md`, `design-architecture.md`

Output: `{ establishing: bool, conventions: {exists, path, source}, architecture: {exists, path, source}, deployment: {exists, path, source} }`.

### establishing: true (no project-level design docs anywhere)

This is the **first design-bearing plan** for the project. Generate BOTH:
- `design-architecture.md` — from `~/.airein/templates/docs/design-architecture/{lang}.md`
- `design-conventions.md` — from `~/.airein/templates/docs/design-conventions/{lang}.md`
- `design.md` — HLD that indexes them via a `## Sub-documents` section

**Regardless of complexity tier** (s/m/l) and **regardless of frontend-or-backend**.
Even a pure-frontend project has architecture — use the nearest language template
(JS frontend → `typescript.md` fallback), or write free-form if no template matches.

> **Conventions lifecycle (P018)**: `design-conventions.md` lives in the plan
> directory during development. At archive time, the `archive-plan` skill
> migrates it to `docs/conventions-{lang}.md` (single source of truth) and
> generates the thin-shell `.claude/rules/conventions-{lang}.md` — a CC native
> conditional rule that auto-injects conventions when editing matching source
> files (replaces the deleted `conventions-trigger` hook). `{lang}` is the
> `design-conventions` template's language token (`javascript`/`typescript`/
> `python`/`go`/`rust`/`java`/`kotlin`/`bash`).

### establishing: false (project-level design docs already exist)

This is a **subsequent plan**. Generate a unified `design.md` ONLY, with a section
that LINKS to the existing conventions/architecture (use the resolver's reported
paths). Do NOT regenerate `design-conventions.md` / `design-architecture.md`.

### Exception: architecture upgrade

If the user declares an architecture upgrade (e.g. "重构架构", "迁移到 X"), this
plan may UPDATE the existing `design-architecture.md` / `design-conventions.md`.
Prompt the user to confirm the overwrite before regenerating.

> Module sub-documents (`design-domain-model.md`, `design-database.md`,
> `design-security.md`, `design-deployment.md`) remain l-feature-driven — see
> Compound Documents below.

## Deployment Step (l-feature only)

When the pipeline includes `deployment` (l-feature only), run the resolver to get
`deployment.exists` and follow one of three paths:

### establishing: deployment.exists === false

This is the **first deployment-bearing plan** for the project. Generate `deployment.md`
from `~/.airein/templates/docs/deployment.md`. At archive time, `archive-plan` migrates it to
`docs/deployment.md` (single source of truth).

### referencing: deployment.exists === true (no deployment change signal)

A deployment doc already exists (archived `docs/deployment.md` or in-flight plan).
Do NOT regenerate `deployment.md`. Instead, LINK to the existing deployment doc in the
plan's `design.md` (use resolver's `deployment.path` for the link).

### Exception: deployment upgrade

If the user declares a deployment change (e.g. "迁移到 k8s", "换 CI-CD", "新增环境",
"改部署目标", "改运行时"), this plan may UPDATE the existing `docs/deployment.md`.
Prompt the user to confirm the overwrite before regenerating. Zero silent false positives.

## Tasks Step (test-plan driven verification)

### Structure: Global Constraints + per-task Interfaces

Every generated `tasks.md` follows `~/.airein/templates/docs/tasks.md`. MUST include two structures that cut rework (structured plans finish in 1 round vs 2-4 rounds with bugs):

- **Global Constraints block** (before the task list) — version floors, dependency limits, naming, exact values (e.g. "Node ≥ 18", "zero npm deps", "kebab-case filenames", "stderr logging"). Bind ALL tasks; copied verbatim so each implementer shares them without re-deriving.
- **per-task Interfaces** (under each task) — `consume` (contracts / preceding-task outputs this task depends on) / `produce` (contract / output it hands downstream). Lets an implementer reading only their own task know neighbor contracts.

When the pipeline includes `test-plan` (l-feature/l-bugfix) and the plan directory
contains `test-plan.md`, read it to generate verification tasks in `tasks.md`.

### Reading test-plan.md

Check for `test-plan.md` in the plan directory. If it exists, parse:
- **Test Cases → Critical Path**: Each test case becomes a verification task
- **Exit Criteria**: Each criterion becomes a validation task (coverage, defect limits)

### Generating verification tasks

For each Critical Path test case, generate a task:

- **Task ID**: Continue the numbering after implementation tasks (e.g., if implementation
  tasks are 1.1-1.5, verification tasks start at 2.1)
- **Title**: `验收测试：{test case name}`
- **Depends on**: The corresponding implementation task (ensure testing after implementation)
- **Acceptance**: Run the test case steps and verify expected results

For each Exit Criterion, generate a task:

- **Title**: `验证：{criterion name}` (e.g., `验证：覆盖率达标`, `验证：无 P0/P1 缺陷遗留`)
- **Acceptance**: Check the criterion (run coverage report, defect scan)

### Fallback

If `test-plan.md` does not exist or cannot be parsed, generate `tasks.md` without
verification tasks — backward compatible, plan creation continues normally.

## File Templates

Read structural templates from `~/.airein/templates/docs/{doc-type}.md` for guidance on document structure. Fill each document with plan-specific content based on the communication phase output.

**Top-level templates** (for `design.md`, `requirements.md`, `tasks.md`, etc.): `requirements.md`, `design.md`, `test-plan.md`, `deployment.md`, `tasks.md`, `progress.md`.

**Design sub-document templates** (used when splitting `design.md` for l-feature / l-bugfix):

| Sub-document | Template path | Selection |
|--------------|---------------|-----------|
| `design-domain-model.md` | `~/.airein/templates/docs/design-domain-model.md` | language-independent (DDD) |
| `design-database.md` | `~/.airein/templates/docs/design-database.md` | language-independent |
| `design-security.md` | `~/.airein/templates/docs/design-security.md` | language-independent |
| `design-deployment.md` | `~/.airein/templates/docs/design-deployment.md` | language-independent |
| `design-architecture.md` | `~/.airein/templates/docs/design-architecture/{lang}.md` | per backend primary language |
| `design-conventions.md` | `~/.airein/templates/docs/design-conventions/{lang}.md` | per backend primary language |

**Per-language template selection** (architecture & conventions):
1. Read `quality.json` → `language.primary` (or detect from project files)
2. Read `~/.airein/templates/language-profiles/{primary}.json` → check `role` field
3. If `role` is `backend` or `fullstack` → use `~/.airein/templates/docs/design-architecture/{primary}.md` and `~/.airein/templates/docs/design-conventions/{primary}.md`
4. If `role` is frontend-only or no matching language template exists → fall back to nearest match (e.g. JS frontend project → `typescript.md`); if none exists, write free-form
5. Available languages: `javascript`, `typescript`, `python`, `java`, `go`, `rust`, `kotlin`

Each template contains section headings with HTML comment guidance — replace the comments with actual content. For `progress.md`, use the template structure but fill with machine-readable values (plan ID, pipeline name, approval states).

## Roadmap Entry Format

Append to the `## 活跃工作` section of `docs/roadmap.md`:

```markdown
- **[P{NNN}]** {Title} — `status` | Priority: P{N} | {complexity}
```

## Compound Documents

For l-feature and l-bugfix pipelines, the `design` step can be split into multiple sub-documents by module boundary. This is AI-guided, not user-managed.

**Naming convention**: `{doc}-{subname}.md` is a sub-document of `{doc}.md`.

**Typical design sub-documents for large projects**:
- `design.md` → HLD（架构总览、模块关系、数据流、子文档索引）
- `design-architecture.md` → 架构设计（模块关系、数据流）
- `design-domain-model.md` → DDD 领域模型（聚合根、实体、值对象、领域事件、核心业务规则、状态流转）
- `design-conventions.md` → 工程规范与结构（目录规范、命名、代码风格、错误处理）
- `design-database.md` → 数据库设计（表结构、索引、迁移策略）
- `design-security.md` → 安全设计（认证、授权、加密、审计）
- `design-deployment.md` → 部署方案（环境、CI/CD、回滚）

**Rules**:
- `design.md` must include a `## Sub-documents` section linking to all `design-*.md` files
- Sub-documents share the same approval as the parent: one `design: approved` covers all `design-*.md`
- `design-architecture.md` + `design-conventions.md` generation is driven by **establishing vs referencing** (see section above) — NOT by complexity tier. An establishing plan generates both regardless of s/m/l.
- Module sub-documents (`design-domain-model.md`, `design-database.md`, `design-security.md`, `design-deployment.md`) are still **l-feature / l-bugfix only** — large-project module decomposition.
- For s/m **referencing** plans: single unified `design.md` linking to existing conventions/architecture, no splitting
- Same pattern applies to `requirements` if needed: `requirements.md` + `requirements-{topic}.md`
- **Templates**:
  - `design-domain-model.md` — required template at `~/.airein/templates/docs/design-domain-model.md`
  - `design-database.md` / `design-security.md` / `design-deployment.md` — required templates at `~/.airein/templates/docs/{name}.md` (language-independent)
  - `design-architecture.md` / `design-conventions.md` — language-specific templates at `~/.airein/templates/docs/design-architecture/{lang}.md` and `~/.airein/templates/docs/design-conventions/{lang}.md`. Select by primary backend language (see "Per-language template selection" above).
  - You MUST read the corresponding template before writing each sub-document and follow its structure.

## Rules

- **Never call `EnterPlanMode` or `ExitPlanMode` inside this skill.** Approval means updating `progress.md` approval states and waiting for user confirmation, not Claude Code plan-mode approval.
- Plan IDs are sequential: P001, P002, P003...
- Slug is lowercase-hyphenated from the title
- If the plan was triggered by a bug, add `Triggered-by: I{NNN}` in Related
- Each task should be a thin vertical slice (tracer bullet) through all layers
- `progress.md` is machine-readable — hooks parse it, not the other files
- `approval-sequence.js` enforces grilling completion and configured pipeline order
- `approval-guard.js` enforces user approval; do not self-approve

## 终止状态

Pipeline 全部文档审批通过后，唯一允许的下一步：

- **直接进入 `tdd-workflow` skill** 开始 TDD 实现
- **如果计划被否决** → 终止，不进入任何 skill

禁止：跳过计划阶段直接编码。禁止：创建计划后不做任何后续动作。
