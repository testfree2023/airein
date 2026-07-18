---
name: tdd
description: Spec-bound TDD for AI agents — bind acceptance tests, implement in vertical slices, prove GREEN, and maintain the plan tests ledger. Use when implementing features, fixing bugs, or refactoring.
---

# TDD（规格绑定 · Agent 向）

Airein 自有 skill。对人的「先写 RED 再写代码」仪式对 Agent 约束弱；这里要求的是 **验收绑定 + 实测绿灯 + 计划可追溯**。

**Announce at start:** "I'm using the tdd skill for spec-bound implementation."

## 测试资产分层（防负债）

| 层级 | 路径 | 职责 |
|------|------|------|
| 策略（项目） | `docs/test-plan.md` | 怎么测：金字塔、框架、命令、门禁 |
| 台账（计划） | `docs/plans/P{NNN}-{slug}/tests.md` | 本 plan：Req/Task ↔ 文件 ↔ 命令 ↔ 状态 |
| 真相 | 仓库测试代码（如 `test/**`） | 可执行用例本身 |

**规则：** Markdown 不是用例第二正文（一行台账 = 意图一句话 + 路径 + 命令）。改/删测试代码时**同轮**更新台账。项目 `test-plan.md` 只保留稀疏 Critical 验收索引，禁止全库用例百科。

活跃 plan 若无 `tests.md`，从 `~/.airein/templates/docs/tests.md`（或仓库 `templates/docs/tests.md`）创建后再开工。

## Core Principles

### 1. Spec-bound tests（绑定验收）
无绑定验收测试不得写生产代码。测试必须能对应 requirements / task **Acceptance** 中的行为点。

### 1.5. Vertical Slicing ONLY

> **WRONG — Horizontal**：写完全部测试 → 再写全部实现  
> **CORRECT — Vertical**：一个行为片：Spec → Bind → Impl → Prove → Trace

**Hard rule:** 已有失败测试时，优先让测试变绿；不要在红灯上并行开新功能切片。

### 2. Prove before claim
覆盖率目标 ≥ 80%（单元 + 集成 + E2E，按项目策略）。口头 "should work" 无效——见 `rules/20-workflow.md`「Verification Before Completion」。

## Common Rationalizations — Anti-Skip Enforcement

| AI 可能说的 | 真相 |
|------------|------|
| "这个改动太小不需要测试" | 简单代码也会出错。绑定一个行为点即可。 |
| "我先写代码再补测试" | 无绑定验收 = 确认偏误，不是验证。 |
| "手动测过了" | 手动测试不可重复、无台账、钩子看不见。 |
| "这个只是重构" | 重构必须用测试证明行为不变。 |
| "测试太难写" | 难测试 = 设计有问题，听测试的信号。 |
| "TDD 会拖慢进度" | 无绿灯的进度是幻觉；返工更贵。 |
| "先跑通再说" | 跑通 ≠ 验收满足；边界与错误路径呢？ |
| "这个逻辑很简单，一眼就能看对" | Bug 永远藏在"简单"里。 |

**Red Flags — 遇到以下情况必须停下来纠正：**
- 生产代码已落地，却没有任何绑定该行为的测试
- 宣称完成但未运行验证命令（或忽略失败）
- 用 "just this once" 为跳过测试/台账辩护
- 说 "测试的精神比形式重要" 而不写可执行用例
- 台账与真实测试文件脱节（改了代码不改 `tests.md`）

**Iron Law: 无绑定验收测试 = 无生产代码。无绿灯证据 = 不得宣称完成。跳过绑定再补测 = 删掉重来。**

## 每 Task 流程（规格绑定）

1. **Spec** — 从 `requirements.md` / task **Acceptance** 抽出本片行为点（可勾选）
2. **Bind** — 落地可执行测试；**不强制**先跑出 RED（Agent 可同轮写好断言与骨架）
3. **Impl** — 最小实现使行为成立
4. **Prove** — 跑项目测试命令至 GREEN（完整输出；不接受「上次跑过」）
5. **Trace** — 更新计划 `tests.md`（新增/改状态；删测试则删行）
6. **Refactor** — 仅在绿灯下整理结构
7. **Coverage** — 按项目 `docs/test-plan.md` / quality 目标自检缺口
7.5. **Per-Task Code Review**（仅当 `quality.json` → `flowControl.perTaskReview` 为 `true`）:
   - Dispatch `code-reviewer`（changed files only）
   - CRITICAL/HIGH → 立刻修；MEDIUM/LOW → 记下稍后处理
   - Default（关闭时）：实现阶段结束后再 `/code-review`

### Bugfix / 回归例外

必须：**可失败复现测试优先（RED）→ 再修实现 → GREEN**。复现测试失败原因必须是目标缺陷，不是脚手架错误。

## 台账行（Trace）示例

| Req | Task | Behavior | Test | Command | Status |
|-----|------|----------|------|---------|--------|
| R1 | 1.2 | resolve s-tier template | `test/test-foo.js` | `node test/test-foo.js` | pass |

模式参考：[REFERENCE.md](REFERENCE.md)（Node 内建 + 本仓 `test/test-*.js` 风格）。

## 终止状态

本 skill 周期结束（相关测试 GREEN + 台账已更新）后，唯一允许的下一步：

- **调用 `code-reviewer` agent**（dispatch 规范见 `rules/20-workflow.md`：model 用 haiku；prompt 只写「审查当前 git diff 的变更」，**不粘贴 diff**）
- 若 `flowControl.perTaskReview === true` → 每 task 完成后立即审查

### 归档提示 + CHANGELOG

当 `progress.md` 中 `completed === total` 时：

1. 若将 `status` 标为 `completed`：检查根目录 `CHANGELOG.md` 的 `## [Unreleased]` 是否已有本 plan 的 `### {planId}` 条目；**没有则先写入**用户向摘要（3–8 条 bullet；禁止堆路径 / commit list）。`CHANGELOG.md` 为根目录白名单文件。
2. 提示用户执行 `/archive-plan`（归档时必润色/确认同一条目，不重复写两条）。

归档**不把** `tests.md` 整表倒入项目文档；只合并策略变更与仍有效的 Critical 索引（见 archive-plan）。

禁止：绿灯未证明就 commit / 跳过 code review。  
禁止：做完实现却不更新 `tests.md`。  
禁止：plan 已 completed 却无对应 `CHANGELOG.md` 条目。
