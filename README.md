# Airein

> 让 Claude Code 像一个入职半年的同事：懂项目规范、不碰不该碰的文件、改完自动跑测试、跨 session 还记得上次干到哪。

[English](README.en.md) | 简体中文

---

## 它解决什么问题

行业里鼓吹 AI 编程，常被戏称为"**日抛代码**"——让 AI 快速生成一个 POC、演示品、实验品，演示完就扔。在 hackathon、原型验证、一次性脚本这类场景里，这确实香。

但**中大型公司有稳定的业务系统、长期的维护负担、合规与审计要求**——它们不能接受日抛代码，也没必要花这个钱反复造。当前阶段，把 AI 编程用在正式研发上，成熟的价值不是"用生成替代工程师"，而是：**成倍提效的同时，让工程质量可控。**

难点恰恰在这里：AI 编码助手天生倾向跳过测试、无视规范、凭记忆编造接口、上下文一长就忘掉关键约束。直接放养，提效是真的，质量失控也是真的。

Airein 的论点很直接——**把企业研发流程抽象成 AI 能遵循的 spec-driven 流程，既拿到 AI 的提效，又守住质量红线。** 做法不是写更多 prompt 求模型自觉，而是把不可妥协的约束交给代码强制的 hook，把项目记忆交给按需加载的机制，让每一个新 session 都能像接班的同事一样快速进入状态。

核心理念一句话：**Prompt 是建议，Hook 是法律。**

### 定位（重要）

Airein **不是**替你管理整个 AI 编程工具的全家桶；它只是宿主（Claude Code / Cursor 等）里的 **skills / plugin 一层**。我们要做好的是：**项目文档管理 + 规格驱动进展**（init-project / 
ew-plan / 审批与 hook 门禁 / Dashboard 等）——不是堆一大堆「看起来都有用」的通用 Agent / command。那些交给你自选工具，或自行安装 [ECC](https://github.com/affaan-m/everything-claude-code) 等插件。 写在 CLAUDE.md 里的规则是"建议"——模型读到、多数遵守，但会被上下文淹没、被绕过、被遗忘；而 hook 的 `exit 2` 是"法律"——代码保证，违反即阻断，不依赖模型自觉。能 hook 强制的，就不只靠 prompt。

---

## 三条核心能力

### 支柱一：`new-plan` —— 把研发流程变成 spec-driven 的 AI 协作

这是 Airein 最核心的能力，也是它和"随手让 AI 写代码"的根本区别。

`new-plan` 抽象了一套企业研发流程，让 AI 的工作按规范走，而不是一上来就埋头写代码：

```
沟通澄清（grilling）→ 按流水线产出文档 → 逐份审批 → TDD 实现 → 归档闭环
```

- **沟通澄清**：动手前先把模糊需求问清楚。一个一个问，挑战假设，用具体场景逼出边界，把"帮我做个 X"变成有验收标准的明确范围。
- **按流水线产出文档**：根据任务类型（s-feature / m-feature / l-feature / hotfix …）走对应的文档流水线——小型 bugfix 只需 `tasks`，中型功能要 `requirements → design → test-plan → tasks`，大型功能再加 `deployment`。文档即 spec，是后续实现的契约。文档**长什么样**，由内核模板决定（见下节「文档模板」）。
- **逐份审批门禁**：每份文档 draft → 你审批 → approved，才允许创建下一份。`approval-sequence` hook 强制顺序，`approval-guard` 保护审批状态不被擅自篡改。避免 AI 一次性铺开所有文档却没人审。
- **TDD 实现**：进入实现阶段后，`test-guard` 在 strict 模式下硬拦截"无测试的源码"——先有失败测试，才允许写实现。`pre-commit-gate` 在提交前跑 build + 测试 + 覆盖率。
- **归档闭环**：计划完成后 `/archive-plan` 归档，完成的计划不再污染活跃上下文。

效果：AI 提效的"快"拿到了，但每一步都有质量门禁兜底——这正是"日抛代码"做不到、而正式研发必须有的可控性。

### 支柱二：`init-project` + 项目记忆 —— 跨 session 不失忆

AI 编程的另一个老大难：**上下文一旦超限压缩，关键信息就丢了**，新 session 像失忆一样要你重新喂背景。

Airein 用一组机制让新 session 能快速恢复"上次干到哪、为什么这么决策、改过哪些文件"：

- **`/init-project`**：进入一个新项目时执行一次。自动判断是空项目还是已有项目——空项目只创建精简骨架（roadmap + session-state + memory），已有项目则扫描代码库、现有文档、隐藏配置，生成 `docs/roadmap.md`（含 Issues 与 Recent Changes），检测主语言写入配置；同时将项目路径注册到 Dashboard（`~/.airein/dashboard/projects.json`）。
- **会话状态恢复**：每个 session 结束时，`session-end` 把"当前计划、活跃任务、上次编辑的文件、待办"写进 `<项目>/.airein/memory/session-state.md`；下次 `session-start` 自动注入（约几百 token），AI 接着上次干，而不是从零问起。（legacy 项目仍可读 `.claude/memory/`）
- **压缩前抢救**：`pre-compact` 在上下文压缩前提取 Active Task / Decisions / Files / Pending，避免压缩把关键决策抹掉。
- **自动归档**：完成的计划归档进 `docs/plans/`，不挤占活跃视野；`/next` 会基于 roadmap 主动告诉你"当前最该做的是 XXX"。
- **自学习晋升**：你纠正过的偏好（"不要 X""以后都 Y"）， Airein 会累计识别，同一指令累计达到阈值就晋升为永久 L0 规则，下次 session 自动生效——不用你每次重复纠正。

### 支柱三：Dashboard —— 轻量级的项目文档与质量管理面板

文档和质量管理不能只靠命令行记忆。Airein 自带一个**极轻量**的浏览器面板，让你看得见、管得了：

```bash
bash ~/.airein/dashboard/start.sh          # 安装后推荐（部署在 ~/.airein/dashboard/）
# 或从源码目录：node dashboard/server.js
```

浏览器自动打开 `http://localhost:3456`。LAN 访问：`bash ~/.airein/dashboard/start.sh --lan`。

它有多轻：**零 npm 依赖**（纯 Node 内建 `http`）、**单文件 SPA**（一个 `index.html` 内嵌 CSS+JS，无构建步骤）、hash 路由。不需要装任何东西，`node` 一跑就起来。

它能做什么：

- **项目发现**：`/init-project` 自动写入 `~/.airein/dashboard/projects.json`；面板 **工具** 页（`#/tools`）可注册/移除/清理失效路径；另兼容 CC 注册表 `~/.claude/projects/` 作为 fallback。
- **计划管理**：可视化查看计划进度、编辑 requirements/design/tasks、按流水线审批、归档完成的计划。
- **模板管理**：侧栏 **模板**（`#/templates`）可浏览并在线编辑内核模板——这是持续打磨 AI 产出质量的主入口，详见下一节。
- **配置可视化**：把项目的 `quality.json` 渲染成结构化表单（开关、阈值、下拉），每个字段标注默认值，只持久化你改过的字段——不用手写 JSON。
- **工具页**：项目注册表维护（register / unregister / prune stale），无需记 CLI。
- **i18n**：中英文切换。

Dashboard 不是独立的系统，而是 airein 已有能力的可视化层——它读的是同一份 roadmap、同一份 `.airein/config/quality.json`、同一套 plan 目录。你在面板里改的配置，就是 hook 实际读的配置。详见 [dashboard/README.md](dashboard/README.md)。

### 文档模板 —— AI 产出质量的「模具」，可在面板里持续打磨

`/new-plan` 与 `/init-project` 并不是凭空写文档：它们从内核 **`~/.airein/templates/`** 取出结构模板，再按任务复杂度（s / m / l）填进计划目录。模板定的是**章节、口径与禁写项**；模型填的是具体业务内容。模板越贴你的工程习惯，AI 越难写出「看起来像需求、其实无法验收」的薄摘要。

**模板在流水线里管什么：**

| 模板族 | 作用（举例） |
|--------|----------------|
| `requirements/{s,m,l}.md` | 产品需求说明书（PRD）：业务流程 → User Story → Use Case（UC-id），而不是 Problem + WHEN/THEN 摘要 |
| `design/{s,m,l}.md` + 子文档 | 技术方案分档：该穷举的决策面写清，避免空对空架构散文 |
| `test-plan/{m,l}.md` | 测试**设计规格**：Critical / VS / 不变量；不抄逐步用例百科 |
| `tasks.md` | Implement / Verify / Deploy / Accept；强制 Source 追溯与 `Depends on` 机读契约（Dashboard Progress 面板靠它解析） |
| `deployment.md` / `roadmap.md` / `tests.md` 等 | 发布运维、项目状态索引、TDD 台账等配套 |

效果可以概括成：**UC → 设计 → 测试设计 → 可调度任务** 一条可追溯链。dogfood 里完整走完 `l-feature` 流水线时，你会明显感到「拆任务带 UC、验收看 Critical/VS」比早期自由发挥稳得多——那正是模板在起作用，而不只是换了更强的模型。

**如何用面板持续升级「适合自己的模板」：**

1. 启动 Dashboard → 侧栏点 **模板**（`http://localhost:3456/#/templates`）。
2. 按分类打开计划文档 / 项目文档等，在线编辑后保存——写回的是本机 **`~/.airein/templates/`**（与 `/new-plan` 读取的是同一套）。
3. 也可以直接改磁盘上的 `~/.airein/templates/docs/*.md`；下次开新计划即生效。
4. **迭代方式**：发现某次 AI 产出偏软（缺 UC、tasks 不可解析、test-plan 太空）→ 回到对应模板补「必填节 / 负面约束 / 示例行」→ 再开一个小计划验证，而不是只靠口头纠正模型。

**升级时注意：**

- `airein update` 会**按清单覆盖**内核里的结构模板（`templates/docs/**` 等），以便你拿到上游改进。
- `templates/pipelines.json` 是**合并**：自定义 pipeline 定义会保留。
- 若你对某份模板做了深度本地定制，升级前请自行备份或 diff；稳定后的改法更建议贡献回上游仓库，或在团队内维护一份「模板补丁」流程，避免下次更新被静默冲掉。

模板是 airein 里最值得长期积累的资产之一：**钩子守红线，模板定写法**——二者一起，才把「提效」变成「可控的提效」。速查也可看 [docs/templates-and-dashboard.md](docs/templates-and-dashboard.md)。


---

## 5 分钟上手

### 三层目录模型（P004）

| 层 | 路径 | 作用 |
|----|------|------|
| **内核** | `~/.airein/` | skills / rules / hooks / scripts 真相源；`install-profile.json` 记录已装宿主 |
| **宿主注册层** | `~/.claude/`（CC）/ `~/.cursor/`（Cursor）… | 各宿主原生配置入口；CC 经 symlink + merge-hooks 指回内核 |
| **项目数据** | `<项目>/.airein/` | `config/quality.json`、`memory/`、`logs/`、自学习 buffer 等 |

CC 项目额外有 **L1 shim**：`<项目>/.claude/rules` → symlink 到 `<项目>/.airein/rules`（CC 原生读 `.claude/rules`，canonical 在 `.airein`）。详见 [deployment.md](docs/deployment.md)。

### 新机器：统一安装（推荐）

前提：git、Node.js ≥ 18、bash ≥ 4（Windows 用 Git Bash）。

```bash
git clone git@github.com:testfree2023/airein.git /tmp/airein && \
bash /tmp/airein/airein setup --yes; rm -rf /tmp/airein
```

`airein setup` 会探测本机宿主，首版完整支持 **Claude Code + Cursor**；Codex / CodeBuddy / OpenCode 仅提示「已探测、后续启用」。

**分叉 Quickstart**（非交互可加 `--hosts`）：

| 场景 | 命令 |
|------|------|
| 仅 Claude Code | `airein setup --hosts claude-code --yes` |
| 仅 Cursor | `airein setup --hosts cursor --yes` |
| CC + Cursor 同机 | `airein setup --hosts claude-code,cursor --yes` |

验证：`bash ~/.airein/scripts/update/verify-airein.sh --full`（推荐；分层排查见 [deployment.md](docs/deployment.md)）。

### 进项目：直接用

```bash
cd /path/to/your-project
claude
```

- **新项目**：模型自动检测到没有 `docs/roadmap.md`，引导你执行 `/init-project`，只创建精简骨架。
- **进行中项目**：首次迁移时在每个项目根执行一次：
  ```bash
  cd /path/to/your-project
  node ~/.airein/scripts/migrate-project-to-airein.js
  # 预览：加 --dry-run
  ```
  将 legacy `.claude/config|memory|…` 迁到 canonical `.airein/`，并为 CC 建 `.claude/rules` shim。之后可用 `/init-project` 补全 roadmap 等文档。
- **建议第一件事**：告诉模型项目的构建/测试命令（写进项目级 `CLAUDE.md` 即可）。

### 日常：你会用到的几个入口（airein 主链）

| 入口 | 作用 |
|------|------|
| /init-project | 项目初始化（自动区分空项目/已有项目）|
| /new-plan | 开新计划：沟通澄清 → 文档流水线 → 审批 |
| /next | 推荐当前最该做的下一步 |
| /status | 看项目整体状态和进度 |
| /tdd | 规格绑定的 TDD（RED → GREEN → REFACTOR） |
| /archive-plan | 计划完成后归档闭环 |

主链外，仓内仅保留一个角色 Agent：`tech-lead`（mode：design / review / security）；slash：`/tdd` / `/code-review` / `/verify`。TDD 卡住重读 `skills/tdd`。其余通用 Agent 已清理，可自装完整 ECC。

> 这个仓库是 **Airein 的源码**，不是安装目标。clone 下来用于阅读/开发 airein 本身；日常使用是在你的项目目录里由已部署的内核 ~/.airein + 宿主注册层接管。

---

## 你会用到的 vs 模型在背后自动做的

Airein 的主链是 **文档 + 进展**（skills / hooks）；不是让你背一大堆 slash。大多数门禁在背后自动跑，你只需掌握上表几个入口。

**你偶尔会主动触发的**：/init-project、/new-plan、/next、/status、/tdd、/archive-plan。

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

## 升级 / 离线迁移 / 回滚

用户向版本说明见 [CHANGELOG.md](CHANGELOG.md)（开发过程流见 `docs/roadmap.md` Recent Changes）。

**升级**（任一已装机器一条命令）：

```bash
airein update
# 或从仓库根：bash airein update
```

更新策略：
- **内核组件随更新刷新**：`~/.airein` 下 hooks、scripts、rules、skills、templates
- **按 profile 刷新宿主**：`install-profile.json` 记录的 CC / Cursor 注册层
- **合并而非覆盖**：`templates/pipelines.json` 保留自定义 pipeline
- **绝不覆盖**：用户 `settings.json`、项目 `quality.json` / `session-state.md`、各宿主 CLAUDE.md 领土

已入职项目无需重新 `/init-project`。

**离线安装/升级**（P002 `--source`）：

```bash
airein setup --source <dir|tar.gz|zip> [--sha256 <hex>] [--hosts cc,cursor] --yes
airein update --source <dir|tar.gz|zip>
```

**回滚**（P004 合并前远程 main 已打稳定 tag，见 deployment）：

```bash
git checkout pre-p004-2026-07-11   # 或文档记载的 pre-P004 tag
airein update --source <该 tag 的 archive>
```

**卸载**：`airein uninstall`（`--keep-kernel` 保留 `~/.airein` 目录）。

---

## 多宿主支持（首版 CC + Cursor）

同一 airein **内核**（`~/.airein`）通过 `airein setup` 或 `install-host.js` 分发到各宿主原生目录：

| 宿主 | setup 支持 | 产物落点 | 阻断机制 |
|------|-----------|---------|---------|
| **Claude Code** | ✅ 完整 | `~/.claude/` 注册层 → 内核 | `exit 2` 原生 |
| **Cursor** | ✅ 完整 | `<项目>/.cursor/` | stdout `{permission:"deny"}` |
| **Codex** | 探测提示 | `.agents/skills/` + `AGENTS.md` | stdout `{permissionDecision:"deny"}` |
| **CodeBuddy** | 探测提示 | `.codebuddy/` + `CODEBUDDY.md` | `exit 2` 原生 |
| **OpenCode** | 探测提示 | `AGENTS.md` + `opencode.json` | `throw Error(stderr)` |

```bash
# 统一入口（推荐）
airein setup --hosts claude-code,cursor --yes

# 或在项目目录单独装某宿主（install-host 直调）
node ~/.airein/scripts/install-host.js install --host cursor
```

**两个关键保证**：

- **CC 物理隔离**：非 CC 宿主的 install / uninstall / verify **不读写** `~/.claude/`（CC 领地）。双宿主同机时 CC 配置原样保留（`test-cc-no-impact` 锁定）。
- **单一真相源**：各宿主 skills 与内核副本逐字节等价；rules 由 `rules/` + `docs/` + `.airein/rules/` 薄壳生成。

详见 **[多宿主安装指南](docs/install-hosts.md)** 与 [deployment.md](docs/deployment.md)。

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
用户持久允许/禁止指令 → buffer(.airein/self-learning/pending.md)
  → Stop hook 归档 → archive(~/.claude/projects/{key}/self-learning-archive.md)
  → 同一指令累计 ≥ promotionThreshold（默认 3）→ 晋升 rules/30-self-learned.md（L0 自动加载）
```

自学习三层**只**在自己的文件里流转，**不碰** CC 原生 memory（`~/.claude/projects/*/memory/` 保持纯净）。详见 [design.md](docs/design.md#自学习系统架构)。

---

## 附录 B：文件地图

### `~/.airein/` 内核关键文件

| 文件 | 走 git | 说明 |
|------|--------|------|
| `hooks/hooks.json` | ✅ | Hook 注册表（真相源）|
| `rules/00-iron-rules.md` | ✅ | 铁律 |
| `scripts/hooks/*.js` | ✅ | Hook 脚本 |
| `skills/*/SKILL.md` | ✅ | Airein skill |
| `install-profile.json` | ❌ | 已装宿主记录（本机）|

CC 注册层 `~/.claude/` 通过 symlink 指回上述文件；用户 `CLAUDE.md` / `settings.json` 仍为用户领土。

### 项目级文件（canonical：`.airein/`）

| 文件 | 走项目 git | 说明 |
|------|-----------|------|
| `.airein/memory/session-state.md` | 建议 ✅ | 会话状态，session-start 注入 |
| `.airein/config/quality.json` | 建议 ✅ | 项目级质量门禁（读写优先此路径）|
| `.airein/self-learning/pending.md` | ❌ | 当轮自学习 buffer |
| `.airein/logs/` | ❌ | hook 诊断日志 |
| `.claude/rules/`（CC 项目）| 建议 ✅ | **shim** → `.airein/rules/`（L1 薄壳 canonical）|
| `docs/roadmap.md` | ✅ | 项目总览 |
| `docs/plans/P{NNN}-*/` | ✅ | 计划目录 |
| `docs/conventions-{scope}.md` | ✅ | 工程规范叶文档 |

> legacy 项目仍可使用 `<项目>/.claude/config|memory|…`；hooks 读时自动 fallback，新写入走 `.airein/`。

---

## FAQ

**Q: 我已经有 cursor rules / spec 工具 / 自己写好的 CLAUDE.md，为什么还要 Airein？**
A: 那些大多是"prompt 级"约束——写在规则文件里，靠模型自觉，上下文一长或指令冲突就会被绕过。Airein 的差异点是**把不可妥协的约束做成 hook（`exit 2` 代码强制）**，加上跨 session 的项目记忆和 spec-driven 的计划流程。你可以把它和现有规则并存：硬约束交给 Airein 的 hook，软偏好留在你的 CLAUDE.md。

**Q: 质量门禁太严格，能降级吗？**
A: 能，在 `.airein/config/quality.json`（或 legacy `.claude/config/quality.json`）灵活配：禁用 TDD（`testGuard.enabled: false`）、TDD 仅提醒（`mode: "advisory"`）、降级拦截（`blocking.testFailure: false`）、关计划门禁（`planGate.mode: "disabled"`）。也能在 Dashboard 面板里直接拖开关。

**Q: 换电脑后自学习记忆会丢吗？**
A: 自学习 archive 在 `~/.claude/projects/{key}/self-learning-archive.md`，按项目隔离、不走 git。迁移时手动复制该目录。

**Q: 项目没有测试框架，stop-test-gate 会报错吗？**
A: 不会。hook 检测项目类型（package.json / pom.xml / Cargo.toml 等），没有匹配的测试框架就跳过。

**Q: 可以只用部分 skill / hook 吗？**
A: 可以。不需要的 skill 删掉目录、不需要的 hook 从 `hooks.json` 摘掉即可。但 `init-project` 建议保留——它是项目状态管理的基础。

**Q: `hooks.json` 里的 `${CLAUDE_PLUGIN_ROOT}` 是什么？**
A: 指向 airein **内核根**（`~/.airein`）。CC 注册层 merge-hooks 会把 hook 命令里的占位符替换为内核绝对路径。

**Q: 自学习怎么验证生效了？**
A: 看 `.airein/self-learning/pending.md`（或 legacy 路径）有没有当轮捕获；Stop 后看 archive 有没有追加日志；同一指令累计达阈值后，检查 `rules/30-self-learned.md` 是否生成——晋升为 L0 后下次 session 自动加载。

---

**Q: 文档模板和 CLAUDE.md 有什么区别？能自己改吗？**
A: CLAUDE.md 是**常驻上下文**的操作手册（宜短）；文档模板是 `/new-plan` 生成计划文档时的**结构模具**（可长、可按 s/m/l 分档）。可以——Dashboard 侧栏 **模板**（`#/templates`）在线编辑，或直接改 `~/.airein/templates/`。注意 `airein update` 会覆盖结构模板清单内的文件；`pipelines.json` 会合并保留自定义 pipeline。详见上文「文档模板」一节。

## 致谢

关系分三类，避免「全都自写」与「全都只是灵感」两种含糊话：

| 关系 | 含义 |
|------|------|
| **使用** | 仓库内仍保留其改编文本或协议资产 |
| **曾使用** | 曾改编进仓，现已移除或内化；仍致谢出处 |
| **参考** | 设计理念 / 方法论 / 协议约定，非整文件拷贝 |

| 项目 | 关系 | 说明 | 链接 |
|------|------|------|------|
| **Everything Claude Code (ECC)** | **曾使用** + 参考 | **曾使用**：早期曾改编进仓的多数 agents/commands（含 `tdd-guide`、`/plan`、`/quality-gate`、语言向 reviewer 等）已清理或内核化；`tdd-workflow` / `verification-loop` 已内化为 `skills/tdd` 与 `rules/20-workflow.md`。现仓内仅 `agents/tech-lead.md`（技术负责人；mode：design/review/security）与 `commands/`（`tdd` / `code-review` / `verify`）**为 airein 自有短卡/薄入口**（由早期 ECC 能力切片收敛而来）。**参考**：整体架构与 hook 事件划分。规划主链以 `/new-plan` 为准；用户可自装完整 ECC。 | [github.com/affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) |
| **Superpowers** | **曾使用** | 早期改编过 `writing-plans` skill；计划主链已由自研 `new-plan` 承担，该 skill 已退役（旧安装由 `clean-airein.sh` 清理）。 | [github.com/obra/superpowers](https://github.com/obra/superpowers) |
| **Claude Code (Anthropic)** | **参考** | Hook 协议 stdin/stdout JSON、原生条件规则（paths + @include）、Session/Compact/Stop 事件定义 | [claude.ai/code](https://claude.ai/code) |
| **TDD (Test-Driven Development)** | **参考** | RED → GREEN → REFACTOR 核心流程、先写测试后实现的工作纪律 | [敏捷宣言](https://agilemanifesto.org) |
| **DDD (Domain-Driven Design)** | **参考** | 领域模型模板（design-domain-model.md）、聚合根/实体/值对象战术设计模式 | [domainlanguage.com/ddd](https://domainlanguage.com/ddd/) |
| **OpenSpec** | **参考** | 沟通澄清（grilling）阶段的结构化 Q&A 方法、需求澄清最佳实践 | [openspec.dev](https://openspec.dev) |
| **SpotBugs** | **参考** | Java 项目静态分析工具参考（design-conventions/java.md） | [github.com/spotbugs/spotbugs](https://github.com/spotbugs/spotbugs) |
| **detekt** | **参考** | Kotlin 项目静态分析工具参考（design-conventions/kotlin.md） | [detekt.dev](https://detekt.dev) |

**特别说明**：早期版本曾引用社区 skill 的自学习机制（heartbeat/reflections/corrections），后重构为三层流转（buffer/archive/promotion）并移除外部依赖。感谢该项目的启发性贡献。

**边界**：hooks / scripts / 自研 skill 主链（`new-plan`、`tdd`、`init-project`、`archive-plan`、自学习等）与 Dashboard 为 airein 自研或已内核化文本；运行时**零 npm 依赖**。白名单 agent/command 正文已内化为 airein 自有；ECC 仅作 **曾使用**/参考致谢，**不要**把历史改编说成「仍在用 ECC 原文」。用户可另行安装完整 ECC；后续升级目标是按「skills/plugin」定位收缩到文档/进展主链，降低与用户自装 ECC 的冲突。
