---
name: log-change
description: Record significant changes to docs/roadmap.md ## Recent Changes — decisions, requirement changes, architecture shifts, bug discoveries. Use when a design decision is made, requirement changes, priority shifts, or plan status changes.
disable-model-invocation: true
---

# Log Change

Record a significant change to `docs/roadmap.md` under the `## Recent Changes` section.

## When to Log

- A design decision was made or changed
- A requirement was added, modified, or removed
- A bug was discovered and its root cause identified
- An architecture change was made
- A plan was created, completed, or blocked
- A priority was changed and why

## Format

Insert into `docs/roadmap.md` under `## Recent Changes`, directly after the heading (newest first):

```
### {YYYY-MM-DD} {Category}: {Title}

**Context**: Why this happened
**Decision**: What was decided/changed
**Impact**: Which plans/issues are affected
**Related**: P{NNN} / I{NNN} links
```

## Categories

- `Plan` — plan created/completed/blocked
- `Decision` — architectural or design decision
- `Requirement` — requirement added/changed/removed
- `Bug` — bug discovered/fixed/root-caused
- `Priority` — priority change with reasoning

## Rules

- One entry per event, keep it under 10 lines
- Always include the date and category
- Always link to related plan/issue IDs
- This is for significant changes, not every commit
- Insert new entries directly under the `## Recent Changes` heading, above existing entries (newest first)
