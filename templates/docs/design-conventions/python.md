<!-- TEMPLATE: python.md — Python 工程规范模板 -->
<!-- 用途：l-feature / l-bugfix 的 design-conventions 子文档 -->
<!-- 位置：docs/plans/P{NNN}-{slug}/design-conventions.md -->
<!-- AI 生成指引：基于 Python 社区最佳实践和团队约定填写 -->
# Design: 工程规范 (Python)
> 子文档 of [design.md](design.md) | 本文档定义 Python 项目的代码与工程规范
<!-- AI 生成指引：替换 {project_name}、{package_name}、{python_version}、{coverage_threshold}、{package_manager}。 -->

## 1. 命名约定 (Naming)
| 对象 | 约定 | 示例 | 禁止 |
|---|---|---|---|
| 文件/模块/包 | snake_case | `user_service.py`, `order_api/` | `user-service.py` |
| 类 | PascalCase | `UserService` | `user_service` |
| 函数/变量 | snake_case | `calculate_total` | `calculateTotal` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` | `max_retry_count` |
| 私有成员 | `_underscore` | `_parse_token` | `privateParse` |
| 异常 | PascalCase + Error | `UserNotFoundError` | `UserException` |
布尔值使用 `is_`, `has_`, `can_`；避免 `data`, `obj`, `tmp`。

## 2. 代码风格 (Code Style)
Formatter: black line 100；Imports: isort；Linter: ruff replaces pylint+flake8；Types: mypy --strict。
```toml
[tool.black]
line-length = 100
target-version = ["py{python_version}"]
[tool.isort]
profile = "black"
[tool.ruff]
line-length = 100
select = ["ALL"]
ignore = ["D203", "D213", "COM812", "ISC001"]
[tool.mypy]
strict = true
warn_unused_ignores = true
warn_return_any = true
```
| DO | DON'T |
|---|---|
| 公共 API 显式类型标注 | 公共函数无返回类型 |
| `pathlib.Path` | 字符串拼路径 |

## 3. 目录结构 (Directory Layout)
```text
{project_name}/
├─ src/{package_name}/
│  ├─ __init__.py
│  ├─ config.py       # 配置模型与加载
│  ├─ domain/         # 纯业务对象
│  ├─ services/       # 用例编排
│  ├─ adapters/       # DB/HTTP/Queue 适配
│  └─ cli.py          # CLI 入口（如适用）
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  └─ conftest.py     # 共享 fixtures
└─ pyproject.toml
```
<!-- AI 生成指引：Django/FastAPI 项目补充框架层目录，但保持 domain 可测试。 -->

## 4. 导入规范 (Imports)
顺序：stdlib → third-party → first-party；组间空行；由 isort 自动整理。
```py
from pathlib import Path
from typing import Final
import httpx
from pydantic import BaseModel
from {package_name}.domain.user import User
```
禁止：通配符导入、无说明的函数内部导入、跨层反向依赖。

## 5. 错误处理 (Error Handling)
使用具体异常；禁止 bare `except`；建立自定义异常层级。
```py
class AppError(Exception):
    """Base exception for application errors."""

class UserNotFoundError(AppError):
    """Raised when a user cannot be found."""
```
| DO | DON'T |
|---|---|
| `except httpx.TimeoutException as exc` | `except:` |
| `raise AppError(...) from exc` | 丢弃原始异常上下文 |
边界层统一转换响应；service/domain 不直接返回 HTTP response。

## 6. 日志规范 (Logging)
使用 stdlib `logging` + `dictConfig`；生产使用 JSON formatter；禁止 `print()`。
```py
logger.info("user_created", extra={"user_id": user_id, "request_id": request_id})
logger.exception("user_create_failed", extra={"request_id": request_id})
```
级别：DEBUG 诊断，INFO 业务事件，WARNING 可恢复异常，ERROR 请求失败，CRITICAL 服务不可用。
禁止记录 token、密码、cookie、完整 PII。

## 7. 测试规范 (Testing)
框架：pytest；文件：`tests/**/test_*.py`；覆盖率 `{coverage_threshold}`，默认 85%。
```py
def test_calculate_total_applies_discount() -> None:
    cart = Cart(items=[Item(price=100)], coupon="SAVE10")
    total = calculate_total(cart)
    assert total == 90
```
fixtures 优于 `setUp`；`parametrize` 优于循环断言；mock 外部 IO，不 mock 领域逻辑。

## 8. 注释与文档 (Comments & Docs)
公共 API 使用 Google style docstring；所有公共 API 必须类型标注。
```py
def create_user(input_data: CreateUserInput) -> User:
    """Create a user from validated input.

    Args:
        input_data: Validated user creation data.
    Returns:
        Created user entity.
    Raises:
        UserAlreadyExistsError: If email is already used.
    """
```
README 包含安装、运行、测试、配置、部署。

## 9. Git 规范
- 分支：`feature/{ticket}-{slug}`、`bugfix/{ticket}-{slug}`。
- Commit：Conventional Commits。
- PR：包含 mypy/ruff/pytest 结果、迁移说明、风险和回滚方式。

## 10. Code Review checklist
- 是否存在 bare except、`print()`、未加类型的公共 API？
- mypy strict 是否通过？ruff 豁免是否明确？
- 异常是否保留 cause？日志是否泄漏敏感数据？
- 是否有 eager evaluation、N+1 查询或循环内 IO？

## 11. 性能规范 (Performance)
避免：循环内重复 IO、一次性加载大文件、无界 list 累积、热路径反复创建正则/客户端。
工具：`cProfile`、`py-spy`、`scalene`、`pytest-benchmark`；大数据使用生成器/迭代器。

## 12. 依赖管理 (Dependencies)
- 使用 `{package_manager}` 和 lock file 固定版本。
- 新依赖说明用途、维护状态、许可证。
- CI 运行 `pip-audit`；使用 Dependabot/Renovate。
- 禁止未固定生产依赖。
