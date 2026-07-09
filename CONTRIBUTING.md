# 贡献指南

感谢你对 Airein 的兴趣！Airein 是套在 Claude Code 之上的工程化框架，遵循「**Prompt 是建议，Hook 是法律**」。

## 开发环境

| 依赖 | 版本 | 说明 |
|------|------|------|
| Node.js | 18+ | hook 运行时（只用内建模块） |
| Bash | 4+ | 部署脚本（macOS / Linux / Git Bash on Windows） |
| git | 任意 | — |
| `shellcheck` / `shfmt` | 可选 | 编辑 `.sh` 时的静态检查与格式化 |

```bash
git clone git@github.com:testfree2023/airein.git
cd airein
bash test/run-all.sh   # 确认全绿
```

## 贡献流程

1. **Fork → 分支**：`feature/{topic}` / `bugfix/{topic}` / `chore/{topic}`
2. **先读规范**：
   - JS：[`docs/conventions-javascript.md`](docs/conventions-javascript.md)
   - Bash：[`docs/conventions-bash.md`](docs/conventions-bash.md)
   - 铁律：[`rules/00-iron-rules.md`](rules/00-iron-rules.md)
3. **TDD**：先写失败测试（RED）→ 实现（GREEN）→ 重构。`scripts/lib/*.js` 变更必须有对应 `test/test-*.js`。
4. **跑全量测试**：`bash test/run-all.sh` 必须全绿
5. **Commit**：见下方「[Commit message 规范](#commit-message-规范)」。**永不 `--no-verify`**。
6. **PR**：描述背景、方案、测试方式、回滚方式

### Commit message 规范

公开 commit message 是写给陌生贡献者的工程记录，只写**专业的事实（what + why）**：

- **DO**：改动做了什么、为什么这样改、影响范围。例：`fix: doc-file-warning 豁免 .claude/self-learning 路径，解除对自学习缓冲的误拦`。
- **DON'T**：不写内部沟通 / 博弈措辞（如「打脸」「(绝对承诺)」「目标 + 现状」这类私下讨论术语），不写会随时间腐烂的过程笔记——私下讨论留 PR / 对话，不进 commit。
- **Trailer 策略**：airein 公开提交**不加 `Co-Authored-By` trailer**。git 作者署名即维护者；如需说明 AI 协作，放 PR 描述，不挂每条 commit 的幽灵共同作者。
- 格式：`<type>: <description>`（Conventional Commits），body 用要点列 what / why。

## 不可妥协的约束

- **零 npm 依赖**：只用 Node.js 内建模块。引入新依赖需证明无法用内建实现 + 记录 ADR。
- **测试先于实现**：找不到失败测试，不写实现。
- **无硬编码密钥 / 代理地址 / 内部 IP**：敏感信息不得提交（包括注释）。
- **校验所有外部输入**：stdin JSON、文件路径、env 全部校验。

## 代码风格

- **JS**：2 空格缩进、单引号、行尾分号、行宽 < 100；CommonJS（非 ESM）；`const` 优先
- **Bash**：`set -euo pipefail`、2 空格缩进、变量双引号、shebang `#!/usr/bin/env bash`、`[[ ]]` 条件测试

## 分层不变量（贡献者必知）

- `scripts/lib/` = 纯函数（无 stdin/stdout/exit 副作用）—— 测试直测
- `scripts/hooks/` = 适配层（读 stdin、调 lib、写 stdout、exit code）—— 通过 lib 间接覆盖
- hook stdout 只写 CC 协议 JSON，诊断走 stderr；**禁止在 hook 逻辑里 `console.log`**

## 报告问题

提 issue 时请包含：

- 复现步骤
- 期望行为 vs 实际行为
- 环境（OS / Node 版本 / Claude Code 版本）

## 行为准则

参与本项目即表示你同意遵守 [Code of Conduct](CODE_OF_CONDUCT.md)。

## License

贡献的内容在 [Apache-2.0](LICENSE) 下授权。
