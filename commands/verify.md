---
description: Run the airein Verification Before Completion gate — identify project commands, run them fresh, read full output, then claim. Use before declaring done or opening a PR.
---

# /verify

Align with `rules/20-workflow.md` → **Verification Before Completion**. Do not assume npm/tsc.

## Gate

1. **IDENTIFY** — Which commands prove the claim? Prefer project `CLAUDE.md` / `docs/test-plan.md` / plan `tests.md` / existing scripts (`bash test/run-all.sh`, `node test/test-*.js`, etc.).
2. **RUN** — Fresh full run; do not reuse “上次跑过”.
3. **READ** — Full output + exit codes; count failures.
4. **VERIFY** — Output actually confirms the claim? If not, report evidence and STOP claiming success.
5. **ONLY THEN** — Make the completion claim.

## Report

```
VERIFICATION: PASS | FAIL

Commands run:
- <cmd> → exit N (summary)

Blockers:
- …

Ready to claim done: YES | NO
```

Optional `$ARGUMENTS`: `quick` (tests only if that’s the project’s smoke) | `full` (default — all identified checks).
