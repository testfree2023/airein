/**
 * lib/self-learning.js — LLM 搭车自学习（P019）
 *
 * 分层：本文件是纯函数库（无 stdin/stdout/exit 副作用），被
 * `hooks/self-learning-prompt.js`（UserPromptSubmit）与 `hooks/session-end.js`
 * （Stop 链）复用。
 *
 * 三层流转（自学习全程不碰 memory）：
 *   缓冲 pending.md（模型搭便车写） → 存档 archive.md（Stop hook 追加）
 *   → rules/30-self-learned.md（≥N 次晋升，L0 自动加载）
 *
 * 红线：自学习全程不碰 memory——本文件不 import、不引用、不写入任何
 * `~/.claude/projects/<key>/memory/` 路径。
 */

const { readFile, writeFile, appendFile } = require('./utils');

const META_PROMPT = `[Self-Learning] 若本条用户 prompt 表达了持久的允许/禁止指令（如"以后都 X" / "不要 Y" / "允许 Z" / "永远别 W"），请在正常回应之外，把识别结果【追加】写入缓冲 \`.claude/self-learning/pending.md\`，每条用 frontmatter 块：

---
ts: <ISO-8601 时间>
type: allow | deny
instruction: <归一化为一条简短指令，中英文均可，去掉指代与上下文>
prompt: <原始用户 prompt 片段，≤200 字>
---

规则：① 只写缓冲文件，绝不写 ~/.claude/projects/*/memory/ 下的任何文件——自学习不碰 memory。② prompt 不含持久指令则不写。③ 归一化要稳：同义不同措辞尽量统一措辞（利于计数晋升）。④ 归档与晋升由 Stop hook 自动处理，你只负责识别 + 写缓冲。`;

/**
 * Build the UserPromptSubmit hook injection output.
 *
 * CC 的 UserPromptSubmit 协议：hook 通过 exit 0 + stdout JSON 的
 * `hookSpecificOutput.additionalContext` 字段向模型上下文注入额外文本
 * （不是顶层 additionalContext，不是 systemMessage）。每条用户消息触发一次。
 *
 * @returns {{ hookSpecificOutput: { hookEventName: string, additionalContext: string } }}
 */
function buildInjectionOutput() {
  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: META_PROMPT
    }
  };
}

/**
 * Normalize an instruction text into a stable counting key.
 *
 * 用于归档侧按指令累计出现次数。只做 trim + lower + 折叠空白——
 * 保守归一化（不做同义合并，那超出纯 JS 能力）。同义不同措辞会被
 * 分开计数，阈值 N=3 本就宁缺毋滥，偏保守可接受。
 *
 * @param {string|null|undefined} text - Raw instruction text.
 * @returns {string} Normalized key (empty string for null/undefined).
 */
function normalizeInstruction(text) {
  if (text == null) return '';
  return String(text).trim().toLowerCase().replace(/\s+/g, ' ');
}

const ARCHIVE_HEADER = '# Self-Learning Archive（append-only，勿手改）\n\n';
const BLOCK_RE = /---\s*\n([\s\S]*?)\n---/g;
const FIELD_RE = /^(\w+):\s*(.*)$/;

function parseFrontmatterBody(body) {
  const fields = {};
  for (const line of body.split('\n')) {
    const m = line.match(FIELD_RE);
    if (m) fields[m[1]] = m[2];
  }
  if (fields.type !== 'allow' && fields.type !== 'deny') return null;
  if (!fields.instruction || !fields.instruction.trim()) return null;
  return {
    ts: fields.ts || '',
    type: fields.type,
    instruction: fields.instruction,
    prompt: fields.prompt || ''
  };
}

/**
 * Parse pending/archive content into instruction records.
 *
 * 切分 `---` frontmatter 块，逐块解析。坏块（缺 type/instruction、非法 type）
 * 跳过不抛——缓冲由模型写，格式可能不稳，必须 fail-tolerant。
 *
 * @param {string|null|undefined} content
 * @returns {Array<{ts:string,type:string,instruction:string,prompt:string}>}
 */
function parsePending(content) {
  if (!content || typeof content !== 'string') return [];
  const records = [];
  BLOCK_RE.lastIndex = 0;
  let m;
  while ((m = BLOCK_RE.exec(content)) !== null) {
    const rec = parseFrontmatterBody(m[1]);
    if (rec) records.push(rec);
  }
  return records;
}

/**
 * Count records by (type, normalizedInstruction), tracking first/last ts.
 *
 * @returns {Array<{type:string,instruction:string,count:number,firstTs:string,lastTs:string}>}
 */
function countInstructions(records) {
  const map = new Map();
  for (const r of records) {
    const key = r.type + ' ' + normalizeInstruction(r.instruction);
    const existing = map.get(key);
    if (existing) {
      existing.count++;
      if (r.ts && (!existing.firstTs || r.ts < existing.firstTs)) existing.firstTs = r.ts;
      if (r.ts && (!existing.lastTs || r.ts > existing.lastTs)) existing.lastTs = r.ts;
    } else {
      map.set(key, {
        type: r.type,
        instruction: r.instruction,
        count: 1,
        firstTs: r.ts || '',
        lastTs: r.ts || ''
      });
    }
  }
  return Array.from(map.values());
}

/**
 * Select counts that meet the promotion threshold and aren't already promoted.
 *
 * alreadyPromoted 用于外部幂等检查；archiveAndPromote 的整文件重渲染天然幂等
 * （同档重跑 selectPromotable(counts, N, []) 结果不变），这里保留参数供未来
 * 增量场景。
 *
 * @returns {Array} counts entries ≥ threshold and not in alreadyPromoted.
 */
function selectPromotable(counts, threshold, alreadyPromoted) {
  const promoted = new Set(
    (alreadyPromoted || []).map(p => p.type + ' ' + normalizeInstruction(p.instruction))
  );
  return counts.filter(c => {
    if (c.count < threshold) return false;
    return !promoted.has(c.type + ' ' + normalizeInstruction(c.instruction));
  });
}

/**
 * Render promoted instructions into rules/30-self-learned.md content.
 *
 * 整文件渲染（非追加）——每次根据全档 count 重渲染，天然幂等。
 */
function renderRules30(promotable) {
  const deny = promotable.filter(p => p.type === 'deny');
  const allow = promotable.filter(p => p.type === 'allow');
  const fmt = p => `- ${p.instruction}（累计 ${p.count} 次，首见 ${p.firstTs}，最近 ${p.lastTs}）`;
  const lines = [
    '# 30 — Self-Learned Rules（自动生成，≥N 次确认晋升）',
    '',
    '> 本文件由 self-learning Stop hook 自动维护：用户对话中重复达 promotionThreshold 次的允许/禁止指令自动晋升至此。L0 自动加载。请勿手改——调整阈值改 quality.json `selfLearning.promotionThreshold`，移除某条删存档对应记录后重生成。',
    ''
  ];
  if (deny.length) {
    lines.push('## Deny');
    deny.forEach(p => lines.push(fmt(p)));
    lines.push('');
  }
  if (allow.length) {
    lines.push('## Allow');
    allow.forEach(p => lines.push(fmt(p)));
    lines.push('');
  }
  return lines.join('\n');
}

function formatBlock(r) {
  return ['---', `ts: ${r.ts}`, `type: ${r.type}`, `instruction: ${r.instruction}`, `prompt: ${r.prompt}`, '---'].join('\n');
}

/**
 * Deduplicate records by (type, normalizedInstruction, ts).
 *
 * 同一时间（ts 完全相同）的相同指令只保留一条。
 * 不同时间（哪怕差1秒）的相同指令保留多条。
 *
 * @param {Array} records
 * @returns {Array} Deduplicated records
 */
function dedupeRecords(records) {
  const seen = new Set();
  const result = [];
  for (const r of records) {
    const key = r.type + '|' + normalizeInstruction(r.instruction) + '|' + r.ts;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(r);
    }
  }
  return result;
}

/**
 * Orchestrate archive + promote (called by session-end Stop hook).
 *
 * 流程：a.读 pending → b.追加 archive（首建加 header）→ c.清 pending
 *      → d.读全档 count → e.≥N 重渲染 rules/30。
 * 全程 fail-open：任何 IO 异常只 log（此处静默），返回已处理量，不抛。
 *
 * 幂等：rules/30 整文件重渲染，同档重跑结果不变。
 *
 * @param {{pendingPath:string, archivePath:string, rulesPath:string, threshold:number}} opts
 * @returns {{archived:number, promoted:Array}}
 */
function archiveAndPromote(opts) {
  const { pendingPath, archivePath, rulesPath, threshold } = opts;

  let pendingContent = '';
  try { pendingContent = readFile(pendingPath) || ''; } catch (e) { return { archived: 0, promoted: [] }; }
  const records = parsePending(pendingContent);

  if (records.length > 0) {
    try {
      const deduped = dedupeRecords(records);
      let existing = '';
      try { existing = readFile(archivePath) || ''; } catch (e) { /* 新档，下面建 header */ }
      if (!existing) writeFile(archivePath, ARCHIVE_HEADER);
      appendFile(archivePath, deduped.map(formatBlock).join('\n') + '\n');
    } catch (e) { /* fail-open：归档失败不影响后续 */ }
  }

  try { writeFile(pendingPath, ''); } catch (e) { /* fail-open */ }

  let fullArchive = '';
  try { fullArchive = readFile(archivePath) || ''; } catch (e) { /* fail-open */ }
  const counts = countInstructions(parsePending(fullArchive));
  const promotable = selectPromotable(counts, threshold, []);
  if (promotable.length > 0) {
    try { writeFile(rulesPath, renderRules30(promotable)); } catch (e) { /* fail-open */ }
  }
  return { archived: records.length, promoted: promotable };
}

module.exports = {
  META_PROMPT,
  buildInjectionOutput,
  normalizeInstruction,
  parsePending,
  countInstructions,
  selectPromotable,
  renderRules30,
  formatBlock,
  dedupeRecords,
  archiveAndPromote
};
