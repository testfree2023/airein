/**
 * test-cc-hook-command.js - Windows CC hooks must not go through System32 bash/WSL.
 *
 * Bug (2026-07-15): settings.json registered
 *   bash ".../run-hook.sh" ".../hook.js"
 * On Windows, bash = WSL launcher; hooks hang and leak hundreds of wsl/bash processes.
 * Fix: rewrite to node ".../hook.js" on win32; keep bash run-hook.sh on unix (PATH resolve).
 */

const { describe, assertEqual, assertOk, printSummary } = require('./helpers');
const { rewriteCcHookCommand } = require('../scripts/lib/cc-hook-command');

describe('rewriteCcHookCommand (win32)', (suite) => {
  suite.test('simple hook to node direct', () => {
    const cmd = 'bash "C:/Users/x/.airein/scripts/hooks/run-hook.sh" "C:/Users/x/.airein/scripts/hooks/test-guard.js"';
    const out = rewriteCcHookCommand(cmd, 'win32');
    assertEqual(out, 'node "C:/Users/x/.airein/scripts/hooks/test-guard.js"');
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

process.exit(printSummary());
