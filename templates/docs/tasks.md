<!-- TEMPLATE: tasks.md — 结构模板，供 AI 生成时参考 -->
<!-- 用途：new-plan 生成计划任务分解 -->
<!-- 注意：模板中的 HTML 注释是填写指引，AI 生成时替换为实际内容 -->

# Tasks: {Title}

> Progress: 0/{N} tasks (0%)

## Global Constraints（bind 所有任务）

<!-- 全局约束：所有任务共享、原样 copied in，避免每个任务重新推导。只列「跨任务通用」的硬约束。 -->
- **版本地板**：<运行时最低版本，如 Node ≥ 18>
- **依赖限制**：<外部依赖策略，如 zero npm deps>
- **命名约定**：<文件/函数命名，见 conventions-*.md>
- **精确值**：<硬性数值，如覆盖率 ≥ 80%、超时 5s>

## 1.0 {Major Section Name}

### 1.1 {Task Name}
- **Status**: ⏳ pending
- **Depends on**: {none | task ID}
- **Scope**: {涉及的文件/模块}
- **consume**: {依赖什么契约 / 前置任务的产出 — 让只看本任务的 implementer 知道邻居契约}
- **produce**: {产出什么契约 / 给后续任务的接口}
- **Acceptance**: `{验证命令}`
- **Risk**: low | medium | high
- **Rollback**: {如何回滚}
- **Requirements**: {引用 requirements.md 中的验收标准}

## Dependency Graph
```
1.1 → 1.2 → 2.1
```
