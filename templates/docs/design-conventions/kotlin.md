<!-- TEMPLATE: kotlin.md — Kotlin 工程规范模板 -->
<!-- 用途：l-feature / l-bugfix 的 design-conventions 子文档 -->
<!-- 位置：docs/plans/P{NNN}-{slug}/design-conventions.md -->
<!-- AI 生成指引：基于 Kotlin 社区最佳实践和团队约定填写 -->
# Design: 工程规范 (Kotlin)
> 子文档 of [design.md](design.md) | 本文档定义 Kotlin 项目的代码与工程规范
<!-- AI 生成指引：替换 {project_name}、{kotlin_version}、{coverage_threshold}、{group_path}。 -->

## 1. 命名约定 (Naming)
| 对象 | 约定 | 示例 | 禁止 |
|---|---|---|---|
| package | lowercase | `com.acme.order` | `com.acme.Order` |
| 文件 | PascalCase 或功能名 | `OrderService.kt` | `order_service.kt` |
| class/object | PascalCase | `OrderService` | `orderService` |
| function/property | camelCase | `calculateTotal` | `calculate_total` |
| compile-time const | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` | `maxRetryCount` |
| sealed subtype | PascalCase | `PaymentFailed` | `PAYMENT_FAILED` |
扩展函数命名必须体现接收者语义；避免 `Util`/`Helper` 泛名。

## 2. 代码风格 (Code Style)
Formatter: ktlint (Pinterest)。Linter: detekt，质量规则含 Cyclomatic、LongMethod、MagicNumber。
```yaml
complexity:
  CyclomaticComplexMethod:
    active: true
    threshold: 10
  LongMethod:
    active: true
    threshold: 50
style:
  MagicNumber:
    active: true
```
```kotlin
plugins {
    kotlin("jvm") version "{kotlin_version}"
    id("org.jlleitschuh.gradle.ktlint") version "{ktlint_plugin_version}"
    id("io.gitlab.arturbosch.detekt") version "{detekt_version}"
}
```
| DO | DON'T |
|---|---|
| data class 表达不可变 DTO | 可变 public var 滥用 |
| sealed class 表达有限状态 | 字符串状态码到处传 |

## 3. 目录结构 (Directory Layout)
```text
{project_name}/
├─ src/main/kotlin/{group_path}/
│  ├─ domain/          # entity/value/error
│  ├─ application/     # use cases
│  ├─ infrastructure/  # DB/HTTP/queue
│  ├─ presentation/    # controller/consumer/cli
│  └─ config/          # framework config
├─ src/test/kotlin/{group_path}/
└─ build.gradle.kts
```
<!-- AI 生成指引：Android 项目补充 app/core/data/domain/ui 分层和 R8 规则。 -->

## 4. 导入规范 (Imports)
由 ktlint 排序；禁止 wildcard imports，`android.R` 例外。
```kotlin
import com.acme.order.domain.Order
import com.acme.order.domain.OrderId
import mu.KotlinLogging
import org.slf4j.MDC
```
禁止：跨层反向导入、导入 internal 实现、为扩展函数制造隐式冲突。

## 5. 错误处理 (Error Handling)
领域错误使用 sealed class hierarchy；IO 边界可使用 `Result<T>`；禁止 catch `Throwable`。
```kotlin
sealed class DomainError(message: String) : RuntimeException(message) {
    data class UserNotFound(val userId: UserId) : DomainError("User not found: $userId")
    data class InvalidState(val reason: String) : DomainError(reason)
}

suspend fun loadUser(id: UserId): Result<User> = runCatching { repository.get(id) }
```
| DO | DON'T |
|---|---|
| catch 具体异常 | `catch (t: Throwable)` |
| `?:` / `requireNotNull` | 生产代码 `!!` |

## 6. 日志规范 (Logging)
使用 SLF4J + kotlin-logging；MDC 传递 trace context；生产禁止 `println`。
```kotlin
private val logger = KotlinLogging.logger {}
logger.info { "user_created userId=$userId requestId=$requestId" }
logger.error(error) { "create_user_failed requestId=$requestId" }
```
禁止记录密码、token、cookie、完整 PII。协程切换时确保 MDC 传播。

## 7. 测试规范 (Testing)
框架：Kotest；Mock：mockk；协程：`runTest`；覆盖率 `{coverage_threshold}` 默认 80%。
```kotlin
class OrderServiceTest : StringSpec({
    "creates order when input is valid" {
        val command = CreateOrderCommand(userId, items)
        val order = service.create(command)
        order.status shouldBe OrderStatus.Created
    }
})
```
测试位于 `src/test/kotlin`；mock 外部端口，不 mock 领域对象。

## 8. 注释与文档 (Comments & Docs)
公共 API 使用 KDoc；注释解释业务约束、并发语义、nullability 决策。
```kotlin
/**
 * Creates an order after validating domain invariants.
 * @throws DomainError.InvalidState when the order cannot be created.
 */
suspend fun createOrder(command: CreateOrderCommand): Order
```
README 包含构建、运行、测试、配置。

## 9. Git 规范
- 分支：`feature/{ticket}-{slug}`、`bugfix/{ticket}-{slug}`。
- Commit：Conventional Commits。
- PR：包含 ktlint/detekt/test 结果、协程影响、迁移说明、回滚方式。

## 10. Code Review checklist
- 是否存在 `!!`、`GlobalScope`、`runBlocking` 滥用？
- sealed class 的 `when` 是否 exhaustive？
- suspend 函数是否正确传播 cancellation？
- detekt MagicNumber/LongMethod 是否有合理豁免？

## 11. 性能规范 (Performance)
避免：热循环中捕获 lambda、无必要序列化、阻塞 IO 跑在 Default dispatcher、过度创建临时集合。
```kotlin
withContext(Dispatchers.IO) {
    repository.load(id)
}
```
Android release 启用 R8 minify；JVM 服务用 JFR/async-profiler；热路径可用 `inline fun`。

## 12. 依赖管理 (Dependencies)
- 使用 Gradle version catalog：`libs.versions.toml`。
- 开启 dependency locking；CI 运行 OWASP dependency-check。
- 新依赖说明用途、许可证、方法数/包体积（Android）、传递依赖。
- 使用 Renovate/Dependabot；禁止动态版本 `+`。
