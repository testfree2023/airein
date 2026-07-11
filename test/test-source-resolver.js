/**
 * test-source-resolver.js — P002 1.3: resolveSource（source-resolver.js）
 *
 * 覆盖 design §3 source-resolver.js 契约（纯本地源解析，不联网；git clone 回退归入口 2.x）:
 *   - --source <dir>:关键文件校验 → 直用
 *   - --source <pkg.tar.gz>:可选 sha256 → tar 解压 → 找 airein root
 *   - --source <pkg.zip>:可选 sha256 → unzip
 *   - 缺关键文件 / 解压失败 / 不支持扩展名 / sha256 不匹配 → 抛错（不 fail-open）
 *   - 无 --source + scriptDir 是 airein → 用 scriptDir；否则 NoLocalSourceError（入口接住走 git 回退）
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { describe, assertEqual, assert, assertOk, printSummary } = require('./helpers');
const { resolveSource, isAireinSource, NoLocalSourceError } = require('../scripts/lib/source-resolver');

// ── fixtures ───────────────────────────────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-src-test-'));

// 合法 airein 源
const GOOD = path.join(TMP, 'good');
fs.mkdirSync(path.join(GOOD, 'scripts', 'lib'), { recursive: true });
fs.mkdirSync(path.join(GOOD, 'hooks'), { recursive: true });
fs.writeFileSync(path.join(GOOD, 'scripts', 'lib', 'utils.js'), '// placeholder');
fs.writeFileSync(path.join(GOOD, 'hooks', 'hooks.json'), '{}');
fs.writeFileSync(path.join(GOOD, 'VERSION'), '2.00');

// 缺关键文件（非 airein）
const BAD = path.join(TMP, 'bad');
fs.mkdirSync(BAD, { recursive: true });
fs.writeFileSync(path.join(BAD, 'README.md'), 'not airein');

// tar.gz fixture（顶层 good/，模拟 GitHub archive 单一子目录）。
// win32 用 cwd 代替 -C（避免 -C "C:\..." 的盘符冒号被 GNU tar 误当 host:path），
// 并加 --force-local 让 archive 文件名里的冒号当本地。macOS/Linux 路径无盘符冒号。
const TARGZ = path.join(TMP, 'good.tar.gz');
const TAR_FORCE_LOCAL = process.platform === 'win32' ? '--force-local' : '';
execSync(`tar ${TAR_FORCE_LOCAL} -czf "${TARGZ}" good`, { cwd: TMP, stdio: 'pipe' });
const TARGZ_HASH = crypto.createHash('sha256').update(fs.readFileSync(TARGZ)).digest('hex');

// 坏 tar.gz（非 tar 内容 → 解压失败）
const BROKEN_TARGZ = path.join(TMP, 'broken.tar.gz');
fs.writeFileSync(BROKEN_TARGZ, 'not a real tar');

// 假 zip（无 zip 命令生成真 fixture；用任意内容测 sha256 校验 + unzip 解压失败分支）
const FAKE_ZIP = path.join(TMP, 'fake.zip');
fs.writeFileSync(FAKE_ZIP, 'fake zip content');
const FAKE_ZIP_HASH = crypto.createHash('sha256').update(fs.readFileSync(FAKE_ZIP)).digest('hex');

// 无 VERSION 的老源（P002 前兼容）
const NOVER = path.join(TMP, 'nover');
fs.mkdirSync(path.join(NOVER, 'scripts', 'lib'), { recursive: true });
fs.mkdirSync(path.join(NOVER, 'hooks'), { recursive: true });
fs.writeFileSync(path.join(NOVER, 'scripts', 'lib', 'utils.js'), '// placeholder');
fs.writeFileSync(path.join(NOVER, 'hooks', 'hooks.json'), '{}');

// ── tests ──────────────────────────────────────────────────────────

describe('isAireinSource: 关键文件校验', (suite) => {
  suite.test('GOOD 是 airein source', () => assertOk(isAireinSource(GOOD), 'GOOD 应识别'));
  suite.test('BAD 非 airein source', () => assert(!isAireinSource(BAD), 'BAD 不应识别'));
  suite.test('不存在路径返 false', () => assert(!isAireinSource(path.join(TMP, 'nope')), '不存在 → false'));
});

describe('resolveSource: --source <dir>', (suite) => {
  suite.test('合法 dir → sourceDir + version + cleanup', () => {
    const r = resolveSource({ source: GOOD });
    assertEqual(r.sourceDir, GOOD, 'sourceDir = 传入 dir');
    assertEqual(r.version, '2.00', 'version 读自 VERSION');
    assertEqual(typeof r.cleanup, 'function', 'cleanup 是函数');
  });
  suite.test('cleanup 对 dir 是 noop（不删用户目录）', () => {
    const r = resolveSource({ source: GOOD });
    r.cleanup();
    assert(fs.existsSync(GOOD), 'dir cleanup 不删源目录');
  });
  suite.test('dir 直用 cleanupDir 为空串（跨进程无需删）', () => {
    const r = resolveSource({ source: GOOD });
    assertEqual(r.cleanupDir, '', 'dir 直用 cleanupDir="" ');
  });
  suite.test('无 VERSION 的源 → version=undefined（P002 前兼容）', () => {
    const r = resolveSource({ source: NOVER });
    assertEqual(r.version, undefined, '无 VERSION → undefined');
  });
  suite.test('缺关键文件 → 抛错', () => {
    let threw = false;
    try { resolveSource({ source: BAD }); } catch (e) { threw = true; }
    assert(threw, 'BAD dir 应抛错');
  });
  suite.test('路径不存在 → 抛错', () => {
    let threw = false;
    try { resolveSource({ source: path.join(TMP, 'nope') }); } catch (e) { threw = true; }
    assert(threw, '不存在路径应抛错');
  });
});

describe('resolveSource: --source <pkg.tar.gz>', (suite) => {
  suite.test('解压 → 找到 airein root + version', () => {
    const r = resolveSource({ source: TARGZ });
    assertOk(isAireinSource(r.sourceDir), '解压后是 airein source');
    assertEqual(r.version, '2.00', 'version 来自解压目录');
    r.cleanup();
  });
  suite.test('cleanup 删除解压 tmpdir（cleanupDir 暴露路径供入口 trap）', () => {
    const r = resolveSource({ source: TARGZ });
    assertOk(r.cleanupDir, '解压情况 cleanupDir 非空');
    r.cleanup();
    assert(!fs.existsSync(r.cleanupDir), 'cleanup 后 cleanupDir 不存在');
  });
  suite.test('sha256 正确 → 通过', () => {
    const r = resolveSource({ source: TARGZ, sha256: TARGZ_HASH });
    assertEqual(r.version, '2.00', 'sha256 正确放行');
    r.cleanup();
  });
  suite.test('sha256 错误 → 抛错（解压前）', () => {
    let threw = false;
    try { resolveSource({ source: TARGZ, sha256: '0'.repeat(64) }); } catch (e) { threw = true; }
    assert(threw, 'sha256 不匹配应抛错');
  });
  suite.test('坏 tar.gz → 抛解压失败', () => {
    let threw = false;
    try { resolveSource({ source: BROKEN_TARGZ }); } catch (e) { threw = true; }
    assert(threw, '坏 tar 应抛错');
  });
});

describe('resolveSource: --source <pkg.zip>', (suite) => {
  suite.test('sha256 正确 → 进入解压（假 zip 内容 → unzip 失败抛错）', () => {
    let threw = false;
    try { resolveSource({ source: FAKE_ZIP, sha256: FAKE_ZIP_HASH }); } catch (e) { threw = true; }
    assert(threw, '假 zip 解压应失败抛错（证明走了 unzip 分支）');
  });
  suite.test('sha256 错误 → 抛错（解压前）', () => {
    let threw = false;
    try { resolveSource({ source: FAKE_ZIP, sha256: '0'.repeat(64) }); } catch (e) { threw = true; }
    assert(threw, 'zip sha256 不匹配应抛错');
  });
});

describe('resolveSource: 无 --source 回退', (suite) => {
  suite.test('scriptDir 是 airein → 用 scriptDir', () => {
    const r = resolveSource({ source: undefined, scriptDir: GOOD });
    assertEqual(r.sourceDir, GOOD, '回退到 scriptDir');
    assertEqual(r.version, '2.00', 'version 来自 scriptDir');
  });
  suite.test('scriptDir 非 airein → NoLocalSourceError', () => {
    let caught = null;
    try { resolveSource({ source: undefined, scriptDir: BAD }); } catch (e) { caught = e; }
    assertOk(caught instanceof NoLocalSourceError, '应抛 NoLocalSourceError');
  });
  suite.test('无 source 无 scriptDir → NoLocalSourceError', () => {
    let caught = null;
    try { resolveSource({}); } catch (e) { caught = e; }
    assertOk(caught instanceof NoLocalSourceError, '应抛 NoLocalSourceError');
  });
});

describe('resolveSource: 不支持的扩展名', (suite) => {
  suite.test('.rar → 抛错', () => {
    const rar = path.join(TMP, 'x.rar');
    fs.writeFileSync(rar, 'x');
    let threw = false;
    try { resolveSource({ source: rar }); } catch (e) { threw = true; }
    assert(threw, '.rar 应抛不支持');
  });
});

// 清理 TMP（os.tmpdir 周期清理，显式清更卫生）
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* 测试 tmp 清理失败不致 fail */ }

printSummary();
