---
name: log-change
description: Record significant process changes to docs/roadmap.md ## Recent Changes — decisions, requirement changes, architecture shifts, bug discoveries. User-facing release notes go to root CHANGELOG.md (via archive-plan / plan completed), not here.
disable-model-invocation: true
---

# Log Change

Record a significant **process** change to `docs/roadmap.md` under the `## Recent Changes` section.

## 分工（勿混）

| 目标 | 文件 | 何时 |
|------|------|------|
| 开发过程 / 决策 / plan 启停 | `docs/roadmap.md` → Recent Changes | 本 skill |
| **用户向**发布摘要（升级能感到什么） | 根目录 `CHANGELOG.md` | plan `completed` / `/archive-plan`（见 archive-plan、tdd） |
| **Git tag**（发布 / 回滚锚点） | 同上 `CHANGELOG.md` → Tags 表 + 正文对应节 | 打 tag / 发版时必登记 |

**禁止**把用户向发布 bullet 只写进 Recent Changes 而漏写 `CHANGELOG.md`。每个发布 tag 也是变更过程的一部分，须在 CHANGELOG Tags 表可见。

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
