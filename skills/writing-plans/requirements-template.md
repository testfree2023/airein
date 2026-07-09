# Requirements Template

> 需求捕获模板。在 Grilling 阶段（new-plan Phase 1）使用此模板结构化记录需求。
> 每个 Requirement 有唯一 ID，task 通过 `_Requirements: R1, R2` 追溯。

## Feature: {Feature Name}

### Introduction
{一段话描述功能、目的、用户价值}

### Alignment with Product Vision
{此功能如何支持 docs/product.md 中的目标}

---

## Functional Requirements

### R1: {Requirement Title}

**User Story:** As a [role], I want [feature], so that [benefit]

**Acceptance Criteria:**
1. WHEN [event] THEN system SHALL [response]
2. IF [precondition] THEN system SHALL [response]
3. WHEN [event] AND [condition] THEN system SHALL [response]

### R2: {Requirement Title}

**User Story:** As a [role], I want [feature], so that [benefit]

**Acceptance Criteria:**
1. WHEN [event] THEN system SHALL [response]
2. IF [precondition] THEN system SHALL [response]

---

## Non-Functional Requirements

### Performance
- [响应时间要求，吞吐量要求]
- [Example: API 响应 < 200ms, 支持并发 100 QPS]

### Security
- [认证、授权、数据保护要求]
- [Example: 所有 API 需要 Bearer token, PII 字段加密存储]

### Reliability
- [可用性、容错、恢复要求]
- [Example: 99.9% 可用性, 失败自动重试 3 次]

### Observability
- [日志、监控、告警要求]
- [Example: 关键操作记录 audit log, 错误率 > 5% 触发告警]

---

## Scope

### In Scope
- {明确包含的功能}

### Out of Scope
- {明确排除的功能，避免范围蔓延}

### Dependencies
- {依赖的其他计划、外部系统、API}

### Risks
- {技术风险、业务风险、缓解措施}
