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
| Design tier templates | `~/.airein/templates/docs/design/{s\|m\|l}.md` |
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
  - **m-feature**: `requirements`, `design`, `test-plan`, `tasks` — 中型项目新功能（默认）
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
- `design.md` — from `resolveDesignTemplate` tier template; indexes them via a `## Sub-documents` section

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

This is a **subsequent plan**. Generate a unified `design.md` ONLY (from the matching
tier template), with a section that LINKS to the existing conventions/architecture
(use the resolver's reported paths). Do NOT regenerate `design-conventions.md` / `design-architecture.md`.

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

## Tasks Step（全生命周期 · 可执行可验收）

`tasks.md` 不是「开发任务清单」，而是本计划在**软件开发生命周期**上的工作分解：**Implement / Verify / Deploy / Accept** 凡计划涉及的，都必须拆成**可执行、可验收**的任务（有命令或逐步操作 + 可观察断言）。

Every generated `tasks.md` follows `~/.airein/templates/docs/tasks.md`.

### Mandatory structures

1. **Global Constraints** — version floors, dependency limits, naming, exact values. Bind ALL tasks.
2. **Traceability Index** — UC / Critical / VS / INV → task IDs（上游规格总表；供 Coverage Gate）.
3. **Entry Coverage** — PRD Story→UC + 入口；每行 ≥1 Must Implement. **禁止**入口降为 Should；**禁止**「前端收口」.
4. **Lifecycle Phases** — Implement / Verify / Deploy / Accept; Kind: `implement` | `verify` | `deploy` | `accept`.
5. **per-task Interfaces** — `consume` / `produce`.
6. **Implement fields** — `UC-id`, **Design refs**（API / 表|模型 / INV- / DD）, Persona, UI Entry, dual Acceptance.
7. **Verify fields** — **Source**（Critical- | VS-{UC}-{维} | Exit- | INV- | PRD-UC-）必填；**禁止无源**；Ledger 对齐 `tests.md`.
8. **Coverage Gate** — every UC + Critical（及关键 VS）mapped；自检清单保留在 tasks.md.

### Slicing rules（vertical only for product capabilities）

- Prefer **角色能力垂直片**（例：销售代报修 = 菜单权限 + FAB 入口 + 表单页 + API + 来源枚举），not 全后端做完再「前端收口」。
- Horizontal layering (DDL → 全 API → 最后 UI) is allowed only for pure infra with **no** persona UI; product 入口任务仍须 early Must.
- Each task Acceptance must be **可执行**（命令或逐步操作）and **可验收**（可观察结果）. Role-entry tasks MUST assert「用该 Persona 登录后入口可见/可点」.

### Test Plan = 测试策略（Critical + VS）

When the pipeline includes `test-plan`, resolve the tier template before writing `test-plan.md`:

```js
const { resolveTestPlanTemplate } = require('…/scripts/lib/test-plan-template.js');
resolveTestPlanTemplate('m-feature');
// → { applicable: true, tier: 'm', relativePath: 'templates/docs/test-plan/m.md', fallback: false }
```

| Pipeline | Template |
|----------|----------|
| `m-feature`（及含 test-plan 的 m-*） | `templates/docs/test-plan/m.md` — Critical + **关键 UC** 轻量 VS |
| `l-feature` / `l-bugfix` | `templates/docs/test-plan/l.md` — 全量 VS + Invariants + Data Strategy |
| `s-*` / `m-bugfix`（pipeline 无 test-plan） | 不适用；Verify 从 PRD UC 生成 |

**精炼 ≠ 稀疏**：m 不必七维全表，但资金/一致性 UC 仍须可证伪断言。

### Verify tasks（from test-plan or PRD AC）

When `test-plan.md` exists (m-feature / l-* pipelines), parse in this order (m: Critical + key-UC VS; l: full VS + invariants):

1. **Critical Acceptance Index**（产品级门禁索引，一行一路径）— **一行一个 Persona**；勿合并「销售/门店」。UI 行：步骤从**入口**起（打开页 → 见控件 → 动作）。每行 → `Kind: verify` 任务 `验收测试：{id} · {persona} · {behavior}`。
2. **Verification Specs by UC（VS-{UC-id}）** — test-plan **本体**（场景穷举 + 不变量断言 + 数据矩阵）。资金/一致性 UC 的主成功/扩展/异常/边界/并发/幂等/降级各维，凡有可跑命令或夹具的，拆成或挂靠 Verify 任务；禁止只生成 Critical 主路径而丢掉 VS 穷举。
3. **Invariant Verification Specs** + **Exit Criteria** → `Kind: verify` / `accept`（覆盖率、不变量、缺陷门禁等）。Exit 须绑「可执行命令 + pass 输出」。

**精炼 ≠ 稀疏**：禁止把 TC 逐步操作抄进 Markdown（真相在测试代码）；但场景维度/断言规格/数据矩阵必须穷尽——只填 Critical Index 不填 VS = 验收规格不完整。

If `test-plan.md` is absent or only has Critical Index without VS: **still** generate Verify tasks from PRD **Use Case** 主成功/扩展（及 Traceability 表）— do **not** ship Implement-only `tasks.md`. Cite **UC-id** in task titles/Acceptance.

### Deploy tasks（from deployment.md / runbook）

When `deployment.md` exists (or design links a project `docs/deployment.md`), generate **Kind: deploy** Must tasks: migrations, rollouts, config flags, smoke after deploy, rollback path. Acceptance = executable runbook step + observable env result.

If the pipeline has no deployment doc and the change is docs/skill-only with nothing to ship, write `Deploy: n/a — {reason}` once under Lifecycle Phases — do not invent fake deploys.

### Accept tasks

PRD §交付物（菜单角色初始化、培训要点、验收报告）→ `Kind: accept` tasks when they are product obligations, not optional notes.

### Anti-patterns（P099-class failures）

| 反模式 | 正确做法 |
|--------|----------|
| 多角色入口合并成「E 前端收口」 | Entry Coverage 每角色一行 + 垂直片 |
| 销售/门店 UI 标 Should，仅 E.1 挡归档 | 入口行一律 Must |
| Critical Path「三角色发起」一行 | 客服 / 销售 / 门店 分三条 verify |
| 只有 API/UT，无 Persona 登录断言 | Acceptance 含入口可见 |
| tasks 只有实现、测试/部署写在别处口头说 | Verify / Deploy 必须落在 tasks.md |
| Verify 无 Source / 只拆 Critical 丢 VS | Source 必填；VS 可跑维须有 Verify |
| Implement 不回指 Design 契约 | 填写 Design refs（API / INV / DD） |

## File Templates

Read structural templates from `~/.airein/templates/docs/{doc-type}.md` for guidance on document structure. Fill each document with plan-specific content based on the communication phase output.

### Requirements = 产品需求说明书（PRD）

When the pipeline includes `requirements`, the plan file is still named `requirements.md`, but content MUST be a **产品需求说明书（PRD）**, not a thin summary of Problem + WHEN/THEN.

**Before writing `requirements.md`**, resolve the tier template via the kernel lib (after sync: `~/.airein/scripts/lib/requirements-template.js`; in-repo: `scripts/lib/requirements-template.js`):

```js
const { resolveRequirementsTemplate } = require('…/scripts/lib/requirements-template.js');
resolveRequirementsTemplate('m-feature');
// → { applicable: true, tier: 'm', relativePath: 'templates/docs/requirements/m.md', fallback: false }
```

Then read `~/.airein/{relativePath}` (or the in-repo `templates/docs/requirements/{s|m|l}.md`) and fill the plan file.

| Pipeline prefix | Template |
|-----------------|----------|
| `s-*` (and docs include requirements) | `templates/docs/requirements/s.md` |
| `m-*` | `templates/docs/requirements/m.md` |
| `l-*` | `templates/docs/requirements/l.md` |
| Custom name with requirements step | **m.md** (`fallback: true`) |
| Docs omit requirements (e.g. `s-bugfix`, `hotfix`) | skip — do not create requirements |

**PRD structure (all tiers that include requirements)** — follow `templates/docs/requirements/{s|m|l}.md`:

1. **Business Process Overview**（端到端业务流程总览，mermaid 活动图；**l** 可加时序图）— **before** User Stories.
2. **User Story** = 价值**源头**（As a / I want / so that）.
3. Under each Story: one or more **Use Cases**（参与者、前置、**主成功场景**、**扩展/异常**）— UC is the落地 of the Story, not the reverse.
4. Optional mermaid **活动图/时序图** under the specific Use Case.
5. Traceability: Story → **UC-id** → tasks / test-plan / 验收.

**Negative constraints:** **禁止** only Problem + User Story + WHEN/THEN with no process overview and no Use Cases. **禁止** treating Use Case as the source that is later sliced into Stories. **禁止** Story-only PRD. For **m/l** also require roles + NFR as in the tier template; for **l** also Success Metrics and richer multi-UC coverage. Downstream tasks/verify/accept **must cite UC-id** (and 业务流程 where relevant).

**Compat:** `~/.airein/templates/docs/requirements.md` is a **stub only** — not the authoritative structure.

### Design = 工程设计说明书（概要 + 按规模详细）

When the pipeline includes `design`, the plan file is still named `design.md`, but content MUST follow the **s/m/l design tier template**, not the thin legacy Approach/Components checklist.

**Before writing `design.md`**, resolve the tier template:

```js
const { resolveDesignTemplate } = require('…/scripts/lib/design-template.js');
resolveDesignTemplate('l-feature');
// → { applicable: true, tier: 'l', relativePath: 'templates/docs/design/l.md', fallback: false }
```

Then read `~/.airein/{relativePath}` (or in-repo `templates/docs/design/{s|m|l}.md`) and fill the plan file.

| Pipeline prefix | Template |
|-----------------|----------|
| `s-*` (and docs include design) | `templates/docs/design/s.md` |
| `m-*` | `templates/docs/design/m.md` |
| `l-*` | `templates/docs/design/l.md` |
| Custom name with design step | **m.md** (`fallback: true`) |
| Docs omit design (e.g. `s-feature` default, `hotfix`) | skip — do not create design |

**视角**：Design = **架构师/技术专家**文档（不是 PRD 摘要，也不是 class 索引）。须**自洽可读**，不强迫读者来回翻 Requirements。

**框架吸收（精炼，禁止照搬企业长文）**：成熟概要设计常见两层骨架——**平台级**（约束 → 原则 → 架构多视图 → 决策对比 → 接口/数据/NFR 下沉）与 **服务级**（系统介绍 → 架构+用例/时序 → **按角色/视角**模块设计（概述→场景→时序）→ 表职责与关系 → 接入指南）。airein 模板只吸收结构与门禁，不要求 RFQ 式百科篇幅。

**Cross-tier Must（所有含 design 的档）**:
1. **Impact & Follow-up Checks** — 一律必填（改动波及面 + 后续重点检查）。
2. **Permissions & AuthZ** — 涉及菜单/页面/按钮/管理 API 则详写权限码与角色授权；否则显式 `N/A（理由）`。
3. **Cross-module Dependencies** — 新引入其它模块依赖时须加厚：①依赖什么 ②契约 ③失败行为 ④归属 ⑤时序；无则 `N/A`。
4. **Traceability（自洽）** — 绑定 UC-id，且每行含 **名称 + 一句话意图**（S/M/L 皆然；L 须覆盖每个 UC）。禁止只有无释义的 `UC-S1-01`。
5. **架构图可读（M/L）** — 须有起点/触发、关键外部边界（银行/支付/其它系统等若存在）、**读图说明**；禁止只有内部框、无说明、用自环糊弄第三方。
6. **模型/服务在 UC 详设之前（M/L；S 用 Model & Service 节）** — 禁止跳过抽象直接写 Class implement；表须点明职责与关系（字段级可下沉）。
7. **API 方法契约** — Interface/Service 须写清 method + 关键入参/返回/错误；禁止只有接口名、把签名整份甩到子文档导致主册空洞。
8. **约束写死（M/L；S 写进 Intent）** — Design Constraints：范围/不可动、NFR、技术栈等可验证边界。
9. **未决显式（M/L；S 可选）** — Open Issues：禁止假装已设计完。

**按档要点**:
- **S**：薄概要；强 Change Surface + Model/DDL + Service/API（方法级）+ **by-UC 时序**；禁止灌水式全系统架构。
- **M**：Constraints + Target Architecture（图+读图说明）+ Model/Services（含关系）+ 方法级 Interface + 自洽 Traceability + 关键 UC 时序 + Open Issues；对外接入时写 Integration Guide。
- **L**：Constraints + **命名 Design Principles** + 子系统**划分原则**（可含配置态/运营态/运行时视角）+ 子系统设计（概述→场景→时序骨架）+ 架构图（含外部边界与读图说明）+ 按需多视图/组合场景 + Architecture Decisions（含备选对比）+ Logical Model & Services + 方法级 Interface + 按需 Integration Guide + 自洽全 UC Traceability + DD-by-UC + Consistency & Failure + Change Surface + Open Issues。正文偏目标态；代码行号证据放附录，**证据不替代设计**。禁止只有 Decisions 墙、无图无 UC 回应、无划分依据的「假子系统」、把主册写成平台百科。

**Compat:** `~/.airein/templates/docs/design.md` is a **stub only** — not the authoritative structure.

**Top-level templates** (other docs): `deployment.md`, `tasks.md`, `progress.md`. Requirements use `templates/docs/requirements/{s|m|l}.md` via `resolveRequirementsTemplate`. Design uses `templates/docs/design/{s|m|l}.md` via `resolveDesignTemplate`. Test-plan uses `templates/docs/test-plan/{m|l}.md` via `resolveTestPlanTemplate` (m-feature → m; l-* → l; s-* / m-bugfix → null). Flat `templates/docs/test-plan.md` is a compat stub only.

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
- `design.md` → 总册（按 `design/l.md`：约束/原则、划分原则、架构图+读图说明、多视图按需、模型/服务、方法级 API、接入指南按需、自洽 Traceability、DD、一致性、变更面、Open Issues、子文档索引；主册不可变纯索引）
- `design-architecture.md` → 架构设计（模块关系、数据流）
- `design-domain-model.md` → DDD 领域模型（聚合根、实体、值对象、领域事件、核心业务规则、状态流转）
- `design-conventions.md` → 工程规范与结构（目录规范、命名、代码风格、错误处理）
- `design-database.md` → 数据库设计（表结构、索引、迁移策略）
- `design-security.md` → 安全设计（认证、授权、加密、审计）
- `design-deployment.md` → 部署方案（环境、CI/CD、回滚）

**Rules**:
- Generate parent `design.md` from `resolveDesignTemplate` → `templates/docs/design/{s|m|l}.md`
- `design.md` must include a `## Sub-documents` section linking to all `design-*.md` files (when any exist; **l** template has the section)
- Sub-documents share the same approval as the parent: one `design: approved` covers all `design-*.md`
- `design-architecture.md` + `design-conventions.md` generation is driven by **establishing vs referencing** (see section above) — NOT by complexity tier. An establishing plan generates both regardless of s/m/l.
- Module sub-documents (`design-domain-model.md`, `design-database.md`, `design-security.md`, `design-deployment.md`) are still **l-feature / l-bugfix only** — large-project module decomposition.
- For s/m **referencing** plans: single unified `design.md` from the matching tier template, linking to existing conventions/architecture, no splitting unless needed
- Same pattern applies to `requirements` if needed: `requirements.md` + `requirements-{topic}.md`
- **Templates**:
  - Parent: `templates/docs/design/{s|m|l}.md` via `resolveDesignTemplate`
  - `design-domain-model.md` — required template at `~/.airein/templates/docs/design-domain-model.md`
  - `design-database.md` / `design-security.md` / `design-deployment.md` — required templates at `~/.airein/templates/docs/{name}.md` (language-independent)
  - `design-architecture.md` / `design-conventions.md` — language-specific templates at `~/.airein/templates/docs/design-architecture/{lang}.md` and `~/.airein/templates/docs/design-conventions/{lang}.md`. Select by primary backend language (see "Per-language template selection" above).
  - You MUST read the corresponding template before writing each sub-document and follow its structure.

## Rules

- **Never call `EnterPlanMode` or `ExitPlanMode` inside this skill.** Approval means updating `progress.md` approval states and waiting for user confirmation, not Claude Code plan-mode approval.
- Plan IDs are sequential: P001, P002, P003...
- Slug is lowercase-hyphenated from the title
- If the plan was triggered by a bug, add `Triggered-by: I{NNN}` in Related
- Each product capability task should be a thin **vertical** slice (tracer bullet) through entry → UI/API → data — not a late「前端收口」bucket
- `tasks.md` covers the full SDLC for the plan (Implement / Verify / Deploy / Accept as applicable); every task is executable and acceptible
- Entry Coverage rows and their verify/deploy counterparts are **Must** unless the user explicitly descope in grilling
- `progress.md` is machine-readable — hooks parse it, not the other files
- `approval-sequence.js` enforces grilling completion and configured pipeline order
- `approval-guard.js` enforces user approval; do not self-approve

## 终止状态

Pipeline 全部文档审批通过后，唯一允许的下一步：

- **直接进入 `tdd` skill** 开始规格绑定实现（并维护计划 `tests.md` 台账）
- **如果计划被否决** → 终止，不进入任何 skill

禁止：跳过计划阶段直接编码。禁止：创建计划后不做任何后续动作。
