/**
 * test-cc-hook-command.js - Windows CC hooks must not go through System32 bash/WSL.
 *
 * Bug (2026-07-15): settings.json registered
 *   bash ".../run-hook.sh" ".../hook.js"
 * On Windows, bash = WSL launcher; hooks hang and leak hundreds of wsl/bash processes.
 * Fix: rewrite to node ".../hook.js" on win32; keep bash run-hook.sh on unix (PATH resolve).
 *
 * Bug (2026-07-16 residual): long-lived CC --resume + stale project hooks under
 * ~/.claude/projects/<slug>/hooks/hooks.json still spawn bash; run-hook.sh must
 * fail-open under WSL; purge must rewrite landmines.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { describe, assertEqual, assertOk, printSummary } = require('./helpers');
const {
  rewriteCcHookCommand,
  rewriteResolvedHooks,
  purgeStaleCcBashHooks,
} = require('../scripts/lib/cc-hook-command');

describe('rewriteCcHookCommand (win32)', (suite) => {
  suite.test('simple hook to node direct', () => {
    const cmd = 'bash "C:/Users/x/.airein/scripts/hooks/run-hook.sh" "C:/Users/x/.airein/scripts/hooks/test-guard.js"';
    const out = rewriteCcHookCommand(cmd, 'win32');
    assertEqual(out, 'node "C:/Users/x/.airein/scripts/hooks/test-guard.js"');
  });

  suite.test('unquoted paths also rewrite (process listing / old writers)', () => {
    const cmd = 'bash C:/Users/x/.airein/scripts/hooks/run-hook.sh C:/Users/x/.airein/scripts/hooks/structure-sync.js';
    const out = rewriteCcHookCommand(cmd, 'win32');
    assertEqual(out, 'node "C:/Users/x/.airein/scripts/hooks/structure-sync.js"');
  });

  suite.test('run-with-flags keeps trailing args', () => {
    const cmd = 'bash "C:/x/.airein/scripts/hooks/run-hook.sh" "C:/x/.airein/scripts/hooks/run-with-flags.js" "post:quality-gate" "scripts/hooks/quality-gate.js" "standard,strict"';
    const out = rewriteCcHookCommand(cmd, 'win32');
    assertEqual(
      out,
      'node "C:/x/.airein/scripts/hooks/run-with-flags.js" "post:quality-gate" "scripts/hooks/quality-gate.js" "standard,strict"',
    );
  });

  suite.test('does not touch non-run-hook commands', () => {
    const cmd = 'node "C:/x/.airein/scripts/hooks/host/cursor.js" test-guard';
    assertEqual(rewriteCcHookCommand(cmd, 'win32'), cmd);
  });
});

describe('rewriteCcHookCommand (unix)', (suite) => {
  suite.test('darwin keeps bash run-hook.sh', () => {
    const cmd = 'bash "/Users/x/.airein/scripts/hooks/run-hook.sh" "/Users/x/.airein/scripts/hooks/test-guard.js"';
    assertEqual(rewriteCcHookCommand(cmd, 'darwin'), cmd);
  });

  suite.test('linux keeps bash run-hook.sh', () => {
    const cmd = 'bash "/home/x/.airein/scripts/hooks/run-hook.sh" "/home/x/.airein/scripts/hooks/plan-gate.js"';
    assertEqual(rewriteCcHookCommand(cmd, 'linux'), cmd);
  });
});

describe('purgeStaleCcBashHooks (win32)', (suite) => {
  suite.test('rewrites project hooks.json landmines; no-op on darwin', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-purge-'));
    const landmine = path.join(root, 'projects', 'F--codes-home-work-harness', 'hooks', 'hooks.json');
    fs.mkdirSync(path.dirname(landmine), { recursive: true });
    fs.writeFileSync(
      landmine,
      JSON.stringify({
        hooks: {
          PreToolUse: [{
            hooks: [{
              type: 'command',
              command: 'bash "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/run-hook.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/test-guard.js"',
            }],
          }],
        },
      }),
    );

    const darwin = purgeStaleCcBashHooks(root, { platform: 'darwin' });
    assertEqual(darwin.fixed.length, 0);

    const win = purgeStaleCcBashHooks(root, { platform: 'win32' });
    assertEqual(win.fixed.length, 1);
    assertEqual(win.fixed[0], landmine);
    const cmd = JSON.parse(fs.readFileSync(landmine, 'utf8')).hooks.PreToolUse[0].hooks[0].command;
    assertOk(cmd.startsWith('node '), 'landmine rewritten to node');
    assertOk(!cmd.includes('run-hook.sh'), 'no run-hook left');
  });

  suite.test('rewriteResolvedHooks mutates nested commands', () => {
    const hooks = {
      Stop: [{ hooks: [{ command: 'bash "C:/x/scripts/hooks/run-hook.sh" "C:/x/scripts/hooks/session-end.js"' }] }],
    };
    rewriteResolvedHooks(hooks, 'win32');
    assertEqual(hooks.Stop[0].hooks[0].command, 'node "C:/x/scripts/hooks/session-end.js"');
  });
});

describe('run-hook.sh WSL fail-open guard', (suite) => {
  suite.test('script refuses WSL / microsoft kernel path', () => {
    const sh = fs.readFileSync(
      path.join(__dirname, '..', 'scripts', 'hooks', 'run-hook.sh'),
      'utf8',
    );
    assertOk(sh.includes('WSL_DISTRO_NAME'), 'checks WSL_DISTRO_NAME');
    assertOk(/microsoft/i.test(sh), 'checks microsoft kernel');
    assertOk(sh.includes('exit 0'), 'fail-open exit');
  });
});

process.exit(printSummary());
