/**
 * T05 — host 归一化入口集成测试（P001-cross-platform · K3 CC 协议轨 · test-plan §3.4）
 *
 * 被测：`scripts/hooks/host/{cursor,codex,codebuddy}.js`（薄壳入口）+ `lib/host-adapter.js`（映射纯函数）。
 * 方式：spawn 真实入口 + 喂宿主 stdin 样本 + 断言 exit code / stderr / stdout。
 *
 * 链路（design §6.1）：宿主 stdin → entry（readStdinJson 剥 BOM → stdinNormalize 归一化 CC schema）
 *   → spawn run-with-flags.js → 既有 hook（零改）→ exit 0/2 + stderr → entry 映射阻断语义。
 *
 * 阻断映射（design §6.2）：
 *   CB  exit 2 + stderr 透传（原生 CC 兼容）
 *   CDX exit 2 + stderr + stdout {permissionDecision:"deny", permissionDecisionReason}
 *   CUR exit 2 + stderr + stdout {permission:"deny", user_message}
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { describe, assertEqual, assertOk, assertContains, assertNotContains, printSummary, projectRoot } = require('./helpers');
const { mapHookResult } = require('../scripts/lib/host-adapter');

const NODE = process.execPath;
const ROOT = projectRoot();
const HOST_DIR = path.join(ROOT, 'scripts', 'hooks', 'host');

// ── fixture helpers ───────────────────────────────────────────────
function mkTmpProject() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'host-adapter-'));
  fs.mkdirSync(path.join(tmp, '.git'), { recursive: true }); // 项目根标记（test-guard findProjectRoot）
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"host-adapter-tmp"}');
  fs.mkdirSync(path.join(tmp, '.claude', 'config'), { recursive: true });
  return tmp;
}
function rmTmp(tmp) { fs.rmSync(tmp, { recursive: true, force: true }); }

/**
 * Spawn a host entry with given stdin object + cwd.
 * @param {string} host - cursor | codex | codebuddy
 * @param {string} hookId - e.g. 'test-guard'
 * @param {object|string} stdin - stdin object (JSON.stringify'd) or raw string (for BOM tests)
 * @param {object} [opts] - { cwd, env }
 */
function runEntry(host, hookId, stdin, opts = {}) {
  const entry = path.join(HOST_DIR, `${host}.js`);
  const input = typeof stdin === 'string' ? stdin : JSON.stringify(stdin);
  const env = { ...process.env, ...(opts.env || {}) };
  delete env.CLAUDE_PROJECT_DIR; // 隔离：测试不靠 CC env 定位根
  const cwd = opts.cwd || process.cwd();
  const r = spawnSync(NODE, [entry, hookId], {
    input, encoding: 'utf8', env, cwd, timeout: 20000,
  });
  return { exitCode: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error };
}

// ── CC-schema stdin 样本（CB/CDX 用，CDX 同 CC schema + cwd）────────
function ccStdin(filePath, toolName = 'Write') {
  return { tool_name: toolName, tool_input: { file_path: filePath }, cwd: '', session_id: 's1' };
}
// CUR 原生 stdin（conversation_id + camelCase 事件 + 嵌套 tool）
function curStdin(filePath, toolName = 'Write') {
  return {
    conversation_id: 'c1',
    hook_event_name: 'preToolUse',
    tool: { name: toolName, input: { file_path: filePath } },
  };
}

// ════════════════════════════════════════════════════════════════════
// 1. mapHookResult 纯函数（阻断映射单元）
// ════════════════════════════════════════════════════════════════════
describe('mapHookResult: 阻断映射纯函数', (suite) => {
  suite.test('CB exit 2 → 透传（stdout/stderr/exit 原样）', () => {
    const r = mapHookResult('codebuddy', { exitCode: 2, stdout: 'passthrough', stderr: 'blocked reason' });
    assertEqual(r.exitCode, 2, 'CB exit 2 透传');
    assertContains(r.stderr, 'blocked reason', 'CB stderr 透传');
    assertContains(r.stdout, 'passthrough', 'CB stdout 透传');
  });

  suite.test('CDX exit 2 → stdout permissionDecision:deny + permissionDecisionReason', () => {
    const r = mapHookResult('codex', { exitCode: 2, stdout: '', stderr: 'reason X' });
    assertEqual(r.exitCode, 2, 'CDX exit 2 保留');
    const j = JSON.parse(r.stdout);
    assertEqual(j.permissionDecision, 'deny', 'CDX permissionDecision:deny');
    assertContains(j.permissionDecisionReason, 'reason X', 'CDX reason 含 stderr');
  });

  suite.test('CUR exit 2 → stdout permission:deny + user_message', () => {
    const r = mapHookResult('cursor', { exitCode: 2, stdout: '', stderr: 'reason Y' });
    assertEqual(r.exitCode, 2, 'CUR exit 2 保留');
    const j = JSON.parse(r.stdout);
    assertEqual(j.permission, 'deny', 'CUR permission:deny');
    assertContains(j.user_message, 'reason Y', 'CUR user_message 含 stderr');
  });

  suite.test('exit 0（允许）→ 三宿主均透传 exit 0', () => {
    for (const host of ['codebuddy', 'codex', 'cursor']) {
      const r = mapHookResult(host, { exitCode: 0, stdout: 'pt', stderr: '' });
      assertEqual(r.exitCode, 0, `${host} exit 0`);
      assertContains(r.stdout, 'pt', `${host} stdout 透传`);
    }
  });

  suite.test('其他非 0 exit（hook 错误）→ fail-open exit 0', () => {
    const r = mapHookResult('codex', { exitCode: 1, stdout: '', stderr: 'boom' });
    assertEqual(r.exitCode, 0, '非 2 非 0 → fail-open');
  });

  suite.test('exitCode 非整数（spawn 崩溃 null）→ fail-open exit 0', () => {
    const r = mapHookResult('codebuddy', { exitCode: null, stdout: '', stderr: '' });
    assertEqual(r.exitCode, 0, 'null → fail-open 0');
  });
});

// ════════════════════════════════════════════════════════════════════
// 2. CB + test-guard（PreToolUse · 缺/有测试）
// ════════════════════════════════════════════════════════════════════
describe('host/codebuddy.js + test-guard（CB · CC schema 恒等）', (suite) => {
  suite.test('缺测试 → exit 2 + stderr（铁律 1）', () => {
    const tmp = mkTmpProject();
    try {
      fs.mkdirSync(path.join(tmp, 'src'));
      const src = path.join(tmp, 'src', 'foo.js');
      fs.writeFileSync(src, 'module.exports = 1;');
      const r = runEntry('codebuddy', 'test-guard', ccStdin(src), { cwd: tmp });
      assertEqual(r.exitCode, 2, 'CB 缺测试 exit 2');
      assertContains(r.stderr, 'Test Guard', 'CB stderr 含 test-guard 阻断原因');
    } finally { rmTmp(tmp); }
  });

  suite.test('有测试 → exit 0', () => {
    const tmp = mkTmpProject();
    try {
      fs.mkdirSync(path.join(tmp, 'src'));
      const src = path.join(tmp, 'src', 'foo.js');
      fs.writeFileSync(src, 'module.exports = 1;');
      fs.writeFileSync(path.join(tmp, 'src', 'foo.test.js'), "require('./foo');");
      const r = runEntry('codebuddy', 'test-guard', ccStdin(src), { cwd: tmp });
      assertEqual(r.exitCode, 0, 'CB 有测试 exit 0');
    } finally { rmTmp(tmp); }
  });
});

// ════════════════════════════════════════════════════════════════════
// 3. CDX + doc-file-warning（PreToolUse · 非标准/标准文档路径）
// ════════════════════════════════════════════════════════════════════
describe('host/codex.js + doc-file-warning（CDX · tool_name:apply_patch）', (suite) => {
  suite.test('非标准文档路径 → exit 2 + stderr', () => {
    const tmp = mkTmpProject();
    try {
      const weird = path.join(tmp, 'weird.txt'); // .txt 非标准名 + 非 docs/
      const stdin = { tool_name: 'apply_patch', tool_input: { file_path: weird }, cwd: tmp, session_id: 's1' };
      const r = runEntry('codex', 'doc-file-warning', stdin, { cwd: tmp });
      assertEqual(r.exitCode, 2, 'CDX 非标准文档 exit 2');
      assertContains(r.stderr, 'Doc Warning', 'CDX stderr 含 doc-file-warning 原因');
    } finally { rmTmp(tmp); }
  });

  suite.test('标准 docs/ 路径 → exit 0', () => {
    const tmp = mkTmpProject();
    try {
      const ok = path.join(tmp, 'docs', 'guide.md'); // /docs/ 白名单
      const stdin = { tool_name: 'apply_patch', tool_input: { file_path: ok }, cwd: tmp, session_id: 's1' };
      const r = runEntry('codex', 'doc-file-warning', stdin, { cwd: tmp });
      assertEqual(r.exitCode, 0, 'CDX docs/ exit 0');
    } finally { rmTmp(tmp); }
  });

  suite.test('阻断映射：stdout permissionDecision:deny（exit 2 同时存在）', () => {
    const tmp = mkTmpProject();
    try {
      const weird = path.join(tmp, 'weird.txt');
      const stdin = { tool_name: 'apply_patch', tool_input: { file_path: weird }, cwd: tmp, session_id: 's1' };
      const r = runEntry('codex', 'doc-file-warning', stdin, { cwd: tmp });
      assertEqual(r.exitCode, 2, 'exit 2 保留');
      let j = null;
      try { j = JSON.parse(r.stdout); } catch {}
      assertOk(j !== null, 'CDX stdout 是合法 JSON');
      assertEqual(j.permissionDecision, 'deny', 'CDX permissionDecision:deny');
      assertOk(typeof j.permissionDecisionReason === 'string' && j.permissionDecisionReason.length > 0, 'CDX reason 非空');
    } finally { rmTmp(tmp); }
  });
});

// ════════════════════════════════════════════════════════════════════
// 4. CUR + test-guard（PreToolUse · 归一化后行为等价）
// ════════════════════════════════════════════════════════════════════
describe('host/cursor.js + test-guard（CUR · conversation_id + camelCase）', (suite) => {
  suite.test('缺测试 → exit 2（归一化后等价于 CB）', () => {
    const tmp = mkTmpProject();
    try {
      fs.mkdirSync(path.join(tmp, 'src'));
      const src = path.join(tmp, 'src', 'bar.js');
      fs.writeFileSync(src, 'module.exports = 2;');
      const r = runEntry('cursor', 'test-guard', curStdin(src), { cwd: tmp });
      assertEqual(r.exitCode, 2, 'CUR 缺测试 exit 2（归一化生效）');
    } finally { rmTmp(tmp); }
  });

  suite.test('阻断映射：stdout permission:deny + user_message', () => {
    const tmp = mkTmpProject();
    try {
      fs.mkdirSync(path.join(tmp, 'src'));
      const src = path.join(tmp, 'src', 'bar.js');
      fs.writeFileSync(src, 'module.exports = 2;');
      const r = runEntry('cursor', 'test-guard', curStdin(src), { cwd: tmp });
      assertEqual(r.exitCode, 2, 'exit 2 保留');
      let j = null;
      try { j = JSON.parse(r.stdout); } catch {}
      assertOk(j !== null, 'CUR stdout 是合法 JSON');
      assertEqual(j.permission, 'deny', 'CUR permission:deny');
      assertOk(typeof j.user_message === 'string' && j.user_message.length > 0, 'CUR user_message 非空');
    } finally { rmTmp(tmp); }
  });
});

// ════════════════════════════════════════════════════════════════════
// 5. 项目根定位（CDX stdin cwd / CUR CURSOR_PROJECT_DIR）
// ════════════════════════════════════════════════════════════════════
describe('项目根定位（无 CLAUDE_PROJECT_DIR env）', (suite) => {
  suite.test('CDX 从 stdin cwd 解析项目根（无 CC env）', () => {
    const tmp = mkTmpProject();
    try {
      const weird = path.join(tmp, 'weird.txt');
      // cwd 仅来自 stdin（opts.cwd 故意设为 os.tmpdir 非 tmp），验证 stdin.cwd 被采纳
      const stdin = { tool_name: 'apply_patch', tool_input: { file_path: weird }, cwd: tmp, session_id: 's1' };
      const r = runEntry('codex', 'doc-file-warning', stdin, { cwd: tmp });
      assertEqual(r.exitCode, 2, 'CDX 从 stdin cwd 定位成功 → 阻断 exit 2');
    } finally { rmTmp(tmp); }
  });

  suite.test('CUR 用 CURSOR_PROJECT_DIR（entry 采纳 env）', () => {
    const tmp = mkTmpProject();
    try {
      fs.mkdirSync(path.join(tmp, 'src'));
      const src = path.join(tmp, 'src', 'baz.js');
      fs.writeFileSync(src, 'module.exports = 3;');
      const r = runEntry('cursor', 'test-guard', curStdin(src), {
        cwd: tmp,
        env: { CURSOR_PROJECT_DIR: tmp },
      });
      assertEqual(r.exitCode, 2, 'CUR CURSOR_PROJECT_DIR 采纳 → 阻断 exit 2');
    } finally { rmTmp(tmp); }
  });
});

// ════════════════════════════════════════════════════════════════════
// 6. BOM 注入（依赖 T01 readStdinJson 剥 BOM，不 fail-open）
// ════════════════════════════════════════════════════════════════════
describe('BOM 注入：stdin 前置 BOM 经 readStdinJson 正确解析', (suite) => {
  suite.test('CB stdin 前置 BOM + 缺测试 → exit 2（非 fail-open）', () => {
    const tmp = mkTmpProject();
    try {
      fs.mkdirSync(path.join(tmp, 'src'));
      const src = path.join(tmp, 'src', 'bom.js');
      fs.writeFileSync(src, 'module.exports = 4;');
      const raw = '﻿' + JSON.stringify(ccStdin(src)); // BOM 前置
      const r = runEntry('codebuddy', 'test-guard', raw, { cwd: tmp });
      assertEqual(r.exitCode, 2, 'BOM 已剥 → 解析成功 → 缺测试 exit 2（不 fail-open）');
      assertNotContains(r.stderr, 'JSON', '非 JSON.parse 失败');
    } finally { rmTmp(tmp); }
  });
});

process.exit(printSummary());
