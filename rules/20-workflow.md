# 20 — Workflow（操作手册 · HOW TO WORK）

> 怎么干活。工作流、生命周期、分支策略、行为规则——可适配、可裁剪。
> 互补：本文件管「怎么做」；WHAT MUST HOLD 见 `00-iron-rules.md`；结构事实见 `10-architecture.md`。每条规则只住一处。

## Behavioral Rules（non-obvious to models）

- Touch only what you must — 每一行改动都能追溯到用户的请求
- 不"顺手改"邻近代码；即使你会换种写法，也匹配既有风格
- 不假设。存在多种解读时，摆出来——别默默选一个
- 不清楚就停下来问。点明哪里令人困惑
- 同一个问题 3 次尝试 → STOP，记录失败、研究替代方案、质疑根本前提
- **永不中途停下问"要不要继续？"——自主完成所有阶段**
  - 任务执行时（tdd-workflow、new-plan 等）：完成一个任务直接开始下一个，不询问
  - 阶段完成时：直接进入下一阶段，不询问
  - 例外场景：遇到 blockers、错误处理、需要外部访问、架构选择重大时，必须询问用户
  - 所有任务完成后：提示用户归档或下一步操作
- **需求/方案规划用 `/new-plan`，不用 CC 原生 plan mode** — 与用户沟通需求、准备写代码时，调用 `/new-plan` skill 走文档流水线（requirements→design→tasks + progress.md 审批）；不要进入 CC 自带 plan mode（`EnterPlanMode`/`ExitPlanMode`）。原因：airein 的审批/归档/roadmap 联动都挂在 `docs/plans/P{NNN}/`，原生 plan mode 不落地文件、不进 roadmap、plan-gate 与 archive-trigger 都感知不到。例外：纯探索性问答、不落代码的讨论可随意用任意方式。
- **计划内 `requirements.md` = 产品需求说明书（PRD）** — 按 pipeline 规模选用 `templates/docs/requirements/{s|m|l}.md`（经 `resolveRequirementsTemplate`）；禁止写成简易需求摘要。

## Workflow（五步）

1. **Research first** — 写新代码前先搜 GitHub 和库文档，优先成熟实现
2. **Plan** — 复杂任务写 `IMPLEMENTATION_PLAN.md`（含阶段、成功标准、测试用例）
3. **TDD** — 先写测试（RED）→ 实现（GREEN）→ 重构（纪律见 `00-iron-rules.md` 测试纪律）
4. **Review** — 提交前用 `code-reviewer` agent（触发见 `00-iron-rules.md` 铁律 3；dispatch 规范见下方「dispatch 规范」）
5. **Verify** — 编译、跑测试、查无回归；UI 改动做 E2E（不变量见 `00-iron-rules.md` 提交不变量）

## dispatch 规范（agent 调度 · 省 token）

调用 subagent（code-reviewer / architect / tdd-guide / security-reviewer / Explore 等）时遵守：

**① 显式声明 model** — 不声明则静默继承 session 最贵模型（实测教训：曾出现 26 个 reviewer 全顶级）。按 agent 任务类型选 tier：

| Agent | 默认 model | 理由 |
|---|---|---|
| Explore / general-purpose（搜索、定位） | haiku | mechanical grep 式 |
| code-reviewer / tdd-guide | haiku | 读 diff / 引导流程，mechanical；复杂逻辑审查时 reviewer 自判上调 sonnet |
| security-reviewer / architect / refactor-cleaner | sonnet | 需理解攻击面 / 架构 / 结构，设计判断 |

规则：dispatch 时显式声明 model；不确定按表；**未列出的 agent 默认 haiku**；任务明显超 tier 能力时上调 sonnet 并注明理由。

**② 不粘贴 diff 给 reviewer** — reviewer 是 fresh context，粘贴的 diff 永久占据最贵上下文（v6.0.0：reviewer 最大单项成本）。`code-reviewer` agent 自带第一步 `git diff --staged && git diff`（见 `agents/code-reviewer.md`），dispatch prompt 只写「审查当前 git diff 的变更」，**不粘贴 diff 内容**。

## Development Lifecycle（按任务类型）

### 新功能（features）

1. `/new-plan` → 需求分析 + 架构设计（不要用 CC 原生 plan mode）
2. **User review** → 用户确认方案后再动手
3. TDD cycle → `tdd-workflow` skill（RED → GREEN → REFACTOR）
4. `/code-review` → `code-reviewer` agent 独立审查
5. `/quality-gate` → 验证通过
6. Commit with structured message

### Bugfix

1. TDD → 先写复现测试（RED）
2. 修实现（GREEN）
3. `regression-test-gate` → 确保 bug fix 有测试覆盖
4. `/code-review`
5. Commit

### 重构（refactoring）

1. `/new-plan` → 影响范围分析
2. **User review** → 确认范围
3. TDD cycle → 确保不破坏行为
4. `/refactor-clean`
5. `/code-review`
6. Commit

**绝对禁止**：不经过任何 review 或测试就直接提交代码。

## 流程豁免

| 场景 | 可跳过 | 仍必须 | 不可豁免 |
|------|--------|--------|----------|
| 单文件小修改（typo、配置调整） | /plan、writing-plans | 测试通过、code review | 铁律 1（必须有测试） |
| 紧急 hotfix | /plan、writing-plans | 写复现测试 → 修复 → code review | 铁律 1（必须有测试） |
| 文档/注释修改 | 全部流程 | 无（非代码文件） | 无 |
| 探索性实验（POC） | 全部流程 | 实验成功后补写测试和 review | — |

**判断标准**：修改 ≤ 3 个源文件且不涉及架构变更 → 可走简化流程。

## 分支策略（worktree 隔离）

当 `quality.json` 中 `flowControl.worktreeIsolation` 启用时：
- **新功能** → 先用 `EnterWorktree` 创建隔离分支，完成后合并回 main
- **Bugfix** → 小改动可直接在 main 上修；大改动用 worktree 隔离
- **重构** → 必须用 worktree 隔离

禁用时（默认）：直接在当前分支工作，commit 前走标准质量门禁。

## Commit 格式

- 格式：`<type>: <description>`（type ∈ feat/fix/refactor/docs/test/chore/perf/ci）
- 提交不变量（编译/测试/`--no-verify`）见 `00-iron-rules.md` 提交不变量

## 代码结构约定

- Immutability：创建新对象，不改既有对象
- 小文件（< 800 行）、小函数（< 50 行）、浅嵌套（< 4 层）
- （输入校验 / 错误处理 / 无硬编码 见 `00-iron-rules.md` 编码铁律）
