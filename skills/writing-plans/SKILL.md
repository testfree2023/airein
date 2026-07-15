---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Read context from:** `docs/plans/P{NNN}-{slug}/requirements.md` and `design.md` (if exists)

**Requirements = PRD:** Plan `requirements.md` is a 产品需求说明书, filled from `templates/docs/requirements/{s|m|l}.md` (see `resolveRequirementsTemplate`). Do not use the old thin summary shape. Pointer: `skills/writing-plans/requirements-template.md`.

**Write output to:** `docs/plans/P{NNN}-{slug}/tasks.md`

## Scope Check

If the spec covers multiple independent subsystems, suggest breaking into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified:
- Design units with clear boundaries and well-defined interfaces
- Prefer smaller, focused files over large ones
- Files that change together should live together
- Follow established patterns in existing codebases
- Check `docs/steering/structure.md` for file map and existing patterns

## Task Granularity

**Each step is one action (2-5 minutes):** Write failing test → Verify failure → Implement → Verify pass → Commit

## Task Structure (Structured Task Format)

Each task uses vertical slicing (tracer bullet through all layers):

````markdown
### 1.1 {Task Name}
- **Status**: ⏳ pending
- **Depends on**: {none | 1.2}
- **Scope**: {涉及的文件/模块}
- **Acceptance**: `{验证命令}`
- **Risk**: low | medium | high
- **Requirements**: {R1, R2}

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## After Writing

1. Update `docs/plans/P{NNN}-{slug}/progress.md` Task Stats to match actual task count
2. Set `tasks: draft` in progress.md Approval State
3. Update progress.md `pending:` count

## Remember
- Exact file paths always
- Complete code in plan (not "add validation")
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits
- Each task is a vertical slice through all layers
- Prefer AFK over HITL where possible

## Plan Review Loop

1. Dispatch plan-document-reviewer subagent with plan + spec
2. If issues found → fix → re-review (max 3 iterations)
3. If approved → proceed to execution handoff

## Execution Handoff

**"Plan complete and saved to `docs/plans/P{NNN}-{slug}/tasks.md`. Ready to execute?"**

> **For agentic workers:** REQUIRED: Use `tdd-workflow` skill to implement. If `flowControl.perTaskReview` is enabled, dispatch `code-reviewer` after each task.

**Required next step:** Call `tdd-workflow` skill to begin implementation.
