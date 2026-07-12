/**
 * install-orchestrator — P004 统一 setup / update / uninstall 编排
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { execSync } = require('child_process');

const { resolveSource, isAireinSource, readVersion } = require('./source-resolver');
const { checkGuard } = require('./version-guard');
const { hostDetect, SELECTABLE_V1 } = require('./host-detect');
const {
  defaultProfile,
  readProfile,
  writeProfile,
  upsertHost,
} = require('./install-profile');
const { registerCc, unregisterCc } = require('./cc-register');
const { installHost, uninstallHost } = require('../install-host');

const DEFAULT_KERNEL_DIR = '.airein';
const REPO_HTTPS = 'https://github.com/testfree2023/airein.git';

function getDefaultKernelRoot(homeDir) {
  return path.join(homeDir || os.homedir(), DEFAULT_KERNEL_DIR);
}

function copyEntry(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (name === '.git') continue;
      copyEntry(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function syncKernelFromSource(sourceDir, kernelRoot) {
  const src = path.resolve(sourceDir);
  const dest = path.resolve(kernelRoot);
  if (src === dest) return { action: 'noop' };
  if (!fs.existsSync(dest)) {
    copyEntry(src, dest);
    return { action: 'install' };
  }
  copyEntry(src, dest);
  return { action: 'sync' };
}

function readInstalledVersion(kernelRoot) {
  try {
    return readVersion(kernelRoot) || null;
  } catch {
    return null;
  }
}

function resolveSetupSource(opts) {
  if (opts.sourceDir && isAireinSource(opts.sourceDir)) {
    return { sourceDir: path.resolve(opts.sourceDir), version: readVersion(opts.sourceDir), cleanup: () => {} };
  }
  if (opts.source) {
    const r = resolveSource({
      source: opts.source,
      sha256: opts.sha256,
      scriptDir: opts.scriptDir,
    });
    return r;
  }
  const scriptDir = opts.scriptDir || path.resolve(__dirname, '..', '..');
  if (isAireinSource(scriptDir)) {
    return { sourceDir: scriptDir, version: readVersion(scriptDir), cleanup: () => {} };
  }
  const kernelRoot = opts.kernelRoot || getDefaultKernelRoot(opts.homeDir);
  if (isAireinSource(kernelRoot)) {
    return { sourceDir: kernelRoot, version: readVersion(kernelRoot), cleanup: () => {} };
  }
  throw new Error('no local airein source; use --source <dir|archive> or run from airein repo');
}

function defaultSelectedHosts(detect) {
  return detect.hosts.filter((h) => h.selectable && h.detected).map((h) => h.id);
}

function parseHostsArg(str) {
  if (!str) return null;
  return str.split(',').map((s) => s.trim()).filter(Boolean);
}

function normalizeHostId(id) {
  if (id === 'cc' || id === 'claude') return 'claude-code';
  return id;
}

async function promptHosts(detect, preselected) {
  if (preselected && preselected.length) {
    return preselected.map(normalizeHostId);
  }
  const defaults = defaultSelectedHosts(detect);
  if (defaults.length === 0) return ['claude-code', 'cursor'].filter((id) => SELECTABLE_V1.has(id));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const list = detect.hosts.filter((h) => h.selectable).map((h) => `${h.id}${h.detected ? ' [detected]' : ''}`).join(', ');
  const answer = await new Promise((resolve) => {
    rl.question(`Select hosts to install (${list}) [${defaults.join(',')}]: `, (line) => {
      rl.close();
      resolve(line.trim());
    });
  });
  if (!answer) return defaults;
  return answer.split(',').map((s) => normalizeHostId(s.trim())).filter((id) => SELECTABLE_V1.has(id));
}

function hintDisabledHosts(detect, log = (m) => process.stderr.write(`${m}\n`)) {
  for (const h of detect.hosts) {
    if (h.detected && !h.selectable) {
      log(`ℹ️  ${h.id}: ${h.reason}`);
    }
  }
}

function registerHost(hostId, opts) {
  const { kernelRoot, homeDir, platform, dryRun } = opts;
  if (hostId === 'claude-code') {
    return registerCc({ kernelRoot, homeDir, dryRun });
  }
  if (hostId === 'cursor') {
    if (dryRun) {
      return { ok: true, written: [{ kind: 'cursor', dryRun: true }], errors: [] };
    }
    const res = installHost('cursor', {
      repoRoot: kernelRoot,
      targetRoot: homeDir,
      aireinRoot: kernelRoot.replace(/\\/g, '/'),
      platform: platform || (process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'),
      dryRun: false,
    });
    return { ok: res.errors.length === 0, written: res.written, errors: res.errors };
  }
  return { ok: false, errors: [`unsupported host: ${hostId}`] };
}

function unregisterHostRecord(hostId, opts) {
  const { kernelRoot, homeDir, dryRun } = opts;
  if (hostId === 'claude-code') {
    return unregisterCc({ kernelRoot, homeDir, dryRun });
  }
  if (hostId === 'cursor') {
    if (dryRun) return { ok: true, removed: [] };
    return uninstallHost('cursor', { targetRoot: homeDir });
  }
  return { ok: false, errors: [`unsupported host: ${hostId}`] };
}

/**
 * @param {object} opts
 * @returns {Promise<object>}
 */
async function setup(opts = {}) {
  const homeDir = path.resolve(opts.homeDir || os.homedir());
  const kernelRoot = path.resolve(opts.kernelRoot || getDefaultKernelRoot(homeDir));
  const dryRun = opts.dryRun === true;
  const log = opts.log || ((m) => process.stdout.write(`${m}\n`));

  const detect = hostDetect({ homeDir, pathEnv: opts.pathEnv });
  hintDisabledHosts(detect, opts.logErr || ((m) => process.stderr.write(`${m}\n`)));

  let hosts = parseHostsArg(opts.hosts);
  if (!hosts && !opts.yes) {
    hosts = await promptHosts(detect, null);
  } else if (!hosts) {
    hosts = defaultSelectedHosts(detect);
    if (hosts.length === 0) hosts = ['cursor'];
  }
  hosts = hosts.map(normalizeHostId).filter((id) => SELECTABLE_V1.has(id));

  const resolved = resolveSetupSource({ ...opts, kernelRoot, homeDir });
  const pkgVer = resolved.version;
  const installedVer = readInstalledVersion(kernelRoot);
  if (pkgVer) {
    const guard = checkGuard({ pkgVer, installedVer });
    if (!guard.ok) {
      throw new Error(guard.message);
    }
    if (guard.action === 'same' && guard.message) log(guard.message);
  }

  if (!dryRun) {
    syncKernelFromSource(resolved.sourceDir, kernelRoot);
    try { resolved.cleanup(); } catch { /* noop */ }
  }

  const results = [];
  for (const hostId of hosts) {
    const r = registerHost(hostId, {
      kernelRoot,
      homeDir,
      platform: opts.platform,
      dryRun,
    });
    results.push({ hostId, ...r });
    if (!r.ok) {
      return { ok: false, kernelRoot, hosts, results, errors: r.errors || [] };
    }
  }

  if (!dryRun) {
    const profile = readProfile(kernelRoot) || defaultProfile(kernelRoot);
    profile.installedVersion = pkgVer || profile.installedVersion;
    profile.installedAt = new Date().toISOString();
    for (const hostId of hosts) {
      upsertHost(profile, { id: hostId, platform: opts.platform });
    }
    writeProfile(kernelRoot, profile);
  }

  return { ok: true, kernelRoot, hosts, results, version: pkgVer };
}

/**
 * @param {object} opts
 * @returns {Promise<object>}
 */
async function update(opts = {}) {
  const homeDir = path.resolve(opts.homeDir || os.homedir());
  const kernelRoot = path.resolve(opts.kernelRoot || getDefaultKernelRoot(homeDir));
  const profile = readProfile(kernelRoot);
  if (!profile) {
    throw new Error(`no install-profile at ${kernelRoot}; run airein setup first`);
  }

  const resolved = resolveSetupSource({ ...opts, kernelRoot, homeDir, scriptDir: opts.scriptDir || kernelRoot });
  const pkgVer = resolved.version;
  const installedVer = readInstalledVersion(kernelRoot);
  if (pkgVer) {
    const guard = checkGuard({ pkgVer, installedVer });
    if (!guard.ok) throw new Error(guard.message);
  }

  syncKernelFromSource(resolved.sourceDir, kernelRoot);
  try { resolved.cleanup(); } catch { /* noop */ }

  const results = [];
  for (const h of profile.hosts) {
    const r = registerHost(h.id, { kernelRoot, homeDir, platform: h.platform });
    results.push({ hostId: h.id, ...r });
  }

  profile.installedVersion = pkgVer || profile.installedVersion;
  profile.installedAt = new Date().toISOString();
  writeProfile(kernelRoot, profile);

  return { ok: results.every((r) => r.ok), kernelRoot, results, version: pkgVer };
}

/**
 * @param {object} opts
 * @returns {object}
 */
function uninstall(opts = {}) {
  const homeDir = path.resolve(opts.homeDir || os.homedir());
  const kernelRoot = path.resolve(opts.kernelRoot || getDefaultKernelRoot(homeDir));
  const profile = readProfile(kernelRoot);
  const keepKernel = opts.keepKernel === true;
  const dryRun = opts.dryRun === true;
  const hosts = profile ? profile.hosts.map((h) => h.id) : [];

  const results = [];
  for (const hostId of hosts) {
    results.push({ hostId, ...unregisterHostRecord(hostId, { kernelRoot, homeDir, dryRun }) });
  }

  if (!dryRun && profile) {
    const empty = defaultProfile(kernelRoot);
    empty.installedAt = new Date().toISOString();
    writeProfile(kernelRoot, empty);
  }

  if (!keepKernel && !dryRun && fs.existsSync(kernelRoot)) {
    fs.rmSync(kernelRoot, { recursive: true, force: true });
  }

  return { ok: results.every((r) => r.ok !== false), kernelRoot, results, keepKernel };
}

function parseCliFlags(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source') { flags.source = argv[++i]; continue; }
    if (a.startsWith('--source=')) { flags.source = a.slice(9); continue; }
    if (a === '--sha256') { flags.sha256 = argv[++i]; continue; }
    if (a.startsWith('--sha256=')) { flags.sha256 = a.slice(9); continue; }
    if (a === '--hosts') { flags.hosts = argv[++i]; continue; }
    if (a.startsWith('--hosts=')) { flags.hosts = a.slice(8); continue; }
    if (a === '--yes' || a === '-y') { flags.yes = true; continue; }
    if (a === '--dry-run') { flags.dryRun = true; continue; }
    if (a === '--keep-kernel') { flags.keepKernel = true; continue; }
    if (a === '--kernel-root') { flags.kernelRoot = argv[++i]; continue; }
    if (!a.startsWith('-')) flags._.push(a);
  }
  return flags;
}

async function runCli(argv) {
  const flags = parseCliFlags(argv);
  const cmd = flags._[0];
  const scriptDir = path.resolve(__dirname, '..', '..');
  const base = {
    source: flags.source,
    sha256: flags.sha256,
    hosts: flags.hosts,
    yes: flags.yes,
    dryRun: flags.dryRun,
    keepKernel: flags.keepKernel,
    kernelRoot: flags.kernelRoot,
    scriptDir,
  };

  if (cmd === 'setup') {
    const r = await setup(base);
    process.stdout.write(`setup: ok=${r.ok} kernel=${r.kernelRoot} hosts=${r.hosts.join(',')}\n`);
    process.exit(r.ok ? 0 : 1);
  }
  if (cmd === 'update') {
    const r = await update(base);
    process.stdout.write(`update: ok=${r.ok} kernel=${r.kernelRoot}\n`);
    process.exit(r.ok ? 0 : 1);
  }
  if (cmd === 'uninstall') {
    const r = uninstall(base);
    process.stdout.write(`uninstall: ok=${r.ok} kernel=${r.kernelRoot}\n`);
    process.exit(r.ok ? 0 : 1);
  }

  process.stderr.write('usage: airein <setup|update|uninstall> [--source ...] [--hosts cc,cursor] [--yes]\n');
  process.exit(2);
}

if (require.main === module) {
  runCli(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_KERNEL_DIR,
  getDefaultKernelRoot,
  setup,
  update,
  uninstall,
  syncKernelFromSource,
  resolveSetupSource,
  registerHost,
  runCli,
};
