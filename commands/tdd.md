---
description: Spec-bound TDD for AI agents — bind acceptance tests, implement in vertical slices, prove GREEN, and maintain the plan tests ledger. Use when implementing features, fixing bugs, or refactoring.
---

# /tdd

Enter airein’s **spec-bound TDD** flow. Canonical procedure lives in the skill — do not invent a second workflow here.

1. Read and follow **`skills/tdd/SKILL.md`** (Spec → Bind → Impl → Prove → Trace).
2. Bugfix still RED-first (repro test before fix) per that skill.
3. When stuck: re-read the skill’s anti-skip table and iron rules (`rules/00-iron-rules.md`); do not invent a parallel TDD agent.

## Related

- Skill: `skills/tdd/SKILL.md` (+ `REFERENCE.md`)
- Completion gate: `rules/20-workflow.md` → Verification Before Completion
- Review: `/code-review` → `tech-lead` **mode: review**
