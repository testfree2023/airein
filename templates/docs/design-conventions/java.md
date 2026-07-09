<!-- TEMPLATE: java.md — Java 工程规范模板 -->
<!-- 用途：l-feature / l-bugfix 的 design-conventions 子文档 -->
<!-- 位置：docs/plans/P{NNN}-{slug}/design-conventions.md -->
<!-- AI 生成指引：基于 Java 社区最佳实践和团队约定填写 -->
# Design: 工程规范 (Java)
> 子文档 of [design.md](design.md) | 本文档定义 Java 项目的代码与工程规范
<!-- AI 生成指引：替换 {project_name}、{java_version}、{coverage_threshold}、{group_id}、{group_path}。 -->

## 1. 命名约定 (Naming)
| 对象 | 约定 | 示例 | 禁止 |
|---|---|---|---|
| package | 全小写，反域名 | `com.acme.order` | `com.acme.Order` |
| 类/接口 | PascalCase | `OrderService` | `orderService` |
| 方法/变量 | camelCase | `calculateTotal` | `calculate_total` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` | `maxRetryCount` |
| 测试类 | `{ClassName}Test` | `OrderServiceTest` | `TestOrderService` |
接口不加 `I` 前缀；实现类用语义命名，如 `JdbcUserRepository`。

## 2. 代码风格 (Code Style)
Formatter: google-java-format 或 Checkstyle Sun/Google config。Linter: SpotBugs + PMD + ErrorProne。
```xml
<plugin>
  <groupId>com.spotify.fmt</groupId>
  <artifactId>fmt-maven-plugin</artifactId>
  <version>{fmt_plugin_version}</version>
</plugin>
<plugin>
  <groupId>com.github.spotbugs</groupId>
  <artifactId>spotbugs-maven-plugin</artifactId>
  <version>{spotbugs_version}</version>
</plugin>
```
| DO | DON'T |
|---|---|
| 小方法、明确参数对象 | 超长参数列表 |
| 明确 nullability | 隐式返回 null |

## 3. 目录结构 (Directory Layout)
```text
{project_name}/
├─ src/main/java/{group_path}/
│  ├─ domain/          # 实体、值对象、领域服务
│  ├─ application/     # 用例、事务边界
│  ├─ infrastructure/  # DB、消息、外部 API
│  ├─ interfaces/      # REST/CLI/Consumer 入口
│  └─ config/          # 框架配置
├─ src/test/java/{group_path}/
└─ pom.xml 或 build.gradle.kts
```
<!-- AI 生成指引：Spring 项目可补充 controller/service/repository，但需说明依赖方向。 -->

## 4. 导入规范 (Imports)
禁止 wildcard imports。顺序：`java` → `javax` → `com.*` → `org.*` → static last。
```java
import java.time.Instant;
import java.util.Optional;
import javax.annotation.Nullable;
import com.acme.order.domain.Order;
import org.slf4j.Logger;
import static org.assertj.core.api.Assertions.assertThat;
```
禁止：`import java.util.*;`、跨模块 internal 包导入、循环依赖。

## 5. 错误处理 (Error Handling)
决策树：调用方可恢复且必须处理 → checked；业务规则失败/编程错误 → unchecked。
```java
public final class BusinessException extends RuntimeException {
  private final String code;
  public BusinessException(String code, String message, Throwable cause) {
    super(message, cause);
    this.code = code;
  }
  public String code() { return code; }
}
```
| DO | DON'T |
|---|---|
| 捕获具体异常 | `catch (Throwable t)` |
| 记录或传播，不重复 | 空 catch block |
`Optional<T>` 用于可空返回；参数可空必须标注 `@Nullable`，默认 non-null。

## 6. 日志规范 (Logging)
使用 SLF4J interface；实现由运行时选择。使用参数化日志和 MDC。
```java
private static final Logger log = LoggerFactory.getLogger(OrderService.class);
log.info("order created userId={} orderId={}", userId, orderId);
log.error("order creation failed requestId={}", requestId, exception);
```
MDC 字段：`traceId`, `requestId`, `userId`。禁止字符串拼接日志；禁止记录 secret/PII。

## 7. 测试规范 (Testing)
框架：JUnit 5；断言：AssertJ 优先于 Hamcrest；覆盖率 Jacoco `{coverage_threshold}`，默认 80%。
```java
class OrderServiceTest {
  @Test
  void createsOrderWhenInputIsValid() {
    var command = new CreateOrderCommand(userId, items);
    var order = service.create(command);
    assertThat(order.status()).isEqualTo(OrderStatus.CREATED);
  }
}
```
测试位于 `src/test/java`；单元测试不启动完整 Spring context；mock 外部端口。

## 8. 注释与文档 (Comments & Docs)
公共 API 必须 Javadoc，`@param/@return/@throws` 完整。
```java
/**
 * Creates an order after validating domain invariants.
 * @param command validated order command
 * @return created order
 * @throws BusinessException when stock is insufficient
 */
public Order create(CreateOrderCommand command) { }
```
README 包含构建、运行、配置、API、运维。

## 9. Git 规范
- 分支：`feature/{ticket}-{slug}`、`bugfix/{ticket}-{slug}`。
- Commit：Conventional Commits。
- PR：包含测试、Jacoco、迁移脚本、兼容性和回滚计划。

## 10. Code Review checklist
- 是否有 wildcard import、空 catch、catch Throwable？
- Optional 是否只用于返回值？nullability 是否明确？
- 日志是否参数化并带 trace context？
- 单元测试是否避免过重 Spring context？

## 11. 性能规范 (Performance)
避免：过早优化、循环中数据库调用、无界线程池、字符串大量拼接、同步锁扩大范围。
工具：JFR、async-profiler、JMH。生产问题先采样再优化，优化必须有基准数据。

## 12. 依赖管理 (Dependencies)
- 使用 Maven/Gradle 严格版本策略；禁止动态版本 `+`。
- CI 运行 OWASP dependency-check Maven/Gradle plugin。
- 新依赖说明许可证、CVE、维护状态、传递依赖影响。
