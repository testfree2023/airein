# Design Template

> 设计文档模板。在 writing-plans 的 File Structure 阶段使用，记录功能级设计决策。
> 与 ADR 配合——小型设计决策记录在此，重大决策提取到 docs/adr/。

## Feature: {Feature Name}

### Overview
{2-3 句话描述功能和在系统中的位置}

---

## Code Reuse Analysis

### Existing Components to Leverage
| Component | How to Use | File |
|-----------|-----------|------|
| {existing module} | {复用方式} | `path/to/file` |
| {existing utility} | {扩展方式} | `path/to/file` |

### Integration Points
| System | Integration Method | Notes |
|--------|-------------------|-------|
| {existing API} | {REST/SDK/Direct call} | {注意事项} |
| {database} | {ORM/Query} | {schema 变更} |

---

## Architecture

### Component Diagram
```
{描述组件间关系，可以用 ASCII 或 mermaid}
Component A → Component B → Component C
```

### Modular Design Principles
- **Single File Responsibility**: 每个文件处理一个关注点
- **Component Isolation**: 小而专注的组件，不是大而全的文件
- **Service Layer Separation**: 数据访问、业务逻辑、表现层分离

---

## Components & Interfaces

### Component 1: {Name}
- **Purpose:** {做什么}
- **Interface:** {公开方法/API 签名}
- **Dependencies:** {依赖什么}
- **Reuses:** {复用了哪些现有组件}

### Component 2: {Name}
- **Purpose:** {做什么}
- **Interface:** {公开方法/API 签名}
- **Dependencies:** {依赖什么}
- **Reuses:** {复用了哪些现有组件}

---

## Data Models

### Model 1: {Name}
```
{定义数据结构}
- id: {type}
- name: {type}
- {additional fields}
```

### Model 2: {Name}
```
{定义数据结构}
- id: {type}
- {additional fields}
```

### Schema Changes
- {新增表/字段/索引}
- {迁移脚本路径}

---

## Error Handling

### Error Scenarios
| Scenario | Handling | User Impact |
|----------|----------|-------------|
| {error case 1} | {如何处理} | {用户看到什么} |
| {error case 2} | {如何处理} | {用户看到什么} |

### Error Propagation
- {错误类型和传播方式：throw/return/Result type}

---

## Testing Strategy

### Unit Tests
- {需要测试的核心逻辑}
- {mock 策略}

### Integration Tests
- {需要测试的集成路径}
- {测试数据准备}

### E2E Tests
- {需要测试的用户流程}
- {验收场景}

### Coverage Target
- {单元测试覆盖率目标}
- {集成测试覆盖的关键路径}

---

## Design Decisions
- {在此记录小型设计决策}
- {如果决策满足 ADR 三条件门槛 → 提取到 docs/adr/}
