---
name: tdd-workflow
description: Use this skill when writing new features, fixing bugs, or refactoring code. Enforces test-driven development with 80%+ coverage including unit, integration, and E2E tests.
origin: ECC
---

# Test-Driven Development Workflow

## Core Principles

### 1. Tests BEFORE Code
ALWAYS write tests first, then implement code to make tests pass.

### 1.5. Vertical Slicing ONLY (Anti-Pattern Warning)

> **❌ WRONG — Horizontal slicing**: Write ALL tests → Write ALL implementation → Refactor
> **✅ CORRECT — Vertical slicing (tracer bullets)**: ONE test → ONE implementation → repeat → Refactor when GREEN

Each cycle is a thin vertical slice through the full stack. A completed slice is demoable/verifiable on its own.

**Hard rule: NEVER refactor while RED.** If tests are failing, the only allowed action is making them pass.

### 2. Coverage Requirements
- Minimum 80% coverage (unit + integration + E2E)
- All edge cases covered, error scenarios tested, boundary conditions verified

## Common Rationalizations — Anti-Skip Enforcement

| AI 可能说的 | 真相 |
|------------|------|
| "这个改动太小不需要测试" | 简单代码也会出错。测试只需 30 秒。 |
| "我先写代码再加测试" | 先写代码后写测试 = 确认偏误，不是验证。 |
| "手动测过了" | 手动测试不可重复、不系统、无记录。 |
| "这个只是重构" | 重构必须验证行为不变，测试是唯一保障。 |
| "测试太难写" | 难测试 = 设计有问题，听测试的信号。 |
| "TDD 会拖慢进度" | 调试比写测试慢。TDD 减少返工。 |
| "先跑通再说" | 跑通不等于正确。边界条件呢？错误路径呢？ |
| "这个逻辑很简单，一眼就能看对" | Bug 永远藏在"简单"里。 |

**Red Flags — 遇到以下情况必须停下来重新开始：**
- 先写了实现代码再补测试
- 测试立即通过（没有 RED 阶段）
- 用 "just this once" 为跳步辩护
- 说 "测试的精神比形式重要"

**Iron Law: 没有失败的测试 = 没有生产代码。代码先于测试 = 删掉重来。**

## TDD Workflow Steps

1. **Write User Journey**: `As a [role], I want to [action], so that [benefit]`
2. **Generate Test Case**: One test for one behavior (see [REFERENCE.md](REFERENCE.md) for patterns)
3. **Run Test → RED**: Must fail — we haven't implemented yet
4. **Implement**: Write minimal code to make test pass
5. **Run Test → GREEN**: Tests should now pass
6. **Refactor**: Improve code quality while keeping tests green
7. **Verify Coverage**: `npm run test:coverage` — verify 80%+ achieved
7.5. **Per-Task Code Review** (conditional — only when `quality.json` `flowControl.perTaskReview` is `true`):
   - Dispatch `code-reviewer` subagent for changed files only
   - CRITICAL/HIGH → fix immediately; MEDIUM/LOW → note for later
   - Default: code review once at end via `/code-review`

## Test Types

| Type | Scope | Tool |
|------|-------|------|
| Unit | Functions, utilities, components | Jest/Vitest |
| Integration | API endpoints, DB operations, services | Jest + mocks |
| E2E | Critical user flows, complete workflows | Playwright |

## Best Practices

1. Write Tests First — Always TDD
2. One Assert Per Test — Focus on single behavior
3. Descriptive Test Names — Explain what's tested
4. Arrange-Act-Assert — Clear test structure
5. Mock External Dependencies — Isolate unit tests
6. Test Edge Cases — Null, undefined, empty, large
7. Test Error Paths — Not just happy paths
8. Keep Tests Fast — Unit tests < 50ms each
9. Clean Up After Tests — No side effects
10. Review Coverage Reports — Identify gaps

> 详细测试代码示例和 mocking 模式见 [REFERENCE.md](REFERENCE.md)

## 终止状态

TDD 周期完成后（所有测试通过 + 覆盖率达标），唯一允许的下一步：

- **调用 `code-reviewer` agent** 审查所有变更（dispatch 规范见 `rules/20-workflow.md`「dispatch 规范」：model 用 haiku；prompt 只写「审查当前 git diff 的变更」，**不粘贴 diff**——reviewer 自带 `git diff --staged && git diff`，粘贴会永久占据其最贵上下文）
- **如果 `quality.json` 中 `flowControl.perTaskReview` 为 `true`** → 每个任务完成后立即审查

### 归档提示

当计划的所有任务完成时（progress.md 中 `completed === total`），提示用户：

> 所有任务已完成。建议执行 `/archive-plan` 归档项目文档。

这是建议性的，不阻塞。用户可以选择现在归档或稍后手动执行。

禁止：TDD 完成后直接 commit 跳过 code review。
禁止：TDD 完成后不做任何后续动作。
