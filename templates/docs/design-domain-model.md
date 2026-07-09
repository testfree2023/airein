<!-- TEMPLATE: design-domain-model.md — DDD 领域驱动设计模板 -->
<!-- 用途：l-feature / l-bugfix 的 design 子文档，描述每个领域模块的核心模型 -->
<!-- 位置：docs/plans/P{NNN}-{slug}/design-domain-model.md -->
<!-- AI 生成指引：从 requirements 和 design.md 架构推导，每个领域按以下结构完整填写 -->

# Design: 领域模型设计

> 子文档 of [design.md](design.md) | 本文档描述各领域模块的 DDD 战术设计

## 领域划分总览

<!-- AI 生成指引：从 design.md 服务列表映射出 Bounded Context，通常 1 service ≈ 1 context -->

| Bounded Context | 核心职责 | 聚合根 | 对应服务 |
|----------------|---------|--------|---------|
| {Context A} | {一句话职责} | {AggregateName} | {service-name} |
| {Context B} | {一句话职责} | {AggregateName} | {service-name} |

## 领域上下文映射

<!-- AI 生成指引：描述 Bounded Context 之间的关系模式 -->
<!-- 关系模式：Customer-Supplier (上游/下游) | Conformist | Anti-Corruption Layer | Open Host Service | Shared Kernel -->

| 上游 | 下游 | 模式 | 通信方式 | 说明 |
|------|------|------|---------|------|
| {Context A} | {Context B} | Customer-Supplier | gRPC 同步 | {数据流向和目的} |
| {Context A} | {Context C} | Customer-Supplier | RocketMQ 异步 | {事件驱动的触发场景} |

---

<!--
  对每个领域按以下结构完整填写。每个领域是一个 ## 二级标题。
  AI 生成指引：不要只填表格——把类型定义、方法签名、业务逻辑都用伪代码写清楚。
-->

## {领域 A 名称}

### 聚合根: {AggregateRoot}

<!-- AI 生成指引：定义聚合根的核心标识、属性和行为。聚合根是事务一致性边界——对聚合内实体的所有修改都必须通过聚合根。 -->

```
// {AggregateRoot} 聚合根
class {AggregateRoot} {
  // ── 标识 ──
  id: {AggregateRoot}Id        // 强类型 ID（非裸 string/long）

  // ── 核心属性 ──
  name: string                  // {说明}
  status: {StatusEnum}          // {说明}
  // ... 按需添加

  // ── 聚合内实体引用 ──
  {childEntities}: {EntityType}[]   // 一对多子实体

  // ── 值对象 ──
  {valueObject}: {ValueObjectType}  // {说明}

  // ── 构造 ──
  static create(params: Create{AggregateRoot}Params): {AggregateRoot} {
    // 工厂方法：验证输入 → 创建实例 → 发布领域事件
  }

  // ── 领域行为 ──
  {behaviorMethod}(params): Result {
    // 不变量检查 → 状态变更 → 发布事件
  }
}
```

### 聚合内实体

<!-- AI 生成指引：聚合内实体依附于聚合根存在，有自己的标识但在聚合外不可直接引用 -->

```
// {EntityName} 实体
class {EntityName} {
  id: {EntityName}Id
  // 属性...
  // 行为...
}
```

### 值对象

<!--
  AI 生成指引：值对象没有标识、不可变、通过属性值判等。凡是用概念性整体来描述领域概念的，都应该是值对象。
  常见值对象：Address, Money, PhoneNumber, Email, DateRange, GeoLocation, Measurement, DeviceSpec
-->

| 值对象 | 属性 | 不可变？ | 判等规则 |
|--------|------|---------|---------|
| {ValueObjectName} | {field1}: {type}, {field2}: {type} | ✓ | 全属性等值比较 |
| {ValueObjectName2} | {field1}: {type} | ✓ | 全属性等值比较 |

```
// 示例：值对象类型定义
value {ValueObjectName} {
  {field1}: {Type}
  {field2}: {Type}

  // 工厂方法（带验证）
  static of({param1}: {Type}, {param2}: {Type}): {ValueObjectName} | ValidationError

  // 相等性
  equals(other: {ValueObjectName}): boolean
}
```

### 聚合持久化（Repository 接口）

<!-- AI 生成指引：Repository 只定义接口，不定义实现。实现放在 infrastructure 层。 -->

```
interface {AggregateRoot}Repository {
  findById(id: {AggregateRoot}Id): Optional<{AggregateRoot}>
  save(aggregate: {AggregateRoot}): void
  delete(id: {AggregateRoot}Id): void
  // 按需添加自定义查询（返回类型必须是聚合根或聚合根 ID 集合）
  findBy{Criteria}({params}): List<{AggregateRoot}>
}
```

### 领域服务

<!--
  AI 生成指引：领域服务用于跨聚合/跨实体的业务逻辑，不属于任何单一实体。
  不要把所有逻辑都塞进领域服务——能放在实体/值对象上的优先放实体/值对象。
-->

```
interface {DomainServiceName} {
  // 每个方法一句话说明：做什么、输入什么、输出什么
  {methodName}({params}): Result<{ReturnType}, {ErrorType}>
}
```

| 领域服务 | 方法 | 职责 | 依赖 |
|----------|------|------|------|
| {ServiceName} | {methodName}({params}): {ReturnType} | {一句话说明做什么} | {依赖的 Repository/外部领域服务} |
| {ServiceName} | {methodName}({params}): {ReturnType} | {一句话说明做什么} | {依赖} |

### 应用服务

<!-- AI 生成指引：应用服务编排领域对象完成用例，处理事务边界、权限校验、外部集成。不包含业务规则。 -->

```
// 应用服务 = 用例编排
class {UseCaseName}Service {
  constructor(
    {repository}: {AggregateRoot}Repository,
    {domainService}: {DomainServiceName},
    {eventPublisher}: EventPublisher
  )

  // 每个方法对应一个用例
  @Transactional
  execute(params: {RequestType}): Result<{ResponseType}, Error> {
    // 1. 从 Repository 获取聚合
    // 2. 调用聚合/领域服务的业务方法
    // 3. 保存聚合
    // 4. 发布领域事件（事务一致）
  }
}
```

| 应用服务 | 用例 | 输入 | 输出 | 涉及领域 |
|----------|------|------|------|---------|
| {UseCaseName}Service | {用例描述} | {DTO 类型} | {DTO 类型} | {涉及的领域/聚合} |

### 核心业务规则

<!--
  AI 生成指引：列出该领域最重要的 3-8 条业务规则。
  每条规则必须包含：触发器 → 约束/计算 → 结果/违反处理。
  这些规则就是未来单元测试的测试用例来源。
-->

| 规则 ID | 规则名称 | 触发条件 | 不变量/约束 | 违反处理 |
|---------|---------|---------|------------|---------|
| {DOMAIN}-R01 | {规则名称} | {什么操作/事件触发} | {必须满足什么条件} | {不满足时怎么处理} |
| {DOMAIN}-R02 | {规则名称} | {触发条件} | {约束} | {处理} |
| {DOMAIN}-R03 | {规则名称} | {触发条件} | {约束} | {处理} |

### 领域事件

<!-- AI 生成指引：领域事件是已经发生的事实，命名用过去式。列出该领域发出的事件。 -->

| 事件 | 触发时机 | 携带数据 | 消费方 | 传输方式 |
|------|---------|---------|--------|---------|
| {Entity}{Action}ed | {领域行为完成后} | {聚合 ID} + {关键变更字段} | {下游 Context} | {同步/异步} |

```
// 事件类型定义
event {Entity}{Action}ed {
  aggregateId: {Type}
  occurredAt: Instant
  {changedFields}: {Types}
}
```

### 状态流转

<!-- AI 生成指引：每个有生命周期的实体都应该有状态机。 -->

```
{EntityName} 状态机:
  {InitialState} ──{触发动作}──▶ {State2} ──{触发动作}──▶ {State3}
```

| 状态 | 允许的操作 | 可转换到 | 转换条件 |
|------|-----------|---------|---------|
| {State1} | {可执行的操作} | {State2} | {转换前需要满足的条件/触发的事件} |
| {State2} | {可执行的操作} | {State3}, {State1} | {条件} |

---

## {领域 B 名称}

<!-- 重复上述结构：聚合根 → 实体 → 值对象 → Repository → 领域服务 → 应用服务 → 业务规则 → 领域事件 → 状态流转 -->

### 聚合根: {AggregateRootB}

```
class {AggregateRootB} {
  id: {Type}Id
  // ...
}
```

<!-- ... 按需填写，参考领域 A 的结构 ... -->

---

## 跨领域约束

<!-- AI 生成指引：跨多个领域协调的全局规则，涉及 Saga/流程编排、最终一致性、补偿逻辑 -->

| 约束 ID | 约束名称 | 涉及领域 | 描述 | 一致性保证 |
|---------|---------|---------|------|-----------|
| CROSS-R01 | {约束名称} | {领域 A}, {领域 B} | {全局约束描述} | {如何保证——Saga/事件最终一致性/同步调用} |

## 设计决策记录

<!-- AI 生成指引：记录建模过程中做出的非平凡决策——为什么这样建模而不是那样 -->

| 决策 | 选项 A | 选项 B | 选择 | 原因 |
|------|--------|--------|------|------|
| {要把某概念建模为} | 实体 | 值对象 | 值对象 | {因为没有独立标识，不需要跟踪生命周期变化} |
| {模块边界划分} | 同一聚合 | 拆分为两个聚合 | 拆分为两个 | {事务边界不同，不需要强一致性} |
