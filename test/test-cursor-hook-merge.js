/**
 * test-cursor-hook-merge.js — Cursor hooks.json merge（保留用户 hook）
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { describe, assertEqual, assert, assertOk, assertContains, printSummary } = require('./helpers');
const { mergeCursorHooks, isAireinCursorHook } = require('../scripts/lib/cursor-hook-merge');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-cur-merge-'));
const KERNEL = path.join(TMP, 'kernel');
const CURSOR_HOME = path.join(TMP, 'cursor-home');

fs.mkdirSync(path.join(KERNEL, 'scripts', 'hooks', 'host'), { recursive: true });
fs.mkdirSync(path.join(KERNEL, 'hooks'), { recursive: true });
fs.writeFileSync(path.join(KERNEL, 'scripts', 'hooks', 'host', 'cursor.js'), '//');
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
      SessionStart: [{
        hooks: [{
          type: 'command',
          command: 'bash "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/run-with-flags.js" "session-start" "scripts/hooks/session-start.js"',
        }],
      }],
    },
  }, null, 2),
);

describe('cursor-hook-merge: isAireinCursorHook', (suite) => {
  suite.test('识别 airein 归一化入口', () => {
    assert(isAireinCursorHook({
      type: 'command',
      command: 'node "/home/.airein/scripts/hooks/host/cursor.js" test-guard',
    }), 'airein');
    assert(!isAireinCursorHook({ type: 'command', command: 'echo custom' }), 'custom');
  });
});

describe('cursor-hook-merge: mergeCursorHooks', (suite) => {
  suite.test('写入 airein hooks 且 ${CLAUDE_PLUGIN_ROOT} 已替换', () => {
    const dest = path.join(CURSOR_HOME, 'hooks.json');
    fs.mkdirSync(CURSOR_HOME, { recursive: true });
    const r = mergeCursorHooks({
      hooksFile: path.join(KERNEL, 'hooks', 'hooks.json'),
      aireinRoot: KERNEL.replace(/\\/g, '/'),
      destFile: dest,
    });
    assertOk(r.count >= 2, 'registered');
    const cfg = JSON.parse(fs.readFileSync(dest, 'utf8'));
    const cmds = Object.values(cfg.hooks).flat().map((h) => h.command).join('\n');
    assertContains(cmds, 'host/cursor.js', 'cursor entry');
    assertContains(cmds, KERNEL.replace(/\\/g, '/'), 'kernel path');
    assert(!cmds.includes('${CLAUDE_PLUGIN_ROOT}'), 'no placeholder');
  });

  suite.test('保留用户自有 hook 定义', () => {
    const dest = path.join(TMP, 'hooks-with-custom.json');
    fs.writeFileSync(dest, JSON.stringify({
      version: 1,
      hooks: {
        preToolUse: [{ type: 'command', command: 'echo my-custom-pre-hook' }],
      },
    }, null, 2));
    mergeCursorHooks({
      hooksFile: path.join(KERNEL, 'hooks', 'hooks.json'),
      aireinRoot: KERNEL.replace(/\\/g, '/'),
      destFile: dest,
    });
    const cfg = JSON.parse(fs.readFileSync(dest, 'utf8'));
    const cmds = (cfg.hooks.preToolUse || []).map((h) => h.command);
    assert(cmds.some((c) => c.includes('my-custom-pre-hook')), 'custom kept');
    assert(cmds.some((c) => c.includes('host/cursor.js')), 'airein added');
  });

  suite.test('二次 merge 不重复 airein 条目', () => {
    const dest = path.join(TMP, 'hooks-idempotent.json');
    mergeCursorHooks({
      hooksFile: path.join(KERNEL, 'hooks', 'hooks.json'),
      aireinRoot: KERNEL.replace(/\\/g, '/'),
      destFile: dest,
    });
    const before = fs.readFileSync(dest, 'utf8');
    mergeCursorHooks({
      hooksFile: path.join(KERNEL, 'hooks', 'hooks.json'),
      aireinRoot: KERNEL.replace(/\\/g, '/'),
      destFile: dest,
    });
    assertEqual(fs.readFileSync(dest, 'utf8'), before, 'idempotent');
  });
});

const code = printSummary();
process.exit(code);
