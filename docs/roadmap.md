# Roadmap: Airein

> **项目路线图**（双轨：产品路线图 + 项目状态）
> 版本: v0.1.0 · License: Apache-2.0

---

## 现状（v0.1.0 · 开源首发）

airein v0.1.0 是首个开源版本，定位为「套在 Claude Code 之上的工程化框架」。核心命题：**Prompt 是建议，Hook 是法律**——把企业研发规范从「靠 AI 自觉遵守的 prompt」升级为「违反即阻断的代码保证」。

### 三大支柱（均已实现）

| 支柱 | 能力 |
|------|------|
| **spec-driven 协作**（`new-plan`） | 沟通澄清 → 按规模分流文档流水线（8 种 pipeline）→ 逐份审批 → TDD 实现 → 归档闭环 |
| **跨 session 记忆**（`init-project` + session-state + 自学习） | 启动自动恢复计划/任务/文件；自学习把持久指令晋升为 L0 永久规则（按项目隔离，不污染 CC memory） |
| **Dashboard** | 零依赖单文件 SPA，项目自动发现、plan/模板/配置可视化、approval 工作流、中英 i18n |

### 能力清单

- **20 个 hook**（6 个时机：PreToolUse / PostToolUse / PreCompact / SessionStart / Stop / UserPromptSubmit）—— 铁律强制 + 质量门禁 + 状态持久化
- **12 个内置 skill** —— 项目管理 / 开发流程 / 审查诊断
- **26 个文档模板** —— 覆盖 7 种语言（js/ts/py/java/go/rust/kotlin）
- **五层 JIT 上下文** —— L0 始终加载 ~5K tokens，按需加载不膨胀主上下文
- **零 npm 依赖** —— 只用 Node.js 内建模块，零安装门槛
- **35 个测试套件** —— 自研骨架，覆盖率目标 ≥ 80%

详细架构见 [design.md](design.md)，产品愿景见 [requirements.md](requirements.md)。

## 未来方向

### v0.2（近期）

- **更多语言模板**：扩展 design-architecture / design-conventions 模板覆盖（Scala、Swift、PHP、C# 等）
- **hook 性能可观测**：hook 执行耗时统计、慢 hook 告警
- **dashboard 增强**：计划甘特视图、hook 触发历史、自学习晋升可视化
- **plan 模板市场**：社区共享 plan pipeline 与文档模板

### v0.3（中期）

- **跨 AI 平台**：在保持 Claude Code 一等支持的前提下，探索其他 AI 编码助手的适配层（Cursor、Windsurf 等）——v0.x 明确为未来方向
- **团队协作**：共享 quality.json profile、团队规范模板库、统一配置分发
- **企业功能**：RBAC、审计日志、合规模块（v0.x 明确 out of scope，企业版方向）

### v1.0（远期）

- **稳定性**：真实企业环境大规模验证，hook 触发可靠性 100%
- **生态**：插件机制（第三方 hook / skill / 模板分发）
- **多语言文档**：英文文档完善，国际化

## 不在路线图（明确排除）

- 改变 Claude Code 的模型调用逻辑（airein 在 CC 之上工作，不替代）
- SaaS 化（纯本地，零外部依赖是核心约束）
- 引入 npm 依赖（零依赖是硬约束，除非证明无法用内建实现 + ADR 记录）

## 项目状态

> 运维轨道：活跃工作、已知 Issues、近期变更。Session 启动时优先读此区块判断「下一步该做什么」；产品战略见上方「产品路线图」各节。

### 活跃工作

_（暂无活跃 plan。下一个 plan：v0.2 规划，待 `/new-plan` 启动。）_

### Issues

> v0.2 候选待办（从「未来方向」沉淀，待排期）：

- [ ] 更多语言模板：扩展 design-architecture / design-conventions 覆盖 Scala、Swift、PHP、C# 等
- [ ] hook 性能可观测：执行耗时统计 + 慢 hook 告警
- [ ] dashboard 增强：计划甘特视图、hook 触发历史、自学习晋升可视化
- [ ] plan 模板市场：社区共享 plan pipeline 与文档模板

> 工程化 / dogfooding 缺口（部署与自身验证）：

- [ ] **安装部署验证缺失**：当前无 CI、无自动化端到端安装测试；`verify-airein.sh` 仅静态校验且自身未被测；行为层验证靠人工按 `test-plan.md` 执行。需补 CI 流水线 + 真实安装冒烟测试 + verify 脚本自身回归测试。
- [ ] **dogfooding：自身 hook 在内部流程上的覆盖**：`doc-file-warning` 曾漏豁免 `.claude/self-learning/`（已修，见 Recent Changes），暴露「hook 未在自身 harness 流程上实战演练」的系统性缺口——类似路径 / 豁免缺口应随发现补测。
- [ ] **dogfooding：源码修复不自动生效于运行中的安装**：开发源（本仓库）与全局安装副本（`~/.claude/scripts/hooks/`）分离——改源码后，运行中的 session 仍用旧副本（本次修 `doc-file-warning` 即被旧安装副本误拦自学习缓冲写入），需手动同步 / 重装才生效。需明确 dogfooding「改源 → 同步到安装」工作流，或让开发态直接跑源码 hook。

### Recent Changes

- **2026-07-09** `fix` doc-file-warning 豁免 `.claude/self-learning/` 路径 —— 解除对自学习缓冲（`.claude/self-learning/pending.md`）的误拦，TDD 补测。dogfooding 首例「自身 hook 漏豁免内部数据路径」。
- **2026-07-09** `docs` CONTRIBUTING 补 commit message 规范（公开记录只写 what+why、不加 `Co-Authored-By` trailer）+ roadmap 增设项目状态轨（活跃工作 / Issues / Recent Changes）。
- **2026-07-09** `docs` 补充英文 README（`README.en.md`）+ 精化致谢措辞（聚焦当前 Node.js 内建模块实现）。
- **2026-07-09** `feat` airein v0.1.0 初始发布 —— 确立「Prompt 是建议，Hook 是法律」核心命题，落地三大支柱（spec-driven 协作 / 跨 session 记忆 / Dashboard）。

## 贡献

欢迎 issue / PR。开发规范见 `docs/conventions-javascript.md` + `docs/conventions-bash.md`，贡献流程见 [CONTRIBUTING.md](../CONTRIBUTING.md)。
