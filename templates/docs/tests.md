<!-- TEMPLATE: tests.md — 计划级测试台账（工作区，高 churn） -->
<!-- 用途：tdd skill 在 Implement 阶段 Trace；不是用例第二正文 -->
<!-- 义务：仅 tasks.md Kind=implement；Task 列 = Implement Task ID（非 Verify ID） -->
<!-- 合格行：Behavior + Test + Command 非空，完成任务时 Status 须为 pass -->
<!-- 归档：禁止整表倒入 docs/test-plan.md；仅 Critical 索引可并入项目稀疏表 -->

# Tests Ledger: {Plan Title}

> 真相在仓库测试代码。本文件只追踪 **Implement** 任务：Req/Task ↔ 测试 ↔ Prove 命令 ↔ 状态。  
> **价值**：可追溯、可再跑、可被 `testsLedger` hook 执法；Dashboard Progress「测试台账」可读。

## Ledger

| Req | Task | Behavior | Test | Command | Status |
|-----|------|----------|------|---------|--------|
<!-- Status: pending | written | pass | fail | dropped -->
<!-- Task = Implement ID only（如 1.2），不是 2.x Verify -->
<!-- Example: | R1 | 1.2 | resolve s-tier PRD template | test/test-requirements-template.js | node test/test-requirements-template.js | pass | -->

## Notes

<!-- 可选：与本计划相关的跑测说明（框架入口、特殊环境变量）。不要粘贴用例步骤正文。 -->

## Anti-liability

- 禁止在此复述 AAA / 前置 / 步骤全文
- `dropped`：测试已删除或行为已剔出计划范围
- Verify / Deploy / Accept **不**在此强制建行
- 计划结束后台账可留在 `docs/plans/.../` 作历史；不搬家到项目级百科
