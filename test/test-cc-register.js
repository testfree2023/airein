/**
 * test-cc-register.js — P004 2.4: cc-register
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { describe, assertEqual, assert, assertOk, printSummary } = require('./helpers');
const { registerCc, unregisterCc } = require('../scripts/lib/cc-register');
const { isSymlink } = require('../scripts/lib/asset-delivery');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-ccreg-'));
const HOME = path.join(TMP, 'home');
const KERNEL = path.join(TMP, 'kernel');

function seedKernel() {
  for (const d of ['skills/x', 'commands', 'agents', 'rules', 'scripts/hooks', 'hooks', '.claude/rules']) {
    fs.mkdirSync(path.join(KERNEL, d), { recursive: true });
  }
  fs.writeFileSync(path.join(KERNEL, 'skills', 'x', 'SKILL.md'), '---\nname: x\n---\n');
  fs.writeFileSync(path.join(KERNEL, 'agents', 'pm.md'), '---\nname: pm\n---\n');
  fs.writeFileSync(path.join(KERNEL, 'rules', '00-iron-rules.md'), '# iron\n');
  fs.writeFileSync(path.join(KERNEL, '.claude', 'rules', 'conventions-javascript.md'), '# js\n');
  fs.writeFileSync(path.join(KERNEL, 'commands', 'tdd.md'), '# tdd\n');
  fs.writeFileSync(path.join(KERNEL, 'scripts', 'hooks', 'test-guard.js'), '//');
  fs.writeFileSync(
    path.join(KERNEL, 'hooks', 'hooks.json'),
    JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'bash "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/run-hook.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/test-guard.js"' }] }] } }),
  );
}

describe('cc-register: registerCc unified', (suite) => {
  suite.test('skills/commands/agents 软链 + rules deploy + settings merge', () => {
    seedKernel();
    const r = registerCc({ kernelRoot: KERNEL, homeDir: HOME, delivery: 'unified' });
    assertEqual(r.ok, true, 'ok');
    const settings = path.join(HOME, '.claude', 'settings.json');
    assertOk(fs.existsSync(settings), 'settings');
    const cmd = JSON.parse(fs.readFileSync(settings, 'utf8')).hooks.PreToolUse[0].hooks[0].command;
    assert(cmd.includes(KERNEL.replace(/\\/g, '/')), 'kernel in command');
    assertOk(isSymlink(path.join(HOME, '.claude', 'skills')), 'skills link');
    assertOk(isSymlink(path.join(HOME, '.claude', 'commands')), 'commands link');
    assertOk(isSymlink(path.join(HOME, '.claude', 'agents')), 'agents link');
    assert(!isSymlink(path.join(HOME, '.claude', 'rules')), 'rules not link');
    assertOk(fs.existsSync(path.join(HOME, '.claude', 'rules', '00-iron-rules.md')), 'rules deployed');
  });

  suite.test('legacy rules symlink 迁移为 deploy 实体目录', () => {
    if (process.platform === 'win32') return;
    const homeLegacy = path.join(TMP, 'home-legacy');
    fs.mkdirSync(path.join(homeLegacy, '.claude'), { recursive: true });
    fs.symlinkSync(path.join(KERNEL, 'rules'), path.join(homeLegacy, '.claude', 'rules'));
    const r = registerCc({ kernelRoot: KERNEL, homeDir: homeLegacy, delivery: 'unified' });
    assertEqual(r.ok, true, 'legacy migrate ok');
    assert(!isSymlink(path.join(homeLegacy, '.claude', 'rules')), 'rules not link after register');
    assertOk(fs.existsSync(path.join(homeLegacy, '.claude', 'rules', '00-iron-rules.md')), 'rules deployed');
  });

  suite.test('copy 模式 skills/commands 为实体目录', () => {
    const homeCopy = path.join(TMP, 'home-copy');
    fs.mkdirSync(homeCopy, { recursive: true });
    const r = registerCc({ kernelRoot: KERNEL, homeDir: homeCopy, delivery: 'copy' });
    assertEqual(r.ok, true, 'copy ok');
    assert(!isSymlink(path.join(homeCopy, '.claude', 'skills')), 'skills not link');
    assertOk(fs.existsSync(path.join(homeCopy, '.claude', 'skills', 'x', 'SKILL.md')), 'skill copied');
  });

  suite.test('dryRun 不写盘', () => {
    const bare = path.join(TMP, 'home2');
    fs.mkdirSync(bare, { recursive: true });
    const r = registerCc({ kernelRoot: KERNEL, homeDir: bare, dryRun: true });
    assertEqual(r.ok, true, 'dry ok');
    assert(!fs.existsSync(path.join(bare, '.claude', 'settings.json')), 'no settings');
  });
});

describe('cc-register: unregisterCc', (suite) => {
  suite.test('unified 删除指向 kernel 的 symlink', () => {
    const home3 = path.join(TMP, 'home3');
    fs.mkdirSync(home3, { recursive: true });
    registerCc({ kernelRoot: KERNEL, homeDir: home3, delivery: 'unified' });
    const r = unregisterCc({ kernelRoot: KERNEL, homeDir: home3, delivery: 'unified' });
    assertEqual(r.ok, true, 'uninstall ok');
    assert(!fs.existsSync(path.join(home3, '.claude', 'skills')), 'skills link gone');
    assert(!fs.existsSync(path.join(home3, '.claude', 'rules', '00-iron-rules.md')), 'airein rules removed');
  });
});

const code = printSummary();
process.exit(code);
