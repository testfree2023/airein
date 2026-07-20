# Airein Integration Tests

零依赖测试套件，基于 Node.js 原生 `assert` + `vm` 模块。

## 运行

```bash
# 运行全部
bash test/run-all.sh

# 运行单个套件
node test/test-quality-config.js
node test/test-skill-chain.js

# 按关键词过滤
bash test/run-all.sh quality   # test-quality-config.js
bash test/run-all.sh chain     # test-skill-chain.js
bash test/run-all.sh anti      # test-anti-rationalization.js
bash test/run-all.sh flow      # test-flow-control.js
bash test/run-all.sh json      # test-json-validity.js
bash test/run-all.sh js        # test-js-syntax.js
bash test/run-all.sh clean     # test-no-superpowers.js
```

## 测试覆盖

| 文件 | 覆盖内容 | 断言数 |
|------|----------|--------|
| `test-quality-config.js` | DEFAULTS 结构、deepMerge 合并、flowControl 开关、quality.json 集成 | 36 |
| `test-skill-chain.js` | F1 链式传递：new-plan → tdd → tech-lead (review) | — |
| `test-tasks-template-sdlc.js` | tasks/test-plan 模板 + new-plan：SDLC / Entry Coverage / 角色入口 Must | — |
| `test-requirements-process-uc.js` | PRD：业务流程总览 + Story→UC + tasks 引用 UC-id | — |
| `test-anti-rationalization.js` | F2 防合理化表（≥8 条）、Red Flags、Iron Law、5 步验证门禁、声明/证据表 | 24 |
| `test-flow-control.js` | F3 每任务审查开关 + F4 worktree 隔离开关 + CLAUDE.md 新增段落 | 14 |
| `test-json-validity.js` | 所有 JSON 文件解析 + hooks.json 结构（5 个 event key） | 13 |
| `test-js-syntax.js` | 所有 .js 文件语法检查（vm.Script 解析） | 90 |
| `test-no-superpowers.js` | 无残留 superpowers 插件引用 | 4 |

## 添加新测试

1. 创建 `test/test-{name}.js`
2. 引入 `const { describe, assert, ... } = require('./helpers')`
3. 用 `describe('标题', suite => { suite.test('名', fn) => { ... }) })` 组织
4. 末尾加 `const { printSummary } = require('./helpers'); process.exit(printSummary());`
5. `run-all.sh` 会自动发现 `test-*.js` 文件
