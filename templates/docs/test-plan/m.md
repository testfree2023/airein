<!-- TEMPLATE: test-plan/m.md — M：测试策略（Critical 门禁 + 关键 UC 轻量 VS） -->
<!-- 用途：new-plan 在 m-* 且 pipeline 含 test-plan 时（默认 m-feature） -->
<!-- 深度：Critical Index 必填；Verification Specs 覆盖关键/资金/一致性 UC（主成功+关键扩展/异常/幂等即可，不必七维全表） -->
<!-- 精炼 ≠ 稀疏：禁止抄 TC 步骤；Critical 只是入口，关键 UC 仍须有可证伪断言规格 -->
<!-- 禁止：把全库用例步骤抄进 Markdown——用例真相在测试代码；工作台账见计划 tests.md -->

# Test Plan: {Title}

> **测试策略 · 规模 M** · Critical 门禁索引 + **关键 UC** 验收规格。  
> 资金/一致性 UC 须有 VS；纯展示/CRUD 可只留 Critical 行。

## Test Scope
### In Scope
<!-- 覆盖的功能模块 / 质量属性 -->

### Out of Scope
<!-- 明确不测的范围 -->

## Test Strategy
| Layer | Tool/Framework | How to run | Coverage Target |
|-------|----------------|------------|-----------------|
<!-- Unit → Integration → E2E；命脉级（CAS/幂等/资金）点名 100%，其余按项目约定 -->

### Unit Testing
<!-- mock 边界、目录约定 -->

### Integration Testing
<!-- 外部依赖、夹具 -->

### E2E Testing
<!-- 关键用户路径；工具链 -->

## Critical Acceptance Index（产品级门禁索引）

> 一行一路径；**一行一个 Persona**；含 UI 须入口开头。  
> 计划工作台账：`docs/plans/P{NNN}-{slug}/tests.md`。  
> 本表是门禁入口；关键 UC 的场景/断言见下「Verification Specs」。

| Id | Persona | Behavior (one line，入口优先) | Test path | Command |
|----|---------|-------------------------------|-----------|---------|
<!-- | C1 | … | … | … | … | -->

## Verification Specs（关键 UC · 按需加厚）

<!-- 关键 / 资金 / 一致性 / 跨边界 UC 必填；其余可写「见 Critical C{n}」 -->
<!-- 场景至少覆盖：主成功 +（扩展或异常）+（幂等或边界，若适用）；不必七维全表 -->
<!-- 无关键 UC：写 N/A（理由）并保证 Critical 已覆盖 Must 路径 -->

### VS-{UC-id} · {名称}
- **对应 design / 意图**：一句话要证伪/证实什么  
- **场景**：

  | 场景类 | 具体场景 | 期望（观察 / pass） | Layer | 数据 |
  |--------|----------|---------------------|-------|------|
  | 主成功 | | | | |
  | 扩展或异常 | | | | |
  | 幂等或边界（按需） | | | | |

## Entry & Exit Criteria
### Entry Criteria
<!-- design approved；环境就绪 -->

### Exit Criteria
<!-- 每条绑可执行命令 + pass 输出；Critical 全绿；关键 VS 覆盖的命令全绿；无 P0/P1 -->

## Risks & Mitigations
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|

## Status: draft
