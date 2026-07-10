/**
 * rule-generate — K2 rules 适配层生成器（P001-cross-platform · design §5 · test-plan §3.2）
 *
 * 纯函数：读真相源（rules/L0 + docs/L1 + .claude/rules/ 薄壳）→ 按宿主条件规则能力生成
 * 规则入口文件（描述，不落盘）。三档策略（design §5.1–5.3）：
 *
 *   CB  完整条件规则：薄壳 paths+@include 原生支持 → CODEBUDDY.md + L0 原样 + 薄壳原样
 *   CUR 有条件规则无 @include：.mdc（frontmatter）+ @include **内联展开**（自包含）
 *   CDX/OC 无条件规则：单 AGENTS.md 降级（L0 内联 + L1 hook 注入/instructions 标注）
 *
 * 单一真相源不变量：L0 内容逐字节等价真相源（CB 原样、CUR body 原样、CDX/OC 内联）。
 * @include 展开：递归 + 深度上限 5（CB 原生同限）+ 循环检测 + 目标缺失 fail-fast。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MAX_INCLUDE_DEPTH = 5;
const AGENTS_MAX_BYTES = 32 * 1024;
const KNOWN_HOSTS = ['codebuddy', 'cursor', 'codex', 'opencode'];

/** 行首 `@<path>` = @include 指令（与 CC 条件规则薄壳语法一致）。 */
const INCLUDE_RE = /^@(.+)$/gm;

/**
 * Recursively expand `@<path>` includes (relative to baseDir).
 * @param {string} content
 * @param {string} baseDir - Directory used to resolve relative @include paths.
 * @param {number} [depth=0]
 * @param {string[]} [stack=[]] - Absolute targets already on the chain (cycle guard).
 * @returns {string}
 * @throws {Error} on missing target, cycle, or depth > MAX_INCLUDE_DEPTH.
 */
function expandIncludes(content, baseDir, depth = 0, stack = []) {
  if (depth > MAX_INCLUDE_DEPTH) {
    throw new Error(
      `@include depth exceeded ${MAX_INCLUDE_DEPTH} (possible cycle) near ${baseDir}`,
    );
  }
  return content.replace(INCLUDE_RE, (line, rel) => {
    const target = path.resolve(baseDir, rel.trim());
    if (stack.includes(target)) {
      throw new Error(`@include cycle detected: ${target}`);
    }
    if (!fs.existsSync(target)) {
      throw new Error(`@include target missing: ${target}`);
    }
    const sub = fs.readFileSync(target, 'utf8');
    return expandIncludes(sub, path.dirname(target), depth + 1, [...stack, target]);
  });
}

/** Read L0 truth-source files (rules/*.md), sorted by name. */
function readL0Files(root) {
  const dir = path.join(root, 'rules');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((name) => ({ name, content: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

/**
 * Parse a thin-shell conventions rule (.claude/rules/conventions-*.md).
 * Format: `paths: [...]\n---\n<body>` (body typically a single @include line).
 * @returns {{ globs: string[], body: string }}
 */
function parseThinShell(content) {
  const m = content.match(/^paths:\s*(\[.*?\])\s*\n---\s*\n([\s\S]*)$/);
  if (!m) return { globs: [], body: content };
  let globs = [];
  try { globs = JSON.parse(m[1]); } catch { globs = []; }
  return { globs, body: m[2] };
}

/** Read L1 thin-shell rules (.claude/rules/conventions-*.md), sorted. */
function readThinShells(root) {
  const dir = path.join(root, '.claude', 'rules');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.startsWith('conventions-') && f.endsWith('.md'))
    .sort()
    .map((name) => {
      const content = fs.readFileSync(path.join(dir, name), 'utf8');
      return { name, content, ...parseThinShell(content) };
    });
}

/** Derive a description from the first `#` heading of an L0 file. */
function l0Description(l0Content) {
  const m = l0Content.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : 'airein rule';
}

/** Derive a description for an L1 conventions shell. */
function l1Description(shellName) {
  const scope = shellName.replace(/^conventions-/, '').replace(/\.md$/, '');
  return `airein conventions: ${scope} (conditional)`;
}

/** Render a Cursor .mdc body: YAML frontmatter + body. */
function renderMdc(frontmatter, body) {
  let fm = '---\n';
  fm += `description: ${JSON.stringify(frontmatter.description)}\n`;
  if (frontmatter.globs && frontmatter.globs.length > 0) {
    fm += `globs: ${JSON.stringify(frontmatter.globs)}\n`;
  }
  fm += `alwaysApply: ${frontmatter.alwaysApply}\n`;
  fm += '---\n';
  return fm + body;
}

const CODEBUDDY_POINTER = `# CODEBUDDY（airein · codebuddy 宿主入口）

> airein 工程规范入口（等价 CLAUDE.md）。L0 铁律/架构/工作流见
> \`.codebuddy/rules/{00,10,20}-*.md\`（由 airein 原样分发）；L1 编辑触发 conventions 见
> \`.codebuddy/rules/conventions-*.md\`（paths + @include，codebuddy 原生支持递归 5 层）。
> 架构总览：\`docs/design.md\`；产品愿景：\`docs/requirements.md\`。
`;

/** CB 档：完整条件规则（最接近 CC）。 */
function generateCB(root) {
  const files = [];
  files.push({ path: 'CODEBUDDY.md', content: CODEBUDDY_POINTER, frontmatter: null });
  for (const l0 of readL0Files(root)) {
    files.push({ path: `.codebuddy/rules/${l0.name}`, content: l0.content, frontmatter: null });
  }
  for (const shell of readThinShells(root)) {
    files.push({ path: `.codebuddy/rules/${shell.name}`, content: shell.content, frontmatter: null });
  }
  return { files, errors: [] };
}

/** CUR 档：.mdc + @include 内联展开。 */
function generateCUR(root) {
  const files = [];
  const shellDir = path.join(root, '.claude', 'rules');
  for (const l0 of readL0Files(root)) {
    const base = l0.name.replace(/\.md$/, '');
    const frontmatter = { description: l0Description(l0.content), globs: [], alwaysApply: true };
    files.push({
      path: `.cursor/rules/${base}.mdc`,
      content: renderMdc(frontmatter, l0.content),
      frontmatter,
    });
  }
  for (const shell of readThinShells(root)) {
    const base = shell.name.replace(/\.md$/, '');
    const expandedBody = expandIncludes(shell.body, shellDir);
    const frontmatter = {
      description: l1Description(shell.name),
      globs: shell.globs,
      alwaysApply: false,
    };
    files.push({
      path: `.cursor/rules/${base}.mdc`,
      content: renderMdc(frontmatter, expandedBody),
      frontmatter,
    });
  }
  return { files, errors: [] };
}

/** CDX 档：单 AGENTS.md 降级（L0 内联 + L1 hook 注入标注 + 32KiB 上限）。 */
function generateCDX(root) {
  const parts = ['# AGENTS.md（airein · codex 宿主）\n'];
  parts.push('## L0 铁律 / 架构 / 工作流（原样内联）\n');
  for (const l0 of readL0Files(root)) parts.push(l0.content + '\n');
  parts.push('\n---\n\n## L1 conventions（降级）\n');
  parts.push(
    '> ⚠️ 降级：codex 无条件规则 paths 机制。以下 conventions 由 PreToolUse / UserPromptSubmit hook 注入\n'
    + '> additionalContext（编辑匹配文件时动态注入），非条件规则。详见 airein design §5.3。\n',
  );
  for (const shell of readThinShells(root)) {
    parts.push(`- \`${shell.name}\` — paths ${JSON.stringify(shell.globs)} → hook 注入 additionalContext\n`);
  }
  const content = parts.join('\n');
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > AGENTS_MAX_BYTES) {
    throw new Error(
      `AGENTS.md exceeds codex 32KiB limit (${bytes} > ${AGENTS_MAX_BYTES} bytes) — trim L0 or split`,
    );
  }
  return { files: [{ path: 'AGENTS.md', content, frontmatter: null }], errors: [] };
}

/** OC 档：单 AGENTS.md 降级（L0 内联 + L1 instructions 数组标注）。 */
function generateOC(root) {
  const parts = ['# AGENTS.md（airein · opencode 宿主）\n'];
  parts.push('## L0 铁律 / 架构 / 工作流（原样内联）\n');
  for (const l0 of readL0Files(root)) parts.push(l0.content + '\n');
  parts.push('\n---\n\n## L1 conventions（降级：instructions）\n');
  parts.push(
    '> ⚠️ 降级：opencode 无条件规则 paths/@include 机制。以下 conventions 作为 instructions 数组\n'
    + '> 静态注入（失去编辑触发强制，退化为 prompt 约定）。详见 airein design §5.3。\n',
  );
  for (const shell of readThinShells(root)) {
    parts.push(`- instructions: \`${shell.name}\` — globs ${JSON.stringify(shell.globs)}\n`);
  }
  return { files: [{ path: 'AGENTS.md', content: parts.join('\n'), frontmatter: null }], errors: [] };
}

/**
 * Generate host rule-entry files from the truth source.
 * @param {string} root - Project root (truth source: rules/ + docs/ + .claude/rules/).
 * @param {string} host - One of KNOWN_HOSTS.
 * @returns {{ files: Array<{path:string,content:string,frontmatter:(object|null)}>, errors: string[] }}
 * @throws {Error} if host is unknown, @include cycles/exceeds depth, or CDX AGENTS.md > 32KiB.
 */
function ruleGenerate(root, host) {
  switch (host) {
    case 'codebuddy': return generateCB(root);
    case 'cursor': return generateCUR(root);
    case 'codex': return generateCDX(root);
    case 'opencode': return generateOC(root);
    default:
      throw new Error(`ruleGenerate: unknown host "${host}" (known: ${KNOWN_HOSTS.join('/')})`);
  }
}

module.exports = {
  ruleGenerate,
  expandIncludes,
  MAX_INCLUDE_DEPTH,
  AGENTS_MAX_BYTES,
};
