<!-- TEMPLATE: bash.md — Bash 工程规范模板 -->
<!-- 用途：l-feature / l-bugfix 的 design-conventions 子文档，或 P018 conventions-{scope}.md 的内容来源 -->
<!-- 位置：docs/plans/P{NNN}-{slug}/design-conventions.md（开发期）→ 归档后 docs/conventions-bash.md -->
<!-- AI 生成指引：基于 POSIX/bash 社区最佳实践和团队约定填写，删除不适用规则 -->
# Design: 工程规范 (Bash)
> 子文档 of [design.md](design.md) | 本文档定义 Bash/Shell 脚本项目的代码与工程规范
<!-- AI 生成指引：替换 {project_name}、{bash_version}、{shellcheck_version}，并删除不适用规则。 -->

## 1. 命名约定 (Naming)
| 对象 | 约定 | 示例 | 禁止 |
|---|---|---|---|
| 脚本文件 | kebab-case | `sync-airein.sh`, `run-hook.sh` | `syncAirein.sh`, `sync_airein.sh` |
| 函数 | snake_case | `check_hooks`, `parse_args` | `checkHooks`, `CheckHooks` |
| 局部变量 | snake_case | `hook_count`, `install_dir` | `hookCount` |
| 全局/常量 | UPPER_SNAKE_CASE | `EXPECTED_HOOKS`, `MAX_RETRY` | `expectedHooks` |
| 环境变量 | UPPER_SNAKE_CASE | `CLAUDE_PLUGIN_ROOT` | `claudePluginRoot` |
**规则**：函数用动词开头（`check_`, `parse_`, `sync_`）；布尔用 `is_`/`has_`（`is_verbose`）；避免 `tmp`, `data`, `x` 等无语义名。

## 2. 代码风格 (Code Style)
Formatter: `shfmt -i 2 -ci`（2 空格缩进，switch-case 缩进）。Linter: `shellcheck`（必须 0 警告，`#!/usr/bin/env bash` shebang）。
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
{project_name}/
├─ scripts/
│  ├─ hooks/        # Claude Code / git hook 脚本
│  ├─ lib/          # 可复用 bash 库（被 source）
│  ├─ update/       # 同步/清理/打包脚本
│  └─ <task>.sh     # 顶层任务入口
├─ test/            # bats 测试或 node 驱动的 bash 测试
└─ verify-airein.sh
```
<!-- AI 生成指引：按项目实际调整；库文件放 lib/ 供多脚本 source，入口脚本放顶层。 -->

## 4. source / 导入规范 (Sourcing)
顺序：bash 配置（`set -euo pipefail`）→ 第三方库 → 项目 lib → 常量定义；用绝对路径或 `dirname` 解析。
```bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/utils.sh
source "$SCRIPT_DIR/lib/utils.sh"
```
禁止：依赖未 source 的函数；`source` 相对路径不解析 `BASH_SOURCE`；循环 source。

## 5. 错误处理 (Error Handling)
`set -euo pipefail` 默认开启；显式 exit code；`trap` 清理资源。
```bash
set -euo pipefail

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
规则：管道用 `pipefail` 捕获中段失败；外部命令检查 `$?`；trap 里读 `$?` 保留真实退出码。

## 6. 日志规范 (Logging)
日志走 stderr（`>&2`），stdout 只留机器可解析的数据输出。
```bash
log_info()  { echo "ℹ️  $*" >&2; }
log_warn()  { echo "⚠️  $*" >&2; }
log_error() { echo "❌ $*" >&2; }
log_ok()    { echo "✅ $*" >&2; }
```
级别：info 进度，warn 可恢复异常，error 失败（通常后接 exit），ok 成功。
永不输出：密钥、token、完整敏感配置；verbose 模式用 `is_verbose` 守卫。

## 7. 测试规范 (Testing)
框架：bats（纯 bash 逻辑）或 node 驱动调用 bash（跨语言项目）；关键脚本必须有冒烟测试。
```bash
# test/sync-airein.bats
@test "sync copies hook scripts to target" {
  run bash "$BATS_TEST_DIRNAME/../scripts/update/sync-airein.sh" "$tmp_dir"
  [ "$status" -eq 0 ]
  [ -f "$tmp_dir/hooks/hooks.json" ]
}
```
规则：`.sh` 纯脚本可豁免单测（靠 verify 回归），但含逻辑分支（解析/计算/条件）的必须有测试；bugfix 先写复现测试；测试不依赖外部网络。

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
- 分支：`feature/{ticket}-{slug}`, `bugfix/{ticket}-{slug}`, `chore/{slug}`。
- Commit：Conventional Commits，如 `fix: quote hook path in sync script`。
- PR：背景、方案、shellcheck 结果、测试方式、回滚方式。

## 10. Code Review checklist
- `shellcheck` 0 警告？变量都加双引号？
- `set -euo pipefail` 开启？`trap` 清理临时资源？
- 管道用 `pipefail`？`rm -rf` 路径变量是否可能为空？
- exit code 正确传递？stderr/stdout 分离？

## 11. 性能规范 (Performance)
避免：循环里启动子进程（`$(cmd)` in loop）、`cat file | grep`（用 `grep file`）、无界数组累积、重复 `cd`。
```bash
# DON'T: 每行 fork grep
while read -r line; do echo "$line" | grep -q x; done < file

# DO: 单次 grep
grep x file
```
工具：`time`, `bash -x` 调试；优先 bash 内建（`[[ ]]`, `${var%/*}`, 参数扩展）免 fork。

## 12. 依赖管理 (Dependencies)
- 运行时依赖明确声明（bash 版本、coreutils、外部工具），文档化最低版本。
- 不引入冷门/无人维护工具；跨平台注意 GNU vs BSD 差异（`sed -i`, `date`）。
- 优先 POSIX 子集提高可移植性；必须 bashism 时锁定 shebang 为 `bash` 非 `sh`。
