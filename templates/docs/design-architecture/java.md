<!-- TEMPLATE: java.md — Java 项目架构设计模板 -->
<!-- 用途：l-feature / l-bugfix 的 design-architecture 子文档 -->
<!-- 位置：docs/plans/P{NNN}-{slug}/design-architecture.md -->
<!-- AI 生成指引：从 tech-stack.md 和 language-profile 推导，按以下结构完整填写 -->

# Design: 项目架构 (Java)

> 子文档 of [design.md](design.md) | 本文档描述 Java 项目的架构设计

## Java Version & Language Features

<!-- AI 生成指引：从 pom.xml <java.version> 或 build.gradle sourceCompatibility 提取 -->
- **Java 版本**: `{17|21} LTS`
- **关键特性利用**:
  - Records: DTO、值对象 (如 `record UserDTO(String name, String email) {}`)
  - Sealed Classes: 受限继承层次，适用于状态机、Result 类型
  - Pattern Matching: `switch` 表达式 + `instanceof` 模式匹配简化类型判断
  - Text Blocks: 多行字符串 (SQL、JSON 嵌入)
  - Virtual Threads (21+): 高并发 IO 场景替代线程池

## Build System

<!-- AI 生成指引：检查 pom.xml (Maven) 或 build.gradle / settings.gradle (Gradle) -->
- **工具**: `{Maven|Gradle (Kotlin DSL)}`
- **Multi-Module Layout**:
  ```
  {project-name}/
  ├── {project}-common/       # 共享 DTO、工具类、异常定义
  ├── {project}-domain/       # 领域模型、领域服务 (DDD)
  ├── {project}-infrastructure/  # 数据访问、外部服务集成
  ├── {project}-application/  # 应用服务、用例编排
  ├── {project}-api/          # REST 控制器、请求/响应 DTO
  └── {project}-boot/         # Spring Boot 启动类、配置聚合
  ```
- **依赖管理**: Maven `<dependencyManagement>` 或 Gradle Version Catalog (`libs.versions.toml`)
- **插件**: Checkstyle / SpotBugs / JaCoCo / Maven Surefire

## Dependency Injection

<!-- AI 生成指引：Spring Boot 项目默认构造注入；非 Spring 说明 Guice/Dagger -->
- **容器**: Spring Framework IoC (默认) / Quarkus CDI / Micronaut
- **注入方式**: **构造器注入 (唯一方式)** — 禁止字段 `@Autowired`
  ```java
  @Service
  public class UserService {
      private final UserRepository userRepository;
      private final PasswordEncoder passwordEncoder;

      public UserService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
          this.userRepository = userRepository;
          this.passwordEncoder = passwordEncoder;
      }
  }
  ```
- **Bean 生命周期**: `@PostConstruct` / `@PreDestroy`，非必要不用 `@Lazy`
- **Profile**: `@Profile("dev")` / `@Profile("prod")` 区分环境 Bean

## Layered Architecture

<!-- AI 生成指引：标注每层的包路径和关键注解 -->
```
HTTP Request → Filter Chain (Security, Logging, Tracing)
    → @RestController (api/ — 参数校验 @Valid, 调用 ApplicationService)
        → ApplicationService (application/ — 用例编排，控制事务边界 @Transactional)
            → DomainService (domain/ — 纯业务逻辑，不依赖框架)
                → Repository (infrastructure/ — JPA/MyBatis 数据访问)
                    → Entity / Aggregate → Database
            → Event Publisher → Message Queue / Event Bus
    → @ControllerAdvice (统一异常处理 → 错误响应 DTO)
    → Response (统一响应体 ApiResponse<T>)
```

## Package Structure

<!-- AI 生成指引：说明 package-by-feature vs package-by-layer 的选择 -->
- **策略**: `{package-by-feature|package-by-layer|混合}`
- **Package-by-feature 示例** (推荐中大型项目):
  ```
  com.{company}.{project}
  ├── user/
  │   ├── UserController.java
  │   ├── UserService.java
  │   ├── UserRepository.java
  │   ├── User.java (Entity)
  │   └── UserDto.java
  ├── order/
  └── payment/
  ```
- **理由**: 高内聚，功能边界清晰，团队可独立开发 feature 包

## Exception Handling

<!-- AI 生成指引：定义业务异常层次和全局处理 -->
```java
// 基础业务异常
public abstract class BusinessException extends RuntimeException {
    private final ErrorCode errorCode;
    // ...
}

// 具体异常
public class UserNotFoundException extends BusinessException { ... }
public class InsufficientBalanceException extends BusinessException { ... }
```
- **全局处理**:
  ```java
  @RestControllerAdvice
  public class GlobalExceptionHandler {
      @ExceptionHandler(BusinessException.class)
      public ResponseEntity<ErrorResponse> handleBusiness(BusinessException ex) { ... }
      @ExceptionHandler(MethodArgumentNotValidException.class)
      public ResponseEntity<ErrorResponse> handleValidation(...) { ... }
  }
  ```
- **Controller 约束**: Controller 仅调用 Service，不捕获异常；异常统一由 GlobalExceptionHandler 处理
- **Error Code 枚举**: `enum ErrorCode { USER_NOT_FOUND("U001", 404), ... }`

## Transaction Management

<!-- AI 生成指引：从 Service 层 @Transactional 使用情况推导 -->
- **声明式事务**: `@Transactional` 标注 ApplicationService 方法
- **传播级别**: 默认 `REQUIRED`；需要独立事务时用 `REQUIRES_NEW`
- **只读优化**: 查询方法 `@Transactional(readOnly = true)` (JPA 性能优化)
- **回滚策略**: 默认 RuntimeException 回滚；checked exception 不回滚 (符合 Spring 默认)
- **分布式事务**: 跨服务时用 Saga 模式 (最终一致) 或 Seata (强一致)
- **事务边界**: 事务仅在 ApplicationService 层开启，不在 Controller 也不在 Repository

## ORM & Persistence

<!-- AI 生成指引：从 pom.xml 依赖推导 JPA/MyBatis/JOOQ -->
- **ORM**: Spring Data JPA (Hibernate) / MyBatis / jOOQ
- **Entity 定义**:
  ```java
  @Entity
  @Table(name = "users")
  public class User {
      @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
      private Long id;
      @Column(nullable = false, unique = true)
      private String email;
      // ...
  }
  ```
- **Repository**:
  ```java
  public interface UserRepository extends JpaRepository<User, Long> {
      Optional<User> findByEmail(String email);
      @Query("SELECT u FROM User u JOIN FETCH u.orders WHERE u.id = :id")
      Optional<User> findByIdWithOrders(@Param("id") Long id);
  }
  ```
- **N+1 防范**: `JOIN FETCH` / `@EntityGraph` / `@BatchSize` 避免懒加载陷阱
- **迁移**: Flyway (`V{version}__{description}.sql`) — 版本化 SQL 迁移
- **查询增强**: QueryDSL 或 Specification 或 JPA Criteria API — 类型安全的动态查询

## Testing

<!-- AI 生成指引：从 pom.xml test dependencies 推导 -->
- **框架**: JUnit 5 + Mockito (单元测试) + Testcontainers (集成测试)
- **测试分层**:
  ```java
  // 单元测试 — 测试 Service 逻辑，mock 所有依赖
  @ExtendWith(MockitoExtension.class)
  class UserServiceTest { ... }

  // Repository 测试 — 使用 @DataJpaTest slice + 真实 H2/Testcontainers
  @DataJpaTest
  class UserRepositoryTest { ... }

  // Web 层测试 — @WebMvcTest slice，仅加载 Controller 层
  @WebMvcTest(UserController.class)
  class UserControllerTest { ... }

  // 集成测试 — @SpringBootTest 完整上线文
  @SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
  class UserApiIntegrationTest { ... }
  ```
- **Testcontainers**: PostgreSQL / Redis / Kafka 用容器运行，保证与生产一致
- **测试数据**: 使用 Builder 模式 + Factory 方法构造测试 entity
- **覆盖率**: JaCoCo — ≥ 80%，CI 中 `mvn verify` 自动检查

## Concurrency

<!-- AI 生成指引：说明项目的并发模型 -->
- **Virtual Threads** (Java 21+): 高 IO 场景启用 `spring.threads.virtual.enabled=true` (Spring Boot 3.2+)
- **CompletableFuture**: 组合异步操作
  ```java
  CompletableFuture<User> userFuture = CompletableFuture.supplyAsync(() -> userRepo.findById(id));
  CompletableFuture<List<Order>> ordersFuture = CompletableFuture.supplyAsync(() -> orderRepo.findByUserId(id));
  CompletableFuture.allOf(userFuture, ordersFuture).join();
  ```
- **线程安全集合**: `ConcurrentHashMap`, `CopyOnWriteArrayList`
- **锁**: 优先 `java.util.concurrent.locks` 而非 `synchronized`；避免跨事务持锁

## Configuration

<!-- AI 生成指引：从 application.yml 推导配置层次 -->
- **配置格式**: YAML (application.yml)
- **配置层次**:
  ```
  application.yml              # 公共配置
  application-dev.yml          # 开发环境
  application-prod.yml         # 生产环境
  ```
- **类型安全配置**: `@ConfigurationProperties` 绑定配置类
  ```java
  @ConfigurationProperties(prefix = "app")
  public record AppProperties(String name, int maxRetry, Duration timeout) {}
  ```
- **敏感信息**: 使用 `${DB_PASSWORD}` 占位符 + 环境变量 / Vault / K8s Secrets 注入

## Observability

<!-- AI 生成指引：从 pom.xml 依赖推导 tracing/metrics/logging -->
- **日志**: SLF4J + Logback — JSON 格式输出 (生产)
- **MDC Tracing**: 在 Filter 中注入 `traceId` 到 MDC，全链路日志携带
- **Metrics**: Micrometer → Prometheus / Datadog
  ```java
  @Timed(value = "user.login", percentiles = {0.5, 0.95, 0.99})
  public User login(String email, String password) { ... }
  ```
- **分布式追踪**: Micrometer Tracing → OpenTelemetry / Zipkin
- **健康检查**: Spring Boot Actuator `/actuator/health`

## Security

<!-- AI 生成指引：从 SecurityConfig 类推导认证授权策略 -->
- **认证**: Spring Security 或自定义 JWT Filter
- **密码**: BCrypt 编码 (`PasswordEncoder`)，禁止明文存储
- **授权**: `@PreAuthorize("hasRole('ADMIN')")` 方法级权限控制
- **CSRF**: REST API 无状态 (禁用 CSRF)；如有前端 Session 则启用
- **CORS**: 白名单 origin 配置
- **依赖审计**: OWASP Dependency-Check 插件在 CI 中扫描 CVE

## Status: draft
