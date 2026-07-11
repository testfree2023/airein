/**
 * source-resolver.js — P002 1.3: 统一 source 解析纯函数库
 *
 * 解析 --source <dir|tar.gz|zip> 或本地 repo dir，产出 { sourceDir, version, cleanup }。
 * 纯本地解析（不联网）；git clone 回退由入口脚本（setup/update）处理，入口接住
 * NoLocalSourceError 后走 HTTPS clone。
 *
 * 分层不变量：本模块是纯函数（无 stdin/stdout/exit 副作用，但读文件系统 + shell out
 * 系统 tar/unzip —— 这些是解析必需的副作用，封装在此；exit code 映射由调用方决定）。
 *
 * 零依赖：sha256 用 Node crypto；解压靠系统 tar/unzip（Node 内建无 tar/zip 解析）。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

// 关键文件：标识一个目录是 airein 源（scripts/lib/ 目录 + hooks/hooks.json）
const KEY_FILES = ['scripts/lib', 'hooks/hooks.json'];

/**
 * 无本地源错误。入口脚本接住后走 git clone HTTPS 回退。
 */
class NoLocalSourceError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'NoLocalSourceError';
  }
}

/**
 * 判断目录是否是合法 airein 源（含关键文件 scripts/lib/ + hooks/hooks.json）。
 * @param {string} dir
 * @returns {boolean}
 */
function isAireinSource(dir) {
  if (!dir || typeof dir !== 'string') return false;
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
  return KEY_FILES.every((rel) => fs.existsSync(path.join(dir, rel)));
}

/**
 * 读目录下 VERSION 文件（trim）。无 VERSION → undefined（P002 前老源兼容）。
 */
function readVersion(dir) {
  const v = path.join(dir, 'VERSION');
  if (!fs.existsSync(v)) return undefined;
  return fs.readFileSync(v, 'utf8').trim();
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

/**
 * 可选 sha256 校验。expected 缺省 → 跳过；提供 → 不匹配抛错（fail-fast）。
 */
function verifySha256(file, expected) {
  if (!expected) return;
  const actual = sha256File(file);
  if (actual !== String(expected).toLowerCase()) {
    throw new Error(
      `sha256 校验失败: ${path.basename(file)}（期望 ${expected}，实际 ${actual}）`
    );
  }
}

/**
 * 解压后找 airein root：优先 extractDir 本身，其次任一子目录（GitHub archive 解压后
 * 通常是 <repo>-<tag>/ 单一子目录）。
 * @returns {string|null}
 */
function findAireinRoot(extractDir) {
  if (isAireinSource(extractDir)) return extractDir;
  let entries = [];
  try { entries = fs.readdirSync(extractDir); } catch (e) { return null; }
  for (const e of entries) {
    const sub = path.join(extractDir, e);
    try { if (fs.statSync(sub).isDirectory() && isAireinSource(sub)) return sub; } catch (err) { /* skip */ }
  }
  return null;
}

function extractTarGz(pkg) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-extract-'));
  // win32：用 cwd 代替 -C（避免 -C "C:\..." 的盘符冒号被 GNU tar 误当 host:path），
  // 并加 --force-local 让 archive 文件名里的冒号当本地。macOS/Linux 路径无盘符冒号。
  const forceLocal = process.platform === 'win32' ? '--force-local' : '';
  try {
    execSync(`tar ${forceLocal} -xzf "${pkg}"`, { cwd: tmp, stdio: 'pipe' });
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error(`tar 解压失败: ${path.basename(pkg)}`);
  }
  return tmp;
}

function extractZip(pkg) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-extract-'));
  try {
    execSync(`unzip -q "${pkg}" -d "${tmp}"`, { stdio: 'pipe' });
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error(
      `unzip 解压失败: ${path.basename(pkg)} — 请确认是有效 zip，或改用 .tar.gz；若系统未装 unzip 请先安装`
    );
  }
  return tmp;
}

/**
 * 解析 source。优先级：
 *   1. source 是目录 → 关键文件校验 → 直用（cleanup noop，不删用户目录）
 *   2. source 是 .tar.gz/.tgz → 可选 sha256 → tar 解压 → 找 airein root（cleanup 删 tmpdir）
 *   3. source 是 .zip → 可选 sha256 → unzip 解压 → 找 airein root
 *   4. source 缺省 + scriptDir 是 airein → 用 scriptDir
 *   5. 以上都不满足 → NoLocalSourceError（入口接住走 git clone 回退）
 *
 * @param {{ source?: string, sha256?: string, scriptDir?: string }} opts
 * @returns {{ sourceDir: string, version: string|undefined, cleanup: () => void, cleanupDir: string }}
 *   cleanupDir：解压情况=extractDir tmpdir（入口脚本 trap 删；node 进程退出后 cleanup 闭包失效，
 *   需此字符串跨进程传递）；dir 直用/scriptDir 回退=空串（无需删用户目录）
 * @throws {Error} 路径不存在 / 缺关键文件 / 不支持扩展名 / sha256 不匹配 / 解压失败
 * @throws {NoLocalSourceError} 无本地源（入口走 git 回退）
 */
function resolveSource({ source, sha256, scriptDir } = {}) {
  if (source) {
    if (!fs.existsSync(source)) {
      throw new Error(`--source 路径不存在: ${source}`);
    }
    const stat = fs.statSync(source);
    if (stat.isDirectory()) {
      if (!isAireinSource(source)) {
        throw new Error(
          `--source 目录缺关键文件（需 scripts/lib/ + hooks/hooks.json）: ${source}`
        );
      }
      return { sourceDir: source, version: readVersion(source), cleanup: () => {}, cleanupDir: '' };
    }
    // 文件包：先 sha256（解压前校验整包完整性），再按扩展名解压
    verifySha256(source, sha256);
    const lower = source.toLowerCase();
    let extractDir;
    if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
      extractDir = extractTarGz(source);
    } else if (lower.endsWith('.zip')) {
      extractDir = extractZip(source);
    } else {
      throw new Error(
        `--source 不支持的包格式（仅 .tar.gz / .zip）: ${path.basename(source)}`
      );
    }
    const root = findAireinRoot(extractDir);
    if (!root) {
      fs.rmSync(extractDir, { recursive: true, force: true });
      throw new Error(
        `--source 解压后未找到 airein 源（缺 scripts/lib/ + hooks/hooks.json）: ${path.basename(source)}`
      );
    }
    const cleanup = () => fs.rmSync(extractDir, { recursive: true, force: true });
    return { sourceDir: root, version: readVersion(root), cleanup, cleanupDir: extractDir };
  }

  // 无 source：scriptDir 回退（本地开发 / 已 clone 的 airein repo）
  if (scriptDir && isAireinSource(scriptDir)) {
    return { sourceDir: scriptDir, version: readVersion(scriptDir), cleanup: () => {}, cleanupDir: '' };
  }

  throw new NoLocalSourceError(
    `无本地源：未传 --source，且 scriptDir 非 airein 仓库（${scriptDir || 'undefined'}）。` +
    `请传 --source <dir|tar.gz|zip>，或入口脚本走 HTTPS git clone 回退。`
  );
}

module.exports = { resolveSource, isAireinSource, NoLocalSourceError, verifySha256, readVersion };
