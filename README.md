# Airein

> 让 Claude Code 像一个入职半年的同事：懂项目规范、不碰不该碰的文件、改完自动跑测试、跨 session 还记得上次干到哪。

[English](README.en.md) | 简体中文

---

## 它解决什么问题

行业里鼓吹 AI 编程，常被戏称为"**日抛代码**"——让 AI 快速生成一个 POC、演示品、实验品，演示完就扔。在 hackathon、原型验证、一次性脚本这类场景里，这确实香。

但**中大型公司有稳定的业务系统、长期的维护负担、合规与审计要求**——它们不能接受日抛代码，也没必要花这个钱反复造。当前阶段，把 AI 编程用在正式研发上，成熟的价值不是"用生成替代工程师"，而是：**成倍提效的同时，让工程质量可控。**

难点恰恰在这里：AI 编码助手天生倾向跳过测试、无视规范、凭记忆编造接口、上下文一长就忘掉关键约束。直接放养，提效是真的，质量失控也是真的。

Airein 的论点很直接——**把企业研发流程抽象成 AI 能遵循的 spec-driven 流程，既拿到 AI 的提效，又守住质量红线。** 做法不是写更多 prompt 求模型自觉，而是把不可妥协的约束交给代码强制的 hook，把项目记忆交给按需加载的机制，让每一个新 session 都能像接班的同事一样快速进入状态。

核心理念一句话：**Prompt 是建议，Hook 是法律。** 写在 CLAUDE.md 里的规则是"建议"——模型读到、多数遵守，但会被上下文淹没、被绕过、被遗忘；而 hook 的 `exit 2` 是"法律"——代码保证，违反即阻断，不依赖模型自觉。能 hook 强制的，就不只靠 prompt。

---

## 三条核心能力

### 支柱一：`new-plan` —— 把研发流程变成 spec-driven 的 AI 协作

这是 Airein 最核心的能力，也是它和"随手让 AI 写代码"的根本区别。

`new-plan` 抽象了一套企业研发流程，让 AI 的工作按规范走，而不是一上来就埋头写代码：

```
沟通澄清（grilling）→ 按流水线产出文档 → 逐份审批 → TDD 实现 → 归档闭环
```

- **沟通澄清**：动手前先把模糊需求问清楚。一个一个问，挑战假设，用具体场景逼出边界，把"帮我做个 X"变成有验收标准的明确范围。
- **按流水线产出文档**：根据任务类型（s-feature / m-feature / l-feature / hotfix …）走对应的文档流水线——小型 bugfix 只需 `tasks`，中型功能要 `requirements → design → tasks`，大型功能再加 `test-plan`、`deployment`。文档即 spec，是后续实现的契约。
- **逐份审批门禁**：每份文档 draft → 你审批 → approved，才允许创建下一份。`approval-sequence` hook 强制顺序，`approval-guard` 保护审批状态不被擅自篡改。避免 AI 一次性铺开所有文档却没人审。
- **TDD 实现**：进入实现阶段后，`test-guard` 在 strict 模式下硬拦截"无测试的源码"——先有失败测试，才允许写实现。`pre-commit-gate` 在提交前跑 build + 测试 + 覆盖率。
- **归档闭环**：计划完成后 `/archive-plan` 归档，完成的计划不再污染活跃上下文。

效果：AI 提效的"快"拿到了，但每一步都有质量门禁兜底——这正是"日抛代码"做不到、而正式研发必须有的可控性。

### 支柱二：`init-project` + 项目记忆 —— 跨 session 不失忆

AI 编程的另一个老大难：**上下文一旦超限压缩，关键信息就丢了**，新 session 像失忆一样要你重新喂背景。

Airein 用一组机制让新 session 能快速恢复"上次干到哪、为什么这么决策、改过哪些文件"：

- **`/init-project`**：进入一个新项目时执行一次。自动判断是空项目还是已有项目——空项目只创建精简骨架（roadmap + session-state + memory），已有项目则扫描代码库、现有文档、隐藏配置，生成 `docs/roadmap.md`（含 Issues 与 Recent Changes），检测主语言写入配置。
- **会话状态恢复**：每个 session 结束时，`session-end` 把"当前计划、活跃任务、上次编辑的文件、待办"写进 `.claude/session-state.md`；下次 `session-start` 自动注入（约几百 token），AI 接着上次干，而不是从零问起。
- **压缩前抢救**：`pre-compact` 在上下文压缩前提取 Active Task / Decisions / Files / Pending，避免压缩把关键决策抹掉。
- **自动归档**：完成的计划归档进 `docs/plans/`，不挤占活跃视野；`/next` 会基于 roadmap 主动告诉你"当前最该做的是 XXX"。
- **自学习晋升**：你纠正过的偏好（"不要 X""以后都 Y"）， Airein 会累计识别，同一指令累计达到阈值就晋升为永久 L0 规则，下次 session 自动生效——不用你每次重复纠正。

### 支柱三：Dashboard —— 轻量级的项目文档与质量管理面板

文档和质量管理不能只靠命令行记忆。Airein 自带一个**极轻量**的浏览器面板，让你看得见、管得了：

```bash
node dashboard/server.js   # 开箱即用，浏览器自动打开 http://localhost:3456
```

它有多轻：**零 npm 依赖**（纯 Node 内建 `http`）、**单文件 SPA**（一个 `index.html` 内嵌 CSS+JS，无构建步骤）、hash 路由。不需要装任何东西，`node` 一跑就起来。

它能做什么：

- **项目自动发现**：扫描 `~/.claude/projects/`，任何有 `docs/plans/` 或 quality 配置的项目自动出现，无需注册。
- **计划管理**：可视化查看计划进度、编辑 requirements/design/tasks、按流水线审批、归档完成的计划。
- **模板管理**：浏览和在线编辑 airein 的文档模板、language profiles、pipelines。
- **配置可视化**：把项目的 `quality.json` 渲染成结构化表单（开关、阈值、下拉），每个字段标注默认值，只持久化你改过的字段——不用手写 JSON。
- **i18n**：中英文切换。

Dashboard 不是独立的系统，而是 airein 已有能力的可视化层——它读的是同一份 roadmap、同一份 quality.json、同一套 plan 目录。你在面板里改的配置，就是 hook 实际读的配置。

---

## 5 分钟上手

### 新机器：一键安装

前提：已装 Claude Code、git、Node.js，已配 SSH key。

```bash
# clone → 合并到 ~/.claude → 配置 → 验证 → 清理临时文件（一条命令）
git clone git@github.com:testfree2023/airein.git /tmp/airein && \
bash /tmp/airein/setup-airein.sh; rm -rf /tmp/airein
```

脚本不会覆盖你已有的 `~/.claude` 配置（settings.json、CLAUDE.md 等用户领土完全不动）。

### 进项目：直接用

```bash
cd /path/to/your-project
claude
```

- **新项目**：模型自动检测到没有 `docs/roadmap.md`，引导你执行 `/init-project`，只创建精简骨架。
- **进行中项目**：首次迁移时执行一次 `/init-project`，扫描代码库生成 roadmap 和项目文档；之后每次 session 自动恢复上次位置，AI 会主动告诉你下一步该做什么。
- **建议第一件事**：告诉模型项目的构建/测试命令（写进项目级 `CLAUDE.md` 即可）。

### 日常：你会用到的几个命令

| 命令 | 作用 |
|------|------|
| `/init-project` | 项目初始化（自动区分空项目/已有项目）|
| `/next` | 推荐当前最该做的下一步 |
| `/status` | 看项目整体状态和进度 |
| `/tdd` | 进入 RED → GREEN → REFACTOR 的 TDD 流程 |
| `/code-review` `/quality-gate` `/refactor-clean` `/plan` `/verify` | 流程类快捷入口 |

> 这个仓库是 **Airein 的源码**，不是安装目标。clone 下来是用于阅读/开发 airein 本身；真正使用是在你的项目目录里 `claude` 启动后，由已部署到 `~/.claude` 的 airein 接管。

---

## 你会用到的 vs 模型在背后自动做的

Airein 自带一批 skill 和命令，但**大多数你永远不需要手动触发**——它们是模型在流程中自动调用的。把它们当"要学的命令"会误以为门槛很高，其实不是。

**你偶尔会主动触发的**：`/init-project`、`/next`、`/status`、`/tdd` 以及上面的流程命令。

**模型在背后自动帮你做的**（你只需知道它替你解决了什么）：

| 它在做什么 | 替你解决了什么 |
|-----------|---------------|
| 自学习识别（self-learning）| 你纠正过的偏好累计晋升为永久规则，不用每次重复说 |
| 自动归档（archive-plan）| 完成的计划自动提示归档，不污染活跃上下文 |
| 自动格式化（post-edit-format）| 改完代码自动 Biome/Prettier，不用手动跑 |
| 接口变更监控（contract-sentinel）| 你改了导出接口时警告破坏性改动 |
| 进度同步（progress-sync）| tasks.md 改动自动回写 progress.md |
| 重复读警告（read-dedup）| 同 session 反复读同一文件时提醒，省上下文 |
| 影响范围分析（pre-edit-impact）| 编辑前告诉你这个文件被多少处依赖 |

---

## 怎么写你自己的 CLAUDE.md（重要）

Airein 的原则是**绝不碰**你的 `~/.claude/CLAUDE.md`（全局）和项目 `<repo>/CLAUDE.md`（项目级）——这是你的领土。但它们写得好不好，直接决定整体质量：CLAUDE.md 是每次 session **全量常驻加载**的宝贵预算，塞错了内容，Airein 再优秀也会被它拖累。

### 放什么

| 层级 | 适合放 | 不适合放（有更好的去处）|
|------|--------|----------------------|
| 全局 `~/.claude/CLAUDE.md` | 你的个人偏好、跨项目通用的工作习惯、沟通语言偏好 | 通用工程规范（测试先行、提交格式）→ Airein 的 `rules/` 已经管 |
| 项目 `<repo>/CLAUDE.md` | 项目特有的构建/测试命令、业务领域术语、项目独有约束 | 硬约束（"必须先写测试"）→ 见下方，靠 hook 才靠谱 |

### 关键原则：硬约束别只写进 CLAUDE.md

**写在 CLAUDE.md 里的规则是"建议"**——模型多数会听，但在上下文膨胀、指令冲突、或单纯遗忘时会绕过。如果你有一条**不可妥协**的约束（必须跑测试、不许跳过 review、不许提交未编译代码），正确的做法是把它配成 hook（`exit 2` 硬拦截），而不是只在 CLAUDE.md 里写一句"请永远先写测试"指望模型自觉。

- 项目硬约束 → 写进 `.claude/config/quality.json`，由 hook 强制（见下节）。
- 项目技术栈规范（命名、目录、风格、错误处理）→ 放 `docs/conventions-{scope}.md`，编辑对应类型文件时**按需注入**，不占常驻上下文。
- 个人持久偏好 → 写进全局 CLAUDE.md，或干脆靠自学习让它累计晋升。

### 反例

- ❌ 把整份公司编码规范粘进 CLAUDE.md → 常驻上下文爆炸，且与 `rules/`、`conventions-{scope}.md` 重复。
- ❌ 在 CLAUDE.md 写"永远先写测试"指望它强制 → 实际可被绕过，应配 `testGuard.mode: "strict"`。
- ❌ 把一次性任务的背景塞进 CLAUDE.md → 任务做完还在每次 session 加载，应该放进 plan 文档。

### 为什么要这样分

CLAUDE.md 全量常驻、token 金贵；硬约束靠 prompt 不靠谱、靠 hook 才是法律；技术规范按需注入比常驻更省。把这三件事放对位置，Airein 的五层加载机制才能各司其职（机制见附录）。

---

## 配置质量门禁（按需）

不创建任何配置文件就**零配置开箱即用**——所有门禁有合理默认值。需要调整时，在项目根创建 `.claude/config/quality.json`（旧路径 `.claude/quality.json` 仍可用），或在 Dashboard 面板里可视化编辑。所有字段可选，未指定则用默认值。

```json
{
  "testGuard":     { "enabled": true, "mode": "strict" },
  "approvalGuard": { "mode": "console-confirm" },
  "planGate":      { "mode": "advisory" },
  "testCoverage":  { "minRatio": 0.3, "minSourceFiles": 2, "functionThreshold": 3 },
  "blocking":      { "testFailure": true, "lowCoverage": true, "buildFailure": true, "untestedSource": true }
}
```

**核心门禁说明：**

| 门禁 | 字段 | 默认 | 行为 |
|------|------|------|------|
| **testGuard**（TDD 强制）| `enabled` | `true` | `false` 完全禁用 |
| | `mode` | `"strict"` | `strict` 拦截无测试源码 \| `advisory` 仅提醒 |
| **approvalGuard**（审批保护）| `mode` | `"console-confirm"` | `advisory` 仅提醒 \| `console-confirm` 拦截+确认绕过 \| `manual-only` 严格拦截 |
| **planGate**（计划门禁）| `mode` | `"advisory"` | `strict` 必须有计划 \| `advisory` 建议可继续 \| `disabled` 禁用 |
| **testCoverage** | `minRatio` / `minSourceFiles` / `functionThreshold` | 0.3 / 2 / 3 | 测试覆盖比例触发阈值 |
| **blocking** | `testFailure` / `lowCoverage` / `buildFailure` / `untestedSource` | 均 `true` | 各类失败是否硬拦截 |
| **flowControl** | `perTaskReview` / `worktreeIsolation` | false / false | 每 task 自动 review / 重构用 worktree 隔离 |
| **aireinLog** | `level` / `retentionDays` | `"info"` / 7 | 日志级别与保留天数 |
| **selfLearning** | `enabled` / `promotionThreshold` | true / 3 | 自学习开关与晋升阈值 |

---

## 升级 / 离线迁移 / 团队共享

**升级**：Airein 发新版后，任一已安装机器一条命令更新：

```bash
bash ~/.claude/update-airein.sh
```

更新策略（保护你的配置）：
- **内置组件随更新刷新**：hooks、scripts、rules、skills、templates
- **合并而非覆盖**：`templates/pipelines.json` —— 保留你自定义的 pipeline，只刷新内置流水线
- **绝不覆盖**：`settings.json`、`quality.json`、`session-state.md`、`~/.claude/CLAUDE.md`（用户领土完全不动）

已入职的项目无需重新 `/init-project`，更新后直接继续工作。

**离线安装/升级（网络不畅或无 git 的机器）**：

从 GitHub 网页下载 source archive（tar.gz / zip），拷到目标机器后：

```bash
bash setup-airein.sh --source <dir|tar.gz|zip> [--sha256 <hex>]   # 首次安装
bash update-airein.sh --source <dir|tar.gz|zip>                    # 升级
```

**团队共享**：把 `~/.claude` 仓库设为团队共享 git 仓库，每人 clone 后各自配 `settings.json`（密钥不同）。项目级的 `docs/` 和 `quality.json` 随项目仓库走。

---

## 多宿主支持（v0.2 预览）

v0.1 的 airein 只跑在 Claude Code 上。v0.2 正在把它扩展到 **4 个 AI 编码宿主**——同一个 airein 内核（skills / rules / hooks），通过一次命令分发到各宿主的原生配置目录：

| 宿主 | 产物落点 | 阻断机制 |
|------|---------|---------|
| **Cursor** | `.cursor/`（skills + rules/*.mdc + hooks.json）| stdout `{permission:"deny"}` |
| **Codex** | `.agents/skills/` + `AGENTS.md` + `.codex/config.toml` | stdout `{permissionDecision:"deny"}` |
| **CodeBuddy** | `.codebuddy/` + `CODEBUDDY.md` + `.codebuddy/settings.json` | `exit 2` 原生透传 |
| **OpenCode** | `AGENTS.md` + `opencode.json` + `.opencode/plugin/airein-bridge.ts` | `throw Error(stderr)` |

```bash
# 在你的项目目录里，任选宿主安装
node scripts/install-host.js install --host cursor    # 或 codex / codebuddy / opencode
```

**两个关键保证**：

- **CC 物理隔离**：4 宿主的 install / uninstall / verify 全程不读写 `~/.claude/`（CC 领地）。已装 airein 的 CC 环境叠加多宿主，CC 配置原样不动。
- **单一真相源**：各宿主的 skills 与 CC 副本逐字节等价，rules 由 `rules/` + `docs/` 生成，hook 注册由 `hooks/hooks.json` 翻译——不是各宿主各写一份。

> 这是 v0.2 预览特性（P001-cross-platform），随实现同步。各宿主前置条件、产物矩阵、阻断映射、故障排查详见 **[多宿主安装指南](docs/install-hosts.md)**；架构契约见 [deployment.md](docs/plans/P001-cross-platform/deployment.md)。

---

## 附录 A：工作原理

> 想深读的人看这里。日常使用不需要理解这些。

### 核心命题：Prompt 是建议，Hook 是法律

- **Prompt（CLAUDE.md / rules / SKILL.md）= 建议**：模型读到、理解、多数遵守，但可被绕过、被上下文淹没、被遗忘。
- **Hook（`exit 2` 阻断）= 法律**：PreToolUse / PostToolUse 钩子是代码保证，违反即阻断，不依赖模型自觉。
- 设计推论：能 hook 强制的，就不要只靠 prompt；hook 是底线，prompt 是上限。

### 上下文按需加载（不再卖"5 层"，按"何时加载"看）

绝大多数规则都搭 Claude Code 原生加载通道，只剩"会话状态恢复"还在用自建 hook。按加载时机看更清楚：

| 何时加载 | 加载什么 | 机制 | 强制力 |
|---------|---------|------|--------|
| 会话开始（常驻）| `rules/{00,10,20}-*.md`（铁律/架构/工作流）| CC 原生加载 `rules/*.md` | ✅ 机制强制 |
| 会话开始（常驻）| CC memory（项目偏好、会话状态）| CC 原生自动加载 | ✅ 机制强制 |
| 会话开始（注入）| session-state（branch/plan/last_files）| `session-start.js` hook | ✅ hook 强制 |
| 编辑匹配文件时 | `docs/conventions-{scope}.md` | CC 原生条件规则（`paths` + `@include` 薄壳）| ✅ 机制强制 |
| 调用 `/skill` 时 | `skills/*/SKILL.md` | CC 原生 skill 机制 | ✅ 机制强制 |
| 按需（subagent 读）| `docs/plans/*`、`docs/adr/*` | CLAUDE.md 指示用 subagent 读 | ⚠️ 纯 prompt 约定 |
| 上下文压缩前 | Active Task / Decisions / Files / Pending | `pre-compact.js` hook | ✅ hook 强制 |

> **图例**：✅ = 机制/hook 真在跑（法律）；⚠️ = 纯 prompt 约定（建议，模型可不听）。
> 唯一仍用自建 hook 的是"会话状态恢复"那条线；L0 规则与 L1 conventions 现在都走 CC 原生通道，区别仅在于有无 `paths`（常驻 vs 按编辑路径触发）。

### Hook 全表（真相源：`hooks/hooks.json`）

覆盖 **6 个事件**（PreToolUse / PostToolUse / SessionStart / PreCompact / Stop / UserPromptSubmit），共 **20 个注册条目**。下面的计数以 `hooks/hooks.json` 为准——加 hook 后刷新这里。

**阻断型（`exit 2` 硬拦截，铁律级）：**

| 时机 | hook | 行为 |
|------|------|------|
| 编辑代码前 | test-guard | 创建源文件前要求测试已存在（strict 模式 exit 2）|
| 编辑代码前 | plan-gate | 无 approved plan 阻止源码编辑 |
| 编辑代码前 | approval-sequence | 强制 R→D→T 文档创建顺序 |
| 编辑代码前 | approval-guard | 保护 progress.md 审批状态不被擅自改 |
| 提交前 | pre-commit-gate | git commit 时跑 build + test，失败阻止提交 |

**建议型 / 自动型（async，警告或自动修复）：**

| 时机 | hook | 行为 |
|------|------|------|
| 编辑后 | quality-sentinel | 检查 debug 语句、密钥、TODO、覆盖 |
| 编辑后 | quality-gate | 编辑后跑全量质量检查 |
| 编辑后 | contract-sentinel | 监控导出接口变更，警告破坏性改动 |
| 编辑后 | post-edit-format | 自动 Biome/Prettier 格式化 |
| 编辑后 | post-edit-typecheck | 编辑 .ts 后 TypeScript 检查 |
| 编辑后 | progress-sync | tasks.md 变动自动更新 progress.md |
| 编辑后 | structure-sync | 源码变动更新 structure.md token 估算 |
| 编辑后 | archive-trigger | 计划完成时提示归档（每计划每 session 一次）|
| 编辑前 | pre-edit-impact | 分析文件被多少其他文件依赖 |
| 读文件后 | read-dedup | 同 session 重复读同一文件时警告 |
| 编辑前 | doc-file-warning | 非标准文档文件警告（对 model 可见）|

**生命周期：**

| 时机 | hook | 行为 |
|------|------|------|
| Session 开始 | session-start | 注入 branch/plan/last_files（约几百 token）|
| 压缩前 | pre-compact | 提取关键信息防丢失 |
| 声明完成时 | stop-test-gate（链式）| 跑测试 + 覆盖 + 回归 + session-state 持久化 |
| 每轮用户输入 | self-learning-prompt | 注入自学习识别提示（模型搭车识别持久指令）|

### 自学习系统（三层流转，不碰 memory）

```
用户持久允许/禁止指令 → buffer(.claude/self-learning/pending.md)
  → Stop hook 归档 → archive(~/.claude/projects/{key}/self-learning-archive.md)
  → 同一指令累计 ≥ promotionThreshold（默认 3）→ 晋升 rules/30-self-learned.md（L0 自动加载）
```

自学习三层**只**在自己的文件里流转，**不碰** CC 原生 memory（`~/.claude/projects/*/memory/` 保持纯净）。详见 [design.md](docs/design.md#自学习系统架构)。

---

## 附录 B：文件地图

### `~/.claude/` 下的关键文件

| 文件 | 走 git | 说明 |
|------|--------|------|
| `CLAUDE.md` | ❌ 用户领土 | 你的全局规则，Airein 不拥有/不覆盖 |
| `hooks/hooks.json` | ✅ | Hook 注册表（真相源）|
| `rules/00-iron-rules.md` | ✅ | 铁律（不可豁免 + 提交不变量 + 输入校验）|
| `rules/10-architecture.md` | ✅ | 架构事实/不变量 |
| `rules/20-workflow.md` | ✅ | 操作手册（工作流 + 生命周期 + 流程豁免）|
| `rules/30-self-learned.md` | ❌ | 自学习晋升产物（个人化，.gitignore 排除）|
| `scripts/hooks/*.js` | ✅ | Hook 脚本 |
| `scripts/lib/*.js` | ✅ | 共享库（quality-config / plan-parser / utils 等）|
| `skills/*/SKILL.md` | ✅ | Airein skill |
| `templates/` | ✅ | 文档模板 + language-profiles + pipelines.json + quality.json |
| `settings.json` | ❌ | 代理地址和密钥，每台机器不同 |

### 项目级文件

| 文件 | 走项目 git | 说明 |
|------|-----------|------|
| `.claude/session-state.md` | 建议 ✅ | 会话状态，session-start 自动加载 |
| `.claude/config/quality.json` | 建议 ✅ | 项目级质量门禁配置（推荐路径）|
| `.claude/contract-cache/` | ❌ | 导出接口缓存（自动生成）|
| `.claude/self-learning/pending.md` | ❌ | 当轮捕获的自学习指令（项目级 buffer）|
| `docs/roadmap.md` | ✅ | 项目总览（含 Issues 与 Recent Changes）|
| `docs/plans/P{NNN}-*/` | ✅ | 计划文件目录（requirements/design/tasks 等）|
| `docs/adr/` | ✅ | 架构决策记录（按需创建）|
| `docs/conventions-{scope}.md` | ✅ | 按技术栈分的工程规范（编辑匹配文件时注入）|

---

## FAQ

**Q: 我已经有 cursor rules / spec 工具 / 自己写好的 CLAUDE.md，为什么还要 Airein？**
A: 那些大多是"prompt 级"约束——写在规则文件里，靠模型自觉，上下文一长或指令冲突就会被绕过。Airein 的差异点是**把不可妥协的约束做成 hook（`exit 2` 代码强制）**，加上跨 session 的项目记忆和 spec-driven 的计划流程。你可以把它和现有规则并存：硬约束交给 Airein 的 hook，软偏好留在你的 CLAUDE.md。

**Q: 质量门禁太严格，能降级吗？**
A: 能，在 `.claude/config/quality.json` 灵活配：禁用 TDD（`testGuard.enabled: false`）、TDD 仅提醒（`mode: "advisory"`）、降级拦截（`blocking.testFailure: false`）、关计划门禁（`planGate.mode: "disabled"`）。也能在 Dashboard 面板里直接拖开关。

**Q: 换电脑后自学习记忆会丢吗？**
A: 自学习 archive 在 `~/.claude/projects/{key}/self-learning-archive.md`，按项目隔离、不走 git。迁移时手动复制该目录。

**Q: 项目没有测试框架，stop-test-gate 会报错吗？**
A: 不会。hook 检测项目类型（package.json / pom.xml / Cargo.toml 等），没有匹配的测试框架就跳过。

**Q: 可以只用部分 skill / hook 吗？**
A: 可以。不需要的 skill 删掉目录、不需要的 hook 从 `hooks.json` 摘掉即可。但 `init-project` 建议保留——它是项目状态管理的基础。

**Q: `hooks.json` 里的 `${CLAUDE_PLUGIN_ROOT}` 是什么？**
A: 指向 airein 安装根（通常是 `~/.claude`）的环境变量。Claude Code 在插件上下文自动设置；若你的环境未设置该变量，可把命令里的路径替换为 `~/.claude` 的绝对路径。

**Q: 自学习怎么验证生效了？**
A: 看 `.claude/self-learning/pending.md` 有没有当轮捕获；Stop 后看 archive 有没有追加日志；同一指令累计达阈值后，检查 `rules/30-self-learned.md` 是否生成——晋升为 L0 后下次 session 自动加载。

---

## 致谢

Airein 的设计和实现借鉴了以下开源项目与社区实践：

| 项目 | 贡献 | 链接 |
|------|------|------|
| **Everything Claude Code (ECC)** | 基础架构灵感、tdd-workflow & verification-loop skill 的 origin、hook 事件模型参考 | [github.com/affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) |
| **Claude Code (Anthropic)** | Hook 协议 stdin/stdout JSON、原生条件规则（paths + @include）、Session/Compact/Stop 事件定义 | [claude.ai/code](https://claude.ai/code) |
| **TDD (Test-Driven Development)** | RED → GREEN → REFACTOR 核心流程、先写测试后实现的工作纪律 | [敏捷宣言](https://agilemanifesto.org) |
| **DDD (Domain-Driven Design)** | 领域模型模板（design-domain-model.md）、聚合根/实体/值对象战术设计模式 | [domainlanguage.com/ddd](https://domainlanguage.com/ddd/) |
| **OpenSpec** | 沟通澄清（grilling）阶段的结构化 Q&A 方法、需求澄清最佳实践 | [openspec.dev](https://openspec.dev) |
| **SpotBugs** | Java 项目静态分析工具参考（design-conventions/java.md） | [github.com/spotbugs/spotbugs](https://github.com/spotbugs/spotbugs) |
| **detekt** | Kotlin 项目静态分析工具参考（design-conventions/kotlin.md） | [detekt.dev](https://detekt.dev) |

**特别说明**：早期版本曾引用社区 skill 的自学习机制（heartbeat/reflections/corrections），后重构为三层流转（buffer/archive/promotion）并移除外部依赖。感谢该项目的启发性贡献。

Airein 力求保持运行时依赖最小化，上述借鉴均为**设计理念与方法论参考**；目前仅基于 Node.js 内建模块实现。
