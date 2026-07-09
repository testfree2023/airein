/**
 * Test: lib/self-learning.js — 注入提示构建 + 指令归一化（P019 T1）
 *
 * T1 覆盖：buildInjectionOutput（UserPromptSubmit 注入协议）+ normalizeInstruction。
 * T2 将在此文件追加 parsePending / countInstructions / selectPromotable / archiveAndPromote 用例。
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  describe, assertEqual, assertOk, assertContains, projectRoot, printSummary
} = require('./helpers');

const selfLearning = require(path.join(projectRoot(), 'scripts', 'lib', 'self-learning'));
const {
  META_PROMPT, buildInjectionOutput, normalizeInstruction,
  parsePending, countInstructions, selectPromotable, renderRules30, archiveAndPromote
} = selfLearning;

describe('buildInjectionOutput: UserPromptSubmit 注入协议', suite => {
  suite.test('返回 hookSpecificOutput 结构', () => {
    const out = buildInjectionOutput();
    assertOk(out && out.hookSpecificOutput, '应有 hookSpecificOutput');
  });

  suite.test('hookEventName = UserPromptSubmit', () => {
    const out = buildInjectionOutput();
    assertEqual(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit', 'hookEventName');
  });

  suite.test('additionalContext 非空字符串', () => {
    const out = buildInjectionOutput();
    const ctx = out.hookSpecificOutput.additionalContext;
    assertEqual(typeof ctx, 'string', 'additionalContext 应为 string');
    assertOk(ctx.length > 50, 'additionalContext 应有实质内容');
  });

  suite.test('META_PROMPT 含 memory 红线（不碰 memory）', () => {
    assertContains(META_PROMPT, 'memory', '元提示必须强调不碰 memory');
  });

  suite.test('META_PROMPT 含缓冲路径 pending.md', () => {
    assertContains(META_PROMPT, 'pending.md', '应给出缓冲写入路径');
  });

  suite.test('META_PROMPT 含 allow / deny 类型', () => {
    assertContains(META_PROMPT, 'allow', '应含 allow 类型');
    assertContains(META_PROMPT, 'deny', '应含 deny 类型');
  });

  suite.test('META_PROMPT 含 frontmatter 块分隔指引', () => {
    assertContains(META_PROMPT, 'ts:', '应指示 ts 字段');
    assertContains(META_PROMPT, 'type:', '应指示 type 字段');
    assertContains(META_PROMPT, 'instruction:', '应指示 instruction 字段');
  });
});

describe('normalizeInstruction: 归一化计数键', suite => {
  suite.test('trim + lower', () => {
    assertEqual(normalizeInstruction('  Never Use Git Add -A  '), 'never use git add -a');
  });

  suite.test('折叠多余空白', () => {
    assertEqual(normalizeInstruction('foo\t  bar\nbaz'), 'foo bar baz');
  });

  suite.test('null / undefined 安全返回空串', () => {
    assertEqual(normalizeInstruction(null), '');
    assertEqual(normalizeInstruction(undefined), '');
  });

  suite.test('非字符串强转', () => {
    assertEqual(normalizeInstruction(42), '42');
  });
});

describe('parsePending: frontmatter 块解析', suite => {
  suite.test('解析多个合法块', () => {
    const content = [
      '---', 'ts: 2026-06-14T10:30:00Z', 'type: deny', 'instruction: 永不用 git add -A', 'prompt: 别用 git add -A', '---',
      '---', 'ts: 2026-06-14T10:35:00Z', 'type: allow', 'instruction: 提交信息用中文', 'prompt: commit 用中文', '---'
    ].join('\n');
    const records = parsePending(content);
    assertEqual(records.length, 2, '应解析出 2 条');
    assertEqual(records[0].type, 'deny');
    assertEqual(records[0].instruction, '永不用 git add -A');
    assertEqual(records[1].type, 'allow');
  });

  suite.test('空/null 内容返回空数组', () => {
    assertEqual(parsePending('').length, 0);
    assertEqual(parsePending(null).length, 0);
    assertEqual(parsePending(undefined).length, 0);
  });

  suite.test('坏块（缺 instruction）跳过不崩', () => {
    const content = ['---', 'ts: t1', 'type: deny', '---'].join('\n');
    assertEqual(parsePending(content).length, 0, '缺 instruction 的块应跳过');
  });

  suite.test('坏块（非法 type）跳过', () => {
    const content = ['---', 'ts: t1', 'type: maybe', 'instruction: foo', '---'].join('\n');
    assertEqual(parsePending(content).length, 0, '非法 type 应跳过');
  });

  suite.test('保留 ts/prompt 字段', () => {
    const content = ['---', 'ts: 2026-06-14T10:30:00Z', 'type: deny', 'instruction: foo', 'prompt: bar baz', '---'].join('\n');
    const records = parsePending(content);
    assertEqual(records[0].ts, '2026-06-14T10:30:00Z');
    assertEqual(records[0].prompt, 'bar baz');
  });
});

describe('countInstructions: 按 type+归一化累计', suite => {
  suite.test('同义不同措辞（归一化后）累计', () => {
    const records = [
      { ts: '2026-06-10T00:00:00Z', type: 'deny', instruction: 'Never Git Add A', prompt: 'a' },
      { ts: '2026-06-12T00:00:00Z', type: 'deny', instruction: 'never git add a', prompt: 'b' },
      { ts: '2026-06-14T00:00:00Z', type: 'deny', instruction: '  never git add a  ', prompt: 'c' }
    ];
    const counts = countInstructions(records);
    assertEqual(counts.length, 1, '归一化后应合并为 1 条');
    assertEqual(counts[0].count, 3);
    assertEqual(counts[0].type, 'deny');
  });

  suite.test('不同 type 分开计', () => {
    const records = [
      { ts: 't1', type: 'deny', instruction: 'foo', prompt: 'a' },
      { ts: 't2', type: 'allow', instruction: 'foo', prompt: 'b' }
    ];
    assertEqual(countInstructions(records).length, 2);
  });

  suite.test('firstTs/lastTs 取 min/max', () => {
    const records = [
      { ts: '2026-06-10T00:00:00Z', type: 'deny', instruction: 'foo', prompt: 'a' },
      { ts: '2026-06-14T00:00:00Z', type: 'deny', instruction: 'foo', prompt: 'b' },
      { ts: '2026-06-12T00:00:00Z', type: 'deny', instruction: 'foo', prompt: 'c' }
    ];
    const counts = countInstructions(records);
    assertEqual(counts[0].firstTs, '2026-06-10T00:00:00Z');
    assertEqual(counts[0].lastTs, '2026-06-14T00:00:00Z');
  });
});

describe('selectPromotable: ≥N 且未已晋升', suite => {
  const C = (type, instruction, count) => ({ type, instruction, count, firstTs: 'a', lastTs: 'b' });

  suite.test('≥N 选中', () => {
    assertEqual(selectPromotable([C('deny', 'foo', 3)], 3, []).length, 1);
  });

  suite.test('<N 不选', () => {
    assertEqual(selectPromotable([C('deny', 'foo', 2)], 3, []).length, 0);
  });

  suite.test('alreadyPromoted 幂等不重复', () => {
    const result = selectPromotable([C('deny', 'foo', 3)], 3, [{ type: 'deny', instruction: 'Foo' }]);
    assertEqual(result.length, 0, '已晋升（归一化匹配）应排除');
  });
});

describe('renderRules30: markdown 渲染', suite => {
  suite.test('分 Deny/Allow 节并含指令', () => {
    const promotable = [
      { type: 'deny', instruction: 'foo', count: 3, firstTs: '2026-06-10', lastTs: '2026-06-14' },
      { type: 'allow', instruction: 'bar', count: 3, firstTs: '2026-06-12', lastTs: '2026-06-14' }
    ];
    const md = renderRules30(promotable);
    assertContains(md, '## Deny');
    assertContains(md, '## Allow');
    assertContains(md, 'foo');
    assertContains(md, 'bar');
    assertContains(md, '累计 3 次');
  });
});

describe('archiveAndPromote: 端到端编排', suite => {
  function setupDirs() {
    const dir = path.join(os.tmpdir(), 'sl-test-' + process.pid);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    return {
      pendingPath: path.join(dir, 'pending.md'),
      archivePath: path.join(dir, 'archive.md'),
      rulesPath: path.join(dir, '30.md'),
      dir
    };
  }
  function block(ts, type, instruction, prompt) {
    return ['---', `ts: ${ts}`, `type: ${type}`, `instruction: ${instruction}`, `prompt: ${prompt}`, '---'].join('\n');
  }

  suite.test('pending→archive→clear→promote', () => {
    const p = setupDirs();
    fs.writeFileSync(p.pendingPath, [
      block('2026-06-10T00:00:00Z', 'deny', '永不用 git add -A', 'a'),
      block('2026-06-12T00:00:00Z', 'deny', '永不用 git add -a', 'b'),
      block('2026-06-14T00:00:00Z', 'deny', ' 永不用 Git Add -A ', 'c')
    ].join('\n'));
    const result = archiveAndPromote({ pendingPath: p.pendingPath, archivePath: p.archivePath, rulesPath: p.rulesPath, threshold: 3 });
    assertEqual(result.archived, 3, '应归档 3 条');
    assertEqual(fs.readFileSync(p.pendingPath, 'utf8'), '', 'pending 应清空');
    assertOk(fs.existsSync(p.rulesPath), 'rules30 应生成');
    assertContains(fs.readFileSync(p.rulesPath, 'utf8'), '## Deny');
    assertEqual(result.promoted.length, 1, '应晋升 1 条');
  });

  suite.test('重复跑幂等不重复晋升', () => {
    const p = setupDirs();
    fs.writeFileSync(p.pendingPath, [block('t1', 'deny', 'foo', 'a'), block('t2', 'deny', 'foo', 'b'), block('t3', 'deny', 'foo', 'c')].join('\n'));
    archiveAndPromote({ pendingPath: p.pendingPath, archivePath: p.archivePath, rulesPath: p.rulesPath, threshold: 3 });
    fs.writeFileSync(p.pendingPath, block('t4', 'deny', 'foo', 'd'));
    archiveAndPromote({ pendingPath: p.pendingPath, archivePath: p.archivePath, rulesPath: p.rulesPath, threshold: 3 });
    const rules = fs.readFileSync(p.rulesPath, 'utf8');
    const fooLines = rules.split('\n').filter(l => l.startsWith('- ') && l.includes('foo'));
    assertEqual(fooLines.length, 1, 'foo 应只 1 行（幂等重渲染）');
  });

  suite.test('坏 pending fail-open 不崩', () => {
    const p = setupDirs();
    fs.writeFileSync(p.pendingPath, '这不是合法 frontmatter');
    const result = archiveAndPromote({ pendingPath: p.pendingPath, archivePath: p.archivePath, rulesPath: p.rulesPath, threshold: 3 });
    assertEqual(result.archived, 0);
  });

  suite.test('pending 不存在 fail-open', () => {
    const p = setupDirs();
    const result = archiveAndPromote({ pendingPath: path.join(p.dir, 'nope.md'), archivePath: p.archivePath, rulesPath: p.rulesPath, threshold: 3 });
    assertEqual(result.archived, 0);
  });
});

describe('self-learning.js 源码字节纯净（无 null byte 污染）', suite => {
  suite.test('源文件不含 null byte（否则 grep/ripgrep 失效、文件被标 binary）', () => {
    const buf = fs.readFileSync(path.join(projectRoot(), 'scripts', 'lib', 'self-learning.js'));
    let nullCount = 0;
    for (let i = 0; i < buf.length; i++) if (buf[i] === 0) nullCount++;
    assertEqual(nullCount, 0, 'self-learning.js 含 ' + nullCount + ' 个 null byte（应为 0）');
  });
});

printSummary();
