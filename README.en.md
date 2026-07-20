# Airein

> Make Claude Code work like a colleague who's been on the team for six months: it knows the project conventions, doesn't touch files it shouldn't, runs tests automatically after changes, and remembers where you left off across sessions.

English | [简体中文](README.md)

---

## The Problem It Solves

The industry loves to hype AI coding, often jokingly calling it "**disposable code**" — let AI quickly spin up a POC, a demo, an experiment, and throw it away once the demo is done. In hackathons, prototype validation, and one-off scripts, that's genuinely useful.

But **mid-to-large companies have stable business systems, long-term maintenance burdens, and compliance & audit requirements** — they can't accept disposable code, nor do they need to spend money reinventing the wheel repeatedly. At the current stage, the mature value of using AI coding in serious development isn't "replace engineers with generation" — it's: **multiply efficiency while keeping engineering quality under control.**

The hard part is exactly here: AI coding assistants naturally tend to skip tests, ignore conventions, fabricate APIs from memory, and forget key constraints once the context grows. Let them run free, and the efficiency gain is real — but so is the loss of quality control.

Airein's thesis is direct: **abstract the enterprise development process into a spec-driven flow that AI can follow, capturing AI's efficiency gains while defending quality red lines.** The approach isn't to write more prompts begging the model to behave, but to hand the non-negotiable constraints to code-enforced hooks, hand project memory to on-demand loading mechanisms, and let every new session get up to speed as fast as a colleague taking over a shift.

The core idea in one line: **Prompt is advice, Hook is law.** Rules written in CLAUDE.md are "advice" — the model reads them, mostly follows them, but can be overwhelmed by context, bypassed, or forgotten; a hook's `exit 2` is "law" — guaranteed by code, blocking on violation, not relying on the model's self-discipline. What can be hook-enforced shouldn't rely on prompt alone.

### Positioning (important)

Airein is **not** a full-stack manager of your AI coding tool. It is a **skills / plugin layer** inside the host (Claude Code / Cursor / ...). We own **project docs + progress** (init-project / 
ew-plan / approval + hooks / Dashboard) — not a kitchen-sink of generic Agents/commands. Leave those to your own stack or install [ECC](https://github.com/affaan-m/everything-claude-code) separately.

---

## Three Core Capabilities

### Pillar 1: `new-plan` — turn development into spec-driven AI collaboration

This is Airein's most central capability, and the fundamental difference from "letting AI write code freestyle."

`new-plan` abstracts an enterprise development flow so AI's work follows conventions instead of diving into code headfirst:

```
Communicate & clarify (grilling) → produce docs by pipeline → approve one by one → TDD implementation → archive to close the loop
```

- **Communicate & clarify**: before acting, nail down vague requirements. Ask one question at a time, challenge assumptions, force boundaries with concrete scenarios, and turn "build me an X" into a clear scope with acceptance criteria.
- **Produce docs by pipeline**: based on task type (s-feature / m-feature / l-feature / hotfix ...), follow the corresponding doc pipeline — a small bugfix only needs `tasks`, a mid-size feature needs `requirements → design → test-plan → tasks`, a large feature adds `deployment`. The docs are specs — contracts for the implementation that follows. **What those docs look like** is defined by kernel templates (see “Document templates” below).
- **Approval gates per doc**: each doc goes draft → your approval → approved, before the next one can be created. The `approval-sequence` hook enforces order; `approval-guard` protects approval state from tampering. Prevents AI from laying out all docs at once with no review.
- **TDD implementation**: once in implementation, `test-guard` hard-blocks "source code without tests" in strict mode — a failing test must exist before implementation is allowed. `pre-commit-gate` runs build + tests + coverage before commit.
- **Archive to close the loop**: when the plan is done, `/archive-plan` archives it so completed plans stop polluting the active context.

Effect: you get the "fast" of AI efficiency, but every step has a quality gate underneath — exactly the controllability that "disposable code" can't provide and serious development must have.


### Pillar 2: `init-project` + project memory — no amnesia across sessions

Another chronic pain of AI coding: **once the context is compressed past its limit, key info is lost**, and a new session makes you re-feed the background like an amnesiac.

Airein uses a set of mechanisms so a new session quickly recovers "where I left off, why this decision was made, which files I changed":

- **`/init-project`**: run once when entering a new project. Automatically detects whether it's an empty or existing project — empty projects get a minimal skeleton (roadmap + session-state + memory); existing projects get a codebase scan, existing docs, and hidden config, generating `docs/roadmap.md` (with Issues & Recent Changes), detecting the primary language into config, and registering the project path with the Dashboard (`~/.airein/dashboard/projects.json`).
- **Session state recovery**: at the end of each session, `session-end` writes current plan, active tasks, last edited files, and pending todos to `<project>/.airein/memory/session-state.md`; next time, `session-start` auto-injects it (a few hundred tokens) so AI picks up where it left off. (Legacy: `.claude/memory/`.)
- **Rescue before compression**: `pre-compact` extracts Active Task / Decisions / Files / Pending before context compression, preventing key decisions from being wiped.
- **Auto archive**: completed plans archive into `docs/plans/`, not crowding the active view; `/next` proactively tells you "the most important thing to do right now is X" based on the roadmap.
- **Self-learning promotion**: preferences you've corrected ("don't do X" / "always Y") accumulate; once the same instruction hits the threshold, it promotes to a permanent L0 rule and auto-takes effect next session — you don't repeat the correction every time.

### Pillar 3: Dashboard — a lightweight project docs & quality management panel

Docs and quality management can't rely on command-line memory alone. Airein ships a **very lightweight** browser panel so you can see and manage:

```bash
bash ~/.airein/dashboard/start.sh          # after install (lives under ~/.airein/dashboard/)
# or from source: node dashboard/server.js
```

Browser auto-opens at `http://localhost:3456`. LAN: `bash ~/.airein/dashboard/start.sh --lan`.

How light: **zero npm dependencies** (pure Node built-in `http`), **single-file SPA** (one `index.html` with inline CSS+JS, no build step), hash routing. Nothing to install — `node` runs it.

What it does:

- **Project discovery**: `/init-project` registers the path in `~/.airein/dashboard/projects.json`; the **Tools** page (`#/tools`) supports register / unregister / prune stale entries; CC registry `~/.claude/projects/` remains a fallback.
- **Plan management**: visualize plan progress, edit requirements/design/tasks, approve by pipeline, archive completed plans.
- **Template management**: sidebar **Templates** (`#/templates`) — browse and edit kernel templates online. This is the main place to keep raising AI output quality; see the next subsection.
- **Config visualization**: render the project's `quality.json` into a structured form (toggles, thresholds, dropdowns), each field annotated with its default, persisting only the fields you changed — no hand-writing JSON.
- **Tools page**: maintain the project registry without memorizing CLI commands.
- **i18n**: switch between Chinese and English.

The Dashboard isn't a separate system — it's the visualization layer over airein's existing capabilities. It reads the same roadmap, the same `.airein/config/quality.json`, the same plan directories. The config you change in the panel is the config the hooks actually read. See [dashboard/README.md](dashboard/README.md).

### Document templates — the “molds” for AI output, tunable from the panel

`/new-plan` and `/init-project` do not invent doc structure from scratch: they load structural templates from the kernel **`~/.airein/templates/`**, then fill a plan directory by complexity (s / m / l). Templates define **sections, tone, and hard “don’t write this” constraints**; the model fills in the business content. The closer templates match your engineering habits, the harder it is for AI to ship thin summaries that look like requirements but cannot be accepted.

**What the template families govern:**

| Family | Role (examples) |
|--------|------------------|
| `requirements/{s,m,l}.md` | Product Requirements Document (PRD): business flow → User Story → Use Case (UC-id), not a Problem + WHEN/THEN blurb |
| `design/{s,m,l}.md` + subdocs | Tiered technical design: enumerate the decisions that matter; avoid empty architecture prose |
| `test-plan/{m,l}.md` | Test **design spec**: Critical / VS / invariants — not a paste of step-by-step test cases |
| `tasks.md` | Implement / Verify / Deploy / Accept; requires Source traceability and machine-readable `Depends on` (Dashboard Progress depends on this contract) |
| `deployment.md` / `roadmap.md` / `tests.md` … | Release/ops, project status index, TDD ledger, and related companions |

In short: a traceable chain **UC → design → test design → schedulable tasks**. When a full `l-feature` pipeline is dogfooded end-to-end, you can feel the jump from freestyle docs to UC-bound tasks and Critical/VS-bound verification — that is the templates working, not just a stronger model.

**How to keep upgrading templates that fit *you*:**

1. Start the Dashboard → sidebar **Templates** (`http://localhost:3456/#/templates`).
2. Open a plan/project doc template by category, edit inline, save — writes back to **`~/.airein/templates/`** (the same tree `/new-plan` reads).
3. Or edit `~/.airein/templates/docs/*.md` on disk; the next new plan picks it up.
4. **Iterate from pain**: when AI output is soft (missing UCs, unparseable tasks, empty test-plan) → tighten the matching template (required sections / negative constraints / example rows) → validate on a small plan — instead of only scolding the model in chat.

**On upgrade:**

- `airein update` **overwrites** stock structural templates under the sync allowlist (`templates/docs/**`, etc.) so you receive upstream improvements.
- `templates/pipelines.json` is **merged**: your custom pipeline definitions are kept.
- If you deeply customize a template locally, back it up or diff before upgrading; lasting changes are better contributed upstream (or kept as a team patch process) so the next update does not silently wipe them.

Templates are one of the highest-leverage assets to accumulate over time: **hooks enforce the red lines; templates define the writing shape** — together they turn “faster” into “controllably faster.”

Chinese readers: a shorter companion note lives in [docs/templates-and-dashboard.md](docs/templates-and-dashboard.md).

---

## 5-Minute Quickstart

### Three-layer directory model (P004)

| Layer | Path | Role |
|-------|------|------|
| **Kernel** | `~/.airein/` | Canonical skills / rules / hooks / scripts; `install-profile.json` records installed hosts |
| **Host registration** | `~/.claude/` (CC) / `~/.cursor/` (Cursor) … | Per-host native config; CC uses symlinks + merge-hooks pointing at the kernel |
| **Project data** | `<project>/.airein/` | `config/quality.json`, `memory/`, `logs/`, self-learning buffer, etc. |

CC projects also get an **L1 shim**: `<project>/.claude/rules` → symlink to `<project>/.airein/rules`. See [deployment.md](docs/deployment.md).

### New machine: unified install (recommended)

Prerequisites: git, Node.js ≥ 18, bash ≥ 4 (Git Bash on Windows).

```bash
git clone git@github.com:testfree2023/airein.git /tmp/airein && \
bash /tmp/airein/airein setup --yes; rm -rf /tmp/airein
```

`airein setup` detects local hosts. First release fully supports **Claude Code + Cursor**; Codex / CodeBuddy / OpenCode are detected with a hint only.

**Quickstart forks** (non-interactive: add `--hosts`):

| Scenario | Command |
|----------|---------|
| CC only | `airein setup --hosts claude-code --yes` |
| Cursor only | `airein setup --hosts cursor --yes` |
| CC + Cursor same machine | `airein setup --hosts claude-code,cursor --yes` |

Verify: `bash ~/.airein/scripts/update/verify-airein.sh --host cursor`.

### In a project: just use it

```bash
cd /path/to/your-project
claude
```

- **New project**: the model auto-detects there's no `docs/roadmap.md` and guides you to run `/init-project`, creating only a minimal skeleton.
- **Existing project**: run `/init-project` once for the first migration to scan the codebase and generate the roadmap and project docs; after that, each session auto-resumes where you left off, and AI proactively tells you the next step.
- **Recommended first step**: tell the model the project's build/test commands (just write them into the project-level `CLAUDE.md`).

### Daily: commands you'll use

| Command | Purpose |
|---------|---------|
| `/init-project` | Project initialization (auto-distinguishes empty/existing) |
| `/new-plan` | Start a plan: clarify → docs pipeline → approval |
| `/next` | Recommend the most important next step |
| `/status` | See overall project status and progress |
| `/tdd` | Enter the RED → GREEN → REFACTOR TDD flow |
| `/code-review` `/verify` | Spec-bound review / verify shortcuts |

> This repo is **Airein's source code**, not the install target. Daily use is in your project directory, driven by the deployed kernel at `~/.airein` plus host registration layers.

---

## What You Use vs What the Model Does Automatically

Airein ships a set of skills and commands, but **most you'll never trigger manually** — the model calls them automatically during the flow. Treating them as "commands to learn" makes the barrier seem high. It isn't.

**What you'll occasionally trigger yourself**: `/init-project`, `/next`, `/status`, `/tdd`, and the workflow commands above.

**What the model does for you behind the scenes** (you only need to know what it solves):

| What it's doing | What it solves for you |
|------------------|------------------------|
| Self-learning | Your corrected preferences accumulate into permanent rules — no repeating |
| Auto archive (archive-plan) | Completed plans auto-prompt to archive, not polluting active context |
| Auto format (post-edit-format) | Auto Biome/Prettier after code edits — no manual run |
| API change monitoring (contract-sentinel) | Warns on breaking changes when you edit exported APIs |
| Progress sync (progress-sync) | tasks.md changes auto-write back to progress.md |
| Repeat-read warning (read-dedup) | Reminds you when reading the same file repeatedly in a session — saves context |
| Impact analysis (pre-edit-impact) | Tells you how many places depend on a file before you edit it |

---

## How to Write Your Own CLAUDE.md (Important)

Airein's principle is to **never touch** your `~/.claude/CLAUDE.md` (global) or project `<repo>/CLAUDE.md` (project-level) — this is your territory. But how well they're written directly determines overall quality: CLAUDE.md is fully resident in every session's precious budget; stuff it with the wrong content and even excellent Airein gets dragged down by it.

### What to put

| Layer | Good fit | Bad fit (has a better home) |
|-------|----------|-----------------------------|
| Global `~/.claude/CLAUDE.md` | Personal preferences, cross-project work habits, communication language | General engineering conventions (test-first, commit format) → Airein's `rules/` covers it |
| Project `<repo>/CLAUDE.md` | Project-specific build/test commands, business domain terms, project-only constraints | Hard constraints ("must test first") → see below, hooks are reliable |

### Key principle: don't put hard constraints only in CLAUDE.md

**Rules written in CLAUDE.md are "advice"** — the model mostly listens, but under context bloat, instruction conflict, or plain forgetting, it bypasses them. If you have a **non-negotiable** constraint (must run tests, no skipping review, no committing uncompilable code), the right move is to configure it as a hook (`exit 2` hard block) rather than just writing "always test first" in CLAUDE.md and hoping the model complies.

- Project hard constraints → write into `.claude/config/quality.json`, enforced by hooks (see next section).
- Project tech-stack conventions (naming, directory, style, error handling) → put in `docs/conventions-{scope}.md`, **injected on demand** when editing matching files, not resident.
- Personal persistent preferences → write into global CLAUDE.md, or just let self-learning accumulate them into promotion.

### Anti-patterns

- ❌ Pasting an entire company coding standard into CLAUDE.md → resident context explosion, and duplication with `rules/`, `conventions-{scope}.md`.
- ❌ Writing "always test first" in CLAUDE.md expecting enforcement → actually bypassable; should configure `testGuard.mode: "strict"`.
- ❌ Stuffing one-off task background into CLAUDE.md → loads every session even after the task is done; should go in a plan doc.

### Why split it this way

CLAUDE.md is fully resident and tokens are precious; hard constraints aren't reliable via prompt but are law via hook; tech conventions are cheaper on-demand than resident. Put these three things in the right places, and Airein's five-layer loading mechanism works as designed (mechanism in the appendix).

---

## Configure Quality Gates (On Demand)

With zero config files created, it **works out of the box** — all gates have sensible defaults. When you need to tune, create `.claude/config/quality.json` in the project root (legacy path `.claude/quality.json` still works), or edit visually in the Dashboard panel. All fields optional; unspecified ones use defaults.

```json
{
  "testGuard":     { "enabled": true, "mode": "strict" },
  "approvalGuard": { "mode": "console-confirm" },
  "planGate":      { "mode": "advisory" },
  "testCoverage":  { "minRatio": 0.3, "minSourceFiles": 2, "functionThreshold": 3 },
  "blocking":      { "testFailure": true, "lowCoverage": true, "buildFailure": true, "untestedSource": true }
}
```

**Core gates:**

| Gate | Field | Default | Behavior |
|------|-------|---------|----------|
| **testGuard** (TDD enforcement) | `enabled` | `true` | `false` fully disables |
| | `mode` | `"strict"` | `strict` blocks untested source \| `advisory` only warns |
| **approvalGuard** (approval protection) | `mode` | `"console-confirm"` | `advisory` only warns \| `console-confirm` block + confirm to bypass \| `manual-only` strict block |
| **planGate** (plan gate) | `mode` | `"advisory"` | `strict` requires plan \| `advisory` suggest, can continue \| `disabled` off |
| **testCoverage** | `minRatio` / `minSourceFiles` / `functionThreshold` | 0.3 / 2 / 3 | Test coverage trigger thresholds |
| **blocking** | `testFailure` / `lowCoverage` / `buildFailure` / `untestedSource` | all `true` | Whether each failure type hard-blocks |
| **flowControl** | `perTaskReview` / `worktreeIsolation` | false / false | Auto review per task / worktree isolation for refactors |
| **aireinLog** | `level` / `retentionDays` | `"info"` / 7 | Log level and retention days |
| **selfLearning** | `enabled` / `promotionThreshold` | true / 3 | Self-learning toggle and promotion threshold |

---

## Upgrade / Offline Migration / Rollback

User-facing release notes: [CHANGELOG.md](CHANGELOG.md).

**Upgrade** (one command on any installed machine):

```bash
airein update
```

Update policy:
- **Kernel refreshes**: hooks, scripts, rules, skills, templates under `~/.airein`
- **Profile-driven host refresh**: CC / Cursor layers per `install-profile.json`
- **Merge not overwrite**: `templates/pipelines.json` keeps custom pipelines
- **Never overwrites**: user `settings.json`, project `quality.json` / `session-state.md`, host CLAUDE.md territory

Onboarded projects don't need to re-run `/init-project`.

**Offline** (P002 `--source`):

```bash
airein setup --source <dir|tar.gz|zip> [--sha256 <hex>] [--hosts cc,cursor] --yes
airein update --source <dir|tar.gz|zip>
```

**Rollback** (stable tag on remote main before P004 merge — see deployment):

```bash
git checkout pre-p004-2026-07-11
airein update --source <archive from that tag>
```

**Uninstall**: `airein uninstall` (`--keep-kernel` retains `~/.airein`).

---

## Multi-Host Support (first release: CC + Cursor)

One airein **kernel** (`~/.airein`) dispatches to each host's native directory via `airein setup` or `install-host.js`:

| Host | setup support | Output | Blocking |
|------|---------------|--------|----------|
| **Claude Code** | ✅ full | `~/.claude/` registration → kernel | native `exit 2` |
| **Cursor** | ✅ full | `<project>/.cursor/` | stdout `{permission:"deny"}` |
| **Codex** | detect hint | `.agents/skills/` + `AGENTS.md` | `{permissionDecision:"deny"}` |
| **CodeBuddy** | detect hint | `.codebuddy/` + `CODEBUDDY.md` | native `exit 2` |
| **OpenCode** | detect hint | `AGENTS.md` + `opencode.json` | `throw Error(stderr)` |

```bash
airein setup --hosts claude-code,cursor --yes
node ~/.airein/scripts/install-host.js install --host cursor
```

**Guarantees**: non-CC hosts never touch `~/.claude/` (`test-cc-no-impact`); single source of truth in the kernel.

See **[Multi-Host Install Guide](docs/install-hosts.md)** and [deployment.md](docs/deployment.md).

---

## Appendix A: How It Works

> For those who want to read deep. Daily use doesn't require understanding this.

### Core thesis: Prompt is advice, Hook is law

- **Prompt (CLAUDE.md / rules / SKILL.md) = advice**: the model reads, understands, mostly follows — but can be bypassed, overwhelmed by context, or forgotten.
- **Hook (`exit 2` block) = law**: PreToolUse / PostToolUse hooks are code guarantees; they block on violation, not relying on the model's self-discipline.
- Design corollary: what can be hook-enforced shouldn't rely on prompt alone; hook is the floor, prompt is the ceiling.

### On-demand context loading (by "when it loads", not "5 layers")

Most rules ride Claude Code's native loading channel; only "session state recovery" still uses a self-built hook. By load timing it's clearer:

| When | What loads | Mechanism | Enforcement |
|------|------------|-----------|-------------|
| Session start (resident) | `rules/{00,10,20}-*.md` (iron rules/arch/workflow) | CC native loads `rules/*.md` | ✅ mechanism-enforced |
| Session start (resident) | CC memory (project prefs, session state) | CC native auto-load | ✅ mechanism-enforced |
| Session start (injected) | session-state (branch/plan/last_files) | `session-start.js` hook | ✅ hook-enforced |
| On editing matching files | `docs/conventions-{scope}.md` | CC native conditional rule (`paths` + `@include` shell) | ✅ mechanism-enforced |
| On `/skill` call | `skills/*/SKILL.md` | CC native skill mechanism | ✅ mechanism-enforced |
| On demand (subagent reads) | `docs/plans/*`, `docs/adr/*` | CLAUDE.md instructs subagent to read | ⚠️ pure prompt convention |
| Before context compression | Active Task / Decisions / Files / Pending | `pre-compact.js` hook | ✅ hook-enforced |

> **Legend**: ✅ = mechanism/hook actually running (law); ⚠️ = pure prompt convention (advice, model can ignore).
> The only line still using a self-built hook is "session state recovery"; L0 rules and L1 conventions now ride CC native channels — the only difference is whether they have `paths` (resident vs edit-path-triggered).

### Hook full table (source of truth: `hooks/hooks.json`)

Covers **6 events** (PreToolUse / PostToolUse / SessionStart / PreCompact / Stop / UserPromptSubmit), **20 registered entries** total. Counts below follow `hooks/hooks.json` — refresh here after adding hooks.

**Blocking (`exit 2` hard block, iron-rule level):**

| Timing | hook | Behavior |
|--------|------|----------|
| Before code edit | test-guard | Require a test to exist before creating source files (strict mode exit 2) |
| Before code edit | plan-gate | Block source edits without an approved plan |
| Before code edit | approval-sequence | Enforce R→D→T doc creation order |
| Before code edit | approval-guard | Protect progress.md approval state from tampering |
| Before commit | pre-commit-gate | Run build + test on git commit, block on failure |

**Advisory / automatic (async, warn or auto-fix):**

| Timing | hook | Behavior |
|--------|------|----------|
| After edit | quality-sentinel | Check debug statements, secrets, TODO, coverage |
| After edit | quality-gate | Run full quality checks after edit |
| After edit | contract-sentinel | Monitor exported API changes, warn on breaking changes |
| After edit | post-edit-format | Auto Biome/Prettier formatting |
| After edit | post-edit-typecheck | TypeScript check after editing .ts |
| After edit | progress-sync | Auto-update progress.md on tasks.md changes |
| After edit | structure-sync | Update structure.md token estimate on source changes |
| After edit | archive-trigger | Prompt archive when plan completes (once per plan per session) |
| Before edit | pre-edit-impact | Analyze how many files depend on this one |
| After read | read-dedup | Warn on repeated reads of the same file in a session |
| Before edit | doc-file-warning | Warn on non-standard doc file locations (visible to model) |

**Lifecycle:**

| Timing | hook | Behavior |
|--------|------|----------|
| Session start | session-start | Inject branch/plan/last_files (a few hundred tokens) |
| Before compression | pre-compact | Extract key info to prevent loss |
| On claiming done | stop-test-gate (chained) | Run tests + coverage + regression + session-state persistence |
| Each user input | self-learning-prompt | Inject self-learning hint (model piggyback-identifies persistent instructions) |

### Self-learning system (three-tier flow, never touches memory)

```
User persistent allow/deny instruction → buffer(.airein/self-learning/pending.md)
  → Stop hook archives → archive(~/.claude/projects/{key}/self-learning-archive.md)
  → same instruction count ≥ promotionThreshold (default 3) → promote to rules/30-self-learned.md (L0 auto-load)
```

The three self-learning tiers flow **only** in their own files and **never touch** CC native memory (`~/.claude/projects/*/memory/` stays pure). See [design.md](docs/design.md#自学习系统架构).

---

## Appendix B: File Map

### Key files under `~/.airein/` (kernel)

| File | In git | Notes |
|------|--------|-------|
| `hooks/hooks.json` | ✅ | Hook registry (source of truth) |
| `rules/00-iron-rules.md` | ✅ | Iron rules |
| `scripts/hooks/*.js` | ✅ | Hook scripts |
| `skills/*/SKILL.md` | ✅ | Airein skills |
| `install-profile.json` | ❌ | Installed hosts (local) |

CC registration `~/.claude/` symlinks back to the kernel; user `CLAUDE.md` / `settings.json` stay user territory.

### Project-level files (canonical: `.airein/`)

| File | In project git | Notes |
|------|----------------|-------|
| `.airein/memory/session-state.md` | recommended ✅ | Session state; session-start injects |
| `.airein/config/quality.json` | recommended ✅ | Project quality gates (read/write priority) |
| `.airein/self-learning/pending.md` | ❌ | Self-learning buffer |
| `.airein/logs/` | ❌ | Hook diagnostic logs |
| `.claude/rules/` (CC projects) | recommended ✅ | **shim** → `.airein/rules/` |
| `docs/roadmap.md` | ✅ | Project overview |
| `docs/plans/P{NNN}-*/` | ✅ | Plan directories |
| `docs/conventions-{scope}.md` | ✅ | Convention leaf docs |

> Legacy projects may still use `<project>/.claude/config|memory|…`; hooks read with fallback, new writes go to `.airein/`.

---

## FAQ

**Q: I already have cursor rules / spec tools / my own well-written CLAUDE.md. Why do I need Airein?**
A: Most of those are "prompt-level" constraints — written in rule files, relying on model self-discipline, bypassable under context bloat or instruction conflict. Airein's differentiator is **making non-negotiable constraints into hooks (`exit 2` code enforcement)**, plus cross-session project memory and a spec-driven planning flow. You can run it alongside existing rules: hard constraints to Airein's hooks, soft preferences in your CLAUDE.md.

**Q: The quality gates are too strict — can I downgrade?**
A: Yes, flexibly configure in `.airein/config/quality.json` (or legacy `.claude/config/quality.json`): disable TDD (`testGuard.enabled: false`), TDD warn-only (`mode: "advisory"`), downgrade blocking (`blocking.testFailure: false`), turn off plan gate (`planGate.mode: "disabled"`). Or drag toggles directly in the Dashboard panel.

**Q: Will self-learning memory be lost when I change machines?**
A: The self-learning archive is at `~/.claude/projects/{key}/self-learning-archive.md`, project-isolated, not in git. Manually copy that directory on migration.

**Q: My project has no test framework — will stop-test-gate error?**
A: No. The hook detects project type (package.json / pom.xml / Cargo.toml, etc.) and skips if no matching test framework is found.

**Q: Can I use only some skills / hooks?**
A: Yes. Delete unwanted skill directories and remove unwanted hooks from `hooks.json`. But `init-project` is recommended to keep — it's the foundation of project state management.

**Q: What is `${CLAUDE_PLUGIN_ROOT}` in `hooks.json`?**
A: Points to the airein **kernel root** (`~/.airein`). CC merge-hooks replaces hook command placeholders with the kernel absolute path.

**Q: How do I verify self-learning is working?**
A: Check whether `.airein/self-learning/pending.md` captured anything this round; after Stop, check whether the archive appended logs; once the same instruction hits the threshold, check whether `rules/30-self-learned.md` was generated — once promoted to L0, it auto-loads next session.

**Q: How are doc templates different from CLAUDE.md? Can I customize them?**
A: CLAUDE.md is the **always-on** operating handbook (keep it short). Doc templates are the **structural molds** `/new-plan` uses when generating plan docs (can be longer; tiered s/m/l). Yes — edit online via Dashboard sidebar **Templates** (`#/templates`), or edit `~/.airein/templates/` on disk. Note: `airein update` overwrites stock structural templates on the sync allowlist; `pipelines.json` is merged so custom pipelines survive. See “Document templates” above.

---

## Credits

Three relationship kinds — so we neither claim "all original" nor "inspiration only":

| Kind | Meaning |
|------|---------|
| **Uses** | Adapted text or protocol assets still ship in this repo |
| **Formerly used** | Was adapted into the repo; now removed or internalized; still credited |
| **References** | Design ideas / methodology / protocol contracts — not wholesale copies |

| Project | Kind | Notes | Link |
|---------|------|-------|------|
| **Everything Claude Code (ECC)** | **Formerly used** + references | **Formerly used**: early adapted agents/commands (including `tdd-guide`, `/plan`, `/quality-gate`, language reviewers) removed or internalized; `tdd-workflow` / `verification-loop` became `skills/tdd` and `rules/20-workflow.md`. Current surface is a single role agent `tech-lead` (modes: design / review / security) plus commands `tdd` / `code-review` / `verify` — **airein-owned**, consolidated from earlier ECC capability slices. **References**: architecture and hook event model. Planning stays on `/new-plan`; users may install full ECC separately. | [github.com/affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) |
| **Superpowers** | **Formerly used** | Early adaptation of `writing-plans`; planning is now airein's `new-plan`. That skill is retired (`clean-airein.sh` removes leftovers). | [github.com/obra/superpowers](https://github.com/obra/superpowers) |
| **Claude Code (Anthropic)** | **References** | Hook protocol stdin/stdout JSON, native conditional rules (paths + @include), Session/Compact/Stop events | [claude.ai/code](https://claude.ai/code) |
| **TDD (Test-Driven Development)** | **References** | RED → GREEN → REFACTOR, test-first discipline | [Agile Manifesto](https://agilemanifesto.org) |
| **DDD (Domain-Driven Design)** | **References** | Domain model template, aggregate/entity/value-object patterns | [domainlanguage.com/ddd](https://domainlanguage.com/ddd/) |
| **OpenSpec** | **References** | Structured grilling Q&A / requirements clarification | [openspec.dev](https://openspec.dev) |
| **SpotBugs** | **References** | Java static analysis (design-conventions/java.md) | [github.com/spotbugs/spotbugs](https://github.com/spotbugs/spotbugs) |
| **detekt** | **References** | Kotlin static analysis (design-conventions/kotlin.md) | [detekt.dev](https://detekt.dev) |

**Special note**: An early version referenced a community skill's self-learning mechanism (heartbeat/reflections/corrections), later refactored into buffer/archive/promotion with external dependencies removed.

**Boundary**: hooks / scripts / airein-owned skill core (`new-plan`, `tdd`, `init-project`, `archive-plan`, self-learning, etc.) and the Dashboard are airein-authored or internalized. Whitelist agent/command bodies are now airein-owned; ECC is credited as **Formerly used** / references only — do **not** describe historical adaptations as current ECC verbatim text. Users may install full ECC separately; later upgrades aim to shrink to the docs/progress core under the skills/plugin positioning, and reduce clashes with a user-installed ECC.
