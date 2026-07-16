<!-- TEMPLATE: tests.md — 计划级测试台账（工作区，高 churn） -->
<!-- 用途：tdd skill 在实现阶段维护；不是用例第二正文 -->
<!-- 规则：一行 = 意图一句话 + 测试路径 + 命令 + 状态；改/删测试代码时同轮更新本表 -->
<!-- 归档：禁止整表倒入 docs/test-plan.md；仅 Critical 索引可并入项目稀疏表 -->

# Tests Ledger: {Plan Title}

> 真相在仓库测试代码。本文件只做本计划内的 Req/Task ↔ 测试追踪。

## Ledger

| Req | Task | Behavior | Test | Command | Status |
|-----|------|----------|------|---------|--------|
<!-- Status: pending | written | pass | fail | dropped -->
<!-- Example: | R1 | 1.2 | resolve s-tier PRD template | test/test-requirements-template.js | node test/test-requirements-template.js | pass | -->

## Notes

<!-- 可选：与本计划相关的跑测说明（框架入口、特殊环境变量）。不要粘贴用例步骤正文。 -->

## Anti-liability

- 禁止在此复述 AAA / 前置 / 步骤全文
- `dropped`：测试已删除或行为已剔出计划范围
- 计划结束后台账可留在 `docs/plans/.../` 作历史；不搬家到项目级百科
