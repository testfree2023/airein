/**
 * Test: hooks/self-learning-prompt.js — UserPromptSubmit 适配层（P019 T1/T4）
 *
 * 集成测试：spawnSync 跑真实 hook 进程，验证 stdin→stdout JSON 协议、
 * exit 0、fail-open、config 开关（T4）。
 */

const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  describe, assertEqual, assertOk, assertContains, projectRoot, printSummary
} = require('./helpers');

const hookPath = path.join(projectRoot(), 'scripts', 'hooks', 'self-learning-prompt.js');

function runHook(stdinPayload, options = {}) {
  const input = stdinPayload == null ? '' : (typeof stdinPayload === 'string' ? stdinPayload : JSON.stringify(stdinPayload));
  const res = spawnSync(process.execPath, [hookPath], {
    input,
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
    cwd: options.cwd
  });
  return {
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    status: res.status
  };
}

describe('self-learning-prompt.js: UserPromptSubmit 协议', suite => {
  suite.test('合法 stdin → exit 0', () => {
    const r = runHook({ prompt: '别用 git add -A', transcript_path: '/tmp/x.jsonl', session_id: 's1' });
    assertEqual(r.status, 0, '应 exit 0（不阻断用户 prompt）');
  });

  suite.test('stdout 是合法 JSON', () => {
    const r = runHook({ prompt: 'hi', transcript_path: '/tmp/x.jsonl' });
    let parsed;
    try { parsed = JSON.parse(r.stdout); } catch (e) { parsed = null; }
    assertOk(parsed !== null, 'stdout 必须是可解析 JSON；实际: ' + r.stdout.slice(0, 120));
  });

  suite.test('JSON 含 hookSpecificOutput.additionalContext', () => {
    const r = runHook({ prompt: 'hi', transcript_path: '/tmp/x.jsonl' });
    const parsed = JSON.parse(r.stdout);
    assertOk(parsed.hookSpecificOutput, '应有 hookSpecificOutput');
    assertEqual(typeof parsed.hookSpecificOutput.additionalContext, 'string', 'additionalContext 应为 string');
  });

  suite.test('hookEventName = UserPromptSubmit', () => {
    const r = runHook({ prompt: 'hi', transcript_path: '/tmp/x.jsonl' });
    const parsed = JSON.parse(r.stdout);
    assertEqual(parsed.hookSpecificOutput.hookEventName, 'UserPromptSubmit', 'hookEventName');
  });

  suite.test('additionalContext 含 Self-Learning 标记 + memory 红线', () => {
    const r = runHook({ prompt: 'hi', transcript_path: '/tmp/x.jsonl' });
    const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    assertContains(ctx, 'Self-Learning', '应含 Self-Learning 标记');
    assertContains(ctx, 'memory', '元提示应强调不碰 memory');
  });
});

describe('self-learning-prompt.js: fail-open（绝不阻断用户 prompt）', suite => {
  suite.test('空 stdin → exit 0', () => {
    const r = runHook(null);
    assertEqual(r.status, 0, '空 stdin 必须 exit 0（fail-open）');
  });

  suite.test('坏 JSON stdin → exit 0', () => {
    const r = runHook('{not valid json');
    assertEqual(r.status, 0, '坏 JSON stdin 必须 exit 0（fail-open）');
  });

  suite.test('缺 prompt 字段 → exit 0', () => {
    const r = runHook({ transcript_path: '/tmp/x.jsonl' });
    assertEqual(r.status, 0, '缺字段必须 exit 0（fail-open）');
  });
});

describe('self-learning-prompt.js: config 开关 (T4)', suite => {
  suite.test('enabled（默认/缺省 quality.json）→ 输出 additionalContext', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-enabled-'));
    const r = runHook({ prompt: 'hi', transcript_path: '/tmp/x.jsonl' }, { cwd: tmp });
    assertEqual(r.status, 0, 'enabled 时 exit 0');
    const parsed = JSON.parse(r.stdout);
    assertOk(parsed.hookSpecificOutput, 'enabled 时应有 hookSpecificOutput');
    assertEqual(typeof parsed.hookSpecificOutput.additionalContext, 'string', 'enabled 时输出 additionalContext');
  });

  suite.test('disabled（quality.json selfLearning.enabled=false）→ 无 additionalContext, exit 0', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-disabled-'));
    fs.mkdirSync(path.join(tmp, '.claude', 'config'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, '.claude', 'config', 'quality.json'),
      JSON.stringify({ selfLearning: { enabled: false } })
    );
    const r = runHook({ prompt: 'hi', transcript_path: '/tmp/x.jsonl' }, { cwd: tmp });
    assertEqual(r.status, 0, 'disabled 时也 exit 0');
    const trimmed = r.stdout.trim();
    if (trimmed) {
      const parsed = JSON.parse(trimmed);
      assertOk(!parsed.hookSpecificOutput, 'disabled 时不应输出 additionalContext');
    } else {
      assertOk(true, 'disabled → 空输出（无 additionalContext）');
    }
  });
});

printSummary();
