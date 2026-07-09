<!-- TEMPLATE: design.md — 结构模板，供 AI 生成时参考 -->
<!-- 用途：new-plan 生成计划设计文档，init-project 生成项目架构文档 -->
<!-- 注意：模板中的 HTML 注释是填写指引，AI 生成时替换为实际内容 -->

# Design: {Title}

## Approach
<!-- 选择方案和原因。1-2 段说明为什么选 A 不选 B -->
<!-- AI 生成指引：基于 requirements 中的约束，列出 2-3 个候选方案，说明选择理由 -->

## Architecture
<!-- 模块职责、数据流、关键接口 -->
<!-- AI 生成指引：从代码模块结构或功能边界推导 -->
- {模块 A 职责}
- {模块 B 职责}
- 数据流: A → B → C

## Components
<!-- 每个组件的接口、依赖和复用情况 -->
<!-- AI 生成指引：列出涉及的所有组件/文件/模块 -->
| Component | Interface | Dependencies | Reuses |
|-----------|-----------|--------------|--------|

## Key Decisions
<!-- 每个重要决策：选择 X 而非 Y，因为 Z -->
- {决策 1}: 选择 X 而非 Y，因为 Z

## Risks
<!-- 识别的风险及其缓解策略 -->
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|

## Sub-documents（大型项目适用）
<!-- 当设计涉及 3+ 个独立关注点时，拆分为子文档 -->
<!-- 命名约定：design-{subname}.md -->
<!-- design.md 本身变为索引文件，包含子文档链接和简要说明 -->
<!-- 常见子文档： -->
<!--   design-architecture.md — 架构设计（模块关系、数据流） -->
<!--   design-domain-model.md — DDD 领域模型（聚合根、实体、值对象、领域事件、核心业务规则） -->
<!--   design-conventions.md — 工程规范（目录规范、命名、代码风格） -->
<!--   design-database.md — 数据库设计（表结构、索引、迁移） -->
<!--   design-security.md — 安全设计（认证、授权、加密） -->
<!-- 子文档共享父文档的审批状态：design: approved 覆盖所有 design-*.md -->

## Status: draft
