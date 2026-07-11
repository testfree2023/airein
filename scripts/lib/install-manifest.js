/**
 * install-manifest — P001 轻量安装清单（deployment §1.2 · §2 · §8）
 *
 * 纯函数：`<targetRoot>/.airein-install-state.json` 的内容生成与校验。**轻量 JSON，非 SQLite**——
 * 与 ECC state-store（scripts/lib/install-state.js，ecc.install.v1 schema）划清边界（deployment §1.2
 * 偏差登记：install-host.js 独立新建，零耦合 ECC）。记录已部署文件（相对路径 + sha256），供幂等判断 /
 * uninstall hash 校验（不可逆保护，deployment §8）/ verify 自检。
 *
 * 不含时间戳——同 host 二次 install 产物等价 → manifest 等价（幂等可重入不变量，test-plan §3.5 ②）。
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');

/**
 * sha256 of a string (utf8).
 * @param {string} content
 * @returns {string} 64-char hex digest.
 */
function hashContent(content) {
  return crypto.createHash('sha256').update(String(content), 'utf8').digest('hex');
}

/**
 * sha256 of a file on disk (utf8 read).
 * @param {string} absPath
 * @returns {string} 64-char hex digest.
 */
function hashFile(absPath) {
  return crypto.createHash('sha256').update(fs.readFileSync(absPath, 'utf8'), 'utf8').digest('hex');
}

/**
 * Build the install manifest from a written-files list.
 * @param {string} host - One of cursor/codex/codebuddy/opencode.
 * @param {string} platform - windows/macos/linux.
 * @param {Array<{path:string,hash:string}>} files - Written files (path is POSIX-relative to targetRoot).
 * @param {string} [installedVersion] - P002: airein VERSION of the installed package
 *   (read by caller from repoRoot/VERSION). Omitted for pre-P002 callers → field absent
 *   (backward compatible with old manifests). Truthy values only — empty string not recorded.
 * @returns {{version:number, host:string, platform:string, files:Array<{path:string,hash:string}>, installedVersion?:string}}
 */
function buildManifest(host, platform, files, installedVersion) {
  const manifest = {
    version: 1,
    host,
    platform,
    files: files.map((f) => ({ path: f.path, hash: f.hash })),
  };
  if (installedVersion) manifest.installedVersion = installedVersion;
  return manifest;
}

module.exports = { hashContent, hashFile, buildManifest };
