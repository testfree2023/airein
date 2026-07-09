<!-- TEMPLATE: javascript.md — JavaScript 工程规范模板 -->
<!-- 用途：l-feature / l-bugfix 的 design-conventions 子文档 -->
<!-- 位置：docs/plans/P{NNN}-{slug}/design-conventions.md -->
<!-- AI 生成指引：基于 JavaScript 社区最佳实践和团队约定填写 -->
# Design: 工程规范 (JavaScript)
> 子文档 of [design.md](design.md) | 本文档定义 JavaScript 项目的代码与工程规范
<!-- AI 生成指引：替换 {project_name}、{node_version}、{coverage_threshold}，并删除不适用规则。 -->

## 1. 命名约定 (Naming)
| 对象 | 约定 | 示例 | 禁止 |
|---|---|---|---|
| 文件/目录 | kebab-case | `user-service.js`, `order-api/` | `UserService.js`, `order_api/` |
| 类 | PascalCase | `PaymentClient` | `paymentClient` |
| 函数/变量 | camelCase | `calculateTotal`, `retryCount` | `calculate_total` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` | `maxRetryCount` |
| 布尔值 | is/has/can/should | `isEnabled` | `enabledFlag` |
**规则**：函数用动词开头；事件处理器用 `handleSubmit`；避免 `data`, `obj`, `tmp` 等无语义名。

## 2. 代码风格 (Code Style)
Formatter: Prettier。Linter: ESLint + `airbnb-base` 或 `standard` + `plugin:import` + `plugin:node`。
<!-- AI 生成指引：semi 按团队选择 true 或 false；不要保留两个互斥选项。 -->
```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "singleQuote": true,
  "semi": false,
  "trailingComma": "es5"
}
```
```js
module.exports = {
  env: { node: true, es2022: true, jest: true },
  extends: ['airbnb-base', 'plugin:import/recommended', 'plugin:node/recommended'],
  rules: { 'no-console': 'error', 'import/order': ['error', { 'newlines-between': 'always' }] }
}
```
| DO | DON'T |
|---|---|
| 小函数、早返回、显式转换 | 深层嵌套、隐式类型转换 |
| `const` 优先，必要时 `let` | 使用 `var` |

## 3. 目录结构 (Directory Layout)
```text
{project_name}/
├─ src/
│  ├─ config/       # 配置解析与校验
│  ├─ domain/       # 纯业务逻辑
│  ├─ services/     # 外部服务编排
│  ├─ routes/       # HTTP/CLI 入口适配
│  ├─ utils/        # 无业务语义工具
│  └─ index.js      # 启动入口
├─ test/            # 集成测试/测试工具
└─ package.json
```
<!-- AI 生成指引：monorepo 时补充 packages/{app}/src 的边界。 -->

## 4. 导入规范 (Imports)
顺序：Node built-ins → external → internal `@/` → relative；组间空行；组内字母序。
```js
import fs from 'node:fs/promises'
import pino from 'pino'
import { createUser } from '@/domain/user.js'
import { parseRequest } from './request-parser.js'
```
禁止：循环依赖、深层导入包内部 API、无注释动态 `require()`。

## 5. 错误处理 (Error Handling)
```js
class AppError extends Error {
  constructor(message, { code, cause, statusCode = 500 } = {}) {
    super(message, { cause })
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
  }
}
```
| DO | DON'T |
|---|---|
| `throw new AppError('Invalid user', { code: 'USER_INVALID' })` | `throw 'Invalid user'` |
| catch 后加上下文或统一转换 | `catch (err) {}` 静默吞错 |
规则：domain 抛业务错误；service 增加上下文；入口层记录并映射 HTTP/CLI 响应。

## 6. 日志规范 (Logging)
使用 pino/winston，结构化 JSON；生产代码禁止 `console.log`。
```js
logger.info({ userId, requestId, action: 'createUser' }, 'user created')
logger.error({ err, requestId }, 'request failed')
```
级别：debug 诊断，info 业务事件，warn 可恢复异常，error 请求失败，fatal 进程退出。
永不记录：密码、token、cookie、密钥、完整 PII、原始敏感请求体。

## 7. 测试规范 (Testing)
框架：Jest；文件：`*.test.js` 与源文件相邻；覆盖率最低 `{coverage_threshold}`，默认 80%。
```js
describe('calculateTotal', () => {
  it('applies discount when coupon is valid', () => {
    const cart = { items: [{ price: 100 }], coupon: 'SAVE10' }
    const total = calculateTotal(cart)
    expect(total).toBe(90)
  })
})
```
Mock 外部 IO，不 mock 被测模块内部函数；bugfix 必须先有失败回归测试。

## 8. 注释与文档 (Comments & Docs)
公共 API 写 JSDoc；注释解释“为什么”，不要复述代码。
```js
/**
 * Creates a user from validated input.
 * @param {CreateUserInput} input - Validated payload.
 * @returns {Promise<User>} Created user.
 * @throws {AppError} When email already exists.
 */
async function createUser(input) {}
```
README 必须包含安装、运行、测试、环境变量、API 表。

## 9. Git 规范
- 分支：`feature/{ticket}-{slug}`, `bugfix/{ticket}-{slug}`, `chore/{slug}`。
- Commit：Conventional Commits，如 `feat: add user import job`。
- PR：背景、方案、测试结果、风险、回滚方式。

## 10. Code Review checklist
- 是否有 `console.log`、未处理 Promise、静默 catch？
- 错误是否有 code/cause，边界层是否统一转换？
- 导入顺序、循环依赖、禁止导入是否合规？
- 测试是否覆盖成功、失败、边界条件？

## 11. 性能规范 (Performance)
避免：请求路径同步 I/O、无界递归、未分页查询、无限数组累积、频繁深拷贝。
工具：`node --prof`、Clinic.js、0x、`perf_hooks`；关注 event loop lag、heap、GC pause。

## 12. 依赖管理 (Dependencies)
- 新依赖说明用途、替代方案、维护状态、包体积影响。
- 每个 PR 运行 `npm audit`；使用 Renovate；锁文件必须提交。
- 禁止引入废弃、无人维护、下载脚本不透明的包。
