/**
 * test-version-guard.js — P002 1.1 + 1.2: VERSION + compareVersion + checkGuard
 *
 * 覆盖 design §3 version-guard.js 契约:
 *   - VERSION 文件存在且 x.xx 格式（P002 起点 2.00）
 *   - compareVersion(a,b) → -1/0/1，先比 major 再比 minor（00–99）
 *   - checkGuard({pkgVer, installedVer}) → {ok, action, message}，5 分支
 *   - 非 x.xx 格式 fail-fast 抛错（不静默放行）
 */

const fs = require('fs');
const path = require('path');
const { describe, assertEqual, assert, assertOk, assertMatch, printSummary } = require('./helpers');
const { compareVersion, checkGuard } = require('../scripts/lib/version-guard');

const VERSION_PATH = path.join(__dirname, '..', 'VERSION');

describe('VERSION 文件', (suite) => {
  suite.test('存在且为 x.xx 格式', () => {
    const v = fs.readFileSync(VERSION_PATH, 'utf8').trim();
    assertMatch(v, /^\d+\.\d{2}$/, `VERSION "${v}" 应为 x.xx 格式`);
  });

  suite.test('VERSION >= P002 起点 2.00', () => {
    const v = fs.readFileSync(VERSION_PATH, 'utf8').trim();
    assertOk(compareVersion(v, '2.00') >= 0, 'VERSION must be >= 2.00 (P002 baseline)');
  });
});

describe('compareVersion: minor 序（同 major）', (suite) => {
  suite.test('1.00 < 1.01', () => assertEqual(compareVersion('1.00', '1.01'), -1, '1.00 < 1.01 → -1'));
  suite.test('1.01 > 1.00', () => assertEqual(compareVersion('1.01', '1.00'), 1, '1.01 > 1.00 → 1'));
  suite.test('1.00 < 1.99', () => assertEqual(compareVersion('1.00', '1.99'), -1, '1.00 < 1.99 → -1'));
  suite.test('2.00 < 2.01', () => assertEqual(compareVersion('2.00', '2.01'), -1, '2.00 < 2.01 → -1'));
  suite.test('2.05 > 2.00', () => assertEqual(compareVersion('2.05', '2.00'), 1, '2.05 > 2.00 → 1'));
});

describe('compareVersion: major 序（跨 plan）', (suite) => {
  suite.test('1.99 < 2.00', () => assertEqual(compareVersion('1.99', '2.00'), -1, '1.99 < 2.00 → -1'));
  suite.test('2.00 > 1.99', () => assertEqual(compareVersion('2.00', '1.99'), 1, '2.00 > 1.99 → 1'));
  suite.test('major 多位: 10.00 > 9.99', () => assertEqual(compareVersion('10.00', '9.99'), 1, '10.00 > 9.99 → 1'));
});

describe('compareVersion: 相等返 0', (suite) => {
  suite.test('2.00 == 2.00', () => assertEqual(compareVersion('2.00', '2.00'), 0, '2.00 == 2.00 → 0'));
  suite.test('1.05 == 1.05', () => assertEqual(compareVersion('1.05', '1.05'), 0, '1.05 == 1.05 → 0'));
});

describe('compareVersion: 非法格式 fail-fast 抛错', (suite) => {
  const expectThrow = (a, b, label) => {
    let threw = false;
    try { compareVersion(a, b); } catch (e) { threw = true; }
    assert(threw, `${label} 应抛错`);
  };
  suite.test('semver 三段 1.0.0', () => expectThrow('1.0.0', '2.00', '1.0.0'));
  suite.test('minor 一位 1.0', () => expectThrow('1.0', '2.00', '1.0'));
  suite.test('无 minor 1', () => expectThrow('1', '2.00', '1'));
  suite.test('非数字 abc', () => expectThrow('abc', '2.00', 'abc'));
  suite.test('minor 三位 1.100', () => expectThrow('1.100', '2.00', '1.100'));
  suite.test('第二参数非法也抛', () => expectThrow('2.00', 'bad', 'bad'));
});

describe('checkGuard: 首次装（无已装版本）', (suite) => {
  suite.test('installedVer=null → install 放行', () => {
    const r = checkGuard({ pkgVer: '2.00', installedVer: null });
    assertEqual(r.ok, true, 'ok=true');
    assertEqual(r.action, 'install', 'action=install');
  });
  suite.test('installedVer=undefined → install 放行', () => {
    const r = checkGuard({ pkgVer: '2.05', installedVer: undefined });
    assertEqual(r.ok, true, 'ok=true');
    assertEqual(r.action, 'install', 'undefined 视为首次');
  });
  suite.test('首次装 message 非强制', () => {
    const r = checkGuard({ pkgVer: '2.00', installedVer: null });
    assert(typeof r.message === 'string', 'message 字段存在（可为空串）');
  });
});

describe('checkGuard: 升级（pkgVer > installed）', (suite) => {
  suite.test('2.01 > 2.00 → upgrade', () => {
    const r = checkGuard({ pkgVer: '2.01', installedVer: '2.00' });
    assertEqual(r.ok, true, 'ok=true');
    assertEqual(r.action, 'upgrade', 'action=upgrade');
  });
  suite.test('跨 major: 3.00 > 2.99 → upgrade', () => {
    const r = checkGuard({ pkgVer: '3.00', installedVer: '2.99' });
    assertEqual(r.action, 'upgrade', '跨 major 升级');
  });
});

describe('checkGuard: 同版（提醒 + 放行）', (suite) => {
  suite.test('2.00 == 2.00 → same', () => {
    const r = checkGuard({ pkgVer: '2.00', installedVer: '2.00' });
    assertEqual(r.ok, true, '同版放行 ok=true');
    assertEqual(r.action, 'same', 'action=same');
    assert(r.message && r.message.includes('2.00'), 'message 含版本号提醒');
  });
});

describe('checkGuard: 降级（拒绝 + 卸载提示）', (suite) => {
  suite.test('1.99 < 2.00 → downgrade 拒绝', () => {
    const r = checkGuard({ pkgVer: '1.99', installedVer: '2.00' });
    assertEqual(r.ok, false, '降级 ok=false');
    assertEqual(r.action, 'downgrade', 'action=downgrade');
    assert(r.message && r.message.includes('clean-airein.sh'), 'message 含卸载脚本指引');
  });
  suite.test('message 含已装与包版本', () => {
    const r = checkGuard({ pkgVer: '1.05', installedVer: '2.10' });
    assert(r.message.includes('2.10') && r.message.includes('1.05'), 'message 含双版本');
  });
});

describe('checkGuard: 格式错 fail-fast', (suite) => {
  suite.test('pkgVer 非法抛错', () => {
    let threw = false;
    try { checkGuard({ pkgVer: 'bad', installedVer: '2.00' }); } catch (e) { threw = true; }
    assert(threw, 'pkgVer=bad 应抛错');
  });
  suite.test('installedVer 非法（非 null）抛错', () => {
    let threw = false;
    try { checkGuard({ pkgVer: '2.00', installedVer: 'bad' }); } catch (e) { threw = true; }
    assert(threw, 'installedVer=bad 应抛错');
  });
});

printSummary();
