/**
 * roadmap-contract — pure validators / formatters for docs/roadmap.md
 *
 * Positioning: project status index (active bullets + Issues + Recent Changes).
 * Not user-facing release notes (those belong in root CHANGELOG.md).
 */

'use strict';

const ACTIVE_STATUSES = ['planning', 'in_progress', 'completed', 'archived', 'on_hold'];
const MAX_ACTIVE_SUMMARY_CHARS = 80;
const MAX_LEAD_BLOCKQUOTE_CHARS = 120;
const MAX_RECENT_ENTRY_CHARS = 200;

const ACTIVE_HEADINGS = [
  /^#{2,3}\s*活跃工作\s*$/m,
  /^#{2,3}\s*Active Plans\s*$/im,
  /^#{2,3}\s*当前焦点\s*$/m,
];

/**
 * @param {string} md
 * @returns {string}
 */
function normalizeNewlines(md) {
  return String(md == null ? '' : md).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Canonicalize known section aliases (Active Plans / 当前焦点 → 活跃工作).
 * @param {string} md
 * @returns {string}
 */
function normalizeSectionAliases(md) {
  return normalizeNewlines(md)
    .replace(/^#{2,3}\s*Active Plans\s*$/gim, '### 活跃工作')
    .replace(/^#{2,3}\s*当前焦点\s*$/gm, '### 活跃工作')
    .replace(/^##\s*Project Overview\s*$/gim, '## 项目概况')
    .replace(/^##\s*Completed\s*$/gim, '## 已完成')
    .replace(/^##\s*On Hold\s*$/gim, '## 搁置');
}

/**
 * Find active-work section body (between heading and next same-or-higher heading).
 * @param {string} md
 * @returns {{ heading: string, body: string, start: number, end: number }|null}
 */
function extractActiveSection(md) {
  const text = normalizeNewlines(md);
  let best = null;
  for (let hi = 0; hi < ACTIVE_HEADINGS.length; hi++) {
    const re = ACTIVE_HEADINGS[hi];
    const m = re.exec(text);
    if (!m) continue;
    const start = m.index;
    const headingLineEnd = text.indexOf('\n', start);
    const bodyStart = headingLineEnd < 0 ? text.length : headingLineEnd + 1;
    const level = (m[0].match(/^#+/) || ['##'])[0].length;
    const rest = text.slice(bodyStart);
    const nextRe = new RegExp('^#{1,' + level + '}\\s', 'm');
    const nm = nextRe.exec(rest);
    const bodyEnd = nm ? bodyStart + nm.index : text.length;
    const body = text.slice(bodyStart, bodyEnd);
    best = {
      heading: m[0].replace(/^#+\s*/, '').trim(),
      body,
      start,
      end: bodyEnd,
    };
    break;
  }
  return best;
}

/**
 * Strip markdown link / bold wrappers for measuring summary length.
 * @param {string} s
 * @returns {string}
 */
function plainText(s) {
  return String(s || '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim();
}

/**
 * @param {string} body
 * @returns {Array<{ id: string|null, status: string|null, summary: string, raw: string }>}
 */
function parseActiveEntries(body) {
  const lines = normalizeNewlines(body).split('\n');
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('<!--')) continue;
    if (!/^[-*]\s+/.test(line)) continue;
    const idMatch = line.match(/\*\*\[(P\d{3})(?:-[^\]]+)?\]/i) || line.match(/\b(P\d{3})\b/i);
    const statusMatch = line.match(/状态：\s*`([^`]+)`/) || line.match(/status:\s*`([^`]+)`/i);
    let summary = '';
    const emDash = line.indexOf('—');
    if (emDash >= 0) {
      const after = line.slice(emDash + 1);
      const cut = after.search(/。状态：|\.\s*状态：|status:/i);
      summary = (cut >= 0 ? after.slice(0, cut) : after).trim();
    }
    entries.push({
      id: idMatch ? idMatch[1].toUpperCase().replace(/p/, 'P') : null,
      status: statusMatch ? String(statusMatch[1]).trim().toLowerCase() : null,
      summary: plainText(summary),
      raw: line,
    });
  }
  return entries;
}

/**
 * @param {object} opts
 * @returns {string}
 */
function formatActiveEntry(opts) {
  const o = opts || {};
  const id = String(o.id || '').toUpperCase();
  const slug = String(o.slug || 'plan').replace(/^-+|-+$/g, '');
  const status = String(o.status || 'planning').toLowerCase();
  const priority = String(o.priority || 'P2');
  const complexity = String(o.complexity || 'm-feature');
  let summary = plainText(o.summary || o.title || '');
  if (summary.length > MAX_ACTIVE_SUMMARY_CHARS) {
    summary = summary.slice(0, MAX_ACTIVE_SUMMARY_CHARS - 1) + '…';
  }
  if (!summary) summary = String(o.title || id);
  return (
    '- **[' + id + '-' + slug + '](plans/' + id + '-' + slug + '/)** — ' +
    summary + '。状态：`' + status + '` | Priority: ' + priority + ' | ' + complexity
  );
}

/**
 * Lead blockquote = contiguous `>` lines after title before first ## heading.
 * @param {string} md
 * @returns {string}
 */
function extractLeadBlockquote(md) {
  const text = normalizeNewlines(md);
  const lines = text.split('\n');
  const chunks = [];
  let seenTitle = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!seenTitle) {
      if (/^#\s+/.test(line)) seenTitle = true;
      continue;
    }
    if (/^##\s+/.test(line)) break;
    if (/^>\s?/.test(line)) {
      chunks.push(line.replace(/^>\s?/, ''));
    } else if (chunks.length && line.trim() === '') {
      continue;
    } else if (chunks.length) {
      break;
    }
  }
  return plainText(chunks.join(' '));
}

/**
 * @param {string} md
 * @returns {{ ok: boolean, violations: string[] }}
 */
function validateRoadmap(md) {
  const text = normalizeNewlines(md);
  const violations = [];

  const lead = extractLeadBlockquote(text);
  if (lead.length > MAX_LEAD_BLOCKQUOTE_CHARS) {
    violations.push(
      '文首 blockquote 过长（' + lead.length + ' > ' + MAX_LEAD_BLOCKQUOTE_CHARS +
      ' 字）。只保留「最后更新」一行；多 plan 史放到 Recent Changes。'
    );
  }

  const active = extractActiveSection(text);
  if (!active) {
    violations.push('缺少活跃工作节（`### 活跃工作` / `## Active Plans` / `### 当前焦点`）。');
  } else {
    if (/^\s*\|.+\|/m.test(active.body) || /\|[-:]+\|/.test(active.body)) {
      violations.push('活跃区禁止 Markdown 表；请改用一行 bullet 索引（见 templates/docs/roadmap.md）。');
    }
    const entries = parseActiveEntries(active.body);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.summary.length > MAX_ACTIVE_SUMMARY_CHARS) {
        violations.push(
          '活跃条目摘要过长（' + (e.id || '?') + ': ' + e.summary.length + ' > ' +
          MAX_ACTIVE_SUMMARY_CHARS + ' 字）。详情放 plan / Recent Changes。'
        );
      }
      if (e.status && ACTIVE_STATUSES.indexOf(e.status) < 0) {
        violations.push(
          '活跃条目状态非法（' + (e.id || '?') + ': `' + e.status +
          '`）。允许: ' + ACTIVE_STATUSES.join(', ')
        );
      }
    }
  }

  // Soft check Recent Changes bullets under heading
  const rcMatch = text.match(/^#{2,3}\s*Recent Changes\s*$/im);
  if (rcMatch) {
    const start = rcMatch.index + rcMatch[0].length;
    const rest = text.slice(start);
    const next = rest.search(/^#{1,3}\s/m);
    const body = next >= 0 ? rest.slice(0, next) : rest;
    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!/^[-*]\s+/.test(line) && !/^###\s+/.test(line)) continue;
      const plain = plainText(line.replace(/^[-*]\s+/, '').replace(/^###\s+/, ''));
      if (plain.length > MAX_RECENT_ENTRY_CHARS) {
        violations.push(
          'Recent Changes 条目过长（' + plain.length + ' > ' + MAX_RECENT_ENTRY_CHARS +
          ' 字）。过程日志保持短摘要。'
        );
        break;
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * @param {string} filePath
 * @returns {boolean}
 */
function isRoadmapPath(filePath) {
  if (!filePath) return false;
  const n = String(filePath).replace(/\\/g, '/');
  return /\/docs\/roadmap\.md$/i.test(n) || /(^|\/)roadmap\.md$/i.test(n);
}

module.exports = {
  ACTIVE_STATUSES,
  MAX_ACTIVE_SUMMARY_CHARS,
  MAX_LEAD_BLOCKQUOTE_CHARS,
  MAX_RECENT_ENTRY_CHARS,
  normalizeNewlines,
  normalizeSectionAliases,
  extractActiveSection,
  parseActiveEntries,
  formatActiveEntry,
  extractLeadBlockquote,
  validateRoadmap,
  isRoadmapPath,
  plainText,
};
