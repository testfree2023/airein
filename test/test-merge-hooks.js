/**
 * test-merge-hooks.js — P004 2.3: merge-hooks pluginRoot = AIREIN_ROOT
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { describe, assertEqual, assert, assertOk, assertContains, printSummary } = require('./helpers');
const { mergeHooks } = require('../scripts/merge-hooks');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-merge-'));
const KERNEL = path.join(TMP, 'kernel');
const CC_HOME = path.join(TMP, 'claude-home');

fs.mkdirSync(path.join(KERNEL, 'scripts', 'hooks'), { recursive: true });
fs.mkdirSync(path.join(KERNEL, 'hooks'), { recursive: true });
fs.writeFileSync(path.join(KERNEL, 'scripts', 'hooks', 'test-guard.js'), '// hook');
fs.writeFileSync(
  path.join(KERNEL, 'hooks', 'hooks.json'),
  JSON.stringify({
    hooks: {
      PreToolUse: [{
        matcher: 'Write',
        hooks: [{
          type: 'command',
          command: 'bash "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/run-hook.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/test-guard.js"',
        }],
      }],
    },
  }, null, 2),
);

describe('mergeHooks: pluginRoot substitution', (suite) => {
  suite.test('${CLAUDE_PLUGIN_ROOT} 替换为内核绝对路径', () => {
    const settings = path.join(CC_HOME, 'settings.json');
    fs.mkdirSync(CC_HOME, { recursive: true });
    const result = mergeHooks({
      hooksFile: path.join(KERNEL, 'hooks', 'hooks.json'),
      pluginRoot: KERNEL,
      settingsFiles: [settings],
      ensureProjectDirs: false,
    });
    assertOk(result.totalCount >= 1, 'registered hooks');
    const saved = JSON.parse(fs.readFileSync(settings, 'utf8'));
    const cmd = saved.hooks.PreToolUse[0].hooks[0].command;
    const norm = KERNEL.replace(/\\/g, '/');
    assertContains(cmd, norm, 'command uses kernel root');
    assert(!cmd.includes('${CLAUDE_PLUGIN_ROOT}'), 'no placeholder left');
  });

  suite.test('保留非 airein 第三方 hook', () => {
    const settings = path.join(TMP, 'custom-settings.json');
    fs.writeFileSync(settings, JSON.stringify({
      hooks: {
        PreToolUse: [{
          hooks: [{ type: 'command', command: 'echo third-party-hook' }],
        }],
      },
    }, null, 2));
    mergeHooks({
      hooksFile: path.join(KERNEL, 'hooks', 'hooks.json'),
      pluginRoot: KERNEL,
      settingsFiles: [settings],
      ensureProjectDirs: false,
    });
    const saved = JSON.parse(fs.readFileSync(settings, 'utf8'));
    const cmds = saved.hooks.PreToolUse.flatMap((g) => (g.hooks || []).map((h) => h.command));
    assert(cmds.some((c) => c.includes('third-party')), 'third party kept');
    assert(cmds.some((c) => c.includes('test-guard')), 'airein added');
  });
});


describe('mergeHooks: platform rewrite', (suite) => {
  suite.test('win32 uses node direct (no bash run-hook.sh)', () => {
    const settings = path.join(TMP, 'win-settings.json');
    mergeHooks({
      hooksFile: path.join(KERNEL, 'hooks', 'hooks.json'),
      pluginRoot: KERNEL,
      settingsFiles: [settings],
      ensureProjectDirs: false,
      platform: 'win32',
    });
    const cmd = JSON.parse(fs.readFileSync(settings, 'utf8')).hooks.PreToolUse[0].hooks[0].command;
    assertOk(cmd.startsWith('node '), 'starts with node');
    assertOk(cmd.includes('test-guard.js'), 'targets hook script');
    assert(!cmd.includes('run-hook.sh'), 'no bash/WSL wrapper');
    assert(!cmd.startsWith('bash '), 'not bash');
  });

  suite.test('darwin keeps bash run-hook.sh', () => {
    const settings = path.join(TMP, 'darwin-settings.json');
    mergeHooks({
      hooksFile: path.join(KERNEL, 'hooks', 'hooks.json'),
      pluginRoot: KERNEL,
      settingsFiles: [settings],
      ensureProjectDirs: false,
      platform: 'darwin',
    });
    const cmd = JSON.parse(fs.readFileSync(settings, 'utf8')).hooks.PreToolUse[0].hooks[0].command;
    assertOk(cmd.startsWith('bash '), 'keeps bash on darwin');
    assertOk(cmd.includes('run-hook.sh'), 'keeps run-hook.sh on darwin');
  });
});

const code = printSummary();
process.exit(code);
