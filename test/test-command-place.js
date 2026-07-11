/**
 * P003 — command-place 单元测试（K4 commands 放置策略 · requirements AC）
 *
 * 被测：`commandPlace(srcCommandsDir, host, targetRoot) → { actions, errors }`
 * （`lib/command-place.js` 纯函数，不执行 IO）。
 *
 * 宿主 commands 发现路径（P003 · roadmap）：
 *   cursor    → .cursor/commands/<name>.md
 *   codebuddy → .codebuddy/commands/<name>.md
 *   opencode  → commands/<name>.md（项目根，OC 官方 docs/commands/）
 *   codex     → N/A（prompts deprecated，errors 报 N/A，无 copy）
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { describe, assertEqual, assertOk, assertContains, printSummary } = require('./helpers');
const { commandPlace, HOST_COMMANDS_DIR } = require('../scripts/lib/command-place');

const COMMANDS_DIR = path.resolve(__dirname, '..', 'commands');
const TARGET = '/tgt-project';
const EXPECTED_COUNT = 16;

describe('commandPlace: CUR（cursor）放置', (suite) => {
  suite.test(`每个源 command → {type:copy, dest 含 .cursor/commands/<name>.md}（${EXPECTED_COUNT} 个）`, () => {
    const { actions } = commandPlace(COMMANDS_DIR, 'cursor', TARGET);
    assertEqual(actions.length, EXPECTED_COUNT, `应有 ${EXPECTED_COUNT} 个 command`);
    for (const a of actions) {
      assertEqual(a.type, 'copy', `${a.name}: type=copy`);
      assertContains(a.dest, '.cursor/commands', `${a.name}: dest 含 .cursor/commands`);
      assertOk(a.dest.endsWith(`${a.name}.md`), `${a.name}: dest 以 <name>.md 结尾`);
    }
  });
});

describe('commandPlace: CB（codebuddy）放置', (suite) => {
  suite.test('dest 含 .codebuddy/commands/', () => {
    const { actions } = commandPlace(COMMANDS_DIR, 'codebuddy', TARGET);
    assertEqual(actions.length, EXPECTED_COUNT, `应有 ${EXPECTED_COUNT} 个 command`);
    for (const a of actions) {
      assertContains(a.dest, '.codebuddy/commands', `${a.name}: dest 含 .codebuddy/commands`);
      assertEqual(a.type, 'copy', `${a.name}: type=copy`);
    }
  });
});

describe('commandPlace: OC（opencode）放置', (suite) => {
  suite.test('dest 含 /commands/<name>.md（项目根 commands/）', () => {
    const { actions } = commandPlace(COMMANDS_DIR, 'opencode', TARGET);
    assertEqual(actions.length, EXPECTED_COUNT, `应有 ${EXPECTED_COUNT} 个 command`);
    for (const a of actions) {
      assertEqual(a.type, 'copy', `${a.name}: type=copy`);
      assertContains(a.dest, '/commands/', `${a.name}: dest 含 /commands/`);
      assertOk(!a.dest.includes('.opencode/commands'), `${a.name}: 不走 .opencode/commands`);
    }
  });
});

describe('commandPlace: CDX（codex）N/A', (suite) => {
  suite.test('codex → actions 空 + errors 报 N/A', () => {
    const { actions, errors } = commandPlace(COMMANDS_DIR, 'codex', TARGET);
    assertEqual(actions.length, 0, 'codex 无 copy actions');
    assertOk(errors.length > 0, 'codex 报 N/A');
    assertOk(errors.some((e) => /codex.*N\/A/i.test(e)), 'errors 含 codex N/A');
  });
});

describe('commandPlace: 文件名 → command 名', (suite) => {
  suite.test('tdd.md → name=tdd', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-place-'));
    try {
      fs.writeFileSync(path.join(tmp, 'tdd.md'), '# TDD\n');
      const { actions } = commandPlace(tmp, 'cursor', TARGET);
      assertEqual(actions.length, 1, '一个 command');
      assertEqual(actions[0].name, 'tdd', 'name 来自文件名');
      assertOk(actions[0].src.endsWith('tdd.md'), 'src 指向源文件');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  suite.test('忽略子目录（首版只支持扁平 commands/*.md）', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-place-'));
    try {
      fs.writeFileSync(path.join(tmp, 'flat.md'), '# flat\n');
      fs.mkdirSync(path.join(tmp, 'nested'));
      fs.writeFileSync(path.join(tmp, 'nested', 'deep.md'), '# deep\n');
      const { actions } = commandPlace(tmp, 'cursor', TARGET);
      assertEqual(actions.length, 1, '只取顶层 .md');
      assertEqual(actions[0].name, 'flat', '只有 flat.md');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('commandPlace: 幂等（纯函数）', (suite) => {
  suite.test('同输入重复调用 → 相同 actions（深相等）', () => {
    const r1 = commandPlace(COMMANDS_DIR, 'cursor', TARGET);
    const r2 = commandPlace(COMMANDS_DIR, 'cursor', TARGET);
    assertEqual(JSON.stringify(r1), JSON.stringify(r2), '两次调用结果一致');
  });

  suite.test('actions 按 name 排序（稳定顺序）', () => {
    const { actions } = commandPlace(COMMANDS_DIR, 'cursor', TARGET);
    const names = actions.map((a) => a.name);
    const sorted = [...names].sort();
    assertEqual(JSON.stringify(names), JSON.stringify(sorted), 'actions 按 name 排序');
  });
});

describe('commandPlace: 未知 host fail-fast', (suite) => {
  suite.test('未知 host 抛错（不静默）', () => {
    let threw = false;
    try { commandPlace(COMMANDS_DIR, 'gemini', TARGET); } catch { threw = true; }
    assertOk(threw, '未知 host 抛错');
  });
});

describe('commandPlace: HOST_COMMANDS_DIR 导出', (suite) => {
  suite.test('三宿主路径常量就位', () => {
    assertEqual(HOST_COMMANDS_DIR.cursor, '.cursor/commands');
    assertEqual(HOST_COMMANDS_DIR.codebuddy, '.codebuddy/commands');
    assertEqual(HOST_COMMANDS_DIR.opencode, 'commands');
  });
});

process.exit(printSummary());
