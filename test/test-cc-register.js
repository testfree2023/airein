/**
 * test-cc-register.js — P004 2.4: cc-register
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { describe, assertEqual, assert, assertOk, printSummary } = require('./helpers');
const { registerCc, unregisterCc } = require('../scripts/lib/cc-register');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-ccreg-'));
const HOME = path.join(TMP, 'home');
const KERNEL = path.join(TMP, 'kernel');

function seedKernel() {
  for (const d of ['skills/x', 'commands', 'rules', 'scripts/hooks', 'hooks']) {
    fs.mkdirSync(path.join(KERNEL, d), { recursive: true });
  }
  fs.writeFileSync(path.join(KERNEL, 'skills', 'x', 'SKILL.md'), '---\nname: x\n---\n');
  fs.writeFileSync(path.join(KERNEL, 'scripts', 'hooks', 'test-guard.js'), '//');
  fs.writeFileSync(
    path.join(KERNEL, 'hooks', 'hooks.json'),
    JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'bash "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/run-hook.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/test-guard.js"' }] }] } }),
  );
}

describe('cc-register: registerCc', (suite) => {
  suite.test('创建 shim + settings hooks 指向 kernel', () => {
    seedKernel();
    const r = registerCc({ kernelRoot: KERNEL, homeDir: HOME });
    assertEqual(r.ok, true, 'ok');
    const settings = path.join(HOME, '.claude', 'settings.json');
    assertOk(fs.existsSync(settings), 'settings');
    const cmd = JSON.parse(fs.readFileSync(settings, 'utf8')).hooks.PreToolUse[0].hooks[0].command;
    assert(cmd.includes(KERNEL.replace(/\\/g, '/')), 'kernel in command');
    assertOk(fs.existsSync(path.join(HOME, '.claude', 'skills', 'x', 'SKILL.md')), 'skills shim');
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
  suite.test('删除指向 kernel 的 symlink', () => {
    const home3 = path.join(TMP, 'home3');
    fs.mkdirSync(home3, { recursive: true });
    registerCc({ kernelRoot: KERNEL, homeDir: home3 });
    const r = unregisterCc({ kernelRoot: KERNEL, homeDir: home3 });
    assertEqual(r.ok, true, 'uninstall ok');
    assert(!fs.existsSync(path.join(home3, '.claude', 'skills')), 'skills link gone');
  });
});

const code = printSummary();
process.exit(code);
