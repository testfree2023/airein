# Airein（自开发仓库）

> airein 自身的开发仓库。L0 指令（铁律 / 架构 / 工作流）住在 `rules/*.md`，安装后由
> CC 原生 `processMdRules` 自动加载（User type，纯拼接，无 override 语义）；本文件不
> 重复其内容——同一条规则只住一处。
>
> 工程规范：`docs/conventions-javascript.md` + `docs/conventions-bash.md`（编辑匹配
> 源文件时由 CC 条件规则薄壳 `.claude/rules/conventions-*.md` 自动注入）。架构总览：
> `docs/design.md`；产品愿景：`docs/requirements.md`；项目状态：`docs/roadmap.md`
> （形态契约见 `templates/docs/roadmap.md`）。

## Agent Teams v0

> **Pipeline Roles**（Agent Teams v0 · 规划/质量最小团队协议）。主会话 = **PM**（编排，不包办专长产出）。

| 节点 | 角色 |
|------|------|
| 编排 / progress | `agents/pm.md` |
| `requirements` | `agents/product-expert.md` |
| `design` | `agents/tech-lead.md` · **mode: design** |
| review / `/code-review` / security STOP | `agents/tech-lead.md` · **mode: review** / **security** |

- 角色产出须对齐 `templates/docs/` 对应文档模板。
- 实现期仍可由 `skills/tdd` 与 main 执行（完整实现期 Teams 另案）。
- 强制节点未派角须在 progress Notes 显式豁免。

<!-- airein:pipeline-roles-banner -->
