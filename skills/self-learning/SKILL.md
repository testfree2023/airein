---
name: self-learning
description: Identify persistent user allow/deny directives in passing while working and append them to the pending buffer file. Archiving to the per-project log and promotion to permanent L0 rules is handled automatically by Stop hooks. Use when the user expresses a durable preference mid-task that should outlive the session.
disable-model-invocation: false
---

# Self-Learning（LLM 搭车识别 + Stop hook 归档晋升）

> 本 skill 是自学习机制的**模型侧说明**。识别提示已由 `UserPromptSubmit` hook
> 自动注入（每条用户消息触发），归档与晋升由 Stop hook 自动处理。你只需
> **识别持久指令 + 写缓冲文件**——其余全自动。

## 机制（三层流转）

```
缓冲 pending.md（你搭便车写）
  → 存档 archive.md（Stop hook 追加，append-only）
  → rules/30-self-learned.md（≥N 次晋升，L0 自动加载）
```

**自学习全程不碰 memory**——只写 `.claude/self-learning/pending.md`，绝不写
`~/.claude/projects/*/memory/` 下的任何文件。memory 是另一套系统（已确认的
规则/偏好），自学习是原始指令流水线，两者隔离。

## 你的职责（仅识别 + 写缓冲）

每条用户 prompt 时，hook 已注入识别提示（`[Self-Learning] ...`）。若 prompt
表达了**持久的允许/禁止指令**，在正常回应之外，把识别结果【追加】写入
`.claude/self-learning/pending.md`，每条用 frontmatter 块：

```
---
ts: <ISO-8601 时间>
type: allow | deny
instruction: <归一化为一条简短指令，中英文均可，去掉指代与上下文>
prompt: <原始用户 prompt 片段，≤200 字>
---
```

### 识别规则

**写**（持久指令）：
- "以后都 / 永远 / 每次" + 允许或禁止
- "不要 / 别 / 禁止 / never" + 行为
- "允许 / 可以 / allow" + 行为
- "记住我喜欢 / 我偏好 / always"

**不写**（一次性 / 上下文相关）：
- "现在做 X"（一次性任务）
- "在这个文件里"（上下文限定，非持久）
- "如果 / 假设"（假设性）
- 已在 quality.json / CLAUDE.md / rules/ 明确的规则（不重复记录）

### 归一化要稳

同一条规则可能用不同措辞反复出现（"别用 git add -A" / "永不用 git add -a" /
"Never Git Add A"）。归一化时尽量统一措辞——**trim + 小写 + 折叠空白**后应一致，
这样累计计数才能达到晋升阈值（默认 3 次）。归一化只做这些（不做同义合并），
保守可接受：宁可不晋升，不可错合并。

## 不归你管（Stop hook 自动）

- **归档**：Stop hook 把 `pending.md` 追加到 `self-learning-archive.md`（与
  transcript 同目录，`~/.claude/projects/{key}/`），然后清空 pending。
- **晋升**：archive 中同一指令累计达 `quality.json selfLearning.promotionThreshold`
  （默认 3）次 → 自动写入 `rules/30-self-learned.md`（L0 自动加载，下一 session
  起对所有工作生效）。
- **幂等**：rules/30 整文件重渲染，重复跑 Stop 不重复晋升。

## 开关

`quality.json` → `selfLearning.enabled: false`：整条链静默关闭（hook 不注入
识别提示、Stop 不归档晋升）。默认 `true`。

## 红线（不可违反）

1. **只写 `.claude/self-learning/pending.md`**，绝不写 memory（任何 `memory/`
   路径，包括 `~/.claude/projects/*/memory/` 和项目 `.claude/memory/`）。
2. prompt 不含持久指令则**不写**（宁缺毋滥——垃圾指令会污染晋升池）。
3. 归一化保守：宁可少合并，不可错合并不同指令。
4. 不改 archive / rules/30（那是 Stop hook 的职责，手改会被下次重渲染覆盖）。

## Scope

This skill ONLY:
- 识别用户 prompt 中的持久允许/禁止指令
- 写 `.claude/self-learning/pending.md` 缓冲

This skill NEVER:
- 写 memory 任何文件
- 改 archive / rules/30-self-learned.md
- 在一次性指令上触发
- 做归档/晋升（Stop hook 的职责）
