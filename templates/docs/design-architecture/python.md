<!-- TEMPLATE: python.md — Python 项目架构设计模板 -->
<!-- 用途：l-feature / l-bugfix 的 design-architecture 子文档 -->
<!-- 位置：docs/plans/P{NNN}-{slug}/design-architecture.md -->
<!-- AI 生成指引：从 tech-stack.md 和 language-profile 推导，按以下结构完整填写 -->

# Design: 项目架构 (Python)

> 子文档 of [design.md](design.md) | 本文档描述 Python 项目的架构设计

## Python Version & Features

<!-- AI 生成指引：从 pyproject.toml 或 .python-version 提取版本 -->
- **Python 版本**: `{3.10|3.11|3.12}+`
- **关键特性利用**:
  - 3.10+: `match/case` 结构模式匹配 (替代深层 if-elif)
  - 3.10+: `|` 联合类型语法 (`str | None` 替代 `Optional[str]`)
  - 3.11+: `Self` 类型、`ExceptionGroup` 并发异常处理
  - 3.12+: `@override` 装饰器、PEP 695 泛型语法 `class Foo[T]:`

## Package Management

<!-- AI 生成指引：检查 pyproject.toml 和 lockfile -->
- **工具**: `{poetry|uv|pip+pip-tools}`
- **选择理由**: {依赖解析速度 / lockfile 可复现性 / 包发布支持 / 团队经验}
- **pyproject.toml 结构**:
  ```toml
  [project]
  name = "{project-name}"
  requires-python = ">=3.11"
  dependencies = [ ... ]
  [project.optional-dependencies]
  dev = ["pytest", "ruff", "mypy", ...]
  [tool.ruff] # linter/formatter 统一配置
  [tool.mypy] # 类型检查配置
  [tool.pytest.ini_options] # 测试配置
  ```

## Project Structure

<!-- AI 生成指引：从实际目录结构推导，说明 src layout 的利弊 -->
```
{project_slug}/
├── src/
│   └── {package_name}/
│       ├── __init__.py          # 公开 API 导出
│       ├── main.py              # 入口：FastAPI app 工厂 / CLI main
│       ├── api/
│       │   ├── __init__.py
│       │   ├── routes/          # API 路由 (按资源分文件)
│       │   ├── dependencies.py  # FastAPI Depends 函数
│       │   └── middleware.py    # 请求中间件
│       ├── services/            # 业务逻辑层
│       ├── repositories/        # 数据访问层 (SQLAlchemy/DynamoDB)
│       ├── models/              # ORM 模型 / Pydantic 模型
│       │   ├── domain.py        # 纯数据类，无 ORM 依赖
│       │   └── orm.py           # SQLAlchemy 映射
│       ├── schemas/             # Pydantic schemas (请求/响应/验证)
│       ├── core/
│       │   ├── config.py        # 配置加载 (pydantic-settings)
│       │   ├── exceptions.py    # 自定义异常类
│       │   └── logging.py       # 日志配置
│       └── utils/               # 纯函数工具
├── tests/
│   ├── conftest.py              # 共享 fixtures
│   ├── factories/               # factory_boy 工厂
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── migrations/                  # Alembic 迁移
├── scripts/                     # 运维/数据脚本
├── Dockerfile
├── pyproject.toml
└── alembic.ini
```
- **src layout 优势**: 防止意外导入未安装的包；强制可编辑安装 (`pip install -e .`)
- **`__init__.py` 约定**: 每个包的 `__init__.py` 仅做 re-export，不包含实现逻辑

## Framework Selection

<!-- AI 生成指引：根据项目类型和性能需求选择 -->
| 框架 | 适用场景 | 特点 |
|------|---------|------|
| FastAPI | {REST API / 微服务} | 类型驱动、自动 OpenAPI、async 原生 |
| Django | {全栈 / 后台管理} | 电池全包、ORM、Admin、模板 |
| Flask | {轻量 API / 原型} | 最小核心、按需扩展、学习曲线低 |

- **选择**: `{FastAPI|Django|Flask}`
- **理由**: {async 需求 / 自动文档 / 生态插件 / 团队经验}

## Layered Architecture

<!-- AI 生成指引：标注每层的关键 Python 模块和类型 -->
```
HTTP Request → Middleware (CORS, request-id, timing)
    → API Routes (FastAPI APIRouter / Flask Blueprint)
        → [Pydantic Schema 验证请求体 ← schemas/]
    → Dependencies (Depends: DB session, current user, auth)
        → Services (纯业务逻辑，参数和返回类型注释)
            → Repositories (数据访问抽象)
                → ORM Models (models/orm.py)
                    → PostgreSQL / Redis / S3
    → Response Model (Pydantic 序列化响应)
```

## Type Hints & Static Analysis

<!-- AI 生成指引：说明项目的类型注释约定和检查工具 -->
- **类型检查器**: `mypy` (strict 模式) 在 CI 中运行
- **Mypy 配置**:
  ```ini
  [mypy]
  strict = true
  plugins = ["pydantic.mypy", "sqlalchemy.ext.mypy.plugin"]
  ```
- **高级类型模式**:
  - `Protocol` 定义 structural subtyping (DuckDB-like 接口)
  - `TypedDict` 用于 dict 结构约束
  - `TypeVar` / `ParamSpec` 用于泛型函数和装饰器
  - `Final` 标记不可覆盖的常量和方法
- **运行时验证**: Pydantic v2 提供类型注解的运行时校验，与 mypy 互补

## Async Architecture

<!-- AI 生成指引：说明 async/await 使用边界，哪些用 async 哪些不用 -->
- **ASGI 服务**: 使用 `async def` 路由处理函数
- **async 边界**: Controller/Routes 用 `async def` → Service/Repository 内部涉及 IO 的用 async，纯计算用 sync def
- **后台任务**:
  - 轻量: FastAPI `BackgroundTasks` (同一进程内，适合发邮件、通知)
  - 重量: Celery + Redis/RabbitMQ (独立 worker，适合长时间处理、重试逻辑)
- **Task Queue**: Celery 任务定义在 `src/{package}/tasks/` 目录
- **连接池**: SQLAlchemy async engine 使用 `NullPool` 或 `QueuePool` (按需配置)
- **信号处理**: `asyncio.gather` 管理多协程并发，`asyncio.wait_for` 设置超时

## ORM & Data Access

<!-- AI 生成指引：从 requirements 或现有代码推导 -->
- **ORM**: `SQLAlchemy 2.0+` (async 模式)
  - 使用 `mapped_column()` 声明式映射
  - `select()` 语句，不用 Query API (1.x legacy)
- **迁移**: Alembic — `alembic revision --autogenerate` 生成，`alembic upgrade head` 执行
- **Repository 模式**:
  ```python
  class UserRepository:
      async def find_by_email(self, db: AsyncSession, email: str) -> User | None: ...
      async def create(self, db: AsyncSession, user: UserCreate) -> User: ...
  ```
- **查询优化**: `selectinload()` 避免 N+1，`limit/offset` 分页

## Testing

<!-- AI 生成指引：从 pyproject.toml 和 conftest.py 推导测试配置 -->
- **测试框架**: `pytest` + `pytest-asyncio` (async 测试)
- **Fixtures**: `conftest.py` 定义共享 fixture — DB session、test client、mock services
- **HTTP 测试**: `httpx.AsyncClient` + `httpx.ASGITransport` (无需真实 HTTP server)
- **数据工厂**: `factory_boy` 或手写 `create_test_*` 工厂函数
- **Mock**: `unittest.mock.AsyncMock` 用于外部 API；DB 测试使用真实 SQLite (内存) 或 testcontainers
- **测试分层**:
  - Unit: 测试 Service 纯逻辑 (mock Repository)
  - Integration: `httpx.AsyncClient` 调用路由，命中真实 DB
  - E2E: 针对 staging 环境验证关键流程
- **覆盖率**: `pytest-cov` — ≥ 80%，`--cov-fail-under=80`

## Error Handling

<!-- AI 生成指引：定义异常类层次和处理策略 -->
```python
class AppError(Exception):
    """应用基类异常"""
    def __init__(self, message: str, status_code: int = 500, code: str = "INTERNAL_ERROR"): ...

class NotFoundError(AppError): status_code = 404
class ValidationError(AppError): status_code = 422
class UnauthorizedError(AppError): status_code = 401
class ConflictError(AppError): status_code = 409
```
- **FastAPI 异常处理器**: 注册 `@app.exception_handler(AppError)` 统一序列化
- **Controller 层**: 不吞异常，抛出 AppError 子类让全局 handler 处理
- **Service 层**: 可返回 `Result` 类型或抛 AppError，全项目统一选择一种

## Configuration Management

<!-- AI 生成指引：从 config.py 或 .env 文件推导 -->
- **配置库**: `pydantic-settings` — 类型安全的 settings 类
  ```python
  class Settings(BaseSettings):
      model_config = SettingsConfigDict(env_file=".env")
      database_url: str
      redis_url: str
      secret_key: str
      debug: bool = False
  ```
- **环境变量**: `.env` 本地开发，docker-compose / K8s envFrom 注入生产
- **敏感信息**: `SecretStr` 类型标记，防止意外打印/序列化

## Logging

<!-- AI 生成指引：从 logging 配置或 structlog 惯用法推导 -->
- **日志库**: `structlog` (结构化日志) + 标准库 `logging` 作为后端
- **日志格式**: JSON 输出 (生产)，彩色 console (开发)
- **上下文绑定**: 使用 `structlog.contextvars.bind_contextvars(request_id=str(uuid4()))` 在中间件中绑定
- **级别**: `error` → `warning` → `info` (业务事件) → `debug` (开发细节)

## Performance & Profiling

<!-- AI 生成指引：列出性能分析和优化工具 -->
- **Profiling**:
  - `cProfile` + `snakeviz` 可视化函数调用耗时
  - `py-spy` 生产环境无侵入采样
  - `memory_profiler` 检测内存泄漏
- **ASGI Workers**: `gunicorn + uvicorn.workers.UvicornWorker` 多进程
- **Worker 数**: `(2 * CPU_CORES) + 1` 起始值，根据 IO 密集度调整
- **连接池**: SQLAlchemy `pool_size` 配置，避免 exceed max_connections

## Deployment

<!-- AI 生成指引：从 Dockerfile 或 CI 配置推导 -->
- **容器化**: Docker multi-stage — builder 阶段安装依赖 → runtime 阶段仅复制必要文件
- **WSGI/ASGI 服务**: `gunicorn + uvicorn` 或纯 `uvicorn`
- **反向代理**: Nginx/Caddy (建议; 可选)
- **健康检查**: `/health` 端点返回 DB/Redis 连通状态

## Security

<!-- AI 生成指引：列出 Python 特有的安全考量 -->
- **依赖审计**: `pip-audit` 或 `safety` 在 CI 中检查已知漏洞
- **输入验证**: Pydantic models 校验所有请求体、查询参数、路径参数
- **SQL 注入**: SQLAlchemy 参数化查询，禁止 f-string 拼接 SQL
- **代码注入防护**: 禁用 `eval()` / `exec()`，禁止 `pickle` 反序列化不可信数据
- **密钥管理**: 生产 secret 通过 K8s Secrets / Vault 注入，不从 .env 文件读取

## Status: draft
