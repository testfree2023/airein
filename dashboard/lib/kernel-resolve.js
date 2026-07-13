'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function pathExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function isKernelRoot(dir) {
  return pathExists(path.join(dir, 'scripts', 'lib', 'utils.js'));
}

/**
 * Resolve airein kernel root for ~/.airein/dashboard installs.
 * Priority: AIREIN_KERNEL env → dashboard/config.json → parent dir (..) → ~/.airein → ~/.claude
 * @param {string} dashboardDir - Absolute path to ~/.airein/dashboard (where server.js lives)
 * @returns {string}
 */
function resolveKernelRoot(dashboardDir) {
  const home = os.homedir();
  const candidates = [];

  if (process.env.AIREIN_KERNEL) candidates.push(process.env.AIREIN_KERNEL);
  if (process.env.AIREIN_ROOT) candidates.push(process.env.AIREIN_ROOT);

  const configPath = path.join(dashboardDir, 'config.json');
  if (pathExists(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (cfg.kernelRoot && typeof cfg.kernelRoot === 'string') {
        const expanded = cfg.kernelRoot.startsWith('~/')
          ? path.join(home, cfg.kernelRoot.slice(2))
          : cfg.kernelRoot;
        candidates.push(expanded);
      }
    } catch { /* ignore malformed config */ }
  }

  candidates.push(path.resolve(dashboardDir, '..'));
  candidates.push(path.join(home, '.airein'));
  candidates.push(path.join(home, '.claude'));

  const seen = new Set();
  for (const raw of candidates) {
    if (!raw) continue;
    const root = path.resolve(raw);
    if (seen.has(root)) continue;
    seen.add(root);
    if (isKernelRoot(root)) return root;
  }

  const tried = [...seen].join('\n  - ');
  throw new Error(
    'Dashboard: cannot find airein kernel (scripts/lib/utils.js).\n' +
    `Tried:\n  - ${tried}\n` +
    'Fix: bash ~/.airein/scripts/dashboard/install-dashboard.sh <airein-src> --with-dashboard\n' +
    'Or: export AIREIN_KERNEL=~/.airein before starting dashboard.',
  );
}

module.exports = {
  resolveKernelRoot,
  isKernelRoot,
};
