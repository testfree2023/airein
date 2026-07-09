<!-- TEMPLATE: typescript.md — TypeScript 工程规范模板 -->
<!-- 用途：l-feature / l-bugfix 的 design-conventions 子文档 -->
<!-- 位置：docs/plans/P{NNN}-{slug}/design-conventions.md -->
<!-- AI 生成指引：基于 TypeScript 社区最佳实践和团队约定填写 -->
# Design: 工程规范 (TypeScript)
> 子文档 of [design.md](design.md) | 本文档定义 TypeScript 项目的代码与工程规范
<!-- AI 生成指引：替换 {project_name}、{module_system}、{coverage_threshold}；保留团队采用的框架规则。 -->

## 1. 命名约定 (Naming)
| 对象 | 约定 | 示例 | 禁止 |
|---|---|---|---|
| 文件 | kebab-case | `payment-service.ts` | `PaymentService.ts` |
| 类/枚举/type | PascalCase | `PaymentService`, `CreateUserInput` | `createUserInput` |
| interface | PascalCase，无 I 前缀 | `UserRepository` | `IUserRepository` |
| 函数/变量 | camelCase | `findUser`, `retryCount` | `find_user` |
| 常量 | UPPER_SNAKE_CASE | `DEFAULT_TIMEOUT_MS` | `defaultTimeout` |
| 泛型 | `T/K/V` 或 PascalCase | `T`, `TEntity` | `thing` |
规则：`any` 禁止进 PR；使用 `unknown` + type guard。领域 primitive 使用 branded types。
```ts
type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand }
type UserId = Brand<string, 'UserId'>
```

## 2. 代码风格 (Code Style)
Formatter: Prettier。Linter: ESLint + `@typescript-eslint/recommended` + import rules。
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "{module_system}",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true
  }
}
```
```js
export default [{
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/switch-exhaustiveness-check': 'error'
  }
}]
```
| DO | DON'T |
|---|---|
| `unknown` 后收窄 | `any` 或无意义断言 |
| discriminated union | 字符串状态散落 |

## 3. 目录结构 (Directory Layout)
```text
{project_name}/
├─ src/
│  ├─ domain/          # 类型、实体、纯业务规则
│  ├─ application/     # use cases / services
│  ├─ infrastructure/  # DB、HTTP、消息队列适配
│  ├─ presentation/    # API/CLI/UI 边界
│  └─ shared/          # 共享类型与工具
├─ test/               # 测试工具、集成测试
└─ tsconfig.json
```
<!-- AI 生成指引：monorepo 时补充 tsconfig references 和包边界。 -->

## 4. 导入规范 (Imports)
顺序：Node built-ins → external → internal `@/` → relative；类型导入用 `import type`。
```ts
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { UserId } from '@/domain/user-id'
import { createUser } from '@/application/create-user'
import { mapUserRow } from './user-mapper'
```
禁止：循环依赖、跨层反向导入、从 `.d.ts` 导入运行时代码、深层包内部导入。

## 5. 错误处理 (Error Handling)
```ts
class AppError extends Error {
  constructor(message: string, readonly code: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AppError'
  }
}
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
```
| DO | DON'T |
|---|---|
| `catch (error: unknown)` 后 type guard | `catch (error: any)` |
| exhaustiveness check | `default` 静默吞掉新枚举值 |

## 6. 日志规范 (Logging)
使用 pino/winston；字段结构化且有稳定名称；生产代码禁止 `console.log`。
```ts
logger.info({ requestId, userId, operation: 'CreateUser' }, 'operation completed')
logger.error({ requestId, err: toError(error) }, 'operation failed')
```
永不记录 secret、token、cookie、完整 PII。

## 7. 测试规范 (Testing)
框架：Jest/Vitest；文件：`*.test.ts` 与源文件相邻；覆盖率 `{coverage_threshold}`，默认 80%。
```ts
describe('parseUserId', () => {
  it('returns branded user id for valid uuid', () => {
    const result = parseUserId('00000000-0000-4000-8000-000000000000')
    expect(result.ok).toBe(true)
  })
})
```
Type guard、边界值、错误路径必须测试；mock 外部端口，不 mock domain 纯函数。

## 8. 注释与文档 (Comments & Docs)
公共 API 使用 TSDoc；复杂类型需要类型级文档；`.d.ts` 只用于 ambient declarations。
```ts
/**
 * Creates a user after validating domain invariants.
 * @throws {@link AppError} when the email is already used.
 */
export async function createUser(input: CreateUserInput): Promise<User> {}
```

## 9. Git 规范
- 分支：`feature/{ticket}-{slug}` / `bugfix/{ticket}-{slug}`。
- Commit：Conventional Commits。
- PR：说明类型变更影响、迁移方式、测试结果、风险。

## 10. Code Review checklist
- 是否有 `any`、非空断言 `!`、类型断言滥用？
- strict/noUncheckedIndexedAccess/exactOptionalPropertyTypes 是否开启？
- public API 是否有 TSDoc 和稳定类型？
- union 是否 exhaustive，branded type 是否用于领域 ID/金额？

## 11. 性能规范 (Performance)
避免：热路径过度泛型抽象、频繁对象展开深拷贝、无界 Promise 并发、同步 I/O。
工具：`node --prof`、Clinic.js、Chrome DevTools、`performance.mark()`；批量异步使用 `{concurrency_limit}`。

## 12. 依赖管理 (Dependencies)
- 新依赖必须有类型支持或维护良好的 `@types/*`。
- 锁文件提交；运行 `npm audit`；使用 Renovate。
- 禁止为简单类型工具引入大型依赖。
