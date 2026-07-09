<!-- TEMPLATE: test-plan.md — 结构模板，供 AI 生成时参考 -->
<!-- 用途：new-plan 生成计划测试计划，init-project 生成项目测试策略 -->
<!-- 注意：模板中的 HTML 注释是填写指引，AI 生成时替换为实际内容 -->

# Test Plan: {Title}

## Test Scope
### In Scope
<!-- 本次测试覆盖的功能模块 -->

### Out of Scope
<!-- 明确排除的测试范围 -->

## Test Strategy
<!-- 测试层次和覆盖策略 -->
| Layer | Tool/Framework | Coverage Target |
|-------|---------------|-----------------|
<!-- Unit → Integration → E2E → Performance -->

### Unit Testing
<!-- 单元测试策略：覆盖率目标、mock 方案 -->

### Integration Testing
<!-- 集成测试策略：模块间接口、外部依赖 -->

### E2E Testing
<!-- 端到端测试策略：关键用户流程 -->

## Test Cases
### Critical Path
<!-- 必须通过的核心用例 -->
<!-- TC-001: [用例名] — 前置条件 → 操作步骤 → 预期结果 -->

### Edge Cases
<!-- 边界条件和异常场景 -->

## Entry & Exit Criteria
### Entry Criteria
<!-- 开始测试的前提条件 -->
<!-- - 功能开发完成，代码审查通过 -->

### Exit Criteria
<!-- 测试完成的判定标准 -->
<!-- - 所有 Critical 用例通过 -->
<!-- - 无 P0/P1 缺陷遗留 -->
<!-- - 覆盖率达标 -->

## Risks & Mitigations
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|

## Status: draft
