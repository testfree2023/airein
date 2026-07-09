<!-- TEMPLATE: design-database.md — 数据库设计模板 -->
<!-- 用途：new-plan 生成数据库设计子文档，描述表结构、索引、迁移策略 -->
<!-- 位置：docs/plans/P{NNN}-{slug}/design-database.md -->
<!-- AI 生成指引：从 design-domain-model.md 的聚合根和实体推导表结构，从 requirements 推导查询模式和性能要求 -->

# Design: 数据库设计

> 子文档 of [design.md](design.md) | 本文档描述数据持久化层的表结构、索引、迁移与运维策略

## 数据库技术选型

<!-- AI 生成指引：根据项目约束（一致性需求、查询模式、运维能力）选择数据库。若只涉及一种数据库可简化此表。 -->

| 候选方案 | 适用场景 | 优势 | 劣势 | 评估 |
|---------|---------|------|------|------|
| PostgreSQL | OLTP、复杂查询、强一致性 | ACID、丰富索引类型、扩展生态 | 水平扩展复杂 | {✓ 推荐 / 备选} |
| MySQL / MariaDB | 读多写少、简单查询 | 成熟稳定、运维工具丰富 | JSON 支持弱、分析能力弱 | {评估} |
| MongoDB | 文档模型、快速迭代 | Schema-less、水平扩展容易 | 事务支持弱、JOIN 能力差 | {评估} |
| {其他候选} | {场景} | {优势} | {劣势} | {评估} |

**选择理由**：<!-- AI 生成指引：1-2 句话说明为何选择该方案 -->

## Entity-Relationship 概览

<!-- AI 生成指引：从 domain-model 的聚合根映射实体列表，标注对应的 Repository -->

| 实体（表名） | 对应聚合 | 行数预估 | 增长速率 | 核心职责 |
|-------------|---------|---------|---------|---------|
| `{table_name}` | {AggregateRoot} | {量级} | {速率} | {一句话描述} |
| `{table_name}` | {AggregateRoot} | {量级} | {速率} | {一句话描述} |

## 表结构定义

<!--
  AI 生成指引：每个实体按以下模板完整填写。
  列类型精确到具体数据库类型（如 TEXT vs VARCHAR(255)、BIGINT vs INTEGER）。
  所有外键显式声明 ON DELETE/ON UPDATE 行为。
-->

### `{table_name}` — {实体描述}

```sql
CREATE TABLE {table_name} (
    -- 主键
    id              BIGSERIAL       PRIMARY KEY,
    -- 业务标识（如对外暴露的 UUID）
    public_id       UUID            NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    -- 核心字段
    {column_name}   {SQL_TYPE}      NOT NULL,           -- {用途说明}
    {column_name}   {SQL_TYPE}      NOT NULL DEFAULT {default},  -- {用途说明}
    {column_name}   {SQL_TYPE},                         -- {用途说明，可为空的原因}
    -- 外键
    {fk_column}     BIGINT          NOT NULL REFERENCES {other_table}(id) ON DELETE RESTRICT,
    -- 审计列
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    -- 版本号（乐观锁）
    version         INTEGER         NOT NULL DEFAULT 1
);

-- 索引
<!-- AI 生成指引：为每个索引说明用途——覆盖哪个查询、为什么类型（唯一/部分/复合） -->
CREATE UNIQUE INDEX idx_{table}_{column}_unique ON {table_name}({column}) WHERE {condition};
CREATE INDEX idx_{table}_{fk} ON {table_name}({fk_column});
CREATE INDEX idx_{table}_{column1}_{column2} ON {table_name}({column1}, {column2}) WHERE {condition};

-- 约束
ALTER TABLE {table_name} ADD CONSTRAINT chk_{table}_{column} CHECK ({column} {condition});
```

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | BIGSERIAL | PK | auto | 内部主键 |
| public_id | UUID | UNIQUE NOT NULL | gen_random_uuid() | 对外暴露的业务标识 |
| {column} | {type} | {constraints} | {default} | {说明} |

### `{table_name}` — {实体描述}

<!-- 按需复制上方表结构模板 -->

## 关系映射

<!-- AI 生成指引：从 domain-model 中聚合间关系推导外键和关联表 -->

| 关系类型 | 父表 | 子表/关联表 | 外键列 | 级联行为 |
|---------|------|------------|--------|---------|
| 1:1 | `{parent}` | `{child}` | `{child}.{parent}_id UNIQUE` | ON DELETE CASCADE |
| 1:N | `{parent}` | `{child}` | `{child}.{parent}_id` | ON DELETE RESTRICT |
| N:M | `{table_a}` | `{junction_table}` | `{junction}.a_id`, `{junction}.b_id` | ON DELETE CASCADE |

### 关联表详情

```sql
-- N:M 关联表：{table_a} ↔ {table_b}
CREATE TABLE {junction_table} (
    {a_id}      BIGINT NOT NULL REFERENCES {table_a}(id) ON DELETE CASCADE,
    {b_id}      BIGINT NOT NULL REFERENCES {table_b}(id) ON DELETE CASCADE,
    -- 关联属性（如有）
    {attr}      {type} NOT NULL DEFAULT {default},
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY ({a_id}, {b_id})
);
```

## 查询模式 & 优化

<!-- AI 生成指引：列出 top 5-10 高频/关键查询，说明匹配的索引和执行计划预期 -->

| 查询 ID | 查询描述 | 涉及表 | 使用索引 | 预期扫描 | 备注 |
|---------|---------|--------|---------|---------|------|
| Q01 | {查询描述} | `{tables}` | `idx_{name}` | Index Scan | {说明} |
| Q02 | {查询描述} | `{tables}` | `idx_{name}` | Index Only Scan | {说明} |

<!-- AI 生成指引：对每个复杂查询附上 SQL 示例和 EXPLAIN 预期 -->
```sql
-- Q01: {查询描述}
SELECT {columns}
FROM {table}
WHERE {conditions}
ORDER BY {sort} {direction}
LIMIT {n};

-- 预期 EXPLAIN:
-- Limit → Index Scan using idx_{name} on {table}
--   Filter: {conditions}
--   Rows Removed by Filter: {estimate}
```

## 分库分表策略

<!-- AI 生成指引：预估数据量小于 100M 行时可标注"暂不需要"并说明预估增长 -->

| 策略项 | 方案 | 说明 |
|--------|------|------|
| 是否分片 | {是 / 否} | {原因} |
| 分片键 | {column} | {为什么选这个键——均匀分布、查询亲和性} |
| 分片算法 | {HASH / RANGE / 暂不需要} | {具体 hash 函数或 range 边界} |
| 分片数量 | {N} 片 | {预估依据} |

## 数据归档与清理

<!-- AI 生成指引：定义哪些表的数据需要定期清理、归档策略 -->

| 表 | 保留周期 | 归档目标 | 清理策略 | 定时任务 |
|----|---------|---------|---------|---------|
| `{table}` | {周期，如 90 天} | {冷存储/文件/删除} | DELETE 分批 / 分区裁剪 | {cron 表达式} |

## 连接池与读写分离

<!-- AI 生成指引：根据预估 QPS 和实例规格配置连接池 -->

```yaml
# 连接池配置（以 HikariCP 为例）
datasource:
  pool:
    maximumPoolSize: {n}           # 公式: CPU核数 * 2 + 磁盘数
    minimumIdle: {m}               # 常驻连接数
    connectionTimeout: 30000       # ms
    idleTimeout: 600000
    maxLifetime: 1800000
```

| 配置项 | 值 | 依据 |
|--------|-----|------|
| 读写分离 | {是 / 否} | {说明：读写比例、延迟容忍度} |
| 读库数量 | {N} 个 | {说明} |
| 最大连接数 | {N} | {计算公式} |

## 迁移策略

<!-- AI 生成指引：每个变更必须同时定义 up 和 down，注明是否涉及数据回填 -->

| 迁移 ID | 描述 | Up | Down | 数据回填 | 风险 |
|---------|------|-----|------|---------|------|
| M001 | 创建 `{table}` 表 | `CREATE TABLE ...` | `DROP TABLE ...` | 无 | 低 |
| M002 | 添加 `{column}` 列 | `ALTER TABLE ADD COLUMN ...` | `ALTER TABLE DROP COLUMN ...` | 需回填历史数据 | 中 |
| M003 | {变更描述} | {up 脚本} | {down 脚本} | {回填方案} | {风险等级} |

### 回填脚本

<!-- AI 生成指引：当迁移涉及数据回填时，提供分批回填脚本 -->
```sql
-- 分批回填示例
DO $$
DECLARE
    batch_size INT := 1000;
    updated INT;
BEGIN
    LOOP
        UPDATE {table} SET {new_column} = {default_value}
        WHERE id IN (SELECT id FROM {table} WHERE {new_column} IS NULL LIMIT batch_size);
        GET DIAGNOSTICS updated = ROW_COUNT;
        COMMIT;
        EXIT WHEN updated = 0;
        PERFORM pg_sleep(0.1);  -- 留出复制延迟
    END LOOP;
END $$;
```

## 备份与恢复

<!-- AI 生成指引：根据 RPO/RTO 要求选择备份策略 -->

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 备份方式 | {pg_dump / WAL 归档 / 快照} | {选择原因} |
| 全量备份频率 | {每天 / 每周} {时间} | {选择原因} |
| 增量备份频率 | {每 N 小时 / 持续归档} | {选择原因} |
| 保留周期 | {N} 天全量 + {M} 天增量 | {合规/业务要求} |
| RPO | {N} 分钟 | {可接受的数据丢失上限} |
| RTO | {N} 分钟 | {恢复时间目标} |
| 恢复验证频率 | {每月 / 每季度} | {验证方式} |

## 运维手册

### 慢查询排查
<!-- AI 生成指引：列出关键 SQL 的性能基线 -->
```sql
-- 查看当前活跃查询
SELECT pid, state, wait_event_type, wait_event, query_start, query
FROM pg_stat_activity WHERE state = 'active' AND query_start < now() - interval '5 seconds';
```

### 锁等待排查
```sql
-- 查看阻塞关系
SELECT blocked.pid AS blocked_pid, blocking.pid AS blocking_pid,
       blocked.query AS blocked_query, blocking.query AS blocking_query
FROM pg_stat_activity blocked
JOIN pg_locks blocked_locks ON blocked.pid = blocked_locks.pid
JOIN pg_locks blocking_locks ON blocked_locks.lock_type = blocking_locks.lock_type
    AND blocked_locks.relation = blocking_locks.relation
    AND blocked_locks.pid != blocking_locks.pid
JOIN pg_stat_activity blocking ON blocking_locks.pid = blocking.pid
WHERE NOT blocked_locks.granted;
```

## Status: draft
