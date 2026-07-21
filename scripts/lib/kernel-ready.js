#!/usr/bin/env node
/**
 * kernel-ready — detect whether L2 airein kernel (~/.airein) is usable (P009 B→C).
 *
 * Pure detection for SessionStart / plugin bridge. No install side effects.
 *
 * Dual interface: require()-able + CLI JSON.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const REASON_KERNEL_MISSING = 'KERNEL_MISSING';
const REASON_KERNEL_INCOMPLETE = 'KERNEL_INCOMPLETE';
const DEFAULT_NEXT_CMD = 'airein setup --hosts claude-code --yes';

/**
 * @param {{
 *   homeDir?: string,
 *   kernelRoot?: string,
 *   fs?: Pick<typeof fs, 'existsSync' | 'readFileSync'>,
 * }} [opts]
 * @returns {{
 *   ok: boolean,
 *   reason: string|null,
 *   nextCmd: string|null,
 *   kernelRoot: string,
 *   version: string|null,
 * }}
 */
function detectKernelReady(opts = {}) {
  const fsys = opts.fs || fs;
  const homeDir = opts.homeDir || os.homedir();
  const kernelRoot = path.resolve(opts.kernelRoot || path.join(homeDir, '.airein'));

  if (!fsys.existsSync(kernelRoot)) {
    return {
      ok: false,
      reason: REASON_KERNEL_MISSING,
      nextCmd: DEFAULT_NEXT_CMD,
      kernelRoot,
      version: null,
    };
  }

  const versionPath = path.join(kernelRoot, 'VERSION');
  const hooksPath = path.join(kernelRoot, 'hooks', 'hooks.json');
  const libDir = path.join(kernelRoot, 'scripts', 'lib');

  const hasVersion = fsys.existsSync(versionPath);
  const hasHooks = fsys.existsSync(hooksPath);
  const hasLib = fsys.existsSync(libDir);

  if (!hasVersion || !hasHooks || !hasLib) {
    return {
      ok: false,
      reason: REASON_KERNEL_INCOMPLETE,
      nextCmd: DEFAULT_NEXT_CMD,
      kernelRoot,
      version: hasVersion ? readVersion(fsys, versionPath) : null,
    };
  }

  return {
    ok: true,
    reason: null,
    nextCmd: null,
    kernelRoot,
    version: readVersion(fsys, versionPath),
  };
}

function readVersion(fsys, versionPath) {
  try {
    return String(fsys.readFileSync(versionPath, 'utf8')).trim() || null;
  } catch {
    return null;
  }
}

/**
 * One-line warning for SessionStart / bridge when kernel is not ready.
 * @param {ReturnType<typeof detectKernelReady>} result
 * @returns {string|null}
 */
function formatKernelReadyWarning(result) {
  if (!result || result.ok) return null;
  const reason = result.reason || REASON_KERNEL_MISSING;
  const cmd = result.nextCmd || DEFAULT_NEXT_CMD;
  return (
    `Airein kernel not ready (${reason}). ` +
    `Plugin/skills alone are incomplete. Run: ${cmd}`
  );
}

module.exports = {
  detectKernelReady,
  formatKernelReadyWarning,
  REASON_KERNEL_MISSING,
  REASON_KERNEL_INCOMPLETE,
  DEFAULT_NEXT_CMD,
};

if (require.main === module) {
  const result = detectKernelReady();
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 1);
}
