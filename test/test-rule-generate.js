/**
 * T04 — rule-generate 单元测试（P001-cross-platform · K2 三档生成器 · test-plan §3.2）
 *
 * 被测：`ruleGenerate(truthSourceDir, host) → { files, errors }`（`lib/rule-generate.js` 纯函数）。
 *       `expandIncludes(content, baseDir)` — @include 递归展开（导出供单测）。
 *
 * 真相源：`rules/{00,10,20}-*.md`（L0 纯文本）+ `docs/conventions-{js,bash}.md`（L1 叶）+
 *         `.claude/rules/conventions-*.md`（L1 薄壳：paths + @include 指针）。
 *
 * 四档（design §5）：
 *   CB  完整条件规则：CODEBUDDY.md + .codebuddy/rules/<L0>.md（原样）+ 薄壳（paths+@include 保留）
 *   CUR .mdc + @include 内联展开：.cursor/rules/<name>.mdc（frontmatter description/globs/alwaysApply）
 *   CDX 单 AGENTS.md 降级：L0 内联 + L1 降级标注（hook 注入）+ 32KiB 上限
 *   OC  单 AGENTS.md 降级：L0 内联 + L1 降级（instructions 数组）
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { describe, assertEqual, assertOk, assertContains, assertNotContains, printSummary, projectRoot } = require('./helpers');
const { ruleGenerate, expandIncludes } = require('../scripts/lib/rule-generate');

const ROOT = projectRoot();
const AGENTS_MAX = 32 * 1024;

// ── fixture helpers ───────────────────────────────────────────────
function mkTmpRoot() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-gen-'));
  return tmp;
}
function rmTmp(tmp) { fs.rmSync(tmp, { recursive: true, force: true }); }

describe('ruleGenerate: CB 档（完整条件规则）', (suite) => {
  suite.test('产出 CODEBUDDY.md + .codebuddy/rules/<L0>.md（原样）+ conventions 薄壳', () => {
    const { files } = ruleGenerate(ROOT, 'codebuddy');
    const paths = files.map((f) => f.path);
    assertOk(paths.includes('CODEBUDDY.md'), '含 CODEBUDDY.md 指针');
    assertOk(paths.some((p) => p === '.codebuddy/rules/00-iron-rules.md'), 'L0 00 原样');
    assertOk(paths.some((p) => p === '.codebuddy/rules/10-architecture.md'), 'L0 10 原样');
    assertOk(paths.some((p) => p === '.codebuddy/rules/20-workflow.md'), 'L0 20 原样');
    assertOk(paths.some((p) => p === '.codebuddy/rules/conventions-javascript.md'), 'CB conventions-js 薄壳');
    assertOk(paths.some((p) => p === '.codebuddy/rules/conventions-bash.md'), 'CB conventions-bash 薄壳');
  });

  suite.test('CB conventions 薄壳保留 paths + @include 指令且路径正确', () => {
    const { files } = ruleGenerate(ROOT, 'codebuddy');
    const js = files.find((f) => f.path === '.codebuddy/rules/conventions-javascript.md');
    assertOk(js, '找到 js 薄壳');
    assertContains(js.content, 'paths:', '薄壳保留 paths');
    assertContains(js.content, '@../../docs/conventions-javascript.md', '@include 路径正确（同级深度不变）');
  });

  suite.test('CB L0 原样：内容与真相源一致（单一真相源）', () => {
    const { files } = ruleGenerate(ROOT, 'codebuddy');
    const cb00 = files.find((f) => f.path === '.codebuddy/rules/00-iron-rules.md');
    const src00 = fs.readFileSync(path.join(ROOT, 'rules', '00-iron-rules.md'), 'utf8');
    assertEqual(cb00.content, src00, 'L0 逐字节等价真相源');
  });
});

describe('ruleGenerate: CUR 档（.mdc + @include 展开）', (suite) => {
  suite.test('L0 → .mdc，frontmatter alwaysApply:true', () => {
    const { files } = ruleGenerate(ROOT, 'cursor');
    const f00 = files.find((f) => f.path === '.cursor/rules/00-iron-rules.mdc');
    assertOk(f00, '00 .mdc 存在');
    assertEqual(f00.frontmatter.alwaysApply, true, 'L0 alwaysApply:true');
    assertOk(typeof f00.frontmatter.description === 'string' && f00.frontmatter.description.length > 0, 'L0 description 非空');
  });

  suite.test('L1 → .mdc，alwaysApply:false + globs 非空 + @include 内联展开', () => {
    const { files } = ruleGenerate(ROOT, 'cursor');
    const js = files.find((f) => f.path === '.cursor/rules/conventions-javascript.mdc');
    assertOk(js, 'conventions-js .mdc 存在');
    assertEqual(js.frontmatter.alwaysApply, false, 'L1 alwaysApply:false');
    assertOk(Array.isArray(js.frontmatter.globs) && js.frontmatter.globs.length > 0, 'L1 globs 非空');
    // @include 已展开：body 含 conventions 全文，无残留 @include 指令
    assertContains(js.content, '命名约定', 'body 含 conventions 内容（@include 已展开）');
    assertNotContains(js.content, '@../../docs/', '无残留 @include 指令');
  });

  suite.test('CUR L0 body 与真相源等价（仅加 frontmatter）', () => {
    const { files } = ruleGenerate(ROOT, 'cursor');
    const f00 = files.find((f) => f.path === '.cursor/rules/00-iron-rules.mdc');
    const src00 = fs.readFileSync(path.join(ROOT, 'rules', '00-iron-rules.md'), 'utf8');
    assertContains(f00.content, src00, 'L0 body 原样嵌入（去 frontmatter 后等价）');
  });
});

describe('ruleGenerate: CDX 档（单 AGENTS.md 降级）', (suite) => {
  suite.test('单 AGENTS.md，L0 内联 + L1 降级标注（hook 注入）', () => {
    const { files } = ruleGenerate(ROOT, 'codex');
    assertEqual(files.length, 1, '仅一个 AGENTS.md');
    assertEqual(files[0].path, 'AGENTS.md', '路径为 AGENTS.md');
    const c = files[0].content;
    assertContains(c, '禁止无测试的生产代码', 'L0 铁律内联（00-iron-rules 内容）');
    assertOk(c.includes('hook 注入') || c.includes('additionalContext'), 'L1 降级标注（hook 注入 additionalContext）');
    assertOk(Buffer.byteLength(c, 'utf8') <= AGENTS_MAX, `AGENTS.md ≤ 32KiB（实际 ${Buffer.byteLength(c, 'utf8')} bytes）`);
  });

  suite.test('32KiB 上限：超限报错（不静默截断）', () => {
    const tmp = mkTmpRoot();
    fs.mkdirSync(path.join(tmp, 'rules'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
    fs.mkdirSync(path.join(tmp, '.claude', 'rules'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'rules', '00-huge.md'), '# huge\n\n' + 'x'.repeat(AGENTS_MAX + 1000));
    let threw = false;
    try { ruleGenerate(tmp, 'codex'); } catch { threw = true; }
    assertOk(threw, '超 32KiB 抛错');
    rmTmp(tmp);
  });
});

describe('ruleGenerate: OC 档（AGENTS.md instructions 降级）', (suite) => {
  suite.test('AGENTS.md，L0 内联 + L1 降级（instructions 提示）', () => {
    const { files } = ruleGenerate(ROOT, 'opencode');
    assertEqual(files.length, 1, '仅一个 AGENTS.md');
    assertEqual(files[0].path, 'AGENTS.md');
    const c = files[0].content;
    assertContains(c, '禁止无测试的生产代码', 'L0 内联');
    assertContains(c, 'instructions', 'L1 降级 instructions 提示');
  });
});

describe('ruleGenerate: L0 内容等价（4 宿主）', (suite) => {
  suite.test('4 宿主产物均含 L0 核心段落（去 frontmatter/markup 等价）', () => {
    const marker = '禁止无测试的生产代码';
    for (const host of ['codebuddy', 'cursor', 'codex', 'opencode']) {
      const { files } = ruleGenerate(ROOT, host);
      const all = files.map((f) => f.content).join('\n');
      assertContains(all, marker, `${host} 产物含 L0 铁律段落`);
    }
  });
});

describe('expandIncludes: @include 递归展开 + 循环/深度保护', (suite) => {
  suite.test('单层 @include 展开', () => {
    const tmp = mkTmpRoot();
    fs.writeFileSync(path.join(tmp, 'main.md'), 'head\n@part.md\ntail');
    fs.writeFileSync(path.join(tmp, 'part.md'), 'PART');
    try {
      const out = expandIncludes('head\n@part.md\ntail', tmp);
      assertContains(out, 'head', '保留 head');
      assertContains(out, 'PART', '@part 已展开');
      assertContains(out, 'tail', '保留 tail');
      assertNotContains(out, '@part.md', '无残留指令');
    } finally { rmTmp(tmp); }
  });

  suite.test('嵌套 @include（>1 层）展开', () => {
    const tmp = mkTmpRoot();
    fs.writeFileSync(path.join(tmp, 'a.md'), 'A:\n@b.md');
    fs.writeFileSync(path.join(tmp, 'b.md'), 'B:\n@c.md');
    fs.writeFileSync(path.join(tmp, 'c.md'), 'C');
    try {
      const out = expandIncludes('@a.md', tmp);
      assertContains(out, 'A:', '层 a');
      assertContains(out, 'B:', '层 b');
      assertContains(out, 'C', '层 c（深度 2）');
    } finally { rmTmp(tmp); }
  });

  suite.test('循环引用 a↔b → 抛错', () => {
    const tmp = mkTmpRoot();
    fs.writeFileSync(path.join(tmp, 'a.md'), '@b.md');
    fs.writeFileSync(path.join(tmp, 'b.md'), '@a.md');
    let threw = false;
    try { expandIncludes('@a.md', tmp); } catch { threw = true; }
    assertOk(threw, '循环引用抛错');
    rmTmp(tmp);
  });

  suite.test('深度超限（>5 层）→ 抛错', () => {
    const tmp = mkTmpRoot();
    // 链 a→b→c→d→e→f→g（7 层，超 MAX=5）
    const chain = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    chain.forEach((n, i) => {
      const next = chain[i + 1];
      fs.writeFileSync(path.join(tmp, `${n}.md`), next ? `@${next}.md` : 'END');
    });
    let threw = false;
    try { expandIncludes('@a.md', tmp); } catch { threw = true; }
    assertOk(threw, '深度 >5 抛错');
    rmTmp(tmp);
  });

  suite.test('@include 目标缺失 → 抛错（fail-fast，不静默）', () => {
    const tmp = mkTmpRoot();
    let threw = false;
    try { expandIncludes('@missing.md', tmp); } catch { threw = true; }
    assertOk(threw, '目标缺失抛错');
    rmTmp(tmp);
  });
});

describe('ruleGenerate: 未知 host fail-fast', (suite) => {
  suite.test('未知 host 抛错', () => {
    let threw = false;
    try { ruleGenerate(ROOT, 'gemini'); } catch { threw = true; }
    assertOk(threw, '未知 host 抛错');
  });
});

process.exit(printSummary());
