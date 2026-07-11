/**
 * version-guard.js — P002: 版本比较与安装守卫纯函数库
 *
 * 版本方案 x.xx: major = plan 序号（P001→1、P002→2），minor = plan 内 commit 序号
 * 00–99（上限 99，两位强制），手动递增。零依赖纯函数，被 setup/update 入口与测试
 * 直接调用。分层不变量：本模块是纯函数（无 stdin/stdout/exit 副作用），exit code
 * 映射由调用方（hook/入口脚本）决定。
 */

'use strict';

const VERSION_RE = /^\d+\.\d{2}$/;

/**
 * 解析 x.xx 版本串为 { major, minor } 整数。非合法格式抛错（fail-fast，不静默放行）。
 * @param {string} v - 版本串，如 "2.00"。
 * @returns {{ major: number, minor: number }}
 */
function parseVersion(v) {
  if (typeof v !== 'string' || !VERSION_RE.test(v)) {
    throw new Error(`invalid version format (expected x.xx): ${JSON.stringify(v)}`);
  }
  const [major, minor] = v.split('.');
  return { major: parseInt(major, 10), minor: parseInt(minor, 10) };
}

/**
 * 比较两个 x.xx 版本。先比 major、再比 minor（0–99 整数）。
 * @param {string} a
 * @param {string} b
 * @returns {-1|0|1} a<b → -1，a==b → 0，a>b → 1
 */
function compareVersion(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  return 0;
}

/**
 * 安装/升级前的版本守卫。比较包版本与已装版本，决定放行/拒绝。
 * @param {{ pkgVer: string, installedVer: string|null|undefined }} opts
 * @returns {{ ok: boolean, action: 'install'|'upgrade'|'same'|'downgrade', message: string }}
 *   - installedVer 为 null/undefined（首次装 / P002 前老版无 VERSION）→ ok:true, action:install
 *   - pkgVer > installed → ok:true, action:upgrade
 *   - pkgVer == installed → ok:true, action:same（提醒 + 放行，幂等重装/修复）
 *   - pkgVer < installed → ok:false, action:downgrade（拒绝 + 卸载提示，无 --force）
 * @throws {Error} pkgVer 或 installedVer（非 null）非 x.xx 格式时 fail-fast
 */
function checkGuard({ pkgVer, installedVer }) {
  parseVersion(pkgVer); // pkgVer 非法立即抛（首次装也校验包版本）
  if (installedVer === null || installedVer === undefined) {
    return { ok: true, action: 'install', message: '' };
  }
  parseVersion(installedVer); // 已装版本非法也抛
  const cmp = compareVersion(pkgVer, installedVer);
  if (cmp > 0) return { ok: true, action: 'upgrade', message: '' };
  if (cmp === 0) {
    return {
      ok: true,
      action: 'same',
      message: `已是相同版本 ${pkgVer}，继续重装/修复安装`,
    };
  }
  return {
    ok: false,
    action: 'downgrade',
    message: `当前已装 ${installedVer}，包 ${pkgVer} 为低版本；请先运行卸载脚本（scripts/update/clean-airein.sh）清理当前版本后重新安装`,
  };
}

module.exports = { compareVersion, checkGuard, parseVersion, VERSION_RE };
