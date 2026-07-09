# Requirements: Airein

> **产品需求文档（PRD）**
> 版本: v0.1.0 · 状态: 开源首发 · License: Apache-2.0

---

## Problem Statement

AI 编码助手（Claude Code 等）在企业研发工作流中存在一组反复出现的痛点。Airein 的存在理由就是回应它们：

| 痛点 | 现象 | Airein 的回应 |
|------|------|---------------|
| **AI 跳过规范** | 让它写测试它说"好的"，下一刻直接给生产代码 | 铁律 + Hook `exit 2` 硬拦截——prompt 是建议，hook 是法律 |
| **上下文爆炸** | session 开始就被规则、知识、历史塞满，越用越笨 | 五层 JIT 按需加载，基础上下文压在低位 |
| **状态丢失** | 关掉 session，下次重头解释项目 | `session-state` + `roadmap` 双源，启动自动恢复 |
| **质量下滑** | `console.log` 被提交、密钥被硬编码、测试被删掉 | 20 个 hook 在编辑 / 提交 / 停止 / 会话四个时机自动门禁 |
| **同样的错误反复犯** | 每个 session 重新踩坑，AI 不会自学 | 自学习三层晋升，持久指令沉淀为 L0 永久规则 |
| **多项目记忆污染** | 项目 A 的偏好串到项目 B | 自学习按项目隔离，CC memory 保持纯净 |

行业里把 AI 生成的代码戏称为"**日抛代码**"——演示完就扔。在 hackathon、原型验证里这没问题；但**中大型公司有稳定的业务系统、长期的维护负担、合规与审计要求**，不能接受日抛代码。Airein 的论点：把企业研发流程抽象成 AI 能遵循的 spec-driven 流程，**既拿到 AI 的提效，又守住质量红线**。

## 一句话定义

**Airein** 是套在 Claude Code 之上的工程化框架，把 AI 编码助手从"按提示生成代码的玩具"驯化成"懂规范、能闭环、会自学的入职半年同事"。

核心理念一句话：**Prompt 是建议，Hook 是法律。**

## 不是什么

- ❌ 不是 Claude Code 的替代品（在它之上工作，不替代）
- ❌ 不是又一套 Cursor Rules（不是 prompt 集合，是工程系统）
- ❌ 不是 SaaS 服务（纯本地，零外部依赖）
- ❌ 不是 npm 包（Shell + Node.js 原生，零依赖）

## 三条核心能力

### 支柱一：`new-plan` —— spec-driven 的 AI 协作

把企业研发流程抽象成 AI 能遵循的流水线：

```
沟通澄清（grilling）→ 按流水线产出文档 → 逐份审批 → TDD 实现 → 归档闭环
```

动手前先把模糊需求问清楚；按任务规模走对应文档流水线（s/m/l × feature/bugfix + hotfix）；每份文档 draft → 你审批 → approved 才允许下一份；进入实现后 `test-guard` 硬拦截"无测试的源码"；完成后 `/archive-plan` 归档。

### 支柱二：`init-project` + 项目记忆 —— 跨 session 不失忆

`/init-project` 一次初始化；`session-end` 持久化"当前计划、活跃任务、上次文件"；`session-start` 自动恢复；`pre-compact` 压缩前抢救关键决策；自学习把你的纠正累计晋升为永久规则。

### 支柱三：Dashboard —— 轻量级项目文档与质量管理面板

零 npm 依赖、单文件 SPA（纯 Node `http` + 内嵌 CSS/JS，无构建）、项目自动发现、计划/模板/配置可视化、中英 i18n。

## Acceptance Criteria

### 功能验收

- WHEN 创建源文件（`.js/.ts/.py/.java/.go`）THEN 必须有对应测试存在（strict 模式 `exit 2`）
- WHEN 用户要求跳过测试 THEN 拒绝并说明违反哪条铁律，不可通过用户确认豁免
- WHEN session 开始 THEN 加载基础上下文（L0 rules + L4 session-state）
- WHEN `git commit` THEN 跑 build + test，失败阻止提交
- WHEN 编辑代码后 THEN 自动检查 debug 语句、硬编码密钥、无 issue TODO
- WHEN 新计划创建 THEN 按 R→D→T 顺序审批，不可跳跃
- WHEN 同一持久指令累计达阈值 THEN 晋升为 L0 永久规则（写入 `rules/30-self-learned.md`）
- WHEN dashboard 启动 THEN 可视化项目状态、计划进度、文档编辑

### 非功能验收

- 零 npm 依赖（只用 Node.js 内建模块）
- Hook 注册自愈（被删自动恢复，保留第三方 hook）
- 模板覆盖 7 种语言（js/ts/py/java/go/rust/kotlin）
- 支持 8 种 plan pipeline（s/m/l × feature/bugfix + 紧急）

## 目标用户

**Primary：独立开发者 / 技术负责人** —— 主用 Claude Code，想让 AI 一次配置永久遵循规范，跳过测试直接被阻断。

**Secondary：AI 辅助开发团队** —— 希望全员 AI 行为一致，一键部署统一配置，新人快速进入状态。

**反目标用户**：对 AI 完全放手不管的、不用 Claude Code 的、想让 AI 写代码但拒绝写测试的。

## Constraints

- **零 npm 依赖**：只用 Node.js 内建模块（`fs` / `path` / `child_process` 等）
- **无 TypeScript 编译**：源码即运行
- **无数据库**：状态文件化（JSON + Markdown）
- **无后台守护进程**：hook 是 fire-and-forget
- **平台**：仅支持 Claude Code（v0.x）；其他 AI 平台为未来方向
- **Shell**：Bash on macOS / Linux / Git Bash（Windows）

## Out of Scope（v0.x）

- AI 模型本身的调用逻辑（不改变 Claude Code 的模型行为）
- 非 Claude Code 的 AI 平台支持
- 团队协作功能（RBAC、审计日志、合规模板）
- 企业版功能

## Success Metrics

| Metric | Target | 验证方式 |
|--------|--------|---------|
| 铁律遵循率 | 95%+ | PreToolUse `exit 2` 真实触发 |
| 基础上下文 token | 低位可控 | 五层 JIT 实测 |
| Hook 触发可靠性 | 100% | 真实 CC 会话验证 |
| 测试覆盖率 | 80%+ | quality-sentinel 检查 |

## Tech Stack

| 层 | 技术 | 原因 |
|----|------|------|
| Hook 运行时 | Node.js（原生 API） | 跨平台、CC 自带 |
| 配置 | JSON + Markdown | 人类可读、版本可控 |
| 部署脚本 | Bash | 跨 macOS / Linux / Git Bash on Win |
| Dashboard | 纯 HTML + JS（无框架） | 单文件 SPA，零构建 |
| 测试 | Node.js 自研骨架 | 零依赖 |
| 文档 | Markdown | 与 AI 的天然语言 |

## License

Apache-2.0（见 [LICENSE](../LICENSE)）。
