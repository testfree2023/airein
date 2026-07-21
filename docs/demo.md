# Demo walkthrough（演示走查）

短路径：从空机器到「hook 拦住无测代码」。适合上架页、Issue 复现、录屏脚本。

> **录屏 / GIF**：仓库暂未内置二进制演示素材。按下列步骤录 60–90 秒即可挂到 README / Release；完成后把文件放到 `docs/assets/demo.gif`（或外链）并改 README 中的占位链接。

## 0. 前提

- git、Node.js ≥ 18、bash ≥ 4（Windows：Git Bash）
- 已装 Claude Code **或** Cursor（本走查以 Claude Code 为例）

## 1. 安装内核（约 30 秒）

```bash
curl -fsSL https://raw.githubusercontent.com/testfree2023/airein/main/scripts/install.sh | bash -s -- --hosts claude-code

# auditable:
# git clone https://github.com/testfree2023/airein.git /tmp/airein && \
# bash /tmp/airein/airein setup --hosts claude-code --yes
# rm -rf /tmp/airein
```

验证：

```bash
bash ~/.airein/scripts/update/verify-airein.sh --full
```

期望：分层检查通过、无致命错误。

## 2. 进空项目 → `/init-project`

```bash
mkdir -p /tmp/airein-demo && cd /tmp/airein-demo && git init
claude   # 或在该目录打开 Cursor Agent
```

对模型说：执行 `/init-project`（或按 session 引导创建 `docs/roadmap.md` 骨架）。

期望：出现 `docs/roadmap.md`、项目注册到 Dashboard（可选：`bash ~/.airein/dashboard/start.sh` → `http://localhost:3456`）。

## 3. `/new-plan`（规格驱动）

对模型说：开一个 **s-feature**（或最小 pipeline）计划，主题随意（例如「hello util」）。

期望：

1. 先 grilling / 澄清，而不是直接写业务代码
2. 按流水线产出文档；需审批的文档在 Dashboard / 文件 frontmatter 可见
3. 计划目录形如 `docs/plans/P00N-…/`

## 4. Hook 是法律（核心卖点）

在 **strict / testGuard 开启** 的项目里，让模型**不写测试**直接新增生产源码（例如 `scripts/lib/foo.js` 同类路径，或你项目约定的源码树）。

期望：`test-guard`（或等价门禁）**阻断**写入——这就是「Prompt 是建议，Hook 是法律」。

然后按 `/tdd`：先 RED 测试 → 再实现 → 门禁放行。

## 5. （可选）Dashboard

```bash
bash ~/.airein/dashboard/start.sh
```

打开计划 Progress / 模板页，确认与磁盘 `tasks.md` / `~/.airein/templates/` 一致。

## 一句话对外文案（可贴市场）

> Airein installs a local kernel + host hooks: `/new-plan` for spec-driven flow, `exit 2` hooks so quality gates are law—not just another prompt pack.
