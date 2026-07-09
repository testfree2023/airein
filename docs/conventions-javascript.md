# Conventions: JavaScript (airein)

> airein 项目的 JavaScript 工程规范。编辑 `scripts/**/*.js` 或 `test/**/*.js` 时由 CC
> 原生条件规则（`.claude/rules/conventions-javascript.md` 薄壳）自动注入。`docs/` 是
> 单一真相源；薄壳只是指针。

## 1. 命名约定 (Naming)

| 对象 | 约定 | 示例 | 禁止 |
|---|---|---|---|
| 文件 | kebab-case | `conventions-shell.js`, `design-doc-resolver.js` | `ConventionsShell.js`, `conventions_shell.js` |
| 函数/变量 | camelCase | `validateShell`, `hookCount` | `validate_shell`, `HookCount` |
| 常量 | UPPER_SNAKE_CASE | `EXPECTED_HOOKS`, `FRONTMATTER_RE` | `expectedHooks` |
| 布尔值 | is/has/can/should | `isValid`, `hasFrontmatter` | `validFlag` |
| 测试文件 | `test/test-{subject}.js` | `test-conventions-shell.js` | `conventions-shell.test.js` |

**规则**：函数用动词开头（`validate`/`parse`/`resolve`/`check`）；校验类返回 `{ valid, errors }`；避免 `data`/`tmp`/`x` 等无语义名。

## 2. 代码风格 (Code Style)

无 Prettier/ESLint 配置（zero deps 原则）；靠约定 + `post-edit-format` hook（若环境装了 Biome/Prettier 则自动格式化）。人工统一为：

```js
// 2 空格缩进、单引号、行尾分号、行宽 < 100
const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)---\s*\n?/;

function parseShell(content) {
  const lines = content.split('\n');
  if (lines[0] !== '---') return { frontmatter: null };
  // ...
}
```

| DO | DON'T |
|---|---|
| `const` 优先，必要时 `let` | 使用 `var` |
| 早返回、扁平控制流 | 深层嵌套（> 4 层拆函数） |
| 解构 + 默认参数 | 一行多语句 |
| 模板字符串拼路径 | 字符串拼接裸 `+` 拼长路径 |

## 3. 目录结构 (Directory Layout)

```text
airein/
├─ scripts/
│  ├─ hooks/        # CC hook 脚本（读 stdin JSON，exit code 控制阻断）
│  ├─ lib/          # 可复用纯函数库（被 hooks/ 和测试 require）
│  ├─ update/       # 同步/清理/打包/校验脚本
│  └─ <task>.js     # 顶层任务入口
├─ test/            # test/test-*.js + helpers.js（自研测试骨架）
├─ hooks/hooks.json # hook 注册清单
└─ templates/       # 文档/规则模板
```

**分层不变量**：`lib/` 是纯函数（无 stdin/stdout/exit 副作用），`hooks/` 是适配层（读 stdin、调 lib、写 stdout、exit）；测试只直接测 `lib/`，hook 脚本通过其调用的 lib 间接覆盖。

## 4. 导入规范 (Imports)

CommonJS（`require`/`module.exports`），**非 ESM**（airein 不用 `"type": "module"`）。

```js
// 顺序：Node 内建 → 项目 lib → 相对路径；组内字母序
const fs = require('fs');
const path = require('path');

const { validateConventionsShell } = require('../lib/conventions-shell');
const { describe, assertEqual } = require('./helpers');
```

**铁律**：**零 npm 依赖**——只用 Node 内建模块（`fs`/`path`/`os`/`child_process` 等）。`node_modules/` 不存在。任何新依赖必须证明无法用内建实现，且记录在 ADR。

## 5. 错误处理 (Error Handling)

hook 协议用 **exit code** 表达结果（不是 throw 到进程崩溃）：

| exit code | 含义 |
|---|---|
| `0` | 通过（可选：stdout 输出 JSON 给模型/用户提示） |
| `2` | **阻断**（PreToolUse 阻止工具调用；stderr 写原因） |
| 其他非 0 | hook 执行错误（不阻断，等同失败开放） |

```js
// lib 返回结果对象，不直接 exit
function validateShell(content) {
  if (!content) return { valid: false, errors: ['empty content'] };
  return { valid: true, errors: [] };
}

// hook 适配层把结果映射成 exit code
const result = validateShell(input);
if (!result.valid) {
  process.stderr.write(result.errors.join('\n'));
  process.exit(2);
}
process.exit(0);
```

| DO | DON'T |
|---|---|
| lib 抛 `Error` 或返回 `{ valid, errors }` | `throw 'string'` |
| 边界（hook 入口）统一 catch + 映射 exit | `catch (e) {}` 静默吞错 |
| 校验所有外部输入（stdin JSON、文件路径） | 信任未校验的输入 |

## 6. 日志规范 (Logging)

hook 脚本：**stdout 只写 CC 协议 JSON**（`{ continue: false, decision: { ... } }` 等）；诊断信息走 **stderr**（`process.stderr.write`）。hook 业务逻辑中**禁止 `console.log`**（污染 stdout 协议）。

```js
process.stderr.write(`[approval-guard] blocked: ${field} not approved\n`);
// 不要 console.log(...) —— 会进 stdout 协议流
```

lib 纯函数：**不输出**，只返回值或 throw；日志由调用方决定。

## 7. 测试规范 (Testing)

自研骨架 `test/helpers.js`（`describe` / `assertEqual` / `assertOk` / `projectRoot` / `printSummary`），**非 Jest/node:test**。文件：`test/test-{subject}.js`，运行 `node test/test-*.js` 或 `bash test/run-all.sh`。

```js
const { describe, assertOk, printSummary } = require('./helpers');

describe('validateConventionsShell: legal shell', () => {
  const { valid } = validateShell(LEGAL_SHELL);
  assertOk(valid, 'legal shell should be valid');
});

printSummary();
```

**铁律**：①生产 `.js` 必须有对应测试；②**测试先于实现**（RED→GREEN）；③bugfix 先写复现测试；④覆盖率目标 ≥ 80%。测行为不测实现细节。

## 8. 注释与文档 (Comments & Docs)

导出函数写 JSDoc（`/** */`）；注释解释**为什么**（非显而易见的约束、历史 bug、不变量），不复述代码做什么。

```js
/**
 * Validate a thin-shell conventions rule.
 * @param {string} content - Raw .md file content.
 * @returns {{ valid: boolean, errors: string[] }}
 *   CC silently ignores a missing @include target, so we must
 *   fail-fast here at generation time — never return valid:true for a
 *   shell whose target is absent.
 */
function validateConventionsShell(content) { /* ... */ }
```

不写无 issue 的 `TODO`；不写"为 X 流程加的"这类会随代码演进而腐烂的注释（放进 PR 描述）。

## 9. Git 规范

- 分支：`feature/{ticket}-{slug}` / `bugfix/{ticket}-{slug}` / `chore/{slug}`。
- Commit：Conventional Commits —— `feat:` / `fix:` / `refactor:` / `docs:` / `test:` / `chore:` / `perf:` / `ci:`。
- 永不 `--no-verify`，永不提交无法 `node test/test-*.js` 通过的代码。

## 10. Code Review checklist

- 是否有 `console.log`（hook 逻辑里）/ 静默 `catch` / 未处理 Promise？
- lib 是否保持纯函数（无 stdin/stdout/exit 副作用）？exit code 是否只在 hook 适配层？
- 外部输入（stdin JSON、文件路径、env）是否全部校验？
- 新函数是否有对应测试？是否 RED 先行？
- 是否引入了 npm 依赖（违反 zero deps）？是否有硬编码值/密钥？

## 11. 性能规范 (Performance)

hook 有 **5 秒超时**（`hooks.json` per-hook `timeout`）——同步逻辑必须快。规则：①配置文件**缓存**（读一次，进程内复用）；②避免在热路径重复 `fs.readFileSync`；③大目录扫描用 `glob` 限定深度；④hook 启动不引入慢 require 链。

## 12. 依赖管理 (Dependencies)

**零 npm 依赖是硬约束**（airein 开源、零安装门槛）。只用 Node 内建模块。如确需引入：
1. 证明无法用内建合理实现；
2. 记录 ADR（用途、替代方案、维护状态、体积）；
3. 锁文件提交。

禁止引入废弃/无人维护/安装脚本不透明的包。
