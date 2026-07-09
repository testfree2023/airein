<!-- TEMPLATE: deployment.md — 结构模板，供 AI 生成时参考 -->
<!-- 用途：new-plan 生成计划部署方案，init-project 生成项目部署文档 -->
<!-- 注意：模板中的 HTML 注释是填写指引，AI 生成时替换为实际内容 -->
<!-- AI 生成指引：从 Dockerfile、CI 配置、package.json scripts、环境变量中提取 -->

# Deployment: {Title}

## Environment Requirements
<!-- 硬件/软件最低要求 -->
| Component | Minimum | Recommended |
|-----------|---------|-------------|

## Architecture Overview
<!-- 部署架构：服务节点、负载均衡、存储、网络拓扑 -->

## Pre-deployment Checklist
- [ ] 代码审查通过
- [ ] 测试全部通过
- [ ] 配置项已更新
- [ ] 回滚方案已确认

## Deployment Steps
### Fresh Install
<!-- 全新安装步骤：依赖安装 → 配置初始化 → 启动 → 健康检查 -->

### Upgrade
<!-- 升级步骤：备份 → 停服/灰度 → 执行迁移 → 验证 -->

## Configuration
<!-- 可配置项清单 -->
| Config | Env Var | Default | Description |
|--------|---------|---------|-------------|

### Environment Variables
<!-- 关键环境变量及取值说明 -->

### Secrets Management
<!-- 密钥和凭证管理方式 -->

## Rollback Strategy
<!-- 回滚触发条件和步骤 -->
<!-- 数据回滚注意事项 -->

## Monitoring & Alerts
<!-- 关键监控指标和告警阈值 -->
| Metric | Threshold | Alert Level |
|--------|-----------|-------------|

### Health Check Endpoints
<!-- GET /health → 200 OK -->

### Log Locations
<!-- 日志文件路径和轮转策略 -->

## Post-deployment Verification
- [ ] 服务启动正常
- [ ] 健康检查通过
- [ ] 核心功能可用
- [ ] 无异常日志

## Status: draft
