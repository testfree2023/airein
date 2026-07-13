/**
 * asset-delivery — skills/commands 交付策略（unified|copy）；rules 固定 deploy
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DELIVERY_UNIFIED = 'unified';
const DELIVERY_COPY = 'copy';
const DEFAULT_DELIVERY = DELIVERY_UNIFIED;
const BACKUP_SUFFIX = '.airein-backup-';

const AIREIN_L0_RULES = ['00-iron-rules.md', '10-architecture.md', '20-workflow.md'];
const AIREIN_L1_SHELLS = ['conventions-javascript.md', 'conventions-bash.md'];

function pathExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function isSymlink(p) {
  try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; }
}

function backupTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function normalizeDelivery(value) {
  if (!value || value === DELIVERY_UNIFIED) return DELIVERY_UNIFIED;
  if (value === DELIVERY_COPY) return DELIVERY_COPY;
  throw new Error(`asset-delivery: invalid delivery "${value}" (known: unified|copy)`);
}

function copyEntryIfAbsent(src, dest) {
  if (pathExists(dest)) return { copied: false, reason: 'exists' };
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyEntryIfAbsent(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
  return { copied: true };
}

function mergeForeignDirIntoKernel(foreignDir, kernelDir) {
  const merged = [];
  const skipped = [];
  if (!pathExists(foreignDir)) return { merged, skipped };
  fs.mkdirSync(kernelDir, { recursive: true });
  for (const name of fs.readdirSync(foreignDir)) {
    const from = path.join(foreignDir, name);
    const to = path.join(kernelDir, name);
    const r = copyEntryIfAbsent(from, to);
    if (r.copied) merged.push(name);
    else skipped.push(name);
  }
  return { merged, skipped };
}

function symlinkPointsTo(symlinkPath, targetPath) {
  if (!isSymlink(symlinkPath)) return false;
  try {
    const realLink = fs.realpathSync(symlinkPath);
    const realTarget = fs.realpathSync(targetPath);
    return realLink === realTarget;
  } catch {
    return false;
  }
}

function makeDirectoryLink(linkPath, targetPath) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  if (process.platform === 'win32') {
    execSync(`cmd /c mklink /J "${path.resolve(linkPath)}" "${path.resolve(targetPath)}"`, { stdio: 'pipe' });
  } else {
    fs.symlinkSync(path.resolve(targetPath), path.resolve(linkPath), 'dir');
  }
}

/**
 * @param {string} linkPath
 * @param {string} targetPath
 * @param {{ dryRun?: boolean, now?: () => string }} [opts]
 */
function createDirLink(linkPath, targetPath, opts = {}) {
  const absTarget = path.resolve(targetPath);
  const absLink = path.resolve(linkPath);
  const dryRun = opts.dryRun === true;
  const ts = (opts.now || backupTimestamp)();

  if (pathExists(absLink)) {
    if (isSymlink(absLink)) {
      if (symlinkPointsTo(absLink, absTarget)) {
        return { ok: true, skipped: true, method: 'link' };
      }
      return { ok: false, error: `refuse to replace foreign symlink ${absLink}`, method: 'link' };
    }
    if (!fs.statSync(absLink).isDirectory()) {
      return { ok: false, error: `refuse to replace non-directory ${absLink}`, method: 'link' };
    }
    const entries = fs.readdirSync(absLink);
    if (entries.length === 0) {
      if (!dryRun) fs.rmdirSync(absLink);
    } else {
      const merge = mergeForeignDirIntoKernel(absLink, absTarget);
      const backupPath = `${absLink}${BACKUP_SUFFIX}${ts}`;
      if (dryRun) {
        return {
          ok: true,
          dryRun: true,
          merged: merge.merged,
          skipped: merge.skipped,
          backupPath,
          method: 'link',
        };
      }
      fs.renameSync(absLink, backupPath);
      return {
        ok: true,
        merged: merge.merged,
        skipped: merge.skipped,
        backupPath,
        method: 'link',
      };
    }
  }

  if (!dryRun) makeDirectoryLink(absLink, absTarget);
  return { ok: true, method: 'link' };
}

function copyTreeOverwrite(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    const from = path.join(srcDir, name);
    const to = path.join(destDir, name);
    if (fs.statSync(from).isDirectory()) {
      copyTreeOverwrite(from, to);
    } else {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }
}

/**
 * Copy kernel entries into dest; preserve foreign entries already in dest.
 * @param {string} srcDir
 * @param {string} destDir
 * @param {{ dryRun?: boolean, now?: () => string }} [opts]
 */
function syncCopyDir(srcDir, destDir, opts = {}) {
  const dryRun = opts.dryRun === true;
  const absSrc = path.resolve(srcDir);
  const absDest = path.resolve(destDir);
  const ts = (opts.now || backupTimestamp)();

  if (pathExists(absDest)) {
    if (isSymlink(absDest)) {
      return { ok: false, error: `refuse to copy over symlink ${absDest}`, method: 'copy' };
    }
    if (!fs.statSync(absDest).isDirectory()) {
      return { ok: false, error: `refuse to copy over non-directory ${absDest}`, method: 'copy' };
    }
    const srcNames = new Set(fs.readdirSync(absSrc));
    const foreign = fs.readdirSync(absDest).filter((n) => !srcNames.has(n));
    if (foreign.length > 0) {
      const merge = mergeForeignDirIntoKernel(absDest, absSrc);
      const backupDir = path.join(path.dirname(absDest), `${path.basename(absDest)}${BACKUP_SUFFIX}${ts}`);
      if (dryRun) {
        return {
          ok: true,
          dryRun: true,
          merged: merge.merged,
          skipped: merge.skipped,
          backupPath: backupDir,
          method: 'copy',
        };
      }
      fs.renameSync(absDest, backupDir);
      fs.mkdirSync(absDest, { recursive: true });
      for (const name of foreign) {
        fs.renameSync(path.join(backupDir, name), path.join(absDest, name));
      }
      copyTreeOverwrite(absSrc, absDest);
      return {
        ok: true,
        merged: merge.merged,
        skipped: merge.skipped,
        backupPath: backupDir,
        method: 'copy',
      };
    }
  } else if (!dryRun) {
    fs.mkdirSync(absDest, { recursive: true });
  }

  if (!dryRun) copyTreeOverwrite(absSrc, absDest);
  return { ok: true, method: 'copy' };
}

/**
 * @param {{ srcDir: string, destDir: string, mode?: string, dryRun?: boolean, now?: () => string }} opts
 */
function deliverAssetDir(opts) {
  const mode = normalizeDelivery(opts.mode);
  if (mode === DELIVERY_UNIFIED) {
    return createDirLink(opts.destDir, opts.srcDir, opts);
  }
  return syncCopyDir(opts.srcDir, opts.destDir, opts);
}

/**
 * List airein-managed CC rule basenames present in kernel.
 * @param {string} kernelRoot
 * @returns {string[]}
 */
function listAireinCcRuleFiles(kernelRoot) {
  const out = [];
  const l0Dir = path.join(kernelRoot, 'rules');
  for (const name of AIREIN_L0_RULES) {
    if (pathExists(path.join(l0Dir, name))) out.push(name);
  }
  const l1Dir = path.join(kernelRoot, '.claude', 'rules');
  for (const name of AIREIN_L1_SHELLS) {
    if (pathExists(path.join(l1Dir, name))) out.push(name);
  }
  return out;
}

/**
 * Ensure dest rules dir is a real directory (migrate legacy symlink → deploy dir).
 * Preserves non-airein files that lived behind a legacy rules symlink.
 * @param {string} destRulesDir
 * @param {boolean} dryRun
 */
function prepareCcRulesDestDir(destRulesDir, dryRun) {
  if (dryRun || !pathExists(destRulesDir)) {
    if (!dryRun) fs.mkdirSync(destRulesDir, { recursive: true });
    return;
  }
  let st;
  try { st = fs.lstatSync(destRulesDir); } catch { st = null; }
  if (st && st.isSymbolicLink()) {
    const linkTarget = fs.realpathSync(destRulesDir);
    if (!dryRun) fs.unlinkSync(destRulesDir);
    if (!dryRun) fs.mkdirSync(destRulesDir, { recursive: true });
    if (!dryRun && pathExists(linkTarget)) {
      try {
        const targetSt = fs.statSync(linkTarget);
        if (targetSt.isDirectory()) {
          for (const name of fs.readdirSync(linkTarget)) {
            copyEntryIfAbsent(path.join(linkTarget, name), path.join(destRulesDir, name));
          }
        }
      } catch { /* best effort */ }
    }
    return;
  }
  if (st && !st.isDirectory()) {
    if (!dryRun) fs.rmSync(destRulesDir, { force: true });
    if (!dryRun) fs.mkdirSync(destRulesDir, { recursive: true });
    return;
  }
  if (!dryRun) fs.mkdirSync(destRulesDir, { recursive: true });
}

/**
 * Deploy CC rules (always copy/regenerate — never symlink).
 * @param {{ kernelRoot: string, destRulesDir: string, dryRun?: boolean }} opts
 */
function deployCcRules(opts) {
  const kernelRoot = path.resolve(opts.kernelRoot);
  const destRulesDir = path.resolve(opts.destRulesDir);
  const dryRun = opts.dryRun === true;
  const deployed = [];

  prepareCcRulesDestDir(destRulesDir, dryRun);

  for (const name of AIREIN_L0_RULES) {
    const src = path.join(kernelRoot, 'rules', name);
    if (!pathExists(src)) continue;
    const dest = path.join(destRulesDir, name);
    if (!dryRun) fs.copyFileSync(src, dest);
    deployed.push(name);
  }

  for (const name of AIREIN_L1_SHELLS) {
    const src = path.join(kernelRoot, '.claude', 'rules', name);
    if (!pathExists(src)) continue;
    const dest = path.join(destRulesDir, name);
    if (!dryRun) fs.copyFileSync(src, dest);
    deployed.push(name);
  }

  return { ok: true, deployed, method: 'deploy' };
}

/**
 * Remove airein-managed rule files from dest (uninstall).
 * @param {string} destRulesDir
 * @param {{ dryRun?: boolean }} [opts]
 */
function removeDeployedCcRules(destRulesDir, opts = {}) {
  const dryRun = opts.dryRun === true;
  const removed = [];
  for (const name of [...AIREIN_L0_RULES, ...AIREIN_L1_SHELLS]) {
    const fp = path.join(destRulesDir, name);
    if (!pathExists(fp)) continue;
    if (!dryRun) fs.rmSync(fp, { force: true });
    removed.push(name);
  }
  return { removed };
}

module.exports = {
  DELIVERY_UNIFIED,
  DELIVERY_COPY,
  DEFAULT_DELIVERY,
  BACKUP_SUFFIX,
  AIREIN_L0_RULES,
  AIREIN_L1_SHELLS,
  normalizeDelivery,
  deliverAssetDir,
  deployCcRules,
  removeDeployedCcRules,
  listAireinCcRuleFiles,
  createDirLink,
  mergeForeignDirIntoKernel,
  copyEntryIfAbsent,
  isSymlink,
  symlinkPointsTo,
};
