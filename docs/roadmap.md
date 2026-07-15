# Roadmap: Airein

> **项目路线图**（双轨：产品路线图 + 项目状态）
> 版本: v0.1.0 · License: Apache-2.0

---

## 现状（v0.1.0 · 开源首发）

airein v0.1.0 是首个开源版本，定位为「套在 Claude Code 之上的工程化框架」。核心命题：**Prompt 是建议，Hook 是法律**——把企业研发规范从「靠 AI 自觉遵守的 prompt」升级为「违反即阻断的代码保证」。

### 三大支柱（均已实现）

| 支柱 | 能力 |
|------|------|
| **spec-driven 协作**（`new-plan`） | 沟通澄清 → 按规模分流文档流水线（8 种 pipeline）→ 逐份审批 → TDD 实现 → 归档闭环 |
| **跨 session 记忆**（`init-project` + session-state + 自学习） | 启动自动恢复计划/任务/文件；自学习把持久指令晋升为 L0 永久规则（按项目隔离，不污染 CC memory） |
| **Dashboard** | 零依赖单文件 SPA，项目自动发现、plan/模板/配置可视化、approval 工作流、中英 i18n |

### 能力清单

- **20 个 hook**（6 个时机：PreToolUse / PostToolUse / PreCompact / SessionStart / Stop / UserPromptSubmit）—— 铁律强制 + 质量门禁 + 状态持久化
- **12 个内置 skill** —— 项目管理 / 开发流程 / 审查诊断
- **26 个文档模板** —— 覆盖 7 种语言（js/ts/py/java/go/rust/kotlin）
- **五层 JIT 上下文** —— L0 始终加载 ~5K tokens，按需加载不膨胀主上下文
- **零 npm 依赖** —— 只用 Node.js 内建模块，零安装门槛
- **35 个测试套件** —— 自研骨架，覆盖率目标 ≥ 80%

详细架构见 [design.md](design.md)，产品愿景见 [requirements.md](requirements.md)。

## 未来方向

### v0.2（近期）

- **多宿主支持**：跨 AI 编码宿主适配层——同一 airein 内核（skills / rules / hooks）分发到 Cursor / Codex / CodeBuddy / OpenCode 4 宿主（[P001-cross-platform](plans/P001-cross-platform/) 实现完成待归档，详见 [多宿主安装指南](install-hosts.md)）
- **更多语言模板**：扩展 design-architecture / design-conventions 模板覆盖（Scala、Swift、PHP、C# 等）
- **hook 性能可观测**：hook 执行耗时统计、慢 hook 告警（**基础版已落地**：`aireinLog` + `hook-timing.js`，`slowHookMs` 默认 2000；dashboard 可视化仍待做）
- **dashboard 增强**：计划甘特视图、hook 触发历史、自学习晋升可视化
- **plan 模板市场**：社区共享 plan pipeline 与文档模板

### v0.3（中期）

- **扩展更多宿主**：在 v0.2 四宿主适配层（CUR/CDX/CB/OC）基础上，扩展更多 AI 编码助手（Windsurf、Trae 等）；Gemini CLI 视 Antigravity CLI 走向决定是否回填
- **团队协作**：共享 quality.json profile、团队规范模板库、统一配置分发
- **企业功能**：RBAC、审计日志、合规模块（v0.x 明确 out of scope，企业版方向）

### v1.0（远期）

- **稳定性**：真实企业环境大规模验证，hook 触发可靠性 100%
- **生态**：插件机制（第三方 hook / skill / 模板分发）
- **多语言文档**：英文文档完善，国际化

## 不在路线图（明确排除）

- 改变 Claude Code 的模型调用逻辑（airein 在 CC 之上工作，不替代）
- SaaS 化（纯本地，零外部依赖是核心约束）
- 引入 npm 依赖（零依赖是硬约束，除非证明无法用内建实现 + ADR 记录）

## 项目状态

> 运维轨道：活跃工作、已知 Issues、近期变更。Session 启动时优先读此区块判断「下一步该做什么」；产品战略见上方「产品路线图」各节。

### 活跃工作

- **[P005-requirements-prd-templates](plans/P005-requirements-prd-templates/)** — Requirements 产品需求说明书定位 + s/m/l 三级模板。状态：`completed`（8/8 task，待归档）| Priority: **P2** | m-feature。产物：`resolveRequirementsTemplate` + `templates/docs/requirements/{s,m,l}.md` + 旧路径兼容桩 + new-plan/`20-workflow` PRD 口径 + writing-plans 模板收拢 + sync CORE/TEMPLATE。详见 plan 目录。
- **[P004-unified-install-orchestrator](plans/P004-unified-install-orchestrator/)** — 统一安装编排层（Unified Install Orchestrator）。状态：`in_progress` | Priority: **P1** | m-feature。触发：P001/P003 落地后用户仍须分别记 `setup-airein.sh`（CC）与 `install-host.js`（其它宿主），Cursor 等用户易误判「仅支持 CC」；真机 Cursor CLI 验证 hooks/commands 可用但安装路径分裂。范围（grilling 中）：统一 install/update/uninstall 编排、宿主探测与交互多选、单一内核根目录、`install-host.js` 收编为内部模块；保留 P001 CC 物理隔离硬约束。详见 plan 目录。
- **[P001-cross-platform](plans/P001-cross-platform/)** — 跨 AI 宿主适配层（Multi-Host Adaptation Layer）。状态：`archived`（2026-07-11 归档，13/13 task；T12 真机 Cursor IDE smoke deferred）。触发：Cursor Agent on Windows 全 hook 阻塞（Cursor 平台 #148131 launcher bug + UTF-8 BOM 静默 fail-open）。架构：**三层 kernel + 宿主适配薄层**——K1 skills kernel（SKILL.md 已成 Anthropic 开放标准，4 首版宿主零内容改动复用）/ K2 rules 适配层（薄壳生成各宿主入口）/ K3 hook 适配层（CC 协议轨 CUR/CDX/CB 复用既有 hook 脚本 + 事件名映射；OpenCode TS 插件独轨 bridge.ts + `throw Error`）。范围：**首版 4 宿主**（Cursor / Codex / CodeBuddy / OpenCode），Gemini CLI 降级为观察。产物分发框架 `scripts/install-host.js`（install/plan/uninstall/verify）+ 部署回归门禁 `verify-airein.sh --host`；CC 物理隔离硬约束（4 宿主 install/uninstall/verify 全程不读写 `~/.claude/`，test-cc-no-impact 锁定）。4 宿主真机冒烟为人工/CI 项，不阻塞本地全绿。详见 plan 目录 + [多宿主安装指南](install-hosts.md)。
- **[P002-local-source-install](plans/P002-local-source-install/)** — 本地源安装/升级支持（Local Source Install/Upgrade）。状态：`archived`（2026-07-11 归档，12/12 task 完成，commit 116c151 + 2649f52；m-feature pipeline）。触发：GitHub 访问不畅（慢/卡/间歇断，**非完全不通**），用户需从 GitHub 网页手动下 source archive 后本地安装/升级，而非每次让脚本在线 clone。范围：① 统一 source 解析层（`setup/update --source <dir|tar.gz|zip> [--sha256 <hex>]` → 本地 repo dir → HTTPS git Clone 回退）；② `REPO` SSH→HTTPS；③ 废弃腐烂的 `airein-pack.sh`/`unpack.sh`（手抄 manifest 子集已不可靠，GitHub archive + sync-airein.sh 接管职能）；④ `update-airein.sh` 同接 `--source`；⑤ README/安装指南补「网络不畅→下 archive→`--source`」流程。明确不做：CI 自建 canonical 包 / git bundle / 镜像源 URL / 强制 sha256 / GPG 签名。install-host.js（P001）已离线无需动。
- **[P003-multi-host-commands](plans/P003-multi-host-commands/)** — 多宿主 commands 部署（Multi-Host Commands Deployment）。状态：`archived`（2026-07-11 归档，4/4 task；真机 slash command smoke deferred）。产物：K4 `scripts/lib/command-place.js` + `install-host.js` K4 编排（16 个 `commands/*.md` → CUR `.cursor/commands/` + CB `.codebuddy/commands/` + OC `commands/`；Codex N/A）+ `verify-airein.sh --host` commands 校验 + `test/test-command-place.js`（145 断言）。dogfood 附带修 `getProjectDir()` stale cache 跨项目写入。详见 plan 目录 + [多宿主安装指南](install-hosts.md)。

### Issues

> v0.2 产品向待办已收拢到上方「未来方向」各节，不在此重复跟踪。

> 工程化 / dogfooding 缺口（部署与自身验证）：

- [x] **安装部署验证缺失**：已补 GitHub Actions CI（`.github/workflows/ci.yml`：`bash test/run-all.sh` + `node test/test-verify-airein.js`）。4 宿主真机冒烟仍靠人工（见 install-hosts.md）。
- [x] **dogfooding：自身 hook 在内部流程上的覆盖**：`docs/deployment.md` §Dogfooding 工作流 + `docs/test-plan.md` 行为清单；路径豁免缺口随发现补 `test/test-*.js`（本次 `doc-file-warning` SECURITY 等）。
- [x] **dogfooding：源码修复不自动生效于运行中的安装**：`docs/deployment.md` §Dogfooding 工作流明确 sync-airein / update-airein / install-host 重部署三步。
- [x] **sync-airein.sh CORE_FILES 引用了仓库不存在的 `RELEASES.md`**：`scripts/update/sync-airein.sh:110` 的 CORE_FILES 列了 `RELEASES.md`，但仓库根无此文件（git log 仅 2 次提交，从未新增）→ 每次同步报 `missing=1(RELEASES.md)` 且陈旧安装副本（本机 7 月 8 日 13KB）刷新不到、永远残留。修：从 CORE_FILES 删 `RELEASES.md`（airein 不发版此文件），或补建仓库文件；本次部署（本机 Windows）即命中，记此 dogfooding 发现。（P002 2.3 已修：CORE_FILES 删 RELEASES.md + 加 VERSION；全仓 grep 残留仅历史日志与 cleanup 防御性清旧残。）
- [x] **setup-airein.sh 检测 nvm 安装的 node 失败**：node 回退路径表（`setup-airein.sh:24` / `airein-chores.sh:16`）只含 homebrew 与 `/usr/local/bin/node`，缺 `~/.nvm/versions/node/*/bin/node`——非交互 shell（SSH / cron / 未 source nvm 的登录）下 `command -v node` 失败且回退表也 miss，误报「Node.js 未安装」并退出。首次真实部署（192.168.3.14 macOS，nvm node v22）即命中，靠预先 `source nvm.sh` 绕过。交互式终端不受影响（nvm 已在 shell rc 加载）。修：回退表补 nvm 路径，或自动 `source` nvm。
- [x] **setup-airein.sh 误把外来 `~/.claude/.git` 当本仓库**：`setup-airein.sh:84-89` 见 `~/.claude/.git` 存在即 `git pull origin main`——若该 `.git` 属于其他 harness（如本机原 my-ai-coder），会静默 pull 错仓库而非安装 airein（本次靠「先卸载删 `.git` + 从 `/tmp/airein` 运行」绕过）。修：pull 前校验 `remote.origin.url` 属于 airein，不匹配则按外来仓库处理（提示备份 / 重装）。
- [x] **CRLF 跨平台破坏 shell 脚本（dogfood · 双机重装发现 · 07d267c 已修）**：Windows 开发机 git autocrlf 让 working tree 变 CRLF，tar/sync 打包传输带 CRLF 到 macOS/Linux → shell 脚本 shebang `#!/usr/bin/env bash\r` 的 `bash\r` 找不到 → 系统 fallback sh/dash → `set -euo pipefail` 报 `invalid option name` 瘫痪（verify-airein.sh 即命中；JS hook 因 node 容忍 CRLF 不受影响）。Windows 自装不暴露（Git Bash env 容忍 `\r`）；3.14 macOS 重装即命中，靠 `find ... -exec perl -i -pe 's/\r$//'` 批量转 LF 修复。修方向：① 仓库 `.gitattributes` 强制 `*.sh *.js *.md eol=lf`（根治）；② 本机 `git config core.autocrlf input`；③ 打包分发用 `git archive`（输出 LF）。
- [x] **setup-airein.sh cwd bug（dogfood · 双机重装发现 · 07d267c 已修）**：setup `cd "$AIREIN_SRC"`（临时 /tmp 目录）后清理步骤 `rm -rf` 该目录却未先退出，后续 merge-hooks/chores/verify 子进程 cwd 失效（`getcwd: cannot access parent directories`）。非致命（子进程靠绝对路径仍工作，安装结果正确），但 verify-airein.sh 在坏 cwd + CRLF 双重作用下报错，用户观感像「安装失败」。修：`rm -rf` 临时目录前先 `cd "$HOME"`（3.14 真机 cwd errors 0 验证）。
- [x] **doc-file-warning stderr 措辞与 exit 2 矛盾（dogfood · 3.14 测试发现 · 本 commit 已修）**：阻断时 stderr 写「此文件可以创建，但建议确认位置是否合理」，但 exit 2 是硬阻断（Write 本轮被 deny）→ 误导模型/用户重试同路径。修：措辞改「已阻断写入,请改放 docs/ 或用标准命名」+ 顶部注释订正（`block Write this turn; model must change path/naming and retry`）；`test-doc-file-warning.js` 补 stderr 语义断言（不得含「可以创建」）。
- [x] **approval-guard 锁死非 git 项目审批流程（dogfood · 3.14 /new-plan 测试发现 · 本 commit 已修）**：`getConfirmationFile()`（`approval-guard.js:69`）靠从 file_path 向上找 `.git`/`package.json` 标志定位项目根——而代码库其他 hook 全用 `process.cwd()`/`getProjectDir()`（项目根本来就已知：CC 及各宿主 `host-runner.resolveCwd` 启动 hook 时设 cwd=项目根），唯独此函数在「猜」。airein-test 无 `.git`（non-git）无 `package.json` → 返回 null → `checkConfirmation(null,…)` 恒 false → 所有 `* → approved` 永久阻断，m-feature 流水线死锁；标志法还宿主耦合（`.claude` 是 CC 特有，Cursor 等不可靠）。测试 fixture 自建 `.git`（注释自承 `needed by getConfirmationFile()`）致盲区从未覆盖。修：`getConfirmationFile` 改用 `lib/utils.js:getProjectDir()`（优先 `process.cwd()` + CC cwd=~/.claude 边缘防护 + session 回退，宿主无关零标志依赖）。TDD：RED 复现 → GREEN 36/36（fixture 删 `.git` 让全测试隐式非 git）。
- [x] **getProjectDir() stale cache 跨项目写入（dogfood · P003 流水线 · 2026-07-11）**：`utils.js:getProjectDir()` 用 `hooks/hooks.json` 误判 airein 源仓库 cwd 为「安装目录」而跳过 → fallback 到 `~/.claude/projects/*/.project-path` 旧缓存（strat-ai）→ approval-guard / session-start / airein-logger 等把 `.claude/approval-confirmed.json`、memory、logs 写到错误项目，airein 内 plan 审批 Edit 全被锁。150aa55 同领域延续 bug。修：cwd !== `~/.claude` 时直接信任 host 设的 cwd，session 缓存仅 CC 边缘（cwd 误设全局配置目录）时使用。TDD：`test/test-utils-get-project-dir.js` 3/3 + approval-guard 36/36。
- [x] **plan-gate 盲区（dogfood · P001 归档发现 · 2026-07-11）**：`findActivePlan` 仅在 `status≠in_progress` 且任务全完成时跳过；`status: in_progress` 待归档计划仍视为 active。TDD：`test-plan-system.js` + `test-enforcement-hooks.js`。
- [x] **doc-file-warning 豁免缺 `SECURITY.md`（dogfood · 2026-07-11 安全加固发现）**：白名单加 `SECURITY` + `CODE_OF_CONDUCT` + `SUPPORT`；`test-doc-file-warning.js` 补断言。

### Recent Changes

- **2026-07-15** `release` VERSION **2.02 → 2.03** —— P005 Requirements PRD 分档模板 + Dashboard 模板分类修复（项目文档归入 design/requirements 等；计划文档仅 tasks/progress）。
- **2026-07-14** `feat` 完成 P005 Requirements PRD 分档模板（m-feature，8/8）—— `scripts/lib/requirements-template.js` 按 pipeline 选 s/m/l；权威模板 `templates/docs/requirements/{s,m,l}.md`；旧 `requirements.md` 改为兼容桩；new-plan + `rules/20-workflow.md` 明确「产品需求说明书」；writing-plans 旁路模板收拢为指针；sync 同步 lib + 三档模板。验收：`test-requirements-template.js` 40 + `test-skill-chain.js` 97 及相关回归绿。下一步：归档 / PR。
- **2026-07-14** `plan` 启动 P005 Requirements PRD 定位 + s/m/l 三级模板（m-feature）—— 触发：模型常把 plan `requirements.md` 写成简易需求摘要；主模板过薄、富模板旁路。grilling 进行中。下一步：对齐目标与范围 → requirements 审批。
- **2026-07-11** `plan` 启动 P004 统一安装编排层（m-feature）—— 触发：P001/P003 后安装路径仍分裂（`setup-airein.sh` 仅 CC、`install-host.js` 需用户自行记命令），Cursor 用户易误判仅支持 CC；真机 Cursor CLI hooks/commands 已验证可用。grilling 进行中。下一步：对齐目标与范围 → requirements 审批。
- **2026-07-11** `fix` 清零 Issues 工程化缺口 —— ① **plan-gate 盲区**：`findActivePlan` 待归档（`status:in_progress` + 任务全完成）不再被 `isPlanCompleted` 误跳过；② **doc-file-warning**：根白名单加 `SECURITY`/`CODE_OF_CONDUCT`/`SUPPORT`；③ **CI**：`.github/workflows/ci.yml`（run-all + verify-airein 回归）；④ **dogfooding 工作流**：`deployment.md` §Dogfooding（sync/install-host）；⑤ **hook 耗时**：`hook-timing.js` + `run-with-flags` 写 `durationMs`（`slowHookMs` 默认 2000）。
- **2026-07-11** `archive` 归档 P003 多宿主 commands 部署（m-feature，4/4 task）—— K4 `command-place.js`（仿 K1 skill-place）+ install-host.js K4 编排：16 个 `commands/*.md` 原样拷贝到 CUR `.cursor/commands/` + CB `.codebuddy/commands/` + OC 项目根 `commands/`；Codex N/A（prompts deprecated）。verify-airein.sh --host 补 commands 校验 + install-hosts.md K4 矩阵 + `test/test-command-place.js` 145 断言 + install-host 集成扩展。**真机 slash command smoke deferred**（同 P001 T12）。dogfood 附带：`getProjectDir()` stale cache 跨项目写入 fix（approval-guard 审批锁死 strat-ai 路径）。
- **2026-07-11** `fix` getProjectDir() stale cache 跨项目写入（P003 dogfood · approval-guard 审批锁死）—— airein 源仓库 cwd 被 `hooks/hooks.json` 误判为安装目录跳过 → session 缓存返回 strat-ai → approval-confirmed / memory / logs 写到错误项目。修：`cwd !== ~/.claude` 时直接信任 host cwd（P001 host-runner 约定），session 缓存仅 CC 边缘 case。TDD：`test/test-utils-get-project-dir.js` 3/3 + approval-guard 36/36。P003 阻塞解除，plan 仍 in_progress（K4 commands 未实现）。
- **2026-07-11** `plan` 启动 P003 多宿主 commands 部署（m-feature）—— 触发：Cursor CLI 装 airein 后 `/tdd` `/plan` `/verify` 等 16 个 slash command 不可用（P001 `install-host.js` 三支柱遗漏第四类资产 commands）。grilling 定 scope：① K4 `command-place.js`（仿 K1 `skill-place.js`）原样拷贝 `commands/*.md` 到三宿主（CUR `.cursor/commands/` + CB `.codebuddy/commands/` + OC `commands/`）；② Codex N/A（`~/.codex/prompts/` deprecated + bug #15941）；③ CC 不动（setup-airein.sh 管 `~/.claude/commands/`）；④ commands 内容零改动（单一真相源，跨宿主兼容性靠真机冒烟）；⑤ install-host.js K4 编排 + verify-airein.sh --host commands 校验 + install-hosts.md 矩阵；⑥ 真机 smoke deferred（同 P001 T12）。4 宿主机制调研（WebSearch）：CUR/CB/OC 均纯 md 稳定，CDX prompts deprecated。下一步：requirements 审批。
- **2026-07-11** `chore` GitHub 仓库安全加固 + main 分支保护（平台提醒触发 · 网页手动配置非代码变更）—— GitHub 平台两项提醒（main 未保护 + Security 页未配置）触发，逐项配齐：① **main 分支保护**规则集 #18800670（Active）：Require PR + 通过 CI + 拒绝 force push / 删除（用户选「强制 PR 流程」，覆盖所有含管理员在内的推送者）；② **Security policy** `docs/SECURITY.md`（本地优先、零依赖、无网络的 scope + 私密上报通道 + 私人 advisory；放 docs/ 因 `doc-file-warning` 白名单缺 `SECURITY`，见 Issues）；③ 私人安全公告 enabled；④ **Dependabot** 安全告警 + 安全更新 enabled；⑤ **Secret scanning + Push protection** enabled（推送含密钥即拦）。配置经 playwright 浏览器网页操作（`gh auth login --web` 因 `github.com:443` 连接超时失败，回退浏览器已有 session 直接操作 repo Settings + Code security）。dogfood 发现：`doc-file-warning` 拦根 `SECURITY.md`（见 Issues 待加白名单）；分支保护即时生效——本次 roadmap 记录改 main 需走 PR，验证保护规则工作。
- **2026-07-11** `release` 双机重装 dogfood 修复 + P001/P002 归档 squash merge 到 main（PR #2）—— `fix/dual-machine-install-dogfood` 分支 8 commit（`07d267c` CRLF+cwd / `5c6e232` doc-file-warning stderr / `150aa55` approval-guard 非 git / `2c57615` P001 T12 Cursor 扁平 schema / `116c151` P002 本地源+版本守卫 / `2649f52` shellcheck SKIPPED / `7cf6cbd`+`403e8a9` 归档）经 PR #2 squash 合成 `05b0264` 进 main（31 文件 +1226/-327）。本机 fast-forward `10a9f50→05b0264` 同步，local + remote feature branch 已删。PR 创建+合并经 playwright 浏览器走网页流程（gh CLI 因 `github.com:443` 网络不通 device-code 流程 failed；playwright 浏览器已有 GitHub session 直接操作 compare→Squash and merge）。T12 真机 Cursor IDE smoke 仍 deferred。
- **2026-07-11** `archive` 归档 P001 跨 AI 宿主适配层（l-feature，13/13 task）—— 三层 kernel + 宿主适配薄层：K1 skills kernel（4 宿主零改复用 SKILL.md）/ K2 rules 薄壳生成器（`lib/rule-generate.js`）/ K3 hook 双轨（CC 协议轨 CUR/CDX/CB 复用既有 hook + 事件映射；OpenCode 独轨 `bridge.ts`）。分发框架 `install-host.js`（install/plan/uninstall/verify + install-manifest hash 校验 + 回滚 + 空目录清理）+ 回归门禁 `verify-airein.sh --host`（14 用例）。CC 物理隔离硬约束（`test-cc-no-impact` 锁定）。46 suites 全绿。**T12 真机 Cursor IDE smoke deferred**（代码+单元测试 62/62 GREEN，commit 2c57615 renderCursor 扁平化；真机验证用户后续补）。plan-gate 盲区（待归档计划被 isPlanCompleted 误判 completed → 归档前修复被锁）记入 Issues。详见 plan 目录 + [install-hosts.md](install-hosts.md)。
- **2026-07-11** `archive` 归档 P002 本地源安装/升级（m-feature，12/12 task）—— 产物：① `scripts/lib/source-resolver.js`（`--source <dir|tar.gz|zip> [--sha256]` → 本地 dir → HTTPS clone 回退，setup/update 同接）；② `scripts/lib/version-guard.js`（`compareVersion` + 根 `VERSION` x.xx，降级拒绝/同版提醒/老版无 VERSION 可升级）；③ install-manifest 记 installedVersion；④ 废弃 airein-pack/unpack.sh（手抄 manifest 子集已腐烂，archive+sync 接管）+ 清残留；⑤ sync CORE_FILES 删 pack/unpack/RELEASES 加 VERSION；⑥ 文档补 --source/sha256 流程 + VERSION 维护规则。门禁：run-all 全绿 + verify-airein 22/0 + shellcheck 0 警告（winget shellcheck 0.11.0 + 删 sync 死变量 SKIPPED）。commit 116c151 + 2649f52。项目文档（deployment/conventions-bash/CONTRIBUTING）实施期已直接更新，归档仅状态翻转。
- **2026-07-11** `plan` 启动 P002 本地源安装/升级支持（m-feature）—— 触发：GitHub 访问不畅（**非断网**），用户需手动下 source archive 本地装/升级，而非每次在线 clone。grilling 定 scope 5 项：① 统一 source 解析层（`setup/update --source <dir|tar.gz|zip> [--sha256]` → 本地 repo dir → HTTPS clone 回退）；② `REPO` SSH→HTTPS；③ 废弃 `airein-pack.sh`/`unpack.sh`（手抄 manifest 子集已腐烂，GitHub archive + sync-airein.sh 覆盖职能）；④ `update-airein.sh` 同接 `--source`；⑤ 安装文档。关键澄清（用户纠正首版理解偏差）：场景是「网络不好」非「断网」→ GitHub 自带 codeload archive（tar.gz + zip）即 canonical 离线产物，**无需自建发布渠道**（据此删去首版「CI 自动发布」「git archive 手动发布」方案）。明确不做：CI/bundle/镜像源/强制 sha256/GPG。install-host.js（P001）已离线无需动。顺带纳入：清理 sync-airein.sh `CORE_FILES` 里仓库不存在的 `RELEASES.md`（已知 Issue）。下一步：requirements 审批。
- **2026-07-10** `fix` approval-guard 锁死非 git 项目审批流程（3.14 /new-plan dogfood；用户 code review 推翻首版「加 .claude 标志」方案）—— `getConfirmationFile()` 靠向上找 `.git`/`package.json` 标志定位项目根，非 git 项目返回 null → 审批永久锁死。首版修：加 `.claude` 第三标志。用户两点击穿：① Cursor 等宿主下 `.claude` 不可靠；②「项目根难道不知道吗」——确实 `process.cwd()` 即项目根（各宿主 `host-runner.resolveCwd` 启动时设），代码库其他 hook 全用 `getProjectDir()`，唯独此函数在猜。改：用 `lib/utils.js:getProjectDir()` 替代标志猜测（宿主无关、零标志依赖）。TDD：RED → GREEN（approval-guard 36/36，fixture 删 `.git` 全测试隐式非 git，全量 14 suites 绿）。教训：定位项目根一律走 `getProjectDir()`，勿 reimplement 标志猜测。下一步：同步 3.14 重跑 /new-plan。
- **2026-07-10** `fix` doc-file-warning stderr 措辞与 exit 2 语义对齐（3.14 测试 dogfood 发现）—— 阻断时 stderr 原写「此文件可以创建」，但 exit 2 是硬阻断（Write 本轮 deny），措辞自相矛盾、误导重试。改「已阻断写入,请改放 docs/ 或用标准命名」+ 顶部注释订正（原 `model can choose to continue` 同样误导）。TDD：`test-doc-file-warning.js` 补 stderr 语义断言（RED 1→GREEN 11/11，全量 14 suites 绿）。
- **2026-07-10** `fix` CRLF 跨平台 + setup cwd 双 bug 根治（双机重装 dogfood · 07d267c）—— ① 仓库根 `.gitattributes` 强制 `*.sh/*.js/*.md eol=lf`（Windows autocrlf=true → working tree CRLF → tar 到 macOS shebang `bash\r` 失效 → sh fallback → `set -euo pipefail` 瘫痪；根治未来所有 clone）；② setup-airein.sh 清理临时目录前先 `cd "$HOME"`（rm -rf SCRIPT_DIR 后子进程 getcwd 失效）。3.14 真机验证：cwd errors 0 + verify 22/22。
- **2026-07-10** `chore` 双机清理 + 标准重装验证（本机 Windows + 3.14 macOS，用户要求「彻底卸载+标准重装」验证 v0.2 双机落地）—— 流程：tar.gz 备份 settings + airein 子集 → 清 settings hooks（保 proxy env）→ 删 airein 文件（排除 CLAUDE.md）→ `setup-airein.sh` 标准重装 → verify。**本机（Windows）**：cp 分支，verify 22/22 0 警告，settings proxy（127.0.0.1:5721）+ 20 hooks 保留。**3.14（macOS）**：原 `~/.claude` 是 airein clone，先删 `.git`+tracked；3.14 无外网（github.com:443 不通 + 192.168.3.30 代理端口全 closed）→ 本机 tar 流式经 sp.sh stdin 传 `/tmp/airein-reinstall`（645KB，排 .git）→ setup-airein.sh → 暴露 CRLF/cwd 双 bug（见 Issues）→ `perl -i -pe 's/\r$//'` 批量转 LF 修复 → verify 22/22 0 警告 → doc-file-warning 真机 smoke 阻断 exit 2（stderr 中文警告）+ docs/ 放行 exit 0；settings proxy（192.168.3.30:5721）+ 20 hooks 保留。CC 用户数据（memory/projects/sessions/history/plugins/file-history/permissions/enabledPlugins）双机全保。
- **2026-07-10** `release` P001-cross-platform squash merge 到 main（PR #1）+ 双机部署 —— 本机未 push 的 `a5b0d5f`（安装器双缺陷修复）与 `b7c653a`（P001）经 PR #1 squash 合成 `10a9f50` 进 main（31 文件 +3525）；本机 reset --hard origin/main 同步（本地 feat branch 已删）；3.14（`~/.claude` 是 airein clone）git pull fast-forward `83260a7→10a9f50`（36 文件 +3945），`verify-airein.sh` 22/22 0 警告（node v22.22.3）。P001 分发文件（`install-host.js` / `host-runner.js` / `hook-register.js` / `bridge.ts`）+ `install-helpers.sh` 双机就位。push 前 dispatch code-reviewer（haiku）审增量无阻塞（`RELEASES.md` MINOR 为预存 known Issue，不夹带进 P001）。下一步：归档 P001。
- **2026-07-10** `fix` P001 Bug A/B 修复（真机 Cursor on Windows smoke 发现）—— 分发层 2 缺陷：① Bug A：hook command 用宿主 env 变量（`$CURSOR_PROJECT_DIR`/`$PLUGIN_ROOT`/`$CODEBUDDY_PLUGIN_ROOT`）引用仓库入口脚本，但运行时这些变量 = 用户打开的项目（targetRoot）而非 airein 仓库（repoRoot）→ 入口不可达（install 不复制入口，`host-runner.js:86` 靠 `__dirname` 定位 `../run-with-flags.js`，入口必须留仓库）；② Bug B：CUR+CB 用 `bash cursor.js`/`bash codebuddy.js` 启 node-shebang 入口 → bash 读 JS 当 shell 语法错 fail-open（比报错更危险）。修：`scripts/lib/hook-register.js` 3 render 收 `aireinRoot` → `node "<aireinRoot>/scripts/hooks/host/<host>.js" <hookId>`（仿 OC `bridge.ts` `AIREIN_ROOT` 占位符模式，install 时注入正斜杠绝对路径）；`translateHooks` 非 OC 宿主强制 aireinRoot（缺则抛错）；`install-host.js` 传 `aireinRoot: repoRoot.replace(/\\/g,'/')`。`$CURSOR_PROJECT_DIR` 仍由 `host-runner.js:55` 用作 cwd（正确，非入口定位）。TDD：`test-hook-register.js` 单元 54/54 + `test-install-host.js` ⑧ 集成（3 host × `fs.existsSync` + `node --check`，188/188）；deployment §3 + design §6.1 文档同步。本机 Windows Cursor 真机复测：spawn 入口 exit 0 stderr 空（真放行，非 fail-open）。全量 46 suites 绿。P001 达 12/12。
- **2026-07-10** `feat` P001-cross-platform 全部 11/11 task 完成（T00-T10）—— 三层 kernel + 宿主适配薄层落地：K1 skills kernel（4 宿主零内容改动复用 SKILL.md）/ K2 rules 薄壳生成器（`lib/rule-generate.js`）/ K3 hook 双轨（CC 协议轨 CUR/CDX/CB 复用既有 hook 脚本 + 事件名映射 + 阻断映射；OpenCode TS 插件独轨 `opencode/bridge.ts` + `throw Error`）。分发框架 `scripts/install-host.js`（install/plan/uninstall/verify + install-manifest hash 校验 + 中途失败回滚 + 空目录外壳清理）+ 部署回归门禁 `verify-airein.sh --host`（deployment §3 产物矩阵结构校验，`test/test-verify-airein.js` 14 用例 node 驱动 bash）。CC 物理隔离硬约束（4 宿主 install/uninstall/verify 全程不读写 `~/.claude/`，`test/test-cc-no-impact.js` 锁定）。`bash test/run-all.sh` 46 suites 全绿。4 宿主真机冒烟为人工/CI 项，不阻塞本地全绿。安装文档见 [install-hosts.md](install-hosts.md)。下一步：归档 P001。
- **2026-07-09** `plan` P001 requirements 据行业调研修订 —— 架构定为「三层 kernel + 宿主适配薄层」：① K1 skills kernel（SKILL.md 是 Anthropic 开放行业标准 [agentskills.io](https://agentskills.io/specification)，4 首版宿主 Cursor/Codex/CodeBuddy/OpenCode 全部原生采用，airein 12 skill 零内容改动跨用）；② K2 rules 薄壳生成器（单一真相源 docs/+rules/ → 各宿主入口 CLAUDE.md / `.cursor/rules/*.mdc` / AGENTS.md / CODEBUDDY.md，CDX·OC 无 `@include` 条件规则处标降级）；③ K3 hook 双轨（CC 协议轨 CUR/CDX/CB 协议同构复用既有脚本 + 事件名映射；OpenCode 异类 JS 插件 + `throw Error` 首版标 N/A）。范围由 5 宿主收为 4 宿主：Gemini CLI 降级观察（2026-06-18 起 Unpaid/Google One 用户被 Antigravity CLI 替换，投入恐白费，保留事件映射表备迁移调研）。调研关键事实：exit 2 阻断 + `CLAUDE_PROJECT_DIR` 别名在 CUR/CB/GEM 官方提供；CDX Pre/PostToolUse 仅 Bash 工具触发；OC 缺 Stop 重新激活（[#12472](https://github.com/sst/opencode/issues/12472)）/ 子代理拦截 / UserPromptSubmit 待确认。下一步：requirements 审批 → design（事件精确映射矩阵 + 三层 kernel 实现细节）。
- **2026-07-09** `plan` 启动 P001 跨 AI 宿主适配层（Multi-Host Adaptation Layer）—— 触发：Cursor Agent on Windows 全 hook 阻塞。诊断分三层：① Cursor 平台 #148131（launcher 在 Git Bash 默认 profile 下注入 PowerShell `&`/`[Convert]::` 语法，bash 无法解析 → 每个 hook 阻断）—— airein 无法修，靠用户切 PowerShell profile 绕过；② UTF-8 BOM 静默 fail-open（`$OutputEncoding=UTF8` 注入 EF BB BF，`lib/utils.js` `readStdinJson` 解析 BOM 原文失败 → 静默放行，比报错更危险）—— airein 可修（去 BOM），纳入本 plan；③ node `String.trim()` 对 U+FEFF 的边界。调研结论：CC hook 协议已成行业标准（Codex CLI / Gemini CLI / CodeBuddy 采用 Claude-style hooks；OpenCode 部分；Trae 暂无），值得做正式跨平台适配层而非单点修补。用户拍板：范围=全平台适配层（含分发框架），验收=全宿主完整三支柱（物理不可达处标 N/A），首版=一次性铺开 5 宿主。下一步：requirements.md 审批。
- **2026-07-09** `fix` SessionStart 启动报错噪音（本机部署后用户报告）—— `scripts/hooks/session-start.js` 在无包管理器偏好时（`pm.source==='default'`）每次启动都把包管理器检测 + 8 行「选择提示」打到 stderr（CC 把 hook stderr 渲染成红色错误），用户看到「一堆报错」。根因：该检测结果 `pm` 仅用于这处日志（代码注释自承「no context injection」），零功能价值。修：删除整段 PM 上报块 + 不再 import `getPackageManager`/`getSelectionPrompt`（启动彻底干净，上下文注入不变）。TDD：`test/test-session-start.js`（6 断言，spawn 真实 hook 隔离临时项目，先 RED 复现噪音再 GREEN）。已 sync 到本机安装，验证 SessionStart stderr 现为空。顺带清理旧 harness 残留 `~/.claude/scripts/session-start.js`（仓库无此文件、无 hook 引用）。
- **2026-07-09** `chore` 第二台真机部署验证（本开发机 Windows 11 + Git Bash + node v22.20.0）—— 外科式清理旧 harness（删 commands/、4 个旧入口脚本、38→24 hooks、45→12 skills、stale harness-optimizer.md agent、空 learned/ 残目录），保留 CC 原生运行时（tasks/daemon/session-env/jobs/metrics/debug/plugins/projects）与全部个人配置；`sync-airein.sh` 从本地仓库刷新（72 文件更新、22 verify 检查 0 警告、install-helpers.sh 已部署）；`merge-hooks` 后 settings.json hooks 6 事件 20 组与仓库 canonical 完全一致，env（代理 127.0.0.1:5721 + 模型映射）/36 permissions/34 plugins/sandbox/model/theme/effortLevel 原样保留。备份 `claude-pre-clean-20260709-185613.tar.gz`（919K）留档。期间发现 1 个 manifest 缺口（`RELEASES.md` 不在仓库却在 CORE_FILES，见 Issues）。验证安装器双缺陷修复在第二台机器同样生效。
- **2026-07-09** `fix` 安装器双缺陷修复（首次真实部署暴露）：① nvm/fnm node 检测 —— 抽取 `scripts/lib/install-helpers.sh` 的 `resolve_node_bin`（PATH → source nvm/fnm → 扫描已知安装目录），`setup-airein.sh` / `airein-chores.sh` / `merge-hooks.sh` 共用，修复非交互 shell（SSH / cron）下误报「Node.js 未安装」并退出；② 外来 `~/.claude/.git` 误 pull —— `setup-airein.sh` pull 前用 `is_airein_remote_url` 校验 `remote.origin.url`，不匹配则拒绝（exit 1 + 提示备份 / 移除），不再静默拉错仓库。新 lib 已加入 `sync-airein.sh` CORE_FILES（更新路径也会分发）。TDD：`test/test-install-helpers.js`（25 断言，含 glob 回退 / source nvm / 拒绝外来仓库集成测试）。
- **2026-07-09** `test` 首次真实部署验证（192.168.3.14 macOS Monterey，bash 3.2 + nvm node v22 + claude 2.1.193）—— 外科式卸载旧 harness（my-ai-coder，401 tracked 文件 + `.git`，保留个人数据 `settings.json` / `history.jsonl` / `sessions` / `projects`）→ 安装 airein → `verify-airein.sh` 通过（22/22 hook 脚本就位、47 脚本语法检查、lib + L0 rules 完整）→ hook 行为实测（`doc-file-warning` 非标准路径 exit 2 阻断 + stderr、`docs/` 路径 exit 0 放行）；`settings.json` hooks 由旧 harness ~42 个替换为 airein 23 个、0 orphan。期间发现 2 个安装器缺陷（见 Issues）。备份 `claude-pre-airein-20260709-162030.tar.gz` 留档可回滚。
- **2026-07-09** `fix` doc-file-warning 豁免 `.claude/self-learning/` 路径 —— 解除对自学习缓冲（`.claude/self-learning/pending.md`）的误拦，TDD 补测。dogfooding 首例「自身 hook 漏豁免内部数据路径」。
- **2026-07-09** `docs` CONTRIBUTING 补 commit message 规范（公开记录只写 what+why、不加 `Co-Authored-By` trailer）+ roadmap 增设项目状态轨（活跃工作 / Issues / Recent Changes）。
- **2026-07-09** `docs` 补充英文 README（`README.en.md`）+ 精化致谢措辞（聚焦当前 Node.js 内建模块实现）。
- **2026-07-09** `feat` airein v0.1.0 初始发布 —— 确立「Prompt 是建议，Hook 是法律」核心命题，落地三大支柱（spec-driven 协作 / 跨 session 记忆 / Dashboard）。

## 贡献

欢迎 issue / PR。开发规范见 `docs/conventions-javascript.md` + `docs/conventions-bash.md`，贡献流程见 [CONTRIBUTING.md](../CONTRIBUTING.md)。
