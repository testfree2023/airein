# Deployment: Airein

> **安装与部署指南**
> 版本: v0.1.0 · License: Apache-2.0

---

## 部署模型

airein 是**纯本地、零外部依赖**的 Claude Code 增强框架。它不运行后台守护进程，而是把规则文件和 hook 脚本部署到 `~/.claude/`，由 CC 原生机制（`processMdRules` 加载 rules、settings.json 调度 hook）在会话中驱动。

```
airein 仓库（GitHub）
  │
  ▼  setup-airein.sh / update-airein.sh
~/.claude/
  ├─ rules/{00,10,20}-*.md      # L0 始终加载
  ├─ skills/*/                  # L2 按需
  ├─ scripts/{hooks,lib}/       # hook 执行体
  ├─ hooks/hooks.json           # hook 注册清单
  ├─ settings.json              # merge-hooks.sh 合并（保留第三方）
  └─ templates/                 # 文档/规则模板
```

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
bash /tmp/airein/setup-airein.sh
```

`setup-airein.sh` 是**完全自包含**的一键初始化：检测前置条件 → 合并 airein 文件到 `~/.claude/` → 注册 hooks → 跑 `verify-airein.sh` 校验。

### 方式二：已有脚本文件

```bash
bash setup-airein.sh
```

脚本用 `BASH_SOURCE` 解析自身路径，不依赖 cwd；从任意目录运行均可。

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

部署后跑回归门禁：

```bash
bash ~/.claude/scripts/update/verify-airein.sh ~/.claude
```

执行 6 项完整性检查（hooks.json 引用脚本就位 / 依赖完整 / settings.json 注册 / lib 核心模块 / L0 rules 三文件），任一失败返回非 0。详见 [test-plan.md](test-plan.md#回归门禁)。

## 更新

```bash
bash ~/.claude/update-airein.sh
```

`update-airein.sh` 是薄编排器：clone 最新版 → `clean-airein.sh`（清理废弃文件）→ `sync-airein.sh`（增量同步）→ `verify-airein.sh`。实际逻辑下沉到 `scripts/update/` 子脚本，方便独立升级。

## 卸载

```bash
bash ~/.claude/scripts/update/clean-airein.sh ~/.claude
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
bash setup-airein.sh --source <dir|tar.gz|zip> [--sha256 <hex>]   # 首次安装
bash update-airein.sh --source <dir|tar.gz|zip>                    # 升级
```

可选 sha256 校验（GitHub archive 无官方 checksum sidecar，自行计算后传入；不传则跳过校验）：

```bash
sha256sum airein-2.00.tar.gz          # Linux / Git Bash
shasum -a 256 airein-2.00.tar.gz      # macOS
bash setup-airein.sh --source airein-2.00.tar.gz --sha256 <上一步输出的 hash>
```

源目录直装（已解压或本地 `git clone` 的仓库）跳过解压，不触网、不调 git：

```bash
bash setup-airein.sh --source /path/to/airein-repo
```

## 安全声明

airein 不收集任何遥测、不联网（除用户主动 `git clone`/`update`）、不存储密钥。所有状态文件化（JSON + Markdown）于本地 `~/.claude/`。License: Apache-2.0。
