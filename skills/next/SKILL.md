---
name: next
description: Determine the single most important next action based on priority and dependency analysis. Use when user asks "what should I do next", "/next", or at session startup to orient work on the highest-priority unblocked task.
disable-model-invocation: true
---

# What's Next?

Analyze the project state and recommend the single most important next action.

## Process

1. Read `docs/roadmap.md` to understand active work streams
2. For each active plan, read `docs/plans/P{NNN}-{slug}/progress.md` for status and blockers
3. Check `docs/roadmap.md` ## Issues section for unresolved high-priority bugs
4. Determine the next action based on these rules:
   - **Blockers first**: If any active plan is blocked by a bug, fix the bug
   - **Highest priority**: Work on the plan with highest priority that is not blocked
   - **Dependencies**: If Plan A blocks Plan B, finish A's current stage before starting B
   - **Quick wins**: If a bug is trivial and a plan stage is complex, mention the bug as an alternative

## Output

```
## Next Action
**Work on**: [Plan ID or Issue ID]
**Action**: [Specific next step]
**Why**: [Reasoning — priority, dependency, or blocker resolution]
**File to read first**: [Which progress.md, tasks.md, or code file to start with]
```

## Rules

- Only recommend ONE action, not a list
- Be specific: "Implement stage 2 of P001" not "Continue working on auth"
- Include the file path so the session can start reading immediately
- Prefer `progress.md` as the entry point for plan status
