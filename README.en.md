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

---

## Three Core Capabilities

### Pillar 1: `new-plan` — turn development into spec-driven AI collaboration

This is Airein's most central capability, and the fundamental difference from "letting AI write code freestyle."

`new-plan` abstracts an enterprise development flow so AI's work follows conventions instead of diving into code headfirst:

```
Communicate & clarify (grilling) → produce docs by pipeline → approve one by one → TDD implementation → archive to close the loop
```

- **Communicate & clarify**: before acting, nail down vague requirements. Ask one question at a time, challenge assumptions, force boundaries with concrete scenarios, and turn "build me an X" into a clear scope with acceptance criteria.
- **Produce docs by pipeline**: based on task type (s-feature / m-feature / l-feature / hotfix ...), follow the corresponding doc pipeline — a small bugfix only needs `tasks`, a mid-size feature needs `requirements → design → tasks`, a large feature adds `test-plan`, `deployment`. The docs are specs — contracts for the implementation that follows.
- **Approval gates per doc**: each doc goes draft → your approval → approved, before the next one can be created. The `approval-sequence` hook enforces order; `approval-guard` protects approval state from tampering. Prevents AI from laying out all docs at once with no review.
- **TDD implementation**: once in implementation, `test-guard` hard-blocks "source code without tests" in strict mode — a failing test must exist before implementation is allowed. `pre-commit-gate` runs build + tests + coverage before commit.
- **Archive to close the loop**: when the plan is done, `/archive-plan` archives it so completed plans stop polluting the active context.

Effect: you get the "fast" of AI efficiency, but every step has a quality gate underneath — exactly the controllability that "disposable code" can't provide and serious development must have.


### Pillar 2: `init-project` + project memory — no amnesia across sessions

Another chronic pain of AI coding: **once the context is compressed past its limit, key info is lost**, and a new session makes you re-feed the background like an amnesiac.

Airein uses a set of mechanisms so a new session quickly recovers "where I left off, why this decision was made, which files I changed":

- **`/init-project`**: run once when entering a new project. Automatically detects whether it's an empty or existing project — empty projects get a minimal skeleton (roadmap + session-state + memory); existing projects get a codebase scan, existing docs, and hidden config, generating `docs/roadmap.md` (with Issues & Recent Changes), and detecting the primary language into config.
- **Session state recovery**: at the end of each session, `session-end` writes "current plan, active tasks, last edited files, pending todos" to `.claude/session-state.md`; next time, `session-start` auto-injects it (a few hundred tokens) so AI picks up where it left off instead of asking from scratch.
- **Rescue before compression**: `pre-compact` extracts Active Task / Decisions / Files / Pending before context compression, preventing key decisions from being wiped.
- **Auto archive**: completed plans archive into `docs/plans/`, not crowding the active view; `/next` proactively tells you "the most important thing to do right now is X" based on the roadmap.
- **Self-learning promotion**: preferences you've corrected ("don't do X" / "always Y") accumulate; once the same instruction hits the threshold, it promotes to a permanent L0 rule and auto-takes effect next session — you don't repeat the correction every time.

### Pillar 3: Dashboard — a lightweight project docs & quality management panel

Docs and quality management can't rely on command-line memory alone. Airein ships a **very lightweight** browser panel so you can see and manage:

```bash
node dashboard/server.js   # works out of the box, browser auto-opens http://localhost:3456
```

How light: **zero npm dependencies** (pure Node built-in `http`), **single-file SPA** (one `index.html` with inline CSS+JS, no build step), hash routing. Nothing to install — `node` runs it.

What it does:

- **Auto project discovery**: scans `~/.claude/projects/`; any project with `docs/plans/` or quality config shows up automatically, no registration.
- **Plan management**: visualize plan progress, edit requirements/design/tasks, approve by pipeline, archive completed plans.
- **Template management**: browse and edit airein's doc templates, language profiles, pipelines online.
- **Config visualization**: render the project's `quality.json` into a structured form (toggles, thresholds, dropdowns), each field annotated with its default, persisting only the fields you changed — no hand-writing JSON.
- **i18n**: switch between Chinese and English.

The Dashboard isn't a separate system — it's the visualization layer over airein's existing capabilities. It reads the same roadmap, the same quality.json, the same plan directories. The config you change in the panel is the config the hooks actually read.

---

## 5-Minute Quickstart

### New machine: one-command install

Prerequisites: Claude Code, git, Node.js installed, SSH key configured.

```bash
# clone → merge into ~/.claude → configure → verify → clean temp files (one command)
git clone git@github.com:testfree2023/airein.git /tmp/airein && \
bash /tmp/airein/setup-airein.sh; rm -rf /tmp/airein
```

The script won't overwrite your existing `~/.claude` config (settings.json, CLAUDE.md, and other user territory stay untouched).

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
| `/next` | Recommend the most important next step |
| `/status` | See overall project status and progress |
| `/tdd` | Enter the RED → GREEN → REFACTOR TDD flow |
| `/code-review` `/quality-gate` `/refactor-clean` `/plan` `/verify` | Workflow shortcuts |

> This repo is **Airein's source code**, not the install target. You clone it to read/develop airein itself; actual usage happens in your project directory after `claude` starts, with airein deployed to `~/.claude` taking over.

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

## Upgrade / Offline Migration / Team Sharing

**Upgrade**: after Airein releases a new version, any installed machine updates with one command:

```bash
bash ~/.claude/update-airein.sh
```

Update policy (protects your config):
- **Built-in components refresh with update**: hooks, scripts, rules, skills, templates
- **Merge not overwrite**: `templates/pipelines.json` — keeps your custom pipelines, only refreshes built-in ones
- **Never overwrites**: `settings.json`, `quality.json`, `session-state.md`, `~/.claude/CLAUDE.md` (user territory untouched)

Onboarded projects don't need to re-run `/init-project`; just continue working after the update.

**Offline migration (machines without git)**:

```bash
bash airein-pack.sh /path/to/output              # pack
scp airein-*.tar.gz user@newhost:~/         # copy
bash airein-unpack.sh airein-*.tar.gz      # unpack
```

**Team sharing**: make the `~/.claude` repo a shared team git repo; each member clones it and configures their own `settings.json` (keys differ). Project-level `docs/` and `quality.json` travel with the project repo.

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
User persistent allow/deny instruction → buffer(.claude/self-learning/pending.md)
  → Stop hook archives → archive(~/.claude/projects/{key}/self-learning-archive.md)
  → same instruction count ≥ promotionThreshold (default 3) → promote to rules/30-self-learned.md (L0 auto-load)
```

The three self-learning tiers flow **only** in their own files and **never touch** CC native memory (`~/.claude/projects/*/memory/` stays pure). See [design.md](docs/design.md#自学习系统架构).

---

## Appendix B: File Map

### Key files under `~/.claude/`

| File | In git | Notes |
|------|--------|-------|
| `CLAUDE.md` | ❌ user territory | Your global rules; Airein doesn't own/overwrite |
| `hooks/hooks.json` | ✅ | Hook registry (source of truth) |
| `rules/00-iron-rules.md` | ✅ | Iron rules (non-waivable + commit invariants + input validation) |
| `rules/10-architecture.md` | ✅ | Architecture facts/invariants |
| `rules/20-workflow.md` | ✅ | Operations manual (workflow + lifecycle + flow waivers) |
| `rules/30-self-learned.md` | ❌ | Self-learning promotion output (personalized, .gitignore'd) |
| `scripts/hooks/*.js` | ✅ | Hook scripts |
| `scripts/lib/*.js` | ✅ | Shared libs (quality-config / plan-parser / utils, etc.) |
| `skills/*/SKILL.md` | ✅ | Airein skills |
| `templates/` | ✅ | Doc templates + language-profiles + pipelines.json + quality.json |
| `settings.json` | ❌ | Proxy address and keys; differ per machine |

### Project-level files

| File | In project git | Notes |
|------|----------------|-------|
| `.claude/session-state.md` | recommended ✅ | Session state; session-start auto-loads |
| `.claude/config/quality.json` | recommended ✅ | Project-level quality gate config (recommended path) |
| `.claude/contract-cache/` | ❌ | Export API cache (auto-generated) |
| `.claude/self-learning/pending.md` | ❌ | Current round's captured self-learning instructions (project buffer) |
| `docs/roadmap.md` | ✅ | Project overview (with Issues & Recent Changes) |
| `docs/plans/P{NNN}-*/` | ✅ | Plan file directory (requirements/design/tasks, etc.) |
| `docs/adr/` | ✅ | Architecture Decision Records (created on demand) |
| `docs/conventions-{scope}.md` | ✅ | Tech-stack engineering conventions (injected on matching file edit) |

---

## FAQ

**Q: I already have cursor rules / spec tools / my own well-written CLAUDE.md. Why do I need Airein?**
A: Most of those are "prompt-level" constraints — written in rule files, relying on model self-discipline, bypassable under context bloat or instruction conflict. Airein's differentiator is **making non-negotiable constraints into hooks (`exit 2` code enforcement)**, plus cross-session project memory and a spec-driven planning flow. You can run it alongside existing rules: hard constraints to Airein's hooks, soft preferences in your CLAUDE.md.

**Q: The quality gates are too strict — can I downgrade?**
A: Yes, flexibly configure in `.claude/config/quality.json`: disable TDD (`testGuard.enabled: false`), TDD warn-only (`mode: "advisory"`), downgrade blocking (`blocking.testFailure: false`), turn off plan gate (`planGate.mode: "disabled"`). Or drag toggles directly in the Dashboard panel.

**Q: Will self-learning memory be lost when I change machines?**
A: The self-learning archive is at `~/.claude/projects/{key}/self-learning-archive.md`, project-isolated, not in git. Manually copy that directory on migration, or pack with `airein-pack.sh`.

**Q: My project has no test framework — will stop-test-gate error?**
A: No. The hook detects project type (package.json / pom.xml / Cargo.toml, etc.) and skips if no matching test framework is found.

**Q: Can I use only some skills / hooks?**
A: Yes. Delete unwanted skill directories and remove unwanted hooks from `hooks.json`. But `init-project` is recommended to keep — it's the foundation of project state management.

**Q: What is `${CLAUDE_PLUGIN_ROOT}` in `hooks.json`?**
A: An environment variable pointing to the airein install root (usually `~/.claude`). Claude Code sets it automatically in the plugin context; if your environment doesn't set it, replace the path in commands with the absolute path to `~/.claude`.

**Q: How do I verify self-learning is working?**
A: Check whether `.claude/self-learning/pending.md` captured anything this round; after Stop, check whether the archive appended logs; once the same instruction hits the threshold, check whether `rules/30-self-learned.md` was generated — once promoted to L0, it auto-loads next session.

---

## Credits

Airein's design and implementation drew from these open-source projects and community practices:

| Project | Contribution | Link |
|---------|--------------|------|
| **Everything Claude Code (ECC)** | Baseline architecture inspiration, origin of the tdd-workflow & verification-loop skills, hook event model reference | [github.com/affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) |
| **Claude Code (Anthropic)** | Hook protocol stdin/stdout JSON, native conditional rules (paths + @include), Session/Compact/Stop event definitions | [claude.ai/code](https://claude.ai/code) |
| **TDD (Test-Driven Development)** | RED → GREEN → REFACTOR core flow, test-first-then-implement discipline | [Agile Manifesto](https://agilemanifesto.org) |
| **DDD (Domain-Driven Design)** | Domain model template (design-domain-model.md), aggregate root/entity/value object tactical patterns | [domainlanguage.com/ddd](https://domainlanguage.com/ddd/) |
| **OpenSpec** | Structured Q&A method for the grilling phase, requirements-clarification best practices | [openspec.dev](https://openspec.dev) |
| **SpotBugs** | Java static analysis tool reference (design-conventions/java.md) | [github.com/spotbugs/spotbugs](https://github.com/spotbugs/spotbugs) |
| **detekt** | Kotlin static analysis tool reference (design-conventions/kotlin.md) | [detekt.dev](https://detekt.dev) |

**Special note**: An early version referenced a community skill's self-learning mechanism (heartbeat/reflections/corrections), later refactored into a three-tier flow (buffer/archive/promotion) with external dependencies removed. Thanks to that project for its inspirational contribution.

Airein aims to keep runtime dependencies minimal; the references above are **design philosophy and methodology inspirations only**, and airein currently builds solely on Node.js built-in modules.
