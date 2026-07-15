<!-- TEMPLATE: requirements/l.md — L 规模产品需求说明书（PRD）结构模板 -->
<!-- 权威模板：供 new-plan 在 l-* 时生成计划内 requirements.md -->
<!-- 定位：产品需求说明书（PRD），不是简易需求摘要 -->
<!-- 负面约束：禁止仅有 Problem Statement + 少量 WHEN/THEN；须覆盖多角色/多场景/成功指标；可拆 requirements-{topic}.md -->

# Requirements: {Title}

> **产品需求说明书（PRD）** · 规模：**L**  
> 禁止写成「简易需求摘要」。大功能须有多角色、多场景、成功指标，并与项目级产品文档对齐（若存在）。

## Problem Statement
<!-- 业务背景、痛点量化（若可）、不做的代价 -->

## Alignment with Product / Project Docs
<!-- 链接或对照：docs/requirements.md、docs/steering/product.md、roadmap 等（有则写，无则「N/A — 首版/无 steering」） -->
- 

## Users & Roles
| 角色 | 诉求 | 优先级 |
|------|------|--------|
| **Primary** | | |
| **Secondary** | | |
| **Other** | | |

## Goals
- 
## Non-Goals
- 

## Success Metrics
<!-- 如何判断产品成功（不只是测试通过） -->
- {指标 1}
- {指标 2}

## Core Scenarios
<!-- L：建议 ≥3 个场景，含主路径与至少 1 个边界/失败路径 -->
1. **{场景}**: 
2. **{场景}**: 
3. **{边界/失败}**: 

## Functional Requirements

### R1: {Title}

**User Story:** As a [role], I want [capability], so that [benefit]

**Acceptance Criteria:**
1. WHEN [event] THEN system SHALL [response]
2. IF [precondition] THEN system SHALL [response]

### R2: {Title}

**User Story:** As a [role], I want [capability], so that [benefit]

**Acceptance Criteria:**
1. WHEN [event] THEN system SHALL [response]

<!-- 需要时继续 R3…；或拆文件 requirements-{topic}.md，在下方索引 -->

## Compound Documents（可选）
<!-- 命名：requirements-{topic}.md；本文件保留索引与总验收 -->
- [ ] `requirements-{topic}.md` — {说明}

## Non-Functional Requirements

### Performance
- 
### Security
- 
### Reliability
- 
### Observability
- 

## Dependencies
- 

## Risks
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| | | | |

## Out of Scope
- 

## Status: draft
