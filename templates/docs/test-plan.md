<!-- TEMPLATE: test-plan.md — 测试策略（项目低 churn / l-* 计划策略文档） -->
<!-- 用途：init-project 项目策略；new-plan l-* 计划内策略；archive 合并策略增量 -->
<!-- 禁止：把全库用例步骤抄进 Markdown——用例真相在测试代码；工作台账见计划 tests.md -->

# Test Plan: {Title}

## Test Scope
### In Scope
<!-- 覆盖的功能模块 / 质量属性 -->

### Out of Scope
<!-- 明确不测的范围 -->

## Test Strategy
<!-- 怎么测：分层、框架、命令、门禁、责任人 -->
| Layer | Tool/Framework | How to run | Coverage Target |
|-------|----------------|------------|-----------------|
<!-- Unit → Integration → E2E -->

### Unit Testing
<!-- mock 边界、目录约定（如 test/test-*.js） -->

### Integration Testing
<!-- 外部依赖、夹具 -->

### E2E Testing
<!-- 关键用户路径；工具链 -->

## Critical Acceptance Index（稀疏）

> 仅产品不变量级验收。一行一路径；禁止完整 TC 步骤百科。
> 计划工作台账：`docs/plans/P{NNN}-{slug}/tests.md`。

| Id | Behavior (one line) | Test path | Command |
|----|---------------------|-----------|---------|
<!-- | C1 | login rejects bad token | test/test-auth.js | node test/test-auth.js | -->

## Entry & Exit Criteria
### Entry Criteria
<!-- 例如：策略已审；关键环境就绪 -->

### Exit Criteria
<!-- 例如：Critical 索引命令全绿；无 P0/P1 遗留；覆盖率达标 -->

## Risks & Mitigations
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|

## Status: draft
