/**
 * project-shim — P004 项目级宿主薄垫层（CC rules symlink/junction）
 *
 * Canonical: <project>/.airein/rules/
 * CC reads:  <project>/.claude/rules/ → link to canonical
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { AIREIN_PROJECT_DIR } = require('./project-paths');

const CC_RULES_SHIM_REL = '.claude/rules';

function canonicalRulesDir(projectRoot) {
  return path.join(projectRoot, AIREIN_PROJECT_DIR, 'rules');
}

function shimRulesDir(projectRoot) {
  return path.join(projectRoot, ...CC_RULES_SHIM_REL.split('/'));
}

function pathExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function isLinkOrJunction(p) {
  try {
    const st = fs.lstatSync(p);
    return st.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Whether shim symlink/junction resolves to the project canonical rules dir.
 * @param {string} shim
 * @param {string} canonicalAbs
 * @returns {boolean}
 */
function shimResolvesToCanonical(shim, canonicalAbs) {
  const expected = path.resolve(canonicalAbs);
  if (!pathExists(shim) || !isLinkOrJunction(shim)) return false;
  try {
    return path.resolve(fs.realpathSync(shim)) === expected;
  } catch {
    try {
      const raw = fs.readlinkSync(shim);
      const resolved = path.isAbsolute(raw) ? raw : path.resolve(path.dirname(shim), raw);
      return path.resolve(resolved) === expected;
    } catch {
      return false;
    }
  }
}

/**
 * Pure plan for CC rules shim (no IO).
 * @param {string} projectRoot
 * @returns {{ actions: Array<{type:string, path:string, target?:string}>, errors: string[] }}
 */
function planCcRulesShim(projectRoot) {
  const root = path.resolve(projectRoot);
  const canonical = canonicalRulesDir(root);
  const canonicalAbs = path.resolve(canonical);
  const shim = shimRulesDir(root);
  const actions = [];
  const errors = [];

  if (pathExists(shim)) {
    if (isLinkOrJunction(shim)) {
      if (shimResolvesToCanonical(shim, canonicalAbs)) {
        return { actions: [{ type: 'noop', path: shim }], errors: [] };
      }
      // 旧装/误装：.claude/rules 指向 ~/.airein/rules 等非 canonical → 拆掉重链
      actions.push({ type: 'unlink', path: shim });
    } else if (fs.statSync(shim).isDirectory()) {
      // Allow if empty dir? Design says error if non-symlink blocks
      const entries = fs.readdirSync(shim);
      if (entries.length > 0) {
        errors.push(`refuse to replace non-link .claude/rules with ${entries.length} file(s)`);
        return { actions, errors };
      }
      actions.push({ type: 'rmdir', path: shim });
    } else {
      errors.push('refuse to replace non-directory .claude/rules');
      return { actions, errors };
    }
  }

  if (!pathExists(canonical)) {
    actions.push({ type: 'mkdir', path: canonical });
  }

  const parent = path.dirname(shim);
  if (!pathExists(parent)) {
    actions.push({ type: 'mkdir', path: parent });
  }

  actions.push({ type: 'link', path: shim, target: canonicalAbs });
  return { actions, errors };
}

function createDirectoryLink(linkPath, targetPath) {
  const absTarget = path.resolve(targetPath);
  const absLink = path.resolve(linkPath);

  if (process.platform === 'win32') {
    // Directory junction — no admin on typical Win10+ for junctions
    execSync(`cmd /c mklink /J "${absLink}" "${absTarget}"`, { stdio: 'pipe' });
    return { method: 'junction' };
  }

  const type = process.platform === 'darwin' ? 'dir' : 'dir';
  fs.symlinkSync(absTarget, absLink, type);
  return { method: 'symlink' };
}

function copyRulesTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  if (!pathExists(src)) return;
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.statSync(from).isDirectory()) {
      copyRulesTree(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

function applyPlan(plan, projectRoot, dryRun) {
  const root = path.resolve(projectRoot);
  const canonical = canonicalRulesDir(root);

  for (const action of plan.actions) {
    if (action.type === 'noop' || dryRun) continue;
    if (action.type === 'mkdir') {
      fs.mkdirSync(action.path, { recursive: true });
    } else if (action.type === 'unlink') {
      fs.unlinkSync(action.path);
    } else if (action.type === 'rmdir') {
      fs.rmdirSync(action.path);
    } else if (action.type === 'link') {
      try {
        createDirectoryLink(action.path, action.target);
      } catch (err) {
        return {
          ok: false,
          fallback: 'copy',
          error: err.message,
          canonical,
          shim: action.path,
        };
      }
    }
  }

  return { ok: true, canonical, shim: shimRulesDir(root), method: 'link' };
}

/**
 * Ensure CC rules shim exists.
 * @param {string} projectRoot
 * @param {{ dryRun?: boolean }} [opts]
 * @returns {{ ok: boolean, canonical?: string, shim?: string, method?: string, fallback?: string, error?: string }}
 */
function ensureCcRulesShim(projectRoot, opts = {}) {
  const dryRun = opts.dryRun === true;
  const plan = planCcRulesShim(projectRoot);
  if (plan.errors.length > 0) {
    return { ok: false, error: plan.errors.join('; ') };
  }
  if (dryRun) {
    return { ok: true, dryRun: true, actions: plan.actions };
  }
  if (plan.actions.some((a) => a.type === 'noop')) {
    return { ok: true, shim: shimRulesDir(projectRoot), canonical: canonicalRulesDir(projectRoot) };
  }
  return applyPlan(plan, projectRoot, false);
}

module.exports = {
  CC_RULES_SHIM_REL,
  planCcRulesShim,
  ensureCcRulesShim,
  shimResolvesToCanonical,
  canonicalRulesDir,
  shimRulesDir,
};
