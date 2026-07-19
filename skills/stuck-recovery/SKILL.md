---
name: stuck-recovery
description: 同一问题尝试 3 次仍未解决时的恢复协议
disable-model-invocation: true
---

# Stuck Recovery Protocol

Maximum 3 attempts per issue, then STOP and follow this protocol.

## Step 1: Document What Failed

Write down:
- What you tried (each attempt)
- Specific error messages (exact text)
- Why you think it failed

## Step 2: Research Alternatives

- Find 2-3 similar implementations (search GitHub, Stack Overflow)
- Note different approaches used in each
- Check library docs for alternative APIs

## Step 3: Question Fundamentals

- Is this the right abstraction level?
- Can this be split into smaller problems?
- Is there a simpler approach entirely?
- Are you solving the right problem?

## Step 4: Try Different Angle

- Different library/framework feature?
- Different architectural pattern?
- Remove abstraction instead of adding?
- Simplify instead of generalizing?

## Escalation

If still stuck after this protocol:
1. Present the user with: what was tried, what failed, 2-3 possible next directions
2. Ask the user for guidance or external resources
3. Consider pairing with `tech-lead` (mode: design or review) for a fresh perspective
