# 文档模板 —— AI 产出质量的「模具」，可在面板里持续打磨

> 与根目录 [README.md](../README.md) / [README.en.md](../README.en.md)「文档模板」小节同源；此处留作速查。

`/new-plan` 与 `/init-project` 并不是凭空写文档：它们从内核 **`~/.airein/templates/`** 取出结构模板，再按任务复杂度（s / m / l）填进计划目录。模板定的是**章节、口径与禁写项**；模型填的是具体业务内容。模板越贴你的工程习惯，AI 越难写出「看起来像需求、其实无法验收」的薄摘要。

## 模板在流水线里管什么

| 模板族 | 作用（举例） |
|--------|----------------|
| `requirements/{s,m,l}.md` | 产品需求说明书（PRD）：业务流程 → User Story → Use Case（UC-id），而不是 Problem + WHEN/THEN 摘要 |
| `design/{s,m,l}.md` + 子文档 | 技术方案分档：该穷举的决策面写清，避免空对空架构散文 |
| `test-plan/{m,l}.md` | 测试**设计规格**：Critical / VS / 不变量；不抄逐步用例百科 |
| `tasks.md` | Implement / Verify / Deploy / Accept；强制 Source 追溯与 `Depends on` 机读契约（Dashboard Progress 面板靠它解析） |
| `deployment.md` / `roadmap.md` / `tests.md` 等 | 发布运维、项目状态索引、TDD 台账等配套 |

效果可以概括成：**UC → 设计 → 测试设计 → 可调度任务** 一条可追溯链。dogfood 里完整走完 `l-feature` 流水线时，你会明显感到「拆任务带 UC、验收看 Critical/VS」比早期自由发挥稳得多——那正是模板在起作用，而不只是换了更强的模型。

## 如何用面板持续升级「适合自己的模板」

1. 启动 Dashboard → 侧栏点 **模板**（`http://localhost:3456/#/templates`）。
2. 按分类打开计划文档 / 项目文档等，在线编辑后保存——写回的是本机 **`~/.airein/templates/`**（与 `/new-plan` 读取的是同一套）。
3. 也可以直接改磁盘上的 `~/.airein/templates/docs/*.md`；下次开新计划即生效。
4. **迭代方式**：发现某次 AI 产出偏软（缺 UC、tasks 不可解析、test-plan 太空）→ 回到对应模板补「必填节 / 负面约束 / 示例行」→ 再开一个小计划验证，而不是只靠口头纠正模型。

Dashboard 支柱小节里对应的一句话入口：侧栏 **模板**（`#/templates`）是持续打磨 AI 产出质量的主入口。

## 升级时注意

- `airein update` 会**按清单覆盖**内核里的结构模板（`templates/docs/**` 等），以便你拿到上游改进。
- `templates/pipelines.json` 是**合并**：自定义 pipeline 定义会保留。
- 若你对某份模板做了深度本地定制，升级前请自行备份或 diff；稳定后的改法更建议贡献回上游仓库，或在团队内维护一份「模板补丁」流程，避免下次更新被静默冲掉。

模板是 airein 里最值得长期积累的资产之一：**钩子守红线，模板定写法**——二者一起，才把「提效」变成「可控的提效」。
