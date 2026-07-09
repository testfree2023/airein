# 10 — Architecture（架构事实 · 不变量）

> HOW the airein is wired。运行结构：加载机制、强制力分层、记忆体系——都是「结构事实」，非操作步骤。
> 互补：本文件管「结构事实」；WHAT MUST HOLD 见 `00-iron-rules.md`；HOW TO WORK 见 `20-workflow.md`。每条规则只住一处。

## 核心命题：Prompt 是建议，Hook 是法律

- **Prompt（CLAUDE.md / rules/*.md / SKILL.md）= 建议**：模型读到、理解、多数遵守，但可被绕过、可被上下文淹没、可被遗忘
- **Hook（exit 2 阻断）= 法律**：PreToolUse / PostToolUse 钩子是代码保证，违反即阻断，不依赖模型自觉
- 设计推论：能 hook 强制的，就不要只靠 prompt；hook 是底线，prompt 是上限

## 五层 JIT 上下文（按需加载，不全部注入）

| 层级 | 内容 | 实现机制 | 强制力 | Token |
|------|------|---------|--------|-------|
| L0 始终加载 | `rules/{00,10,20}-*.md` | CC 原生 `processMdRules` 加载 `~/.claude/rules/*.md`（User type，纯拼接） | ✅ 机制强制 | ~5K |
| L1 编辑触发 | `docs/conventions-{scope}.md` | CC 原生条件规则薄壳 `.claude/rules/conventions-{scope}.md`（`paths` + `@include`），编辑匹配文件时自动注入 | ✅ 机制强制 | ~50 |
| L2 技能按需 | `skills/*/SKILL.md` | CC 原生 skill 机制（`/skill` 触发） | ✅ 机制强制 | 0 |
| L3 知识库 | `docs/plans/*`, `docs/adr/*` | **无 hook**，指示用 subagent 读 | ⚠️ prompt 约定 | 0 |
| L4 会话状态 | session-state + roadmap + memory | `session-start.js` hook 注入 branch/plan/last_files | ✅ hook 强制 | ~200 |

> **横切生命周期**：CC memory（`~/.claude/projects/{key}/memory/`）每次 session 原生自动加载（~200–500 tok）；`pre-compact.js` 压缩前提取 Active Task + Decisions + Files + Pending（~800 tok）。
>
> **已知缺口**：L1 编辑触发已由 CC 原生条件规则薄壳承载（`.claude/rules/conventions-{scope}.md`，`paths` + `@include` docs/ 单一来源）。L3 知识库仍为 prompt 约定（无 hook，靠指示用 subagent 读）。

## CC 指令加载事实（源码确认）

- `~/.claude/CLAUDE.md` 与 `~/.claude/rules/*.md` 都以 **User type** 注入，**纯拼接，无 override 语义**（同一条规则写两处 = 出现两次 = token 浪费，不是"备份"）
- `processMdRules()` 读取 `~/.claude/rules/*.md` 的全部 `.md` 纯拼接；`00 / 10 / 20` 数字前缀用于在实践中保证注入顺序为 iron → architecture → workflow
- `/init` 只写项目 `<cwd>/CLAUDE.md`，**永不**触碰 `~/.claude/`；CC 升级也不动 `~/.claude/`

## 持久性排序（L0 住 rules/ 的根本理由）

持久性从低到高：

1. 项目 `<repo>/CLAUDE.md` — **易碎**：`/init` 覆盖、用户手改、迁移易丢
2. 全局 `~/.claude/CLAUDE.md` — **中**：用户领土，airein 不应写/覆盖（开源前提）
3. `~/.claude/rules/*.md` — **最耐久**：`/init`-safe + 升级-safe + 位置隐蔽

> 铁律与架构不变量住最耐久层（rules/），操作手册住易碎层（CLAUDE.md）——这是宪法 vs 操作手册分层的耐久性依据。

## CC Memory（保持纯净）

CC 原生自动加载的 memory 在 `~/.claude/projects/{sanitized-path}/memory/`（不是项目 `.claude/memory/`），是 CC 的领地：

- `memory.md` — 已确认的规则和偏好（≤100 行）
- `session-state.md` — 上次会话状态，新 session 自动恢复
- SessionEnd hook 同时写入项目 + CC memory 两个路径；`MEMORY.md` 索引精简（≤100 行），每个 memory 文件 ≤4KB

> **自学习不碰 memory**：memory 是 CC 的原生机制，airein 不往里写自学习数据（详见下方自学习三层）。

## Self-Learning 自学习（三层流转，不碰 memory）

模型在工作中搭车识别用户**持久允许/禁止**的指令，按 buffer → archive → promotion 三层流转晋升为永久规则。**无全局 `~/self-improving/` 目录**。

| 层 | 位置 | 写入者 | 用途 |
|----|------|--------|------|
| 缓冲 buffer | 项目 `.claude/self-learning/pending.md` | 模型（搭车识别） | 当轮捕获的待归档指令 |
| 存档 archive | `~/.claude/projects/{key}/self-learning-archive.md` | Stop hook（append-only） | 完整指令日志，按项目隔离 |
| 晋升 promotion | 项目 `rules/30-self-learned.md` | Stop hook（达阈值时写） | 晋升后的 L0 永久规则（CC 自动加载） |

**机制**：UserPromptSubmit hook 每轮注入"识别提示"，模型搭便车识别出持久允许/禁止指令就写入 buffer；Stop hook 把 buffer 追加进 archive，并统计同一指令累计次数，达 `quality.json selfLearning.promotionThreshold`（默认 3）即写入 `rules/30-self-learned.md`（晋升为 L0，下次 session 自动加载）。阈值 N=3 防偶发指令污染永久规则。

**skill**：`skills/self-learning/`（替代已退役的 `self-improving`）。

> **职责边界**：自学习三层**只**在自己的文件里流转，永不写 `memory/`。memory 保持 CC 原生纯净；自学习是旁路的规则晋升通道。

### 质量门禁（编辑代码后自动检查）

每次编辑代码文件后自动检查：新函数是否有对应测试？是否有 `console.log`/`print` 调试语句？是否有硬编码密钥/配置？是否有无 issue 的 TODO？发现问题立即提醒，不等提交。（规则实质见 `00-iron-rules.md` 编码铁律与测试纪律。）
