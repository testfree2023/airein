---
description: Spec-bound TDD for AI agents — bind acceptance tests, implement in vertical slices, prove GREEN, and maintain the plan tests ledger. Use when implementing features, fixing bugs, or refactoring.
---

# /tdd

Enter airein’s **spec-bound TDD** flow. Canonical procedure lives in the skill — do not invent a second workflow here.

1. Read and follow **`skills/tdd/SKILL.md`** (Spec → Bind → Impl → Prove → Trace).
2. Bugfix still RED-first (repro test before fix) per that skill.
3. Agent fallback when stuck: dispatch **`tdd-guide`** (`agents/tdd-guide.md`) with the same skill rules.

## Related

- Skill: `skills/tdd/SKILL.md` (+ `REFERENCE.md`)
- Agent: `agents/tdd-guide.md`
- Iron rules / completion gate: `rules/00-iron-rules.md`, `rules/20-workflow.md`
