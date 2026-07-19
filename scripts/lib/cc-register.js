/**
 * cc-register — P004 CC 用户级注册层（~/.claude shim + merge-hooks）
 *
 * skills/commands/agents 跟 delivery（unified|copy）；rules 固定 deploy；hooks 固定 merge。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { mergeHooks } = require('../merge-hooks');
const { upsertHost } = require('./install-profile');
const {
  DEFAULT_DELIVERY,
  normalizeDelivery,
  deliverAssetDir,
  deployCcRules,
  removeDeployedCcRules,
  isSymlink,
} = require('./asset-delivery');

const CC_ASSET_DIRS = ['skills', 'commands', 'agents'];

function pathExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

/**
 * @param {{ kernelRoot: string, homeDir?: string, delivery?: string, dryRun?: boolean }} opts
 */
function registerCc(opts) {
  const kernelRoot = path.resolve(opts.kernelRoot);
  const homeDir = path.resolve(opts.homeDir || process.env.HOME || process.env.USERPROFILE || '');
  const ccHome = path.join(homeDir, '.claude');
  const dryRun = opts.dryRun === true;
  const delivery = normalizeDelivery(opts.delivery || DEFAULT_DELIVERY);
  const written = [];
  const errors = [];

  const hooksFile = path.join(kernelRoot, 'hooks', 'hooks.json');
  if (!pathExists(hooksFile)) {
    errors.push(`missing hooks.json at ${hooksFile}`);
    return { ok: false, written, errors };
  }

  for (const name of CC_ASSET_DIRS) {
    const src = path.join(kernelRoot, name);
    const dest = path.join(ccHome, name);
    if (!pathExists(src)) continue;
    const r = deliverAssetDir({ srcDir: src, destDir: dest, mode: delivery, dryRun });
    if (!r.ok) errors.push(r.error);
    else {
      written.push({
        kind: delivery === 'unified' ? 'link' : 'copy',
        asset: name,
        from: src,
        to: dest,
        method: r.method,
        skipped: r.skipped,
        merged: r.merged,
        skippedNames: r.skipped,
        backupPath: r.backupPath,
      });
    }
  }

  const rulesDest = path.join(ccHome, 'rules');
  const rulesRes = deployCcRules({ kernelRoot, destRulesDir: rulesDest, dryRun });
  written.push({ kind: 'deploy', asset: 'rules', to: rulesDest, deployed: rulesRes.deployed });

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

  return { ok: errors.length === 0, written, errors, ccHome, kernelRoot, delivery };
}

/**
 * @param {{ kernelRoot: string, homeDir?: string, delivery?: string, dryRun?: boolean }} opts
 */
function unregisterCc(opts) {
  const kernelRoot = path.resolve(opts.kernelRoot);
  const homeDir = path.resolve(opts.homeDir || process.env.HOME || process.env.USERPROFILE || '');
  const ccHome = path.join(homeDir, '.claude');
  const dryRun = opts.dryRun === true;
  const delivery = normalizeDelivery(opts.delivery || DEFAULT_DELIVERY);
  const removed = [];
  const errors = [];

  for (const name of CC_ASSET_DIRS) {
    const dest = path.join(ccHome, name);
    if (!pathExists(dest)) continue;
    if (delivery === 'unified') {
      if (!isSymlink(dest)) {
        errors.push(`skip non-link ${dest}`);
        continue;
      }
      const target = fs.readlinkSync(dest);
      const resolved = path.resolve(ccHome, target);
      const kernelTarget = path.join(kernelRoot, name);
      if (resolved !== path.resolve(kernelTarget) && !resolved.startsWith(kernelRoot)) {
        errors.push(`skip foreign link ${dest}`);
        continue;
      }
      if (!dryRun) fs.unlinkSync(dest);
      removed.push(dest);
    } else {
      // copy 模式：仅删除内核拥有的条目（目录/文件同名）
      const src = path.join(kernelRoot, name);
      if (!pathExists(src)) continue;
      for (const entry of fs.readdirSync(src)) {
        const fp = path.join(dest, entry);
        if (!pathExists(fp)) continue;
        if (!dryRun) fs.rmSync(fp, { recursive: true, force: true });
        removed.push(fp);
      }
    }
  }

  const rulesRemoved = removeDeployedCcRules(path.join(ccHome, 'rules'), { dryRun });
  removed.push(...rulesRemoved.removed.map((n) => path.join(ccHome, 'rules', n)));

  return { ok: errors.length === 0, removed, errors, delivery };
}

function applyCcToProfile(profile, platform) {
  return upsertHost(profile, { id: 'claude-code', platform: platform || process.platform });
}

module.exports = {
  CC_ASSET_DIRS,
  registerCc,
  unregisterCc,
  applyCcToProfile,
};
