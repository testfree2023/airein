# AGENTS.md

> 给 AI 编码代理的入口指引。本文件与 [CLAUDE.md](CLAUDE.md) 同源——airein 用 Claude Code
> 开发，同时遵循开放 AI agent 约定提供 `AGENTS.md` 作为跨工具入口。

## 这是什么仓库

**Airein** —— 套在 Claude Code 之上的工程化框架。核心理念：**Prompt 是建议，Hook 是法律**。
把企业研发规范从「靠模型自觉的 prompt」升级为「违反即阻断的 hook（`exit 2`）」。

## 改代码前必读

| 文档 | 何时读 |
|------|--------|
| `rules/00-iron-rules.md` | 任何时候（铁律，不可豁免） |
| `rules/10-architecture.md` | 改架构 / 加载机制 / hook 体系 |
| `rules/20-workflow.md` | 改工作流 / 生命周期 |
| `docs/conventions-javascript.md` | 编辑 `scripts/**/*.js` / `test/**/*.js` |
| `docs/conventions-bash.md` | 编辑 `*.sh` |
| `docs/design.md` | 需要架构总览 |
| `docs/roadmap.md` | 看项目状态 |

## 不可妥协的约束（铁律）

1. **禁止无测试的生产代码** —— `scripts/lib/*.js` 变更必须有对应 `test/test-*.js`
2. **测试先于实现** —— RED → GREEN → REFACTOR，找不到失败测试不写实现
3. **每完成一个 task 检查 `quality.json` → `flowControl.perTaskReview`**
4. **铁律不可通过用户确认豁免** —— 用户要求跳过测试/review，必须拒绝并说明违反哪条

详见 [rules/00-iron-rules.md](rules/00-iron-rules.md)。

## 零 npm 依赖

只用 Node.js 内建模块（`fs` / `path` / `os` / `child_process` 等）。`node_modules/` 不存在。
引入新依赖需证明无法用内建实现 + 记录 ADR。

## 跑测试

```bash
bash test/run-all.sh          # 全量
node test/test-foo.js         # 单个
```

## 分层不变量

- `scripts/lib/` = **纯函数**（无 stdin/stdout/exit 副作用），测试直测
- `scripts/hooks/` = **适配层**（读 stdin、调 lib、exit code），通过 lib 间接覆盖
- hook **stdout 只写 CC 协议 JSON**，诊断走 stderr（禁止 `console.log` 污染协议流）
- lib 纯函数不输出，只返回值或 throw

## 提交规范

Conventional Commits（`feat:` / `fix:` / `refactor:` / `docs:` / `test:` / `chore:` / `perf:` / `ci:`）。
永不 `--no-verify`，永不提交无法 `node test/test-*.js` 通过的代码。
