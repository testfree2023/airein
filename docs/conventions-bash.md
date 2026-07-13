# Conventions: Bash/Shell (airein)

> airein 项目的 Bash/Shell 工程规范。编辑任意 `.sh`（根目录 `airein`、`scripts/update/*.sh`、
> `scripts/hooks/run-hook.sh` 等）时由 CC 原生条件规则（`.claude/rules/conventions-bash.md`
> 薄壳）自动注入。`docs/` 是单一真相源；薄壳只是指针。

## 1. 命名约定 (Naming)

| 对象 | 约定 | 示例 | 禁止 |
|---|---|---|---|
| 脚本文件 | kebab-case | `sync-airein.sh`, `run-hook.sh` | `syncAirein.sh`, `sync_airein.sh` |
| 函数 | snake_case | `check_hooks`, `parse_args` | `checkHooks`, `CheckHooks` |
| 局部变量 | snake_case | `hook_count`, `install_dir` | `hookCount` |
| 全局/常量 | UPPER_SNAKE_CASE | `EXPECTED_HOOKS`, `CLAUDE_PLUGIN_ROOT` | `expectedHooks` |
| 环境变量 | UPPER_SNAKE_CASE | `CLAUDE_PLUGIN_ROOT` | `claudePluginRoot` |

**规则**：函数用动词开头（`check_`/`parse_`/`sync_`/`install_`）；布尔用 `is_`/`has_`（`is_verbose`）；避免 `tmp`/`data`/`x` 等无语义名。

## 2. 代码风格 (Code Style)

Formatter: `shfmt -i 2 -ci`（2 空格缩进、switch-case 缩进）。Linter: `shellcheck`（必须 0 警告，shebang 统一 `#!/usr/bin/env bash`）。

```bash
#!/usr/bin/env bash
set -euo pipefail

# 2 空格缩进，长命令换行用 \ 对齐
install_hook() {
  local src="$1"
  local dest="$2"
  cp "$src" "$dest" \
    && chmod +x "$dest"
}
```

| DO | DON'T |
|---|---|
| 变量始终加双引号 `"$var"` | 裸 `$var`（词分割/glob 漏洞） |
| `[[ ]]` 做条件测试 | `[ ]` 或 `test`（POSIX 兼容时除外） |
| `local` 声明函数内变量 | 函数内用全局变量 |
| 2 空格缩进、行尾无空格 | Tab 缩进、`&&` 链超过 3 级 |

## 3. 目录结构 (Directory Layout)

```text
airein/
├─ airein              # 统一安装入口（setup / update / uninstall）
├─ scripts/
│  ├─ hooks/        # run-hook.sh（CC hook 调度入口）+ 被 hooks.json 引用
│  ├─ lib/          # bash 库（被 source；多数逻辑在 lib/*.js）
│  └─ update/       # sync-airein.sh / clean-airein.sh / verify-airein.sh
```

**约定**：库函数放 `lib/` 供多脚本 source；顶层 `airein` 只做编排，复杂逻辑下沉到 `scripts/lib/*.js`。

## 4. source / 导入规范 (Sourcing)

顺序：bash 配置（`set -euo pipefail`）→ 第三方库 → 项目 lib → 常量定义；用 `BASH_SOURCE` 解析自身路径，不依赖 cwd。

```bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/utils.sh
source "$SCRIPT_DIR/lib/utils.sh"

: "${CLAUDE_PLUGIN_ROOT:?CLAUDE_PLUGIN_ROOT must be set}"
```

**规则**：跨平台用 `"$CLAUDE_PLUGIN_ROOT"/scripts/...` 绝对路径（不依赖相对 cwd）；关键环境变量用 `${VAR:?msg}` 显式校验存在。

## 5. 错误处理 (Error Handling)

`set -euo pipefail` 默认开启（未定义变量即错、管道中段失败即失败、命令失败即退出）；显式 exit code；`trap` 清理临时资源。

```bash
set -euo pipefail

TMP_FILE="$(mktemp)"
cleanup() {
  local exit_code=$?
  rm -f "$TMP_FILE" 2>/dev/null || true
  exit "$exit_code"
}
trap cleanup EXIT ERR

fail() {
  echo "❌ $*" >&2
  exit 1
}

# 显式检查关键前置条件
[ -f "$CONFIG" ] || fail "config not found: $CONFIG"
```

| DO | DON'T |
|---|---|
| `set -euo pipefail` 在脚本头 | 无 `set`，错误静默继续 |
| `trap ... EXIT` 清理临时文件 | 临时文件遗留 `/tmp` |
| `|| fail "msg"` 显式退出码 | `|| true` 吞掉所有错误 |

**规则**：管道用 `pipefail` 捕获中段失败；外部命令检查 `$?`；trap 里先读 `$?` 保留真实退出码再清理。

## 6. 日志规范 (Logging)

日志走 **stderr**（`>&2`），stdout 只留机器可解析的数据输出（或留给 CC hook 协议）。

```bash
log_info()  { echo "ℹ️  $*" >&2; }
log_warn()  { echo "⚠️  $*" >&2; }
log_error() { echo "❌ $*" >&2; }
log_ok()    { echo "✅ $*" >&2; }
```

级别：info 进度，warn 可恢复异常，error 失败（通常后接 exit），ok 成功。**永不输出**：密钥、token、完整敏感配置；verbose 模式用 `is_verbose` 守卫。

## 7. 测试规范 (Testing)

`.sh` 纯编排脚本**豁免单测**（靠 `verify-airein.sh` 回归 + 人工验证）；含逻辑分支（解析/计算/条件）的脚本必须有冒烟测试（bats 或 node 驱动调用）。`verify-airein.sh` 是部署后回归门禁：校验 hooks.json 引用的脚本就位、依赖完整、lib/ 与 L0 rules 通过。

**规则**：bugfix 先写复现测试；测试不依赖外部网络。

## 8. 注释与文档 (Comments & Docs)

公共函数写注释（参数/返回/退出码）；脚本头写用途 + 用法；shebang 统一 `#!/usr/bin/env bash`。

```bash
#!/usr/bin/env bash
# sync-airein.sh — Copy airein files to install target
# Usage: sync-airein.sh <install_dir>

# Install a single hook with mode bits.
# Args: $1=src $2=dest
# Returns: 0 on success, 1 on copy failure
install_hook() { ... }
```

`# shellcheck source=...` 标注 source 目标助静态分析；README 含安装、运行、环境变量表。

## 9. Git 规范

- 分支：`feature/{ticket}-{slug}` / `bugfix/{ticket}-{slug}` / `chore/{slug}`。
- Commit：Conventional Commits，如 `fix: quote hook path in sync script`、`chore: sync templates`。
- PR：背景、方案、shellcheck 结果、测试方式、回滚方式。

## 10. Code Review checklist

- `shellcheck` 0 警告？变量都加双引号？
- `set -euo pipefail` 开启？`trap` 清理临时资源？
- 管道用 `pipefail`？`rm -rf` 路径变量是否可能为空？
- exit code 正确传递？stderr/stdout 分离（hook 协议不被日志污染）？

## 11. 性能规范 (Performance)

避免：循环里启动子进程（`$(cmd)` in loop）、`cat file | grep`（用 `grep file`）、无界数组累积、重复 `cd`。

```bash
# DON'T: 每行 fork grep
while read -r line; do echo "$line" | grep -q x; done < file

# DO: 单次 grep
grep x file
```

工具：`time`、`bash -x` 调试；优先 bash 内建（`[[ ]]`、`${var%/*}`、参数扩展）免 fork。

## 12. 依赖管理 (Dependencies)

- 运行时依赖明确声明（bash 版本、coreutils、`node`、`shellcheck`/`shfmt` 可选），文档化最低版本。
- 不引入冷门/无人维护工具；跨平台注意 GNU vs BSD 差异（`sed -i`、`date`）。
- 优先 POSIX 子集提高可移植性；必须 bashism（`[[ ]]`、关联数组）时锁定 shebang 为 `bash` 非 `sh`。
