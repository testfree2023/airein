---
name: init-project
description: Initialize project into Airein system. Auto-detects empty vs existing projects. Empty projects get scaffolding only; existing projects get full code analysis and project document generation.
disable-model-invocation: false
---

# Initialize Project

Initialize a project into the Airein system. Automatically detects whether the project is empty or has existing code, and adjusts the setup depth accordingly.

**Before starting, tell the user:**
```
即将为项目创建以下标准文件：
  1. docs/roadmap.md — 项目状态总览（含 Issues、Recent Changes）
  2. docs/adr/ — 架构决策记录（仅在需要时创建）
  3. .airein/memory/memory.md — 已确认的规则和偏好
  4. .airein/memory/session-state.md — 会话状态
  5. .airein/config/quality.json — 质量门禁配置

注意事项：
  - 已存在的文件不会被覆盖，只会补充缺失的内容
  - docs/roadmap.md 包含了 Issues（原 issues.md）和 Recent Changes（**过程日志**；原过程向 changelog 已并入此处）
  - **用户向**发布说明在项目根 `CHANGELOG.md`（白名单标准名）；空项目**不强制**创建，有 plan 归档或标 `completed` 时由 archive-plan / tdd 写入
  - 不再创建 docs/knowledge/ 目录和 CONTEXT.md（内容已由 rules/ 和 plan 文档覆盖）

输入项目名称继续，或取消。
```

## Pre-check: Already initialized?

Before doing anything, check if the project was already initialized:

1. `.airein/memory/session-state.md` — search for `onboarded` keyword
2. `docs/roadmap.md` — exists and has `## Issues` section
3. `.airein/config/quality.json` — exists

**If already onboarded:**
- Warn: `⚠️ 此项目已于 [日期] 完成 init。重新执行会追加内容到已有文件，不会覆盖。`
- Ask: `是否仍要继续？输入"继续"确认，或取消。`
- Only proceed after explicit user confirmation

## Phase 0: Ensure directories exist

```bash
mkdir -p docs/plans docs/adr .airein/config .airein/memory .airein/rules
```

Verify: `ls -d docs/plans docs/adr .airein/config .airein/memory .airein/rules`

**Register with Dashboard** (writes project path to `~/.airein/dashboard/projects.json` — panel auto-discovers, no scanDirs config):

```bash
node ~/.airein/scripts/lib/dashboard-projects.js register "$(pwd)"
```

Verify: `node ~/.airein/scripts/lib/dashboard-projects.js list`

**Agent Teams v0 · 入口声明（P008）** — 向 `CLAUDE.md` 与 `AGENTS.md` 追加 `## Agent Teams v0`（幂等；读 `quality.json` → `pipelineRoles.enabled`，**默认 `true`**；为 `false` 则跳过写入）：

```bash
node ~/.airein/scripts/lib/pipeline-roles-banner.js apply "$(pwd)"
```

Verify: `rg -n "## Agent Teams v0" CLAUDE.md AGENTS.md`

**宿主判断（必做，再决定是否创建 `.claude/`）**：

| 当前宿主 | 动作 |
|----------|------|
| **Claude Code** 打开本项目 | 运行 `bash ~/.airein/scripts/airein-chores.sh --cc-shim` → 创建 `.claude/rules` shim → 本项目 `.airein/rules` |
| **Cursor / Codex / 其他** | **禁止**创建 `<项目>/.claude/`。铁律与全局 rules 已在用户级 `~/.cursor/rules/` 等（`airein setup` deploy）。本项目只维护 `.airein/rules/`（有代码后再生成 conventions 薄壳）。 |

> **两层 rules 别混**：铁律 L0 在用户级（CC=`~/.claude/rules/`，CUR=`~/.cursor/rules/*.mdc`）；项目 `.airein/rules/` 是 L1 薄壳 canonical，仅 CC 需要额外 `.claude/rules` shim 让 CC 原生读到它。

If any directory already has content, don't delete or empty — only fill gaps.

## Auto-detect: Empty vs Existing project

After Phase 0, check the project:

**Empty project detection** — if ALL of these are true:
- No source files (no .js/.ts/.py/.java/.go files in root or src/)
- No config files (no package.json/pom.xml/Cargo.toml/go.mod/pyproject.toml)
- No git history (`git log` fails or returns nothing)
- No existing docs/ content

→ Skip to **[Minimal Setup](#minimal-setup-empty-project)**

**Existing project** — any of the above conditions is false:
→ Continue to **[Full Setup](#full-setup-existing-project)**

---

## Minimal Setup (Empty Project)

For brand new projects with no code — only create essential scaffolding:

1. **Create `docs/roadmap.md`** (from template below)
2. **Create `docs/adr/README.md`** (if not already present)
3. **Create `.airein/memory/memory.md`** (empty template, if not present)
4. **Create `.airein/memory/session-state.md`** (initial state, if not present)
5. **Report**: List created files. Tell user: "项目骨架已就绪。当项目有代码后，重新运行 `/init-project` 获取完整分析。"

**Done. Do NOT create project documents (requirements/design/deployment) — empty projects have nothing to analyze. Do NOT generate conventions thin-shells either — there is no source code to infer conventions from, and a shell would point at a non-existent `docs/conventions-{lang}.md`. Re-run `/init-project` after the project has code.**

---

## Full Setup (Existing Project)

For projects with existing code — full analysis and document generation.

### Phase 1: Information Collection (3 parallel subagents)

**Agent 1: Codebase structure analysis**
```
分析当前项目的代码库结构，返回：
1. 技术栈（语言、框架、构建工具、测试框架）
2. 模块划分（顶层目录及其职责）
3. 核心入口文件
4. 配置文件清单
5. 依赖关系概览
6. 数据库/存储层类型
7. API 层技术
```

**Agent 2: Existing docs and specs**
```
扫描项目中所有文档和规范：
1. docs/ 目录下所有 .md 文件
2. README.md
3. 隐藏目录配置（.airein/, .github/, .husky/, lint configs, CI/CD, Docker）
返回每个文件的路径和内容摘要
```

**Agent 3: Git history and activity**
```
分析 git 历史：
1. 最近 20 条 commit
2. 活跃分支
3. 项目规模（文件数、代码行数）
4. 修改最频繁的 10 个文件
5. 贡献者数量
```

### Phase 1.5: Session Context Extraction

Review the current session's conversation history and extract:

| Category | What to extract | Target |
|----------|----------------|--------|
| Business context | Project background, user roles, use cases | `docs/roadmap.md` → 项目概况 section |
| Design decisions | Architecture choices, tech selection reasons | `docs/adr/` (create ADR file if irreversible) |
| Code understanding | Module relationships, data flow | `docs/roadmap.md` → 项目概况 section |
| User preferences | Coding style, tool, workflow preferences | `.airein/memory/memory.md` |
| Unfinished tasks | Mentioned but undone items | `docs/roadmap.md` → 活跃工作 section |

If session just started, skip this step and note in Phase 6 report.

### Phase 2: Generate Project Documents

Read structural templates from `~/.airein/templates/docs/` as reference, then generate based on code analysis:

| File | Content source | Skip when |
|------|---------------|-----------|
| `requirements.md` | Infer from code modules, routes, API endpoints | No functional modules |
| `design.md` | Infer from directory structure, module dependencies | No module structure |
| `deployment.md` | Infer from Dockerfile, CI config, package.json scripts | No deployment configs |

**Rules:**
- Only generate docs with analysis evidence — skip if nothing to infer
- Existing docs: **append, don't overwrite**; mark with `[onboard-generated {date}]`
- Each doc ends with `## Status: draft`
- Skip docs where `docs/` already has a substantial version (>20 lines of real content)

### Phase 2.5: Generate Conventions (multi-scope + thin-shell)

For existing projects with source code, generate per-language conventions rules
using the **P018 thin-shell pattern** — CC native conditional rules (the thin
shell auto-injects conventions when editing matching source files, replacing the
deleted `conventions-trigger` hook).

1. **Detect languages** from Phase 1 codebase analysis. Map to scope tokens
   matching the `design-conventions` template filenames: JS → `javascript`,
   TS → `typescript`, Python → `python`, Java → `java`, Go → `go`,
   Rust → `rust`, Kotlin → `kotlin`, Bash-heavy → `bash`. Only generate scopes
   for languages with real source files.

2. **For each detected language `{lang}`**, generate BOTH:

   a. **`docs/conventions-{lang}.md`** — the convention content (single source
      of truth). Generate from `~/.airein/templates/docs/design-conventions/{lang}.md`,
      filling template sections with conventions inferred from the codebase
      (naming, style, error handling, testing, etc.). Append `## Status: draft`.
      If `docs/conventions-{lang}.md` already exists, append — don't overwrite.

   b. **`.airein/rules/conventions-{lang}.md`** — the thin-shell pointer:
      - Read skeleton `~/.airein/templates/rules/conventions-scope.md`
      - Replace `{scope}` → `{lang}`
      - Replace `{paths-globs}` → source file globs for that language
      - Write `.airein/rules/conventions-{lang}.md`. The frontmatter `---` MUST
        be the first line (CC's conditional-rule loader anchors on `^---`).
      - Validate: `node ~/.airein/scripts/lib/conventions-shell.js .airein/rules/conventions-{lang}.md`
        must report `"valid": true`.

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

**Skip when**: no detected language has source files. **Minimal Setup does NOT
generate conventions** — empty projects have nothing to infer from, and a shell
pointing at a non-existent `docs/conventions-{lang}.md` would be dead weight.

### Phase 3: Generate Project State

1. **`docs/roadmap.md`** — create from `templates/docs/roadmap.md`, populate 项目概况 from code analysis, infer 活跃工作 from recent git history
2. **Generate Recent Changes** from recent commits (append to `## Recent Changes` section in roadmap.md)
3. Migrate `.airein/plans/` content to `docs/plans/` if applicable

### Phase 4: Generate Config

1. **`.airein/config/quality.json`** — auto-detect test framework:
   - pytest → Python config
   - JUnit/Maven → Java config
   - Jest/Vitest → JS/TS config
   - None → set `"blocking": {"testFailure": false}`

2. **`.airein/memory/session-state.md`** — must include onboard marker:

```markdown
# Session State: {Project Name}

## Onboard Status
- **Status**: ✅ Onboarded
- **Date**: {today}
- **Tech Stack**: {detected}

## Last Files Edited
- (initial onboard)
```

### Phase 5: Self-learning

1. **`.airein/memory/memory.md`** — if empty, generate from CLAUDE.md/rules/quality.json/eslint; include a `## Project Info` section with tech stack and key configs

### Phase 6: Verification

Report:
- All generated files (full paths)
- Which existing docs were referenced (not copied)
- **Phase 2 results**: which docs generated, which skipped and why
- **Session context**: what categories extracted, what skipped
- Detected tech stack and test framework
- Verify all files exist and are non-empty: `ls` each file

---

## File Templates

### `docs/roadmap.md`

Read the authoritative skeleton from `templates/docs/roadmap.md` (install path: `~/.airein/templates/docs/roadmap.md` or repo `templates/docs/roadmap.md`).

Copy it to `docs/roadmap.md`, then substitute:
- `{Project Name}` → project name
- `{YYYY-MM-DD}` → today
- Fill **项目概况** from analysis; leave **活跃工作** empty or with inferred one-line bullets (never tables)
- Add the Init Recent Changes entry if not already present

Do **not** embed a divergent English "Active Plans" copy — the template is the single source of shape.

### `.airein/memory/memory.md`

```markdown
# Memory (confirmed rules and preferences)

> Auto-loaded every session. Confirmed rules and preferences accumulate here.
```

### `.airein/memory/session-state.md`

```markdown
# Session State: {Project Name}

## Current Task
- **Status**: Initialized
- **Last Active**: {Today}
- **Branch**: main

## Last Files Edited
- (none)

## Recent User Messages
- /init-project
```

### `docs/adr/README.md`

```markdown
# Architecture Decision Records

> ADR 记录重要设计决策。仅当满足以下**三个条件**时才创建：
> 1. 难以逆转 2. 缺少上下文会令人困惑 3. 真正权衡的结果
> 三条件缺一 → 不需要 ADR。

## 索引

| ADR | Title | Date | Status |
|-----|-------|------|--------|
```

## Rules

- Don't overwrite existing files — check first, skip if already present
- Ask user for project name
- After creation, output a summary of what was created
