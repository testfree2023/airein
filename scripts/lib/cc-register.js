/**
 * cc-register — P004 CC 用户级注册层（~/.claude shim + merge-hooks）
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { mergeHooks } = require('../merge-hooks');
const { upsertHost } = require('./install-profile');

const CC_SHIM_DIRS = ['skills', 'commands', 'rules'];

function pathExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function isSymlink(p) {
  try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; }
}

function createDirLink(linkPath, targetPath) {
  const absTarget = path.resolve(targetPath);
  const absLink = path.resolve(linkPath);
  if (pathExists(absLink)) {
    if (isSymlink(absLink)) {
      return { ok: true, skipped: true };
    }
    if (fs.statSync(absLink).isDirectory()) {
      const entries = fs.readdirSync(absLink);
      if (entries.length > 0) {
        return { ok: false, error: `refuse to replace non-link ${absLink}` };
      }
      fs.rmdirSync(absLink);
    } else {
      return { ok: false, error: `refuse to replace non-directory ${absLink}` };
    }
  }
  fs.mkdirSync(path.dirname(absLink), { recursive: true });
  if (process.platform === 'win32') {
    execSync(`cmd /c mklink /J "${absLink}" "${absTarget}"`, { stdio: 'pipe' });
  } else {
    fs.symlinkSync(absTarget, absLink, 'dir');
  }
  return { ok: true };
}

/**
 * @param {{ kernelRoot: string, homeDir?: string, dryRun?: boolean }} opts
 */
function registerCc(opts) {
  const kernelRoot = path.resolve(opts.kernelRoot);
  const homeDir = path.resolve(opts.homeDir || process.env.HOME || process.env.USERPROFILE || '');
  const ccHome = path.join(homeDir, '.claude');
  const dryRun = opts.dryRun === true;
  const written = [];
  const errors = [];

  const hooksFile = path.join(kernelRoot, 'hooks', 'hooks.json');
  if (!pathExists(hooksFile)) {
    errors.push(`missing hooks.json at ${hooksFile}`);
    return { ok: false, written, errors };
  }

  for (const name of CC_SHIM_DIRS) {
    const src = path.join(kernelRoot, name);
    const dest = path.join(ccHome, name);
    if (!pathExists(src)) continue;
    if (dryRun) {
      written.push({ kind: 'link', from: src, to: dest });
      continue;
    }
    const r = createDirLink(dest, src);
    if (!r.ok) errors.push(r.error);
    else written.push({ kind: 'link', from: src, to: dest, skipped: r.skipped });
  }

  const settingsFile = path.join(ccHome, 'settings.json');
  if (!dryRun && errors.length === 0) {
    try {
      mergeHooks({
        hooksFile,
        pluginRoot: kernelRoot,
        settingsFiles: [settingsFile],
        ensureProjectDirs: false,
      });
      written.push({ kind: 'settings', path: settingsFile });
    } catch (err) {
      errors.push(err.message);
    }
  } else if (dryRun) {
    written.push({ kind: 'settings', path: settingsFile });
  }

  return { ok: errors.length === 0, written, errors, ccHome, kernelRoot };
}

/**
 * @param {{ kernelRoot: string, homeDir?: string, dryRun?: boolean }} opts
 */
function unregisterCc(opts) {
  const kernelRoot = path.resolve(opts.kernelRoot);
  const homeDir = path.resolve(opts.homeDir || process.env.HOME || process.env.USERPROFILE || '');
  const ccHome = path.join(homeDir, '.claude');
  const dryRun = opts.dryRun === true;
  const removed = [];
  const errors = [];

  for (const name of CC_SHIM_DIRS) {
    const dest = path.join(ccHome, name);
    if (!pathExists(dest)) continue;
    if (!isSymlink(dest)) {
      errors.push(`skip non-link ${dest}`);
      continue;
    }
    const target = fs.readlinkSync(dest);
    if (!path.resolve(target).startsWith(kernelRoot)) {
      errors.push(`skip foreign link ${dest}`);
      continue;
    }
    if (!dryRun) fs.unlinkSync(dest);
    removed.push(dest);
  }

  return { ok: errors.length === 0, removed, errors };
}

function applyCcToProfile(profile, platform) {
  return upsertHost(profile, { id: 'claude-code', platform: platform || process.platform });
}

module.exports = {
  CC_SHIM_DIRS,
  registerCc,
  unregisterCc,
  applyCcToProfile,
  createDirLink,
};
