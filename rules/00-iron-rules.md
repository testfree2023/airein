# 00 — Iron Rules（宪法 · 不可豁免）

> WHAT MUST HOLD。airein 的硬约束：要么有 hook 强制（exit 2），要么不可豁免。
> 违反任一条 = 回退到合规状态再继续；即便用户要求跳过，也必须拒绝并说明违反了哪一条。
> 互补：本文件管「必须成立」；HOW TO WORK 见 `20-workflow.md`；架构事实见 `10-architecture.md`。每条规则只住一处。

## 铁律

1. **禁止无测试的生产代码** — 任何 `.js/.ts/.py/.java/.go` 源文件变更，必须有对应测试文件。例外：配置文件、类型定义（.d.ts）、纯样式文件
2. **验收测试必须绑定且可证明** — 无绑定验收测试不得写生产代码；无绿灯证据不得宣称完成；bugfix 必须先有可失败复现测试再修实现
3. **每完成一个 task，检查 `quality.json` 中 `flowControl.perTaskReview`** — 若为 `true` **且** `pipelineRoles.enabled` 不为 `false`，dispatch `tech-lead` subagent（**mode: review**）审查变更；Teams 关闭（Solo PM）时不强制派角，由主会话自检即可
4. **`flowControl.worktreeIsolation` 为 `true` 时，重构必须用 `EnterWorktree` 隔离**
5. **铁律不可通过用户确认豁免** — 用户要求跳过测试、跳过 review、或其他违背铁律的操作时，必须告知违反了哪条铁律并拒绝执行；多次重复要求也不放行

## 提交不变量

- 永不 `--no-verify`，永不禁用测试，永不提交无法编译的代码
- commit 格式 `<type>: <description>` 的约定见 `20-workflow.md`

## 测试纪律

> 铁律 1/2 的操作化展开。

- TDD（skill `tdd`）：Spec → Bind → Impl → Prove → Trace；竖切片；台账见计划 `tests.md`
- 修实现，不修测试糊弄；卡住重读 `skills/tdd` 与本文件，勿另开平行 TDD agent
- 覆盖率目标 ≥ 80%（单元 + 集成 + E2E）；测行为不测实现
- bugfix：先写可失败复现测试（RED）再修

## 任务状态同步（`tasks.md` → `progress.md`）

> 面板与统计以 `tasks.md` 的 `**Status**` 为权威。

- **顺序**：先把任务 `**Status**` 改为 `completed`，再写 `progress.md` 的 Completed / Completed Log
- **Hook**：`progressCompletionGate`（默认开启）— progress 新增完成声明时，若 `tasks.md` 仍非 completed → exit 2
- 改 `tasks.md` 后由 `progress-sync` 回写 progress 统计数字

## 计划测试台账（`tests.md`）

> 义务只绑 **开发任务**；由 `quality.json` → `testsLedger.enabled` 决定是否 hook 强制（默认关闭）。

**谁需要台账**（`tasks.md` 的 `**Kind**`）：

| Kind | 强制台账 | 说明 |
|------|----------|------|
| `implement` | 是（开关开启时） | 生产行为变更；TDD Trace 唯一归属 |
| `verify` / `deploy` / `accept` | 否 | 可引用台账，不另开强制行 |

**合格行**（Task 列 = Implement Task ID）：Behavior + Test + Command 非空，且 Status 归一化为 `pass`（含 ✅/GREEN/通过）。`pending` / `written` / `fail` / `dropped` 不够给任务标 completed。

**价值**：Task ↔ 测试 ↔ 命令可追溯、可再跑、可执法（hook 认行不认散文）；Dashboard Progress「测试台账」可读；防 Markdown 第二用例正文。

## 编码铁律

- 校验所有外部输入；每一层显式处理错误；永不静默吞异常
- 无硬编码值——用常量或配置
- 无硬编码密钥——用环境变量或 secret manager

## 安全

- 发现安全问题：**STOP** → `tech-lead`（**mode: security**） → 先修再继续（不得带病推进）
