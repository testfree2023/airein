# Test Plan: Airein

> **测试策略文档**
> 版本: v0.1.0 · License: Apache-2.0

---

## 测试理念

airein 是「把工程规范变成代码保证」的框架——它自身也必须被同样的标准约束。**铁律 1（禁止无测试的生产代码）适用于 airein 自己的 `scripts/lib/*.js`**：每个纯函数库必须有对应测试，测试先于实现（RED→GREEN）。

## 测试分层

| 层 | 对象 | 策略 |
|----|------|------|
| **lib 纯函数** | `scripts/lib/*.js`（validate / parse / resolve 等无副作用函数） | 直接单测，**主战场** |
| **hook 适配层** | `scripts/hooks/*.js`（读 stdin、调 lib、exit code） | 通过其调用的 lib 间接覆盖，不直接测进程 |
| **编排脚本** | `*.sh`（setup / sync / clean / verify） | 纯编排**豁免单测**，靠 `verify-airein.sh` 回归 + 人工验证 |
| **配置/模板** | `quality.json` / `templates/**` | 结构校验测试（JSON 合法性、模板引用完整） |

> 分层不变量：`lib/` 是纯函数（无 stdin/stdout/exit 副作用），`hooks/` 是适配层；测试只直测 `lib/`，hook 行为通过 lib 间接验证。这让测试快、稳定、不依赖 CC 运行时。

## 测试骨架

**自研**（零依赖原则，不引入 Jest/node:test）：

- 入口：`test/helpers.js`，提供 `describe` / `assertOk` / `assertEqual` / `assertContains` / `assertNotContains` / `projectRoot` / `readSkill` / `printSummary`
- 用例文件：`test/test-{subject}.js`
- 运行：`node test/test-*.js` 单个，或 `bash test/run-all.sh` 全量
- 路径解析：`projectRoot()` 通过 `__dirname` 定位仓库根（**不依赖 cwd**）

## 关键覆盖域（v0.1.0，35 个测试套件）

| 域 | 代表测试 | 验证什么 |
|----|---------|---------|
| 铁律强制 | `test-enforcement-hooks`, `test-commit-gate`, `test-bash-bypass` | 无测试源码被阻断、commit 前跑测试、bash 绕写源码被拦 |
| 审批流水线 | `test-approval-sequence`, `test-integration-approval`, `test-archive-trigger` | R→D→T 顺序、approval-guard 状态保护、完成触发归档 |
| 计划系统 | `test-plan-system`, `test-new-plan-establishing`, `test-compound-docs`, `test-pipelines` | plan 目录结构、establishing/referencing 分流、复合文档、8 pipeline |
| 自学习 | `test-self-learning`, `test-self-learning-prompt` | 三层流转（buffer→archive→promotion）、阈值晋升、不碰 memory |
| 文档/规则 | `test-conventions-shell`, `test-rules-deployment`, `test-project-docs`, `test-doc-file-warning` | 薄壳校验、L0 三文件部署、文档结构、薄壳缺失 fail-fast |
| 配置 | `test-quality-config`, `test-language-config`, `test-flow-control`, `test-global-language-profiles` | quality.json 解析、语言 profile、flowControl 开关 |
| 兼容性 | `test-deep-path`, `test-monorepo-root`, `test-dashboard-plan-config`, `test-regression-gate-roadmap` | 深路径、monorepo、单文件 plan 兼容、roadmap 一致性 |
| 质量 | `test-js-syntax`, `test-json-validity`, `test-no-superpowers`, `test-guard.test` | 语法、JSON 合法、无外部品牌残留、guard 行为 |

## 覆盖率目标

**≥ 80%**（单元 + 集成），见 `rules/00-iron-rules.md` 测试纪律。`quality.json` → `testCoverage` 提供可调阈值：

| 配置项 | 含义 | 默认 |
|--------|------|------|
| `minRatio` | 最小测试/源码比 | 0.3 |
| `minSourceFiles` | 触发覆盖检查的最小源文件数 | 2 |
| `functionThreshold` | 函数数阈值 | 3 |

`blocking.untestedSource: true` + `testGuard.mode: "strict"` → 无测试的源文件编辑被 `exit 2` 硬阻断。

## 回归门禁

### 提交前（编辑时）

- **test-guard**（PreToolUse）：创建/编辑源文件时要求对应测试已存在（strict 模式 `exit 2`）
- **commit-gate**（PreToolUse git commit）：跑 build + test，失败阻止提交
- **regression-test-gate**：bugfix 必须有复现测试覆盖

### 部署后（`verify-airein.sh`）

`bash verify-airein.sh ~/.claude` 执行 6 项完整性检查，任一失败返回非 0：

1. 解析 `hooks.json` 提取全部引用的脚本路径
2. 校验每个引用脚本在安装目标存在
3. `node --check` + `require()` 校验依赖完整（捕获缺失依赖）
4. 交叉校验关键 hook（test-guard/plan-gate/stop-test-gate/session-start）已注册进 `settings.json`
5. 校验 `lib/` 核心模块（utils/quality-config/airein-logger/plan-parser/hook-flags/shell-split）就位
6. 校验 L0 `rules/{00,10,20}-*.md` 三文件就位

## 测试纪律（铁律展开）

- **TDD**：写测试（RED）→ 实现（GREEN）→ 重构（IMPROVE）
- 修实现，不修测试；卡住用 `tdd-guide` agent
- 测行为不测实现细节
- bugfix：先写复现测试（RED）再修
- 测试**不依赖外部网络**（离线可跑）

## E2E / 端到端

CC hook 的真实触发行为无法在单测里模拟（需要真实 CC 会话），靠：

- `verify-airein.sh` 部署后回归（脚本就位 + 依赖完整 + 注册正确）
- 真实 CC 会话人工验证（hook 真实触发、阻断/放行行为）
- dashboard E2E（浏览器手动走查：项目发现、plan 查看/编辑、approval 工作流、配置可视化）

## 不测什么

- **CC 运行时本身**：不测 CC 如何调度 hook（那是 CC 的职责）
- **模型行为**：不测模型是否遵守 prompt（prompt 是建议，无法测；只测 hook 是否阻断违反）
- **第三方依赖**：airein 零 npm 依赖，无第三方测试负担
