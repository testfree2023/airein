---
description: Dispatch airein tech-lead in review mode on the current uncommitted diff. Use after a task or before claiming done.
---

# /code-review

Thin entry — **do not** paste a second checklist here.

1. Dispatch **`tech-lead`** (`agents/tech-lead.md`) with **`mode: review`**.
2. Prompt only: `mode: review` — examine the current git diff (staged + unstaged). **Do not paste the diff** (agent gathers it). Prefer model **haiku**.
3. CRITICAL/HIGH → fix before continuing; MEDIUM/LOW → record and proceed per iron rules / `quality.json`.

Canonical rules: `agents/tech-lead.md` → mode:review；`rules/00-iron-rules.md`.
