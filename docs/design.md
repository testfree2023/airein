# Design: Airein

> **架构设计文档**
> 版本: v0.1.0 · License: Apache-2.0

---

## 核心设计理念

**Prompt 是建议，Hook 是法律。**

- **Prompt（`CLAUDE.md` / `rules/*.md` / `SKILL.md`）= 建议**：模型读到、理解、多数遵守，但可被绕过、可被上下文淹没、可被遗忘。
- **Hook（`exit 2` 阻断）= 法律**：PreToolUse / PostToolUse 钩子是代码保证，违反即阻断，不依赖模型自觉。

设计推论：**能 hook 强制的，就不要只靠 prompt**；hook 是底线，prompt 是上限。

## 五层 JIT 上下文架构

按需加载，不全部注入主上下文：

| 层级 | 内容 | 实现机制 | 强制力 | Token |
|------|------|---------|--------|-------|
| L0 始终加载 | `rules/{00,10,20}-*.md` | CC 原生 `processMdRules` 加载 `~/.claude/rules/*.md`（User type，纯拼接） | ✅ 机制强制 | ~5K |
| L1 编辑触发 | `docs/conventions-{scope}.md` | CC 原生条件规则薄壳 `.claude/rules/conventions-{scope}.md`（`paths` + `@include`），编辑匹配文件时自动注入 | ✅ 机制强制 | ~50 |
| L2 技能按需 | `skills/*/SKILL.md` | CC 原生 skill 机制（`/skill` 触发） | ✅ 机制强制 | 0 |
| L3 知识库 | `docs/plans/*`, `docs/adr/*` | **无 hook**，指示用 subagent 读 | ⚠️ prompt 约定 | 0 |
| L4 会话状态 | session-state + roadmap + memory | `session-start.js` hook 注入 branch / plan / last_files | ✅ hook 强制 | ~200 |

### 加载时机

```
Session 启动
  ├─ L0 自动加载（rules/00,10,20，~5K tokens）
  ├─ L4 注入（session-state，~200 tokens）
  └─ L1 / L2 / L3 按需加载
      ├─ 编辑 .js 文件 → L1 注入 conventions-javascript.md
      ├─ 调用 /new-plan → L2 加载 skills/new-plan/SKILL.md
      └─ 查询计划 → L3 subagent 读 docs/plans/*/
```

### 关键不变量

1. **L0 始终加载住 `rules/`**：铁律与架构不变量放在最耐久层。
2. **L1 编辑触发住 `docs/`**：`conventions-*.md` 单一真相源在 `docs/`，薄壳只是指针。
3. **L3 不进主上下文**：知识库由 subagent 读取，不膨胀主会话。
4. **CC 指令加载事实**：`~/.claude/CLAUDE.md` 与 `~/.claude/rules/*.md` 都以 User type 纯拼接注入，**无 override 语义**——同一条规则写两处 = 出现两次 = token 浪费，不是"备份"。

## 持久性排序（L0 住 rules/ 的根本理由）

持久性从低到高：

1. 项目 `<repo>/CLAUDE.md` — **易碎**：`/init` 覆盖、用户手改、迁移易丢。
2. 全局 `~/.claude/CLAUDE.md` — **中**：用户领土，airein 不写 / 不覆盖。
3. `~/.claude/rules/*.md` — **最耐久**：`/init`-safe + 升级-safe + 位置隐蔽。

铁律与架构不变量住最耐久层（`rules/`），操作手册住易碎层（`CLAUDE.md`）。

## Hook 体系架构

### 事件时机

| 事件 | 触发时机 | 用途 |
|------|---------|------|
| PreToolUse | 调用工具前 | 铁律强制（test-guard、plan-gate、approval-sequence） |
| PostToolUse | 工具返回后 | 质量检查（quality-sentinel、quality-gate、contract-sentinel） |
| PreCompact | 上下文压缩前 | 提取关键信息（pre-compact） |
| SessionStart | 会话开始 | 加载会话状态（session-start） |
| Stop | 声明完成时 | 测试门禁 + 状态持久化（stop-test-gate） |
| UserPromptSubmit | 用户提交 prompt | 注入自学习提示（self-learning-prompt） |

### 阻断型 vs 建议型

**阻断型（`exit 2`）** —— 铁律级别，不可覆盖：

| Hook | 时机 | 行为 |
|------|------|------|
| test-guard | PreToolUse 创建 / 编辑源文件 | 要求测试已存在（strict 模式 `exit 2`） |
| plan-gate | PreToolUse 编辑代码 | 无 approved plan 阻止源码编辑 |
| approval-sequence | PreToolUse 创建文档 | 强制 R→D→T 顺序 |
| approval-guard | PreToolUse 编辑 progress.md | 保护 approval 状态不被擅自篡改 |
| pre-commit-gate | PreToolUse git commit | 跑 build + test，失败阻止 |

**建议型（async）** —— 警告与自动化：

| Hook | 时机 | 行为 |
|------|------|------|
| quality-sentinel | PostToolUse 编辑代码后 | 检查 debug 语句、密钥、TODO |
| quality-gate | PostToolUse 编辑代码后 | 跑全量质量检查 |
| contract-sentinel | PostToolUse 编辑代码后 | 检测导出 API 签名变更并警告 |
| post-edit-format | PostToolUse 编辑代码后 | 自动格式化（探测 Biome / Prettier） |
| progress-sync | PostToolUse tasks.md 变动 | 自动更新 progress.md |
| archive-trigger | PostToolUse progress.md 变动 | 计划完成时提示归档 |
| structure-sync / read-dedup | PostToolUse | token 估算更新 / 重复读提醒 |

### Hook 注册机制

注册清单：`hooks/hooks.json`（CC 原生 settings.json hook 格式）。安装时由 `merge-hooks.js`
合并进全局 `~/.claude/settings.json`——**只替换 airein 拥有的 hook，保留第三方 hook**，并有
自愈机制（被删则下次 session-start 自动恢复）。

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PLUGIN_ROOT}/scripts/hooks/run-hook.sh\" \"${CLAUDE_PLUGIN_ROOT}/scripts/hooks/test-guard.js\"",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

**调用链**：CC → `run-hook.sh` wrapper → `scripts/hooks/*.js`（hook 适配层）→ `scripts/lib/*.js`（纯函数库）。

## 铁律系统

5 条铁律，定义于 `rules/00-iron-rules.md`：

1. **禁止无测试的生产代码** — 源文件变更必须有对应测试。
2. **测试必须先于实现** — 找不到失败测试不写实现。
3. **每完成 task 检查 perTaskReview** — 开启则 dispatch code-reviewer。
4. **worktreeIsolation 启用时重构必须 EnterWorktree**。
5. **铁律不可通过用户确认豁免** — 用户要求跳过也必须拒绝。

**强制力来源（双重保障）**：Prompt 层（`rules/00-iron-rules.md` L0 加载）告诉模型"这是规则"；Hook 层（PreToolUse `exit 2`）确保违反即阻断。

## Skill 体系

12 个内置 skill：

| 类别 | Skill | 用途 |
|------|-------|------|
| 项目管理 | init-project / new-plan / next / status / log-change / archive-plan | 项目生命周期 |
| 开发流程 | writing-plans / tdd-workflow / verification-loop | spec → TDD → 验证 |
| 审查诊断 | stuck-recovery / self-learning / model-guide | 失败恢复 / 自学 / 模型选型 |

### Plan Pipeline 体系

8 种按规模分流的 pipeline：`s-feature` / `s-bugfix` / `m-feature`（默认）/ `m-bugfix` /
`m-urgent` / `l-feature` / `l-bugfix` / `hotfix`。每种对应一组文档流水线（如 l-feature =
requirements → design → test-plan → deployment → tasks）。

## 自学习系统架构

三层流转，**不碰 CC memory**：

```
buffer（项目 .claude/self-learning/pending.md）
  └─ 模型搭车识别持久允许/禁止指令，当轮写入

archive（~/.claude/projects/{key}/self-learning-archive.md）
  └─ Stop hook append-only 追加，按项目隔离

promotion（项目 rules/30-self-learned.md）
  └─ 同一指令累计 ≥ promotionThreshold（默认 3）→ Stop hook 写入，晋升 L0
```

**职责边界**：自学习三层只在自己的文件流转，永不写 `memory/`。CC memory 保持原生纯净；
自学习是旁路的规则晋升通道。

## Dashboard 架构

- **后端**：Node.js `http` module（零依赖）。
- **前端**：单文件 SPA（一个 `index.html` 内嵌 CSS + JS，无构建步骤），hash 路由。
- **端口**：3456（可配置）。

**安全设计**：Host / Origin 头校验（DNS rebinding + CSRF 防护）、严格 Content-Type
（`text/plain` CSRF 绕过防护）、`exec` 去 shell 化（不可信输入处理）、`discoverProjects`
TTL 缓存（DoS 防护）、错误消息收敛（信息泄漏防护）。

**功能**：项目自动发现、plan 文档查看 / 编辑（子文档 tab）、approval 工作流可视化、
模板浏览器、配置可视化（`quality.json` → 结构化表单）、中英 i18n。

## 模板系统

26 个文档模板：结构化顶层模板（requirements / design / test-plan / deployment / tasks /
progress）、通用子文档模板（design-domain-model / database / security / deployment）、
语言特定模板（design-architecture / design-conventions × 7 语言：js / ts / py / java / go /
rust / kotlin）。

**模板选择**：读 `quality.json` → `language.primary` → `templates/language-profiles/{lang}.json`
→ `role`；role 是 backend / fullstack 用对应语言模板，否则回退通用版。

## 强制力分层（贯穿全系统）

| 层 | 机制 | 性质 |
|----|------|------|
| 法律 | Hook `exit 2` | 代码保证，违反即阻断 |
| 机制强制 | CC 原生加载（rules / 条件规则 / skill） | 加载即生效 |
| 建议 | Prompt（CLAUDE.md / rules / SKILL.md） | 可被上下文淹没 |
| 兜底 | CI / Code Review | 人工 + 流程 |

设计原则：**能上移到"法律"层的约束，就不要只留在"建议"层。**
