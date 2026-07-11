# 多宿主安装指南（v0.2 预览 · P001-cross-platform）

> airein 从 Claude Code 单宿主扩展到 **4 宿主**：Cursor（CUR）/ Codex（CDX）/ CodeBuddy（CB）/ OpenCode（OC）。
> CC 仍是**基准宿主**（走既有 `setup-airein.sh` → `~/.claude/`）；本文档是 v0.2 多宿主分发入口
> `scripts/install-host.js` 的使用指南。架构与产物契约详见 [deployment.md](plans/P001-cross-platform/deployment.md)；
> 事件映射与阻断机制详见 [design.md §6](plans/P001-cross-platform/design.md)。

## 核心保证

- **CC 物理隔离**：4 宿主的 install / uninstall / verify 全程**不读写 `~/.claude/`**（CC 领地）。在已装 airein 的 CC 环境叠加多宿主，CC 的 `settings.json` / hooks / memory 原样保留（`test/test-cc-no-impact.js` 锁定）。
- **单一真相源**：K1 skills（`SKILL.md`）逐字节等价 CC 副本；K2 rules 由 `rules/` + `docs/` 生成；K3 hook 注册由 `hooks/hooks.json` 翻译；**K4 commands** 由 `commands/*.md` 原样拷贝（P003）。
- **幂等可重入**：同宿主重复 install 产物 hash 不变；install 中途失败回滚已写文件（`deployment §8`）。

## 通用命令

```bash
node scripts/install-host.js <install|plan|uninstall|verify> \
  --host <cursor|codex|codebuddy|opencode> \
  [--root <dir>]      # 安装根，默认项目根的父目录
  [--platform <windows|macos|linux>]  # 默认按 process.platform
```

| 子命令 | 用途 |
|---|---|
| `install` | 部署该宿主的 K1 skills + K2 rules + K3 hook 注册 + **K4 commands** + 归一化入口引用 |
| `plan` | 等价 `install --dry-run`，仅打印产物清单，不写盘 |
| `verify` | 自检产物完整性（manifest hash 校验 + 归一化入口存在） |
| `uninstall` | 按 install-manifest + hash 校验清理（hash 不匹配报错中止，保护用户改动） |

每次 install 在 `<root>/.airein-install-state.json` 写一份 manifest（轻量 JSON，记录已部署文件 + hash）。

## 各宿主前置条件与产物

### Cursor（CUR）

- **前置**：macOS/Linux 标准 bash；**Windows 必须 PowerShell profile**（🚫 不支持 Git Bash profile，致命兼容问题）。install 在 Windows 时打印前置说明，不做特殊 launcher。
- **install**：`node scripts/install-host.js install --host cursor --platform windows`
- **产物**（落 `<root>/.cursor/`）：
  - K1 `skills/<name>/SKILL.md`
  - K2 `rules/*.mdc`（L0 `alwaysApply:true`；L1 `alwaysApply:false` + `globs`，`@include` 内联展开）
  - K3 `hooks.json`（事件名 camelCase：`preToolUse` / `sessionStart` / …；command 引用 `$CURSOR_PROJECT_DIR/scripts/hooks/host/cursor.js`）
  - **K4** `commands/*.md`（16 个 slash command，如 `tdd.md` → `/tdd`）
- **阻断机制**：PreToolUse `exit 2` → cursor.js 映射为 stdout `{permission:"deny"}`（CUR 原生协议）。

### Codex（CDX）

- **前置**：首次需在 Codex `/hooks` 审核 hook（hash 信任机制）。无项目根 env，靠 stdin cwd（归一化入口处理）。
- **install**：`node scripts/install-host.js install --host codex`
- **产物**：
  - K1 `.agents/skills/<name>/SKILL.md`（**复数 `.agents`**，CDX 约定）
  - K2 `AGENTS.md`（L0 内联；L1 降级标注「hook 注入」，32KiB 上限）
  - K3 `.codex/config.toml`（Windows 额外 `command_windows` 字段；command 引用 `$PLUGIN_ROOT/scripts/hooks/host/codex.js`）
  - K4 🚫 **N/A**（Codex `~/.codex/prompts/` 已 deprecated + bug #15941；install 时 errors 报 N/A，不部署）
- **阻断机制**：PreToolUse `exit 2` → codex.js 映射为 stdout `{permissionDecision:"deny"}`（CDX 原生协议）。

### CodeBuddy（CB）

- **前置**：CB 自身强制 Git Bash（Windows 天然兼容，无需特殊处理）。`CLAUDE_PLUGIN_ROOT` 别名原生识别。
- **install**：`node scripts/install-host.js install --host codebuddy`
- **产物**（落 `<root>/`）：
  - K1 `.codebuddy/skills/<name>/SKILL.md`
  - K2 `CODEBUDDY.md`（根） + `.codebuddy/rules/{00,10,20,30}-*.md` + `.codebuddy/rules/conventions-*.md`（薄壳 `paths` + `@include` 保留）
  - K3 `.codebuddy/settings.json`（schema 同 CC，command 引用 `$CODEBUDDY_PLUGIN_ROOT/scripts/hooks/host/codebuddy.js`）
  - **K4** `.codebuddy/commands/*.md`
- **阻断机制**：CB 原生识别 `exit 2` 并透传，**零阻断映射**（codebuddy.js 恒等归一化，直接 exit 2）。

### OpenCode（OC）

- **前置**：OpenCode 支持 TS 插件 + 本机 Node（bridge spawn airein `.js` hook 用）。
- **install**：`node scripts/install-host.js install --host opencode`
- **产物**（落 `<root>/`）：
  - K1 **零放置**（OC 原生搜 `.claude/skills/`，不复制）
  - K2 `AGENTS.md`（L1 降级 `instructions` 数组）
  - K3 `opencode.json`（注册 plugin `.opencode/plugin/airein-bridge.ts`） + `.opencode/plugin/airein-bridge.ts`（install 时从仓库 `opencode/bridge.ts` 复制 + 注入 `AIREIN_ROOT` 正斜杠绝对路径）
  - **K4** `commands/*.md`（项目根 `commands/`，OC 官方 docs/commands/）
- **阻断机制**：bridge.ts 注册 `tool.execute.before` → spawn airein PreToolUse hook → `exit 2` → `throw Error(stderr)` 阻断 OC 工具执行。
- **🚫 N/A 事件**：OC 事件集无 `session.idle`（Stop）/ UserPromptSubmit 对应项——物理不可达，install 时报错标注 N/A，不注册悬空 hook（design §6.3）。

## verify（部署后回归门禁）

两种 verify 互补：

```bash
# ① install-host.js 自带 verify（manifest hash 校验 + 归一化入口存在）
node scripts/install-host.js verify --host cursor --root <dir>

# ② verify-airein.sh --host（产物矩阵结构校验，deployment §6.2 回归门禁）
bash scripts/update/verify-airein.sh --host cursor --root <dir>
```

- ① 做**内容性校验**（每文件 hash == install 时 hash，防漂移）。
- ② 做**结构性校验**（§3 产物矩阵各路径就位 + install-manifest 存在 + 归一化入口在仓库内），独立于 node install-host.js，bash 回归门禁。

## uninstall

```bash
node scripts/install-host.js uninstall --host <X> --root <dir>
```

- 按 install-manifest 记录的文件列表清理，**仅删 state 记录的文件**（不碰用户其他文件）。
- 删除前校验目标文件 hash == install 时记录（防误删用户改动过的文件；hash 不匹配 → 报错中止，提示人工确认）。
- 清理 airein 创建的空目录外壳（`rmdirSync` 仅删空目录，含用户文件的目录保留）。

## 阻断机制映射表（design §6.2）

| 宿主 | PreToolUse 阻断载体 | 归一化入口 |
|---|---|---|
| CUR | stdout `{permission:"deny"}` | `scripts/hooks/host/cursor.js` |
| CDX | stdout `{permissionDecision:"deny"}` | `scripts/hooks/host/codex.js` |
| CB | `exit 2` 原生透传（零映射） | `scripts/hooks/host/codebuddy.js` |
| OC | `throw Error(stderr)` | `opencode/bridge.ts`（TS 插件，OC 独轨） |

## 事件可达性矩阵（design §6.3）

| CC 事件 | CUR | CDX | CB | OC |
|---|---|---|---|---|
| PreToolUse | ✅ `preToolUse` | ✅ `PreToolUse` | ✅ `PreToolUse` | ✅ `tool.execute.before` |
| PostToolUse | ✅ | ✅ | ✅ | ✅ `tool.execute.after` |
| SessionStart | ✅ | ✅ | ✅ | ✅ `session.created` |
| PreCompact | ✅ | ✅ | ✅ | ✅ `experimental.session.compacting` |
| Stop | ✅ | ✅ | ✅ | 🚫 N/A（`session.idle` 不可达） |
| UserPromptSubmit | ✅ | ✅ | ✅ | 🚫 N/A |

OC 两项 N/A 是物理限制（OC 事件集无对应项），诚实标注，不静默注册悬空 hook。

## 故障排查

- **install 报「refuse to write under .claude/」**：路径白名单硬约束触发——install 永不写 `~/.claude/`。检查 `--root` 是否误指向 CC 领地。
- **uninstall 报「hash mismatch」**：install 后文件被改动（用户手改 / 其他工具改）。manifest 记录的是 install 时 hash；若有意保留改动，手动删该文件后再 uninstall，或手动删 manifest。
- **verify 报「缺 install-manifest」**：先 `install`。manifest = `<root>/.airein-install-state.json`。
- **CDX Windows hook 不触发**：确认 `.codex/config.toml` 含 `command_windows` 字段（install `--platform windows` 时生成）。
- **OC bridge 不生效**：确认 `opencode.json` 注册了 `.opencode/plugin/airein-bridge.ts` + bridge.ts 内 `AIREIN_ROOT` 已注入（非 `__AIREIN_ROOT__` 占位符）。

## Status: draft（v0.2 预览）

P001-cross-platform 是 v0.2 特性（airein v0.1.0 已发布）。本指南随实现同步；4 宿主真机冒烟为人工/CI 集成验证项（test-plan §6），不阻塞本地 `bash test/run-all.sh` 全绿。
