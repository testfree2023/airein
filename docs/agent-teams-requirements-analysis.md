# Agent Teams 需求分析报告

> **状态**：调研 / 需求澄清（非已批准的 plan PRD）  
> **日期**：2026-07-18  
> **关联**：P006 Dashboard Progress 面板；P007 任务面板与派工同步（本报告所述 Agent Teams **不在** P007 当期范围）  
> **目的**：把「main=PM + 多 subagent 协作」与宿主能力边界整理成可后续立项的依据。

---

## 1. 背景与动机

Local Dashboard Progress 面板（P006）已能投影 `tasks.md` 的顺序、依赖与状态。执行侧仍存在：

- Active Task / Stats 与面板解析不一致；
- 「下一任务」依赖模型自觉，Status 常未及时标为 `in_progress`；
- 长任务中 API 失败或 worker 卡死时，若「干活的就是 main」，整段会话容易空停，浪费研发时间。

讨论中曾评估 **会话外 cron watchdog**（系统定时任务 + 薄脚本 + 面板开关）。结论：**不做**——不符合「进程还在则继续协作」的产品直觉，且跨平台运维重、与 airein「无后台守护进程」取向冲突。

更优方向：**main 做 PM（编排），实现交给 subagent；某 worker 失败则 PM 发现并重开**。main 挂则团队一起挂——可接受。

进一步产品意图：

> **在 skills 里自建 Agent Teams 团队规范**，用规范驱动 main + 多个 subagent 协作完成项目；**不把** Claude Code 实验性「Agent Teams」运行时当作跨宿主唯一底座。

---

## 2. 宿主能力澄清（勿混为一谈）

| 能力 | 含义 | 跨宿主 | 对本需求的含义 |
|------|------|--------|----------------|
| **Subagent / Task / Agent** | main 派孤立上下文工人，回收结果 | CC、Cursor 等普遍具备（形态有差异） | **主路径**：团队规范应建立在此原语上 |
| **CC Agent Teams** | `SendMessage`、TeammateIdle、隐式 team 等 | **仅 CC 实验能力**（需开关） | **增强可选**，不可当唯一实现 |
| **系统 cron / 会话外 watchdog** | OS 定时拉起 CLI | 与宿主无关 | **已否决**，不进入当期方案 |
| **Stop / StopFailure + asyncRewake** | 会话内防空停 / API 失败后唤醒 | 随宿主 hook 成熟度变化 | PM 自身 API 失败时的薄护栏，非团队主体 |

**结论**：

- 「各宿主都支持某种 subagent 派工」——大体成立（以 P001 宿主矩阵 + 真机为准）。
- 「各宿主都有 CC 式 Agent Teams」——**不成立**。
- airein 应交付的是 **可移植的团队协议（skill + agents 定义）**，底层调用各宿主的 subagent 原语。

---

## 3. 目标架构（技能自建团队）

```text
skill: plan-execution-team（名称待定）
  ├─ Main = PM
  │    · 读 tasks / Active Task / 验收口径
  │    · 禁止承担业务实现（约定 + 可选劝阻）
  │    · 派 worker / 收结果 / 失败重开
  ├─ Worker subagent(s)
  │    · 按 Active Task 做 TDD / 实现（可复用 tdd-guide 等）
  ├─ 可选 Reviewer
  │    · flowControl.perTaskReview 时派 code-reviewer
  └─ 与派工 hook 的边界
       · Status / Stats / Active Task 短指针：hook 为法律
       · 谁派谁、何时重开：skill 为建议（可逐步加硬约束）
```

与「干活的 main + 续跑」对比：

| | 干活 main + 续跑 | **PM main + worker subagent** |
|--|------------------|------------------------------|
| API 常挂在谁身上 | 正在写代码的 main | 多为 worker；PM 仍可重派 |
| 恢复动作 | 叫醒同一会话 | **重开 agent**（带失败摘要） |
| main 挂了 | 全停 | 全停（已接受） |

仓库已有角色资产（如 `agents/chief-of-staff.md`、`loop-operator.md`、`tdd-guide.md`、`code-reviewer.md`）。缺口是一条 **端到端团队 skill**（何时当 PM、派谁、重开规则、与 `tasks.md` 交接）。

---

## 4. 与 Hook / 面板的分工

符合 airein 铁律分层：

| 层 | 职责 |
|----|------|
| **Hook（法律）** | `tasks.md` 为状态源；空档自动 `in_progress`；progress-sync 与面板同源；`onBlocked`；全完成停止派工 |
| **Skill / Agents（团队规范）** | main=PM；实现只在 worker；失败重开；并行/串行策略 |
| **Dashboard 面板** | 只读投影任务图；**不**写回 Status；**不**承担会话外拉起 |

面板可信的前提是 hook 与 `parse-tasks-panel` 语义一致——这是 **P007 当期**应先做完的「任务面板优化」底座；Agent Teams skill 建立在此底座之上。

---

## 5. 明确不做（本报告共识）

- 系统级 cron / 会话外 watchdog / 面板「开启续跑」拉起 CLI  
- 向交互式 TTY「灌键」假装用户输入  
- 将 CC Agent Teams 运行时绑定为跨宿主唯一方案  
- 用 prose / Session Log 单独推断并写回 Status  
- hook 自动标 `completed` / `blocked`（仍由模型或人写 `tasks.md`）

---

## 6. 风险与开放问题

1. **PM 自身 API 失败**：仍需会话内薄护栏（Stop / StopFailure+asyncRewake）；不能假设「有了 subagent 就永不空停」。  
2. **「及时发现」**：依赖背景 agent 结束通知、超时约定、PM 在 Stop 前检查结果——不是子进程内 cron。  
3. **成本**：每任务一 worker 增加 token；需纪律（PM 不写业务代码）。  
4. **多宿主降级**：无可靠 subagent 的宿主 → 文档标明「PM 模式降级为单代理执行」。  
5. **与现有 `/tdd` 工作流**：需改约定「实现在 worker；main 只编排」，避免双重真相。  
6. **立项切分**：团队 skill 全量（多角色、并行、多宿主验收矩阵）可能超过单个 s-feature，宜独立 plan。

---

## 7. 建议的交付切分

| 阶段 | 内容 | 建议归属 |
|------|------|----------|
| **当期** | 任务面板可信：progress-sync ↔ 面板解析同源；Active Task 短指针；派工空档标 `in_progress`；阻塞策略配置；全完成交棒 | **P007**（已去除 watchdog） |
| **后续 A** | skill 骨架：`plan-execution-team`（或等价）+ PM/Worker 角色约定；CC/Cursor 用 subagent 原语 | 新 plan 或 P007 后续迭代 |
| **后续 B** | 可选：CC Agent Teams 适配层（有则增强） | 更后；非阻塞 |
| **不做** | 会话外 watchdog | — |

---

## 8. 成功标准（供后续 plan 引用）

立项 Agent Teams 时，至少应可验证：

- [ ] 存在可安装的 skill，明确 main=PM、实现仅 worker  
- [ ] 单任务失败后，PM 可按规范重开 worker（带 Active Task + 失败摘要），无需 cron  
- [ ] Status 变更仍先落 `tasks.md`；面板与 progress 摘要一致  
- [ ] 文档说明：CC Teams 为可选增强；无 subagent 宿主的降级路径  
- [ ] 零 npm；不引入会话外守护进程  

---

## 9. 参考讨论要点（摘要）

1. Watchdog cron = 系统级定时任务；面板开关只是配置闸门——**已否决**。  
2. 进程仍在时「再喂一句继续」：会话内 hook/`asyncRewake` 可行；外部灌键不可靠。  
3. 独立 subagent 监控 main：**弱**；PM + 重开 worker：**强**。  
4. 自建团队 = **skills + agents 规范 + subagent 原语**，不是复刻 CC Teams 运行时。

---

## 10. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-18 | 初稿：汇总 grilling 结论；明确不做 watchdog；Agent Teams 与 P007 任务面板优化切分 |
