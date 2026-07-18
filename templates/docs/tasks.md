<!-- TEMPLATE: tasks.md — 结构模板，供 AI 生成时参考 -->
<!-- 用途：new-plan 在 pipeline 含 tasks 时生成；承接 PRD / Design / test-plan -->
<!-- 定位：可执行工作分解（Implement / Verify / Deploy / Accept），不是「仅开发清单」 -->
<!-- 核心门禁：Design refs（Implement）+ Source（Verify）+ Coverage Gate；精炼 ≠ 稀疏 -->
<!-- 禁止：无源 Verify；只拆 Critical 丢 VS；堆标题空 Acceptance；抄 UC/TC 步骤正文 -->
<!-- 面板契约（Dashboard Progress 可解析）：Status ∈ {pending, in_progress, completed}（可带装饰如 ⏳）； -->
<!--   Depends on ∈ {none} 或 Task ID 列表（禁止散文）；每个 Kind（含 Accept）必有 Status； -->
<!--   Dependency Graph 仅示意，权威依赖以各任务 Depends on 为准。旧模板无法满足契约时面板提示不支持。 -->

# Tasks: {Title}

> Progress: 0/{N} tasks (0%)  
> **定位**：软件开发生命周期上的可执行分解（SDLC：Implement / Verify / Deploy / Accept），承接 PRD / Design / test-plan。  
> **核心门禁（相对上游升级）**：Implement 必绑 **Design refs**；Verify 必填 **Source**（Critical / VS / Exit / INV）；写完过 **Coverage Gate**；台账见计划 **tests.md**。  
> **拆解补充**：PRD **UC** → Implement（开发任务）；test-plan **Critical / VS** → Verify（测试任务）。  
> **面板契约**：`Status` ∈ `pending` | `in_progress` | `completed`（允许装饰前缀）；`Depends on` = `none` 或 Task ID（如 `1.1` / `1.1, 2.1`）；含 Accept 在内每个任务都写 Status。

## Global Constraints（bind 所有任务）

<!-- 只列跨任务硬约束；从 Design Constraints / quality.json / conventions 提炼 -->
- **版本地板**：<如 Node ≥ 18>
- **依赖限制**：<如 zero npm deps>
- **命名约定**：<见 conventions-*.md>
- **精确值**：<覆盖率 / 超时 / 门禁数字>

## Traceability Index（UC / Critical / VS → Task）

> 上游规格 → 任务总表；填完再写正文，**Coverage Gate** 据此自检。  
> Implement 绑 **UC-id**（可加 Design DD/API）；Verify 绑 **Critical- / VS- / Exit / INV-**。

| Source | 类型 | 一句话意图 | Implement Task | Verify Task | Priority |
|--------|------|------------|----------------|-------------|----------|
<!-- | UC-S1-01 | UC | 销售代报修 | 1.1 | 2.1 | Must | -->
<!-- | Critical-CA-01 | Critical | 客服主路径验收 | — | 2.2 | Must | -->
<!-- | VS-UC-S6-01-幂等 | VS | outbox 重复投递不双花 | 1.3 | 2.3 | Must | -->
<!-- | INV-资金守恒 | INV | 跨库金额守恒 | 1.3 | 2.4 | Must | -->

## Entry Coverage（UC × 角色 × 入口 → Must）

> 从 `requirements.md` 的 **User Story → Use Case** 与入口落位生成。  
> **每一格** Primary/Secondary 角色可见入口 = ≥1 条 **Priority: Must** Implement（Acceptance 点名 Persona + UI Entry + UC-id）。  
> **禁止**入口降为 Should；**禁止**「前端收口」一条代替多角色。

| UC-id | Persona | Capability | UI Entry（页/控件） | Implement Task | Priority |
|-------|---------|------------|---------------------|----------------|----------|
<!-- | UC-S1-01 | 销售专员 | 代提交维修 | admin-uniapp 工单列表 FAB「代报修」 | 1.1 | Must | -->

## Lifecycle Phases

| Phase | Kind | 拆解源 | 必须拆出的任务 |
|-------|------|--------|----------------|
| **Implement（开发任务）** | `implement` | PRD UC + Design（API/表/INV/时序） | 垂直片；每条有 UC-id + **Design refs** |
| **Verify（测试任务）** | `verify` | test-plan Critical / VS / Exit（无则 PRD UC） | 每条有 **Source**；命令可跑；对齐 `tests.md` |
| **Deploy** | `deploy` | `deployment.md` / 发布清单 | 迁移、发版、配置、回滚；无则 `Deploy: n/a — {理由}` |
| **Accept** | `accept` | Exit Criteria / PRD 交付物 | 产品验收、培训/手册等义务项 |

**不得**只写 Implement 而省略 Verify。有 test-plan 时：**禁止**只拆 Critical 主路径而丢掉 VS 穷举维。

---

## 1.0 Implement — {能力 / 子系统}

> 垂直切片：角色 + 能力；**勿**「先全后端再前端收口」。共享基建可服务多 UC，须在 Traceability Index 列清。

### 1.1 {垂直片：Persona + 能力 · 绑 UC-id}
- **Status**: ⏳ pending
- **Kind**: implement
- **Priority**: Must | Should
- **UC-id**: {UC-…；多条用逗号}
- **Persona**: {角色；无 UI 则 `n/a — API/infra`}
- **UI Entry**: {端 + 路径/菜单/FAB/文案；无则 `n/a`}
- **Design refs**: {`design.md` 锚点 — API 方法 / 表或模型 / **INV-…** / DD 小节；无设计文档则 `n/a — {理由}`}
- **Depends on**: {none | Task ID 列表，如 `1.1` 或 `1.1, 1.2` — 禁止散文}
- **Scope**: {文件/模块}
- **consume**: {前置契约}
- **produce**: {产出契约（给后续 Implement / Verify）}
- **Acceptance**: |
  - 可执行：`{命令，或「用 {Persona} 登录 → 打开 {UI Entry} → 动作」}`
  - 可验收：`{可观察结果；入口任务必须含「入口可见/可点」}`
- **Risk**: low | medium | high
- **Rollback**: {如何回滚}
- **Requirements**: {requirements.md 章节 / Story}

---

## 2.0 Verify — {Critical / VS 组}

> 从 test-plan 拆：Critical 一行 → 一条；VS 各维凡可跑者 → 条或挂靠。无 test-plan 时 Source 写 `PRD-UC-…`。  
> **禁止无源 Verify**。实现阶段由 `tdd` 维护计划 **`tests.md`**（Acceptance 命令 ↔ 台账 Command）。

### 2.1 {Critical-id 或 VS-id · 单 Persona}
- **Status**: ⏳ pending
- **Kind**: verify
- **Priority**: Must | Should
- **Source**: {`Critical-…` | `VS-{UC-id}-{维}` | `INV-…` | `Exit-…` | `PRD-UC-…` — **必填**}
- **Persona**: {单一角色 — 禁止「销售/门店」合并}
- **UI Entry**: {含 UI 则步骤从打开入口起；否则 `n/a`}
- **Depends on**: {对应 Implement Task ID（如 `1.1`）| none}
- **Ledger**: {计划 `tests.md` 行意图；未建则 `pending — 开工时创建`}
- **Acceptance**: |
  - 可执行：`{test 命令或 E2E 路径 — 勿粘贴 TC 步骤全文}`
  - 可验收：`{断言要点；含入口可见性（若 UI）}`
- **Requirements**: {test-plan 章节 / VS 小节}

---

## 3.0 Deploy — {环境}

### 3.1 {迁移 / 滚动发布 / 配置开关}
- **Status**: ⏳ pending
- **Kind**: deploy
- **Priority**: Must
- **Persona**: n/a — ops
- **UI Entry**: n/a
- **Source**: {deployment.md 章节 | `n/a — 本计划无部署`}
- **Depends on**: {相关 Must Implement + 冒烟 Verify}
- **Acceptance**: |
  - 可执行：`{runbook / 命令}`
  - 可验收：`{环境可观察结果；回滚已验证或已记录}`

---

## 4.0 Accept — {退出 / 交付}

### 4.1 {Exit Criteria 或 PRD 交付物}
- **Status**: ⏳ pending
- **Kind**: accept
- **Priority**: Must
- **Source**: {`Exit-…` | PRD §交付物}
- **Depends on**: {相关 Must Verify Task ID 列表 | none}
- **Acceptance**: |
  - 可执行：`{门禁命令或验收步骤}`
  - 可验收：`{pass 输出 / 签字条件}`

---

## Dependency Graph

> **示意 / 非权威**：下图仅帮助阅读；机器与面板以各任务 **Depends on**（Task ID）为准。

```
{Implement} → {Verify Source=Critical/VS} → {Deploy?} → {Accept?}
```

## Coverage Gate（写完自检）

- [ ] **每个 UC**（PRD）在 Traceability Index 有 Implement Must，或显式 `N/A — {理由}`
- [ ] **Entry Coverage** 每一行有对应 Implement Must（禁止 Should 顶替）
- [ ] 有 test-plan 时：**每条 Critical** → ≥1 Verify Must；**关键 UC 的 VS 维**凡可跑者有 Verify（禁止只留 Critical）
- [ ] 每个 Verify 有非空 **Source**；无源任务删掉或补源
- [ ] Design 命脉 **INV-** 有 Implement 落地 + Verify 断言（或 N/A）
- [ ] 计划维护 **`tests.md`**；Verify 命令与台账可对齐

## Must / Should 规则

- **Must**：挡归档 — Entry Coverage 全行、Traceability 中适用的 UC/Critical/VS、必要 Deploy/Accept。
- **Should**：非门禁增强。
- **禁止**：入口/Critical/VS 门禁降为 Should；「前端收口」；无源 Verify；只写 Implement 不写 Verify。
