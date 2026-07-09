<!-- TEMPLATE: design-deployment.md — 部署设计模板 -->
<!-- 用途：new-plan 生成部署设计子文档，描述基础设施、容器化、CI/CD、可观测性与灾备 -->
<!-- 位置：docs/plans/P{NNN}-{slug}/design-deployment.md -->
<!-- AI 生成指引：从项目 Dockerfile、CI 配置、云服务选择推导，从 requirements 的性能要求推导扩缩容策略 -->

# Design: 部署设计

> 子文档 of [design.md](design.md) | 本文档描述系统部署架构：基础设施、容器化、CI/CD、可观测性与灾备

## 基础设施概览

### 架构拓扑

<!-- AI 生成指引：画出端到端请求路径，从用户浏览器到数据库，标注每段协议 -->

```
                        ┌─────────────┐
                        │   CDN/WAF   │
                        │ {CloudFlare}│
                        └──────┬──────┘
                               │ HTTPS
                        ┌──────▼──────┐
                        │  Ingress /  │
                        │ API Gateway │
                        │  {nginx/k8s}│
                        └──┬───┬───┬──┘
                           │   │   │
              ┌────────────┘   │   └────────────┐
              │                │                │
     ┌────────▼──────┐  ┌──────▼──────┐  ┌─────▼────────┐
     │ {Service A}   │  │ {Service B} │  │ {Service C}  │
     │ replicas: {n} │  │ replicas: {n}│ │ replicas: {n}│
     └───┬───┬───────┘  └───┬────┬────┘  └───┬────┬─────┘
         │   │              │    │            │    │
    ┌────┘   └──────┐  ┌───┘    └─────┐  ┌──┘    └──────┐
    │               │  │              │  │               │
┌───▼───┐    ┌──────▼──▼──────┐  ┌───▼──▼───┐    ┌─────▼─────┐
│ Redis │    │ PostgreSQL     │  │ RabbitMQ │    │ S3/MinIO  │
│ cache │    │ (primary+repl) │  │ / Kafka  │    │ (objects) │
└───────┘    └───────────────-┘  └──────────┘    └───────────┘
```

### 组件清单

| 组件 | 技术选型 | 版本 | 规格 | 说明 |
|------|---------|------|------|------|
| 计算 | {K8s / ECS / VM} | {版本} | CPU: {核}, RAM: {G} × {N} 实例 | {说明} |
| 主数据库 | {PostgreSQL / MySQL} | {版本} | {规格} | Managed / Self-hosted |
| 缓存 | {Redis / Valkey} | {版本} | {规格} {单机/集群/哨兵} | 用于会话/热点数据 |
| 消息队列 | {RabbitMQ / Kafka / SQS} | {版本} | {规格} | 异步任务 / 事件 |
| 对象存储 | {S3 / MinIO / GCS} | — | {容量说明} | 文件/备份/静态资源 |
| 日志 | {ELK / Loki / CloudWatch} | {版本} | {保留 N 天} | 集中日志 |
| 指标 | {Prometheus + Grafana / Datadog} | {版本} | {保留 N 天} | 监控告警 |
| Tracing | {Jaeger / Tempo / Datadog APM} | {版本} | sampling: {N}% | 分布式追踪 |
| 密钥 | {Vault / AWS Secrets Manager} | {版本} | — | 密钥管理 |

## 环境策略

| 环境 | 用途 | 数据 | 规模 | 部署方式 | 访问控制 |
|------|------|------|------|---------|---------|
| `dev` | 开发联调 | 模拟数据 | 最小（单副本） | 分支 push 自动部署 | 团队内网 |
| `staging` | 预发布验证 | 脱敏生产数据 / 模拟 | 等同生产（缩容） | main 合并自动部署 | 团队内网 |
| `prod` | 生产环境 | 真实数据 | 全规模 | Tag/Release 触发 | 严格 RBAC，变更审批 |

### 环境差异

<!-- AI 生成指引：生产与预发环境应尽可能一致，差异点必须显式记录 -->

| 配置项 | dev | staging | prod | 说明 |
|--------|-----|---------|------|------|
| 副本数 | 1 | {同生产} | {N} | 生产 ≥3 (HA) |
| 数据库连接池 | {N} | {同生产} | {P} | 生产更大连接池 |
| 日志级别 | DEBUG | INFO | WARN | 生产不输出 DEBUG |
| 限流 | 关闭 | 模拟阈值 | 开启 | 生产全量限流 |
| 监控告警 | 关闭 | 开启（静默） | 开启（发送） | 仅生产真正告警 |
| 证书 | 自签 | 自签 | 正式 CA | 生产使用可信证书 |

## 容器化

### 镜像构建

```dockerfile
# ── Stage 1: Build ──
FROM {base_image}:{version} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build

# ── Stage 2: Production ──
FROM {base_image}:{version}-slim AS runtime
RUN addgroup --system app && adduser --system --no-create-home --ingroup app app
WORKDIR /app
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/node_modules ./node_modules
USER app
EXPOSE {port}
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD curl -f http://localhost:{port}/health || exit 1
ENTRYPOINT ["node", "dist/main.js"]
```

| 构建规则 | 说明 |
|---------|------|
| 基础镜像 | `{image}:{version}` — 固定版本、不随 latest 漂移 |
| 多阶段构建 | 是 — Build 阶段包含 SDK，Runtime 阶段仅运行时 |
| 非 root 运行 | 是 — `USER app`，容器内无 root 权限 |
| 层缓存 | 依赖安装单独一层（先 COPY package*.json） |
| 镜像仓库 | `{registry}/{project}/{service}:{git_sha}` |
| 标签策略 | `{git_sha}` + `latest`（staging）, `v{semver}`（prod） |

## 编排 (Kubernetes)

<!-- AI 生成指引：若使用非 K8s 方案则替换为对应编排配置 -->

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {service-name}
  namespace: {namespace}
  labels:
    app: {service-name}
spec:
  replicas: {n}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  selector:
    matchLabels:
      app: {service-name}
  template:
    metadata:
      labels:
        app: {service-name}
        version: "{version_label}"
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "{metrics_port}"
    spec:
      serviceAccountName: {sa-name}
      containers:
        - name: {service-name}
          image: {registry}/{project}/{service}:{tag}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: {app_port}
              name: http
            - containerPort: {metrics_port}
              name: metrics
          envFrom:
            - configMapRef:
                name: {service-name}-config
            - secretRef:
                name: {service-name}-secret
          resources:
            requests:
              cpu: {request_cpu}
              memory: {request_mem}
            limits:
              cpu: {limit_cpu}
              memory: {limit_mem}
          livenessProbe:
            httpGet:
              path: /health/live
              port: http
            initialDelaySeconds: 10
            periodSeconds: 15
            timeoutSeconds: 3
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health/ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 2
          startupProbe:
            httpGet:
              path: /health/startup
              port: http
            initialDelaySeconds: 0
            periodSeconds: 5
            failureThreshold: 30
```

### Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: {service-name}
  namespace: {namespace}
spec:
  type: ClusterIP
  selector:
    app: {service-name}
  ports:
    - name: http
      port: 80
      targetPort: http
      protocol: TCP
```

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {service-name}-hpa
  namespace: {namespace}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {service-name}
  minReplicas: {min}
  maxReplicas: {max}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
```

### ConfigMap & Secrets

| 资源 | 内容 | 变更策略 | 刷新机制 |
|------|------|---------|---------|
| ConfigMap | 日志级别、超时、特性开关 | 随部署更新 | Pod 重启 |
| Secret | DB 密码、API Key、JWT 密钥 | 通过 Vault CSI Driver 注入 | 自动轮换无需重启 |
| ExternalSecret | `{Vault/KMS}` → K8s Secret 同步 | Vault 策略驱动 | {周期} 同步 |

## CI/CD 管道

### 管道阶段

```
Git Push ──▶ Lint ──▶ Test ──▶ Build ──▶ Deploy ──▶ Verify
                  │                │        │
                  ▼                ▼        ▼
              失败的阻止      安全扫描   冒烟测试通过
              后续阶段       镜像签名   才宣告部署成功
```

| 阶段 | 工具/命令 | 超时 | 失败行为 |
|------|---------|------|---------|
| **Lint** | `{eslint / checkstyle / golangci-lint}` | 3 min | 阻止管道 |
| **Unit Test** | `{jest / pytest / go test}` | 10 min | 阻止管道 |
| **SAST** | `{SonarQube / CodeQL / Snyk Code}` | 10 min | 阻止管道（High+） |
| **Container Scan** | `{Trivy / Snyk Container}` | 5 min | 阻止管道（Critical） |
| **Build Image** | `docker build` (多阶段) | 10 min | 阻止管道 |
| **Push & Sign** | `cosign sign {image}` | 2 min | 重试 3 次 |
| **Deploy dev** | `{helm/kubectl} apply` (dev) | 5 min | 自动回滚 |
| **Deploy staging** | `{helm/kubectl} apply` (staging) | 5 min | 自动回滚 |
| **Smoke Test** | E2E 冒烟用例 | 10 min | 阻止生产部署 |
| **Deploy prod** | `{helm/kubectl} apply` (prod) | 10 min | 停止 + 告警 + 人工回滚 |

### 触发规则

| 分支 | 触发条件 | 部署到 | 审批 |
|------|---------|--------|------|
| `feature/*` | Push | dev (按 namespace 隔离) | 无 |
| `main` | PR 合并 | staging | 无 |
| `main` | Tag `v*.*.*` | prod | 需要审批 + Change Request |

## 网络

### Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {name}
  namespace: {namespace}
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "{N}m"
    nginx.ingress.kubernetes.io/rate-limit: "{N}r/s"
spec:
  ingressClassName: nginx
  tls:
    - hosts: [{domain}]
      secretName: {name}-tls
  rules:
    - host: {domain}
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: {service-name}
                port:
                  name: http
```

### 网络策略

| 源 | 目标 | 端口 | 协议 | 说明 |
|----|------|------|------|------|
| Ingress → | Service A | 80 | TCP | 公开 API |
| Service A → | PostgreSQL | 5432 | TCP | 数据库连接 |
| Service A → | Redis | 6379 | TCP | 缓存 |
| Service A → | Service B | {port} | gRPC | 服务间调用 |
| Prometheus → | All Services | {metrics_port} | TCP | 指标采集 |

### DNS & 负载均衡

| 域名 | 指向 | 类型 | TTL |
|------|------|------|-----|
| `api.{domain}` | Load Balancer / Ingress IP | A | 300 |
| `*.{domain}` | CDN | CNAME | 3600 |
| `internal-db.{domain}` | 数据库私网 IP | A | 3600 |

## 存储

| 卷/存储 | 类型 | 容量 | 访问模式 | 备份 |
|---------|------|------|---------|------|
| 数据库数据 | {云盘 / Ceph / local-ssd} | {X} GB | ReadWriteOnce | 自动快照 + 定期转储 |
| 对象存储 | {S3 / MinIO} | {X} GB | — | 跨区域复制 |
| 日志卷 | {hostPath / emptyDir} | {X} GB | ReadWriteOnce | 日志已采集，不备份 |

## 可观测性

### 日志

| 配置项 | 值 |
|--------|-----|
| 采集器 | {Fluentd / Vector / Filebeat} DaemonSet |
| 聚合引擎 | {Elasticsearch / Loki / OpenSearch} |
| 格式 | JSON 结构化日志 |
| 最少字段 | timestamp, level, service, trace_id, message |
| 生产保留 | {N} 天 (hot) + {M} 天 (warm/cold) |
| 敏感字段脱敏 | 采集层正则脱敏 |
| 查询入口 | {Kibana / Grafana} |

### 指标

| 指标类型 | 采集源 | 示例 |
|---------|--------|------|
| 应用指标 | `/metrics` (Prometheus 格式) | `http_requests_total`, `db_query_duration_seconds` |
| 基础设施指标 | Node Exporter / cAdvisor | CPU, Memory, Disk, Network |
| 数据库指标 | postgres-exporter / mysqld-exporter | 连接数、慢查询、复制延迟 |
| 业务指标 | 自定义 metrics | 注册数、订单量、支付成功率 |

### 关键告警规则

| 告警名称 | PromQL/条件 | 阈值 | 严重级别 | 通知 |
|---------|------------|------|---------|------|
| 服务宕机 | `up{job="{service}"} == 0` | 持续 1m | Critical (P0) | 电话+IM |
| 错误率过高 | `rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > {threshold}` | > {N}% | Critical (P0) | 电话+IM |
| P99 延迟过高 | `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > {threshold}` | > {N}s | High (P1) | IM |
| CPU 持续高负载 | `container_cpu_usage_seconds_total > {threshold}` | > 80% 持续 10m | Warning (P2) | IM |
| 磁盘空间不足 | `disk_free < {threshold}` | < 20% | Warning (P2) | IM |
| 证书即将过期 | `certmanager_certificate_expiration_timestamp_seconds - time() < {threshold}` | < 7 天 | High (P1) | IM+邮件 |
| HPA 触及上限 | `kube_hpa_status_current_replicas >= kube_hpa_spec_max_replicas` | — | Warning (P2) | IM |

### 分布式追踪

| 配置项 | 值 |
|--------|-----|
| 追踪系统 | {Jaeger / Tempo / Datadog APM} |
| 采样率 | 100% (dev/staging), {N}% (prod) |
| 传播头 | W3C TraceContext (`traceparent`) |
| 跨服务必须传递 | `trace_id`, `span_id` |
| 集成 | HTTP Client / gRPC 拦截器 / DB Driver / MQ 中间件 |

## 扩缩容策略

| 服务 | 扩容触发 (CPU/Mem) | 缩容触发 | 最小副本 | 最大副本 | 预热时间 |
|------|-------------------|---------|---------|---------|---------|
| {Service A} | > 70% CPU 持续 3m | < 30% 持续 10m | 3 | 10 | 60s |
| {Service B} | > 70% CPU 持续 3m | < 30% 持续 10m | 2 | 5 | 30s |
| {Worker} | 队列深度 > {N} 持续 5m | 队列深度 < {M} | 1 | 20 | 30s |

<!-- AI 生成指引：Worker 类型服务使用 KEDA 根据队列深度扩缩 -->

## 灾备方案

### RPO / RTO

| 灾备场景 | RPO | RTO | 策略 |
|---------|-----|-----|------|
| 单实例故障 | 0 | < {N}s | K8s 自动重建 Pod |
| 单可用区故障 | < {N}s | < {M} min | 多 AZ 部署 + 自动故障转移 |
| 单区域故障 | < {N} min | < {M} min | 跨区域主备 / 暖备 |
| 数据误删 | 0 (PITR) | < {N} min | Point-in-time recovery |
| 人为错误 (代码) | 0 | < {N} min | 回滚到上一版本 |

### 故障转移流程

```
1. 检测: 健康检查失败 → Prometheus 告警触发
2. 确认: On-call 确认非误报
3. 决策: 判断是否为区域性故障 → 是则执行跨区切换
4. 切换: DNS 指向备用区域 / 提升只读副本为主库
5. 验证: 烟雾测试 → 无异常 → 扩大流量
6. 恢复: 修复原区域 → 数据同步 → 切回
7. 复盘: 事后分析 → 改进预案
```

### 恢复测试

| 测试项 | 频率 | 方式 | 验收标准 |
|--------|------|------|---------|
| 数据库备份恢复 | 每月 | 从最新备份恢复至临时实例 | 数据完整性校验通过 |
| 跨区域切换 | 每季度 | 模拟主区域宕机 | 用户无感知或 < {N} min 中断 |
| 回滚演练 | 每月 | 部署一个错误版本后回滚 | 回滚时间 < {N} min |

## 健康检查

### 探针设计

| 探针 | 端点 | 检查内容 | 检查目的 |
|------|------|---------|---------|
| **Startup** | `GET /health/startup` | 初始化完成（连接池建立、缓存预热） | 防止 Pod 过早接收流量 |
| **Liveness** | `GET /health/live` | 进程存活、无死锁 | Kubelet 决定是否重启 |
| **Readiness** | `GET /health/ready` | DB 可达、MQ 连接正常、非 overload | 决定是否从 Service 摘除 |

```go
// 健康检查实现伪代码
func HealthHandler(c *gin.Context) {
    // Liveness: 只检查进程未死锁
    // Readiness: 检查下游依赖
    dbErr := db.Ping()
    cacheErr := cache.Ping()
    if dbErr != nil || cacheErr != nil {
        c.JSON(503, gin.H{"status": "not ready", "db": dbErr, "cache": cacheErr})
        return
    }
    c.JSON(200, gin.H{"status": "ready"})
}
```

## 成本估算

<!-- AI 生成指引：按月度估算，区分 dev/staging/prod，标注固定成本 vs 弹性成本 -->

| 资源 | dev/staging | prod | 月度小计 | 备注 |
|------|------------|------|---------|------|
| 计算 (K8s Nodes / ECS) | ${X} | ${Y} | ${X+Y} | {规格} |
| 数据库 | ${X} | ${Y} | ${X+Y} | {规格/类型} |
| 缓存 (Redis) | ${X} | ${Y} | ${X+Y} | {规格} |
| 对象存储 | ${X} | ${Y} | ${X+Y} | {容量} |
| 网络 (LB/NAT/IP) | ${X} | ${Y} | ${X+Y} | — |
| 日志 & 指标 | ${X} | ${Y} | ${X+Y} | {保留天数} |
| 密钥管理 | ${X} | ${Y} | ${X+Y} | — |
| CI/CD | ${X} | — | ${X} | {分钟数} |
| **总计** | **${sub}** | **${sub}** | **${total}** | — |

## Status: draft
