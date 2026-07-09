---
name: status
description: 查看项目当前状态：活跃计划、未解决问题、优先级和下一步
disable-model-invocation: true
---

# Project Status

Read `docs/roadmap.md` and summarize the current project state.

## What to show

1. **Active work streams** — which plans are in progress, which are blocked
2. **Priority** — what should be worked on next and why
3. **Unresolved issues** — open bugs and their impact
4. **Recent changes** — last 3-5 entries from `docs/roadmap.md` ## Recent Changes section

## Rules

- Read only `docs/roadmap.md` (## Recent Changes section for changes, ## Issues for bugs)
- For plan details, read `docs/plans/P{NNN}-{slug}/progress.md` (machine-readable status)
- If more context needed, read `requirements.md` from the same plan directory
- Return a concise summary, not the full files
- If `docs/roadmap.md` doesn't exist, say "Project not initialized — use /init-project first"
