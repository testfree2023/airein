# Changelog

面向**使用者 / 升级者**的发布说明（Keep a Changelog 风格）。
开发过程流（grill、决策、plan 启停）见 [`docs/roadmap.md`](docs/roadmap.md) → **Recent Changes**。

格式：
- 按 `VERSION` 与 **Git tag** 分节（tag = 可检出的发布/回滚锚点）。最新在上。
- 节内按 **plan id** 小标题。
- 发版或打检查点 tag 时：**必须**在下方 Tags 表登记，并在正文有对应节（或注明落入哪一节）。
- Plan 完成（`status: completed`）时写入 `[Unreleased]`；`/archive-plan` 时必写或润色，同一 plan 不重复两条。

## Tags（发布 / 回滚锚点）

| Tag | 日期 | 含义 |
|-----|------|------|
| [`2026-07-18`](https://github.com/testfree2023/airein/releases/tag/2026-07-18) | 2026-07-18 | 检查点：合并 P006/P007 前的 `main`（`63dfd08`，含 VERSION 2.03–2.05） |
| [`2026-07-13`](https://github.com/testfree2023/airein/releases/tag/2026-07-13) | 2026-07-13 | **Release**：P004 统一安装编排（`airein setup/update`、内核 `.airein`、Dashboard） |
| [`pre-p004-2026-07-11`](https://github.com/testfree2023/airein/releases/tag/pre-p004-2026-07-11) | 2026-07-11 | **回滚锚点**：P004 合入前的稳定 `main`（已含 P001–P003） |

回滚示例：`git checkout pre-p004-2026-07-11` 后 `airein update --source <该 tag 的 archive>`（详见 deployment）。

## [Unreleased]

相对 tag **`2026-07-18`** 之后、尚未打进下一 VERSION / tag 的变更。

### P007-task-pickup-progress-sync (2026-07-18)

- 空档时自动把下一 ready 任务标为 `in_progress`（progress-sync + session-start）
- Progress 面板高亮当前任务；可配置 `taskPickup.onBlocked`
- `progress.md` 的 Stats / Active Task 与 `tasks.md` 同源同步

### P006-dashboard-progress-panel (2026-07-17)

- Dashboard Progress：**面板 / 文本**双 Tab，按 `tasks.md` 契约展示任务与状态
- 依赖关系用 Mermaid DAG 可视化（首屏即渲染；忽略 `Depends on` 注解里的幽灵 ID）
- 旧任务模板给出明确「暂不支持」提示，避免假进度图

## [2.05] - 2026-07-15

含于 tag **`2026-07-18`** 检查点（该 tag 无单独 2.05 date-tag）。

### Design / test-plan 分档 + Win32 hooks

- design / test-plan 按 pipeline 分档（s/m/l）；`m-feature` 流水线纳入 test-plan
- Windows 上 Claude Code hooks 优先 `node` 直调，减轻 WSL bash 泄漏
- Dashboard Markdown 预览支持 Mermaid；TDD skill 内核对齐

## [2.04] - 2026-07-15

含于 tag **`2026-07-18`** 检查点。

### TDD skill kernel

- 以 airein `skills/tdd`（规格绑定）作为默认 TDD 路径
- SessionStart / hook 注册在 Win32 上更稳健

## [2.03] - 2026-07-15

含于 tag **`2026-07-18`** 检查点。

### P005-requirements-prd-templates

- Requirements 按 pipeline 提供 s/m/l **产品需求说明书**模板
- Dashboard 模板分类修正（项目文档 vs 计划文档）
- new-plan / 工作流明确：计划内 requirements = PRD，禁止写成简易需求摘要

## tag `2026-07-13` — Release（P004）

Git tag **`2026-07-13`** @ `1525b56`。安装/升级见 [docs/install-hosts.md](docs/install-hosts.md)、[docs/deployment.md](docs/deployment.md)。

### P004-unified-install-orchestrator

- 统一入口：`airein setup` / `update` / `uninstall`（内核 `~/.airein` + 按 profile 注册宿主）
- 一条命令覆盖 Claude Code 与 Cursor 等已登记宿主，不再分记两套安装脚本
- Dashboard 随内核同步安装/更新

## tag `pre-p004-2026-07-11` — 回滚锚点（P001–P003）

Git tag **`pre-p004-2026-07-11`** @ `2931be3`：P004 之前可回滚的稳定面。

### P003-multi-host-commands

- 16 个 slash commands（如 `/tdd`、`/plan`）部署到 Cursor / CodeBuddy / OpenCode
- 与 skills/hooks 同一分发链；Codex 因平台限制标为 N/A
- 修复跨项目误写审批/日志的 `getProjectDir` 缓存问题

### P002-local-source-install

- 支持 `airein setup|update --source <dir|tar.gz|zip>`（网络不畅时用本地包升级）
- 根目录 `VERSION` 守卫：拒绝静默降级；同版可修复重装
- 废弃不可靠的 pack/unpack 手抄包流程

### P001-cross-platform

- 同一 airein 内核可装到 **Cursor / Codex / CodeBuddy / OpenCode**（skills / rules / hooks）
- `install-host` 分发 + `verify-airein --host` 校验；Claude Code 配置与其它宿主物理隔离
- Windows/Cursor 上 hook 入口改为可靠的 `node` 路径，避免 bash 误启导致 fail-open
