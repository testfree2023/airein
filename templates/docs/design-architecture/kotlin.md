<!-- TEMPLATE: kotlin.md — Kotlin/JVM 项目架构设计模板 -->
<!-- 用途：l-feature / l-bugfix 的 design-architecture 子文档 -->
<!-- 位置：docs/plans/P{NNN}-{slug}/design-architecture.md -->
<!-- AI 生成指引：从 tech-stack.md 和 language-profile 推导，按以下结构完整填写 -->

# Design: 项目架构 (Kotlin)

> 子文档 of [design.md](design.md) | 本文档描述 Kotlin/JVM 项目的架构设计

## Kotlin Version & Compiler

<!-- AI 生成指引：从 build.gradle.kts 或 gradle/libs.versions.toml 提取 -->
- **Kotlin 版本**: `{1.9+|2.0+}`
- **编译器**: `{K1|K2}` — K2 编译更快 (1.9 opt-in, 2.0 默认)
- **关键语言特性**:
  - Sealed Classes/Interfaces: 完备性检查、when 穷举、状态机建模
  - Extension Functions: 为外部类型添加行为，不修改源码
  - Inline Functions + Reified: 编译时泛型消除 (reified type parameters)
  - Type-Safe Builders: DSL 设计 (如 `html { body { p("hello") } }`)
  - Data Classes: 自动生成 `equals/hashCode/toString/copy/componetN`
  - Null Safety: 编译时 null 检查，`?.` / `?:` / `!!` 操作符

## Build System

<!-- AI 生成指引：从 build.gradle.kts 和 settings.gradle.kts 推导 -->
- **工具**: Gradle Kotlin DSL (类型安全构建脚本)
- **Version Catalog** (`gradle/libs.versions.toml`):
  ```toml
  [versions]
  kotlin = "2.0.0"
  spring-boot = "3.3.0"
  exposed = "0.52.0"
  kotest = "1.8.0"

  [libraries]
  exposed-core = { module = "org.jetbrains.exposed:exposed-core", version.ref = "exposed" }
  ```

- **Convention Plugins**: `buildSrc/` 或 `included build` 共享公共构建逻辑
  ```kotlin
  // buildSrc/src/main/kotlin/convention.kotlin-jvm.gradle.kts
  plugins {
      kotlin("jvm")
      kotlin("plugin.spring")
  }
  ```
- **Multi-Module** (`settings.gradle.kts`):
  ```kotlin
  rootProject.name = "{project-name}"
  include("domain", "infrastructure", "application", "api")
  ```

## Project Structure

<!-- AI 生成指引：说明 multi-module 的组织和依赖方向 -->
```
{project-name}/
├── domain/                 # 纯 Kotlin 领域模块 (零框架依赖)
│   └── src/main/kotlin/
│       └── com/{company}/{project}/
│           ├── model/      # Data classes, Value Objects
│           ├── service/    # Domain service interfaces
│           └── repository/ # Repository interfaces (no impl)
├── infrastructure/         # 基础设施实现
│   └── src/main/kotlin/
│       └── com/{company}/{project}/
│           ├── repository/ # Exposed/jOOQ 实现
│           ├── cache/
│           ├── external/   # 第三方 API 客户端
│           └── config/     # 基础设施配置类
├── application/            # 应用服务层 (用例编排)
│   └── src/main/kotlin/
│       └── com/{company}/{project}/
│           ├── service/    # ApplicationService 实现
│           ├── dto/        # Input/Output DTO
│           └── mapper/     # DTO ↔ Domain 映射
├── api/                    # HTTP 层 (Spring Boot/Ktor)
│   └── src/main/kotlin/
│       └── com/{company}/{project}/
│           ├── controller/ # @RestController / Route handlers
│           ├── request/    # 请求体 DTO
│           ├── response/   # 响应体 DTO
│           ├── advice/     # @ControllerAdvice 异常处理
│           └── middleware/ # 过滤器和拦截器
├── boot/                   # Spring Boot 启动模块 (如用 Spring)
│   └── src/main/kotlin/
│       └── com/{company}/{project}/
│           └── Application.kt  # @SpringBootApplication
├── buildSrc/               # Convention plugins
├── gradle/
│   └── libs.versions.toml  # Version catalog
├── build.gradle.kts
└── settings.gradle.kts
```

## Framework Selection

<!-- AI 生成指引：比较 Spring Boot 和 Ktor -->
| 框架 | 适用场景 | 特点 |
|------|---------|------|
| Spring Boot | {企业级 / 全栈} | 成熟生态、JPA/Spring Data、Actuator、安全 |
| Ktor | {微服务 / 轻量 API} | Kotlin 原生、协程原生、插件架构、嵌入式 |
| http4k | {Serverless / 函数式} | 纯函数式、极简、测试友好 |

- **选择**: `{Spring Boot|Ktor|http4k}`
- **理由**: {生态需求 / 团队经验 / 性能 / 部署模式}

## Coroutines & Structured Concurrency

<!-- AI 生成指引：说明协程的架构级约定 — 这是 Kotlin 最大特色 -->
- **Coroutine Scope 层次**:
  - Controller: 框架管理 scope (Spring WebFlux / Ktor 内置)
  - ApplicationService: `coroutineScope {}` 结构化并发
  - Repository: `suspend fun` — 调用方传递 scope
  ```kotlin
  suspend fun processOrder(orderId: OrderId): OrderResult = coroutineScope {
      // 以下两个调用并发执行，任一失败 → 两者取消
      val userDeferred = async { userRepository.findById(userId) }
      val orderDeferred = async { orderRepository.findById(orderId) }
      val user = userDeferred.await() ?: throw UserNotFoundException(userId)
      val order = orderDeferred.await() ?: throw OrderNotFoundException(orderId)
      // ...
  }
  ```

- **Flow**: 冷数据流，用于分页查询、实时事件、SSE
  ```kotlin
  fun searchUsers(query: String): Flow<User> = flow {
      val users = userRepository.search(query)
      users.forEach { emit(it) }
  }.flowOn(Dispatchers.IO)
  ```
- **调度器约定**:
  - `Dispatchers.IO` — 数据库、网络 (Repository 层)
  - `Dispatchers.Default` — CPU 密集计算
  - Controller 层不指定调度器 (框架管理)

## Functional Patterns

<!-- AI 生成指引：展示 Kotlin 特有的函数式架构模式 -->
- **Sealed Class 作为 ADT** (Algebraic Data Type):
  ```kotlin
  sealed class Result<out T, out E> {
      data class Success<T>(val value: T) : Result<T, Nothing>()
      data class Failure<E>(val error: E) : Result<Nothing, E>()
  }

  // 使用 when 穷举处理
  when (val result = userService.findById(id)) {
      is Result.Success -> ResponseEntity.ok(result.value.toDto())
      is Result.Failure -> errorHandler.toResponse(result.error)
  } // 编译强制穷举
  ```

- **Extension Functions 作为 Mixin**:
  ```kotlin
  fun User.toDto(): UserDto = UserDto(id = id.value, email = email.value, name = name)
  fun CreateUserRequest.toCommand(): CreateUserCommand = ...
  ```

- **Type-Safe Builders 设计**:
  - 查询 DSL: `Exposed DSL`, `jOOQ DSL`
  - 测试断言: `kotest should`, `mockk every { ... }`
  - 路由定义: `routes { get("/users") { ... } }`

## Null Safety

<!-- AI 生成指引：说明 Kotlin 空安全在架构中的约定 -->
- **Platform Types 处理**: Java 互操作的返回类型标注 `@Nullable` / `@NotNull`
- **!! 禁止**: 项目中禁用 `!!` (代码审查强制); 使用 `?.let {}` 或 `?:` 安全处理
- **Sealed Class 替代 null**: 用 `Option<T>` 或 `sealed class` 代替 null 作为"无值"语义
  ```kotlin
  sealed class MaybeUser {
      object NotFound : MaybeUser()
      data class Found(val user: User) : MaybeUser()
  }
  ```

## Dependency Injection

<!-- AI 生成指引：选择 DI 策略 -->
- **方式**:
  - Spring Boot: 构造注入 (唯一方式)
  - Ktor: 参数化工厂 或 Koin (轻量 DI)
  ```kotlin
  // Spring Boot 风格 — 构造注入
  @Service
  class UserService(private val userRepository: UserRepository) { ... }

  // Koin 风格 — 模块声明
  val appModule = module {
      single<UserRepository> { PgUserRepository(get()) }
      single { UserService(get()) }
  }
  ```
- **测试中的 Swap**: 通过构造注入或 Koin `declare` 覆盖做 mock

## ORM & Persistence

<!-- AI 生成指引：从 Gradle 依赖推导持久化方案 -->
- **方案**:
  - Exposed (JetBrains 官方): Kotlin DSL + DAO / SQL DSL
  - jOOQ: 类型安全 SQL 构建器 + 代码生成
  - Spring Data JPA: 传统 JPA + Kotlin plugin (jpa 插件)
  - Hibernate (Kotlin plugin): `kotlin("plugin.jpa")` 生成 no-arg 构造器
  ```kotlin
  // Exposed SQL DSL 风格 — 编译时类型安全
  object Users : Table("users") {
      val id = uuid("id").autoGenerate()
      val email = varchar("email", 255).uniqueIndex()
      val name = varchar("name", 255)
  }

  suspend fun findById(id: UUID): User? = dbQuery {
      Users.selectAll().where { Users.id eq id }.singleOrNull()?.toDomain()
  }
  ```
- **迁移**: Flyway (`/src/main/resources/db/migration/`)
- **事务**: `transaction { ... }` (Exposed) 或 `@Transactional` (Spring)

## Serialization

<!-- AI 生成指引：从 Gradle 依赖推导序列化方案 -->
- **kotlinx.serialization**: 编译时序列化 (零反射，Kotlin 原生)
  ```kotlin
  @Serializable
  data class UserDto(val id: String, val email: String, val name: String)

  // JSON 编解码
  val json = Json { ignoreUnknownKeys = true; encodeDefaults = false }
  val user = json.decodeFromString<UserDto>(body)
  ```
- **格式支持**: JSON, Protobuf (通过 `kotlinx-serialization-protobuf`)
- **与框架集成**: Ktor 内置 `ContentNegotiation` + `kotlinx.serialization`

## Testing

<!-- AI 生成指引：说明 Kotlin 特有的测试生态 -->
- **测试框架**: kotest (Kotlin 原生) 或 JUnit 5 + kotlin extensions
  ```kotlin
  // kotest — string spec style
  class UserServiceTest : StringSpec({
      "create user with valid email should succeed" {
          val result = userService.createUser(validEmail, "Alice")
          result.shouldBeRight()
      }
      "create user with duplicate email should fail" {
          val result = userService.createUser(existingEmail, "Bob")
          result.shouldBeLeft().shouldBeInstanceOf<EmailConflictError>()
      }
  })
  ```
- **Mock**: mockk (Kotlin 原生 mock 库 — 支持 final class, object, extension fun)
  ```kotlin
  val userRepo = mockk<UserRepository>()
  coEvery { userRepo.findByEmail(any()) } returns existingUser
  ```
- **Coroutine 测试**: `kotlinx-coroutines-test` — `runTest {}` 虚拟时间
- **测试工具**:
  - Testcontainers (Kotlin DSL 扩展): 真实 DB 集成测试
  - `mockMvc` / `webTestClient`: Controller 层测试 (Spring) 或 `testApplication {}` (Ktor)
- **Property Testing**: kotest property-based testing

## Error Handling

<!-- AI 生成指引：展示 Result 类型 + sealed class 的错误处理 -->
```kotlin
// domain module
sealed class AppError {
    abstract val message: String
    abstract val code: ErrorCode
}
sealed class UserError : AppError() {
    data class NotFound(val userId: UserId) : UserError() { ... }
    data class EmailConflict(val email: String) : UserError() { ... }
}

// Service 返回 Result 或抛出 sealed exception
suspend fun createUser(input: CreateUserInput): Result<User, UserError>
```

- **Controller 层统一处理**: `@ControllerAdvice` (Spring) 或 StatusPages plugin (Ktor)
- **原则**: Service 返回 `Result<T, E>`，Controller 负责转换为 HTTP response

## Configuration

<!-- AI 生成指引：从 application.yml 或环境变量推导 -->
- **Spring Boot**: `application.yml` + `application-{profile}.yml` + `@ConfigurationProperties`
- **Ktor**: `HOCON` (application.conf) 或环境变量
- **敏感配置**: 环境变量注入，不提交 secrets 到仓库
- **类型安全**: 使用 `@ConfigurationProperties` + `@validated` 或 Ktor `Config.propertyOrNull()`

## Observability

<!-- AI 生成指引：说明 Kotlin 项目的监控约定 -->
- **Structured Logging**: SLF4J + Logback (JSON encoder)
- **Mapped Diagnostic Context (MDC)**: 过滤器注入 `traceId` 到 MDC
- **Tracing 与 Coroutine**: 使用 `slf4j` MDC 或 Kotlin context `ThreadContextElement`
- **Metrics**: Micrometer (Prometheus) + `@Timed` 注解或手动 Counter/Timer
- **Actuator** (Spring Boot): `/actuator/health`, `/actuator/metrics`
- **Ktor 等价**: `CallId` plugin + `MicrometerMetrics` plugin

## Security

<!-- AI 生成指引：Kotlin 项目的安全约定 -->
- **Spring Security** (Spring Boot):
  - JWT Filter 基于 `OncePerRequestFilter`
  - CSRF 禁用 (REST API)
  - CORS 白名单
- **Ktor Security**:
  - `Authentication` plugin + `jwt()` provider
  - `CORS` plugin 配置
- **输入验证**: `@Valid` (Spring) + Bean Validation 或 Ktor `validate {}` plugin
- **Kotlin 空安全**: 编译时消除大部分 NullPointerException 安全隐患
- **依赖审计**: `dependencyCheck` 或 `dependabot` — CI/CI 中自动扫描 CVE

## Status: draft
