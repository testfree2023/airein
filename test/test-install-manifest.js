/**
 * test-install-manifest.js — P001 buildManifest 基础 + P002 2.4 installedVersion 字段
 *
 * 覆盖 scripts/lib/install-manifest.js 契约：
 *   - hashContent / hashFile（sha256 确定性）
 *   - buildManifest 结构（version/host/platform/files，files 剥离 kind 等额外字段）
 *   - P002 2.4：installedVersion 可选字段——传入则记录，不传则字段缺省（向后兼容老 manifest）
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { describe, assertEqual, assertOk, assert, printSummary } = require('./helpers');
const { hashContent, hashFile, buildManifest } = require('../scripts/lib/install-manifest');

// ── fixtures ───────────────────────────────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-manifest-test-'));
const FIXTURE = path.join(TMP, 'fixture.txt');
fs.writeFileSync(FIXTURE, 'hello airein\n');

// ── tests ──────────────────────────────────────────────────────────

describe('hashContent: sha256 确定性', (suite) => {
  suite.test('同内容同 hash', () => {
    assertEqual(hashContent('abc'), hashContent('abc'), '同内容 hash 相等');
  });
  suite.test('不同内容不同 hash', () => {
    assert(hashContent('abc') !== hashContent('abd'), '不同内容 hash 不同');
  });
  suite.test('返回 64 hex', () => {
    assertOk(/^[0-9a-f]{64}$/.test(hashContent('x')), 'hashContent 返回 64 位 hex');
  });
});

describe('hashFile: 读文件算 hash', (suite) => {
  suite.test('与同内容 hashContent 一致', () => {
    assertEqual(
      hashFile(FIXTURE),
      hashContent(fs.readFileSync(FIXTURE, 'utf8')),
      'hashFile 与 hashContent(同内容) 一致',
    );
  });
  suite.test('返回 64 hex', () => {
    assertOk(/^[0-9a-f]{64}$/.test(hashFile(FIXTURE)), 'hashFile 返回 64 位 hex');
  });
});

describe('buildManifest: 结构契约', (suite) => {
  suite.test('version=1 + host + platform + files', () => {
    const state = buildManifest('cursor', 'windows', []);
    assertEqual(state.version, 1, 'version=1');
    assertEqual(state.host, 'cursor', 'host 透传');
    assertEqual(state.platform, 'windows', 'platform 透传');
    assertOk(Array.isArray(state.files), 'files 是数组');
  });
  suite.test('files 只含 path+hash（剥离 kind 等额外字段）', () => {
    const written = [{ path: 'a.md', hash: 'h1', kind: 'rule' }, { path: 'b.md', hash: 'h2' }];
    const state = buildManifest('codex', 'linux', written);
    assertEqual(state.files.length, 2, 'files 数量');
    assertOk(!('kind' in state.files[0]), 'files 剥离 kind');
    assertEqual(state.files[0].path, 'a.md', 'files[0].path');
    assertEqual(state.files[0].hash, 'h1', 'files[0].hash');
  });
});

describe('buildManifest: P002 2.4 installedVersion', (suite) => {
  suite.test('传 installedVersion → 字段记录', () => {
    const state = buildManifest('cursor', 'windows', [], '2.00');
    assertEqual(state.installedVersion, '2.00', 'installedVersion 记录');
  });
  suite.test('不传 installedVersion → 字段缺省（向后兼容老 manifest）', () => {
    const state = buildManifest('cursor', 'windows', []);
    assert(!('installedVersion' in state), '老调用不应出现 installedVersion 字段');
  });
  suite.test('空串 installedVersion → 字段缺省（不记空值）', () => {
    const state = buildManifest('cursor', 'windows', [], '');
    assert(!('installedVersion' in state), '空串不记 installedVersion');
  });
});

// 清理 TMP
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* 测试 tmp 清理失败不致 fail */ }

printSummary();
