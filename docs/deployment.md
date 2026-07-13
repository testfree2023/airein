# Deployment: Airein

> **安装与部署指南**
> 版本: v0.1.0 · License: Apache-2.0

---

## 部署模型

airein 采用**三层目录**（P004），纯本地、零外部依赖，无后台守护进程：

```
airein 仓库（GitHub）
  │
  ▼  airein setup / update / uninstall
~/.airein/                          ← 内核（真相源）
  ├─ rules/{00,10,20}-*.md
  ├─ skills/*/
  ├─ scripts/{hooks,lib}/
  ├─ hooks/hooks.json
  ├─ templates/
  └─ install-profile.json           ← 已装宿主记录

宿主注册层（按 profile 写入；`install-profile.json` 含 `delivery: unified|copy`）：

| 资产 | 策略 | CC | Cursor |
|------|------|-----|--------|
| skills | `delivery` | unified=软链 / copy=拷贝 | 同左 |
| commands | `delivery` | unified=软链 / copy=拷贝 | 同左 |
| rules | **固定 deploy** | 拷贝 `rules/` + `.claude/rules/` 薄壳 → `~/.claude/rules/` | `ruleGenerate` → `.cursor/rules/*.mdc` |
| hooks | **固定 merge** | `merge-hooks` → `settings.json` | `cursor-hook-merge` → `hooks.json` |

```
  ~/.claude/   ← CC：skills/commands 按 delivery；rules deploy；hooks merge
  ~/.cursor/   ← Cursor：skills/commands 按 delivery；rules .mdc；hooks merge
```

项目数据（per-repo）：
  <项目>/.airein/                   ← canonical：config / memory / logs / self-learning
  <项目>/.claude/rules/             ← CC 项目 shim → .airein/rules（可选）
```

**用户入口**：`airein setup|update|uninstall`（根目录 `airein` bash CLI）。

**回滚锚点**：P004 合并到 main 前，远程 `origin/main` 打 tag `pre-p004-2026-07-11`。出问题可 `git checkout pre-p004-2026-07-11` 或 `airein update --source <该 tag 的 archive>`。

## 前置条件

| 依赖 | 最低版本 | 说明 |
|------|---------|------|
| Claude Code | v0.x | 唯一支持的 AI 平台（v0.x） |
| Node.js | 18+ | hook 运行时（只用内建模块，零 npm 依赖） |
| Bash | 4+ | 部署脚本（macOS 自带 / Linux / Git Bash on Windows） |
| git | 任意 | clone 仓库 |

可选：`shellcheck` / `shfmt`（编辑 `.sh` 时的静态检查与格式化，非运行时必需）。

## 安装

### 方式一：clone 后执行（推荐）

```bash
git clone git@github.com:testfree2023/airein.git /tmp/airein
cd /tmp/airein
bash ./airein setup --yes
```

`airein setup` 检测宿主、安装内核到 `~/.airein`、注册 CC/Cursor（首版）、跑 `verify --full`。非交互示例：`bash ./airein setup --hosts claude-code,cursor --yes`。

## Hook 注册机制

airein 的 hook 不直接写死在 `settings.json`，而是通过 `scripts/merge-hooks.sh` 把 `hooks/hooks.json` **合并**进全局 `~/.claude/settings.json`：

- **只替换 airein 拥有的 hook**（按 command 路径前缀识别），**保留第三方 hook**
- **自愈**：airein 拥有的 hook 被删 → 下次 session-start 自动恢复
- 格式遵循 CC 原生 settings.json hook 规范：

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Write|Edit|Bash",
      "hooks": [{
        "type": "command",
        "command": "bash \"${CLAUDE_PLUGIN_ROOT}/scripts/hooks/run-hook.sh\" \"${CLAUDE_PLUGIN_ROOT}/scripts/hooks/test-guard.js\"",
        "timeout": 5
      }]
    }]
  }
}
```

调用链：CC → `run-hook.sh` wrapper → `scripts/hooks/*.js`（适配层）→ `scripts/lib/*.js`（纯函数）。

## 配置

airein 的行为由 `quality.json` 驱动（项目级 `.claude/quality.json` 或模板 `templates/quality.json`）。关键开关：

| 配置块 | 关键项 | 作用 |
|--------|--------|------|
| `testGuard` | `mode: strict` | 无测试源码编辑 → `exit 2` 阻断 |
| `blocking` | `untestedSource / testFailure / buildFailure` | 提交门禁开关 |
| `planGate` | `mode: advisory`, `exemptPaths` | 无 approved plan 时的源码编辑门禁 |
| `planWorkflow` | `pipeline: auto`, `enforceGrilling` | plan 流水线分流 + 沟通强制 |
| `flowControl` | `perTaskReview / worktreeIsolation` | 每 task review / worktree 隔离 |
| `approvalGuard` | `mode: console-confirm` | 审批确认方式 |

## 验证

部署后跑回归门禁（**推荐一条命令验全部层**）：

```bash
bash ~/.airein/scripts/update/verify-airein.sh --full
```

`--full` 会依次检查：

| 层 | 检查对象 | 内容 |
|----|---------|------|
| ① 内核 | `~/.airein/` | hooks.json 引用脚本 / 依赖 / lib / L0 rules |
| ② CC 注册 | `~/.claude/` | skills/commands 按 delivery；rules **deploy**；settings.json hooks merge |
| ③ 宿主注册 | `~/.cursor/` 等 | install-host 产物矩阵（按 `install-profile.json`） |

`airein update` 结束后会自动跑 `--full`；手动复验用上面命令。

### 分层排查（定位失败层）

```bash
# ① 仅内核（sync 后脚本是否就位）
bash ~/.airein/scripts/update/verify-airein.sh --kernel ~/.airein

# ② 仅 CC 注册层
bash ~/.airein/scripts/update/verify-airein.sh --cc-registration \
  --home "$HOME" --kernel ~/.airein

# ③ 仅 Cursor 注册层（全局安装：targetRoot=$HOME → ~/.cursor/）
bash ~/.airein/scripts/update/verify-airein.sh --host cursor --root "$HOME"

# ③ 项目级 Cursor（targetRoot=项目根 → <项目>/.cursor/）
bash ~/.airein/scripts/update/verify-airein.sh --host cursor --root /path/to/project
```

**为何 `--kernel` 与 `--host cursor` 不同？** 前者只验内核真相源是否完整，不管 CC/Cursor 是否注册成功；后者只验 Cursor 侧 `.cursor/` 产物，不管内核是否最新。`--full` 按 profile 依次跑全部层。

详见 [test-plan.md](test-plan.md#回归门禁)。

## 项目结构迁移（P004 前老项目）

P004 前项目数据在 `<项目>/.claude/`；新标准 canonical 在 `<项目>/.airein/`（CC 另建 `.claude/rules` shim）。

在每个老项目根执行一次：

```bash
cd /path/to/your-project
node ~/.airein/scripts/migrate-project-to-airein.js --dry-run   # 预览
node ~/.airein/scripts/migrate-project-to-airein.js            # 执行
```

迁移内容：`quality.json`、`memory/`、`logs/`、`self-learning/`、`rules/` → `.airein/` 对应路径；hooks 读路径自动 fallback legacy，**新写入走 `.airein/`**。

旧包装器仍可用：`bash ~/.airein/scripts/migrate-paths.sh`（内部转发到上述脚本）。

## 更新

```bash
bash ~/.airein/airein update
# 或从仓库：bash /path/to/airein/airein update
```

`airein update` 解析源（`--source` 本地目录/archive，`--branch` 指定远程分支，或 **HTTPS git clone 到 /tmp**）→ 同步内核到 `~/.airein`（**入口脚本最后写入**）→ `clean-airein.sh` 清理废弃文件 → `verify-airein.sh --full` 回归 → 按 `install-profile.json` 重注册各宿主。

**进度输出**：update 会分步打印 `① 解析源 → ② 同步内核 → ③ clean/verify → ④ 刷新注册层`；在线 clone 使用 `git clone --progress`（GitHub 慢时可能 1–3 分钟，并非卡死）。

**P004 feat 分支真机验证**（未合并 main 前）：

```bash
# 推荐：本地仓库作源（最快、可验 2.00→2.01 升级）
bash ~/.airein/airein update --source /path/to/airein-repo

# 或在线拉 feat 分支
bash ~/.airein/airein update --branch feat/p004-unified-install-orchestrator
```

无参数运行 `airein` 或 `airein --help` 会打印用法与常见示例。

## 卸载

```bash
bash ~/.airein/airein uninstall
```

或仅清 airein 拥有的废弃文件（legacy `~/.claude` 副本）：

```bash
bash ~/.airein/scripts/update/clean-airein.sh ~/.airein
```

移除 airein 拥有的文件与 hook 注册（保留第三方配置与用户领土 `~/.claude/CLAUDE.md`、`memory/`）。

## Dashboard（可选）

轻量级项目文档与质量管理面板（纯 Node `http` + 单文件 SPA，零依赖）：

```bash
bash ~/.claude/dashboard/start.sh   # 默认 http://localhost:3456
```

端口可配。安全设计：Host/Origin 头校验（DNS rebinding + CSRF 防护）、严格 Content-Type、`exec` 去 shell 化、TTL 缓存。详见 [design.md](design.md#dashboard-架构)。

## 跨平台注意事项

| 平台 | 注意 |
|------|------|
| **macOS / Linux** | 原生 bash，直接运行 |
| **Windows** | 用 **Git Bash**（非 cmd/PowerShell）；路径用正斜杠；`mktemp`/`sed -i` 等 GNU vs BSD 差异已在脚本内处理 |
| **Node 路径** | 非 PATH 环境下脚本会探测 `~/.homebrew/bin/node`、`/opt/homebrew/bin/node`、`/usr/local/bin/node` |

## 离线安装 / 升级

GitHub 网页下载 source archive（tar.gz / zip）后本地安装（网络不畅场景，P002）：

```bash
airein setup --source <dir|tar.gz|zip> [--sha256 <hex>] [--hosts cc,cursor] --yes   # 首次安装
airein update --source <dir|tar.gz|zip> [--sha256 <hex>]                            # 升级
```

可选 sha256 校验（GitHub archive 无官方 checksum sidecar，自行计算后传入；不传则跳过校验）：

```bash
sha256sum airein-2.00.tar.gz          # Linux / Git Bash
shasum -a 256 airein-2.00.tar.gz      # macOS
airein setup --source airein-2.00.tar.gz --sha256 <上一步输出的 hash> --yes
```

源目录直装（已解压或本地 `git clone` 的仓库）跳过解压，不触网、不调 git：

```bash
airein setup --source /path/to/airein-repo --yes
```

## Dogfooding 工作流（开发源 → 运行安装）

airein **开发仓库**与**全局安装副本**（`~/.claude/` 或 Cursor 的 `install-host` 内核路径）分离。改 `scripts/lib/` 或 `scripts/hooks/` 后，运行中的 session **不会**自动拾取源码变更，需显式同步：

### Claude Code（`~/.claude/`）

```bash
# 在 airein 源码根目录
bash scripts/update/sync-airein.sh "$(pwd)" "$HOME/.claude" "$(pwd)"
bash scripts/merge-hooks.sh "$HOME/.claude" "$(pwd)"   # 若 hooks.json 有变
bash scripts/update/verify-airein.sh "$HOME/.claude"
```

或整包升级：`airein update --source <airein-repo-dir>`

### Cursor / 多宿主（内核在 airein 仓库，注册表在 `~/.cursor/` 等）

hook 脚本从 **airein 仓库绝对路径**加载（`install-host` 注入）。开发时直接在源码仓库改 hook/lib 即可生效；若改了 K1–K4 **分发产物**（rules/skills/commands 模板），需重跑：

```bash
node scripts/install-host.js install --host cursor --root "$HOME"
```

### Hook 自身流程覆盖

在 airein 仓库内改 hook 时，用本仓库 `test/test-*.js` 与 `docs/test-plan.md` 行为清单做回归；发现路径豁免缺口（如 `doc-file-warning`）应补对应用例。

### Hook 耗时可观测

`run-with-flags.js` 为每次 hook 写 `durationMs` 到 `<project>/.claude/logs/airein-*.log`（`quality.json` → `aireinLog.slowHookMs`，默认 2000ms 以上记 `warn`）。

## 安全声明

airein 不收集任何遥测、不联网（除用户主动 `git clone`/`update`）、不存储密钥。所有状态文件化（JSON + Markdown）于本地 `~/.claude/`。License: Apache-2.0。
