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

/** 升级时最后写入，避免覆盖正在执行的入口（旧 update-airein 同思路） */
const KERNEL_ENTRY_RELPATHS = [
  'airein',
  path.join('scripts', 'lib', 'install-orchestrator.js'),
];

function getDefaultKernelRoot(homeDir) {
  return path.join(homeDir || os.homedir(), DEFAULT_KERNEL_DIR);
}

function normRel(rel) {
  return rel.split(path.sep).join('/');
}

function copyFileEnsuringDir(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyTreeSkipping(srcRoot, destRoot, relPrefix, skipRels) {
  const skip = new Set(skipRels.map(normRel));
  const walk = (src, dest, rel) => {
    const st = fs.statSync(src);
    if (st.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      for (const name of fs.readdirSync(src)) {
        if (name === '.git') continue;
        const childRel = rel ? `${rel}/${name}` : name;
        walk(path.join(src, name), path.join(dest, name), childRel);
      }
      return;
    }
    if (skip.has(normRel(rel))) return;
    copyFileEnsuringDir(src, dest);
  };
  walk(srcRoot, destRoot, relPrefix || '');
}

function copyEntryFilesLast(src, dest, relPaths) {
  for (const rel of relPaths) {
    const s = path.join(src, rel);
    const d = path.join(dest, rel);
    if (fs.existsSync(s) && fs.statSync(s).isFile()) {
      copyFileEnsuringDir(s, d);
    }
  }
}

function syncKernelFromSource(sourceDir, kernelRoot) {
  const src = path.resolve(sourceDir);
  const dest = path.resolve(kernelRoot);
  if (src === dest) return { action: 'noop' };
  const existed = fs.existsSync(dest);
  if (!existed) {
    fs.mkdirSync(dest, { recursive: true });
  }
  copyTreeSkipping(src, dest, '', KERNEL_ENTRY_RELPATHS);
  copyEntryFilesLast(src, dest, KERNEL_ENTRY_RELPATHS);
  return { action: existed ? 'sync' : 'install' };
}

function readInstalledVersion(kernelRoot) {
  try {
    return readVersion(kernelRoot) || null;
  } catch {
    return null;
  }
}

function cloneRepoToTemp(repoUrl, execFn = execSync) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-update-'));
  const cloneDest = path.join(tmp, 'airein');
  try {
    execFn(`git clone --depth 1 --quiet "${repoUrl}" "${cloneDest}"`, { stdio: 'pipe' });
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error(
      `git clone 失败: ${repoUrl}。网络不畅时请从 GitHub 下载 source archive 后执行:\n` +
      `  airein update --source <dir|tar.gz|zip>`,
    );
  }
  if (!isAireinSource(cloneDest)) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error(`clone 结果不是合法 airein 源: ${cloneDest}`);
  }
  const cleanup = () => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* noop */ }
  };
  return {
    sourceDir: cloneDest,
    version: readVersion(cloneDest),
    cleanup,
    cleanupDir: tmp,
  };
}

function resolveSetupSource(opts) {
  if (opts.sourceDir && isAireinSource(opts.sourceDir)) {
    return { sourceDir: path.resolve(opts.sourceDir), version: readVersion(opts.sourceDir), cleanup: () => {} };
  }
  if (opts.source) {
    return resolveSource({
      source: opts.source,
      sha256: opts.sha256,
      scriptDir: opts.scriptDir,
    });
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

/**
 * update 专用源解析：禁止把已装内核当源（避免空转）；无 --source 时 git clone。
 * @param {object} opts
 * @param {() => object} [opts.cloneFn]
 */
function resolveUpdateSource(opts = {}) {
  if (opts.sourceDir && isAireinSource(opts.sourceDir)) {
    return {
      sourceDir: path.resolve(opts.sourceDir),
      version: readVersion(opts.sourceDir),
      cleanup: () => {},
      cleanupDir: '',
    };
  }
  if (opts.source) {
    return resolveSource({
      source: opts.source,
      sha256: opts.sha256,
      scriptDir: opts.scriptDir,
    });
  }
  const kernelRoot = path.resolve(opts.kernelRoot || getDefaultKernelRoot(opts.homeDir));
  const scriptDir = opts.scriptDir ? path.resolve(opts.scriptDir) : null;
  if (scriptDir && isAireinSource(scriptDir) && scriptDir !== kernelRoot) {
    return {
      sourceDir: scriptDir,
      version: readVersion(scriptDir),
      cleanup: () => {},
      cleanupDir: '',
    };
  }
  const cloneFn = opts.cloneFn || (() => cloneRepoToTemp(REPO_HTTPS, opts.execSync));
  return cloneFn();
}

function runShellScript(scriptPath, args, opts = {}) {
  if (!fs.existsSync(scriptPath)) {
    return { ok: false, skipped: true, reason: `missing ${scriptPath}` };
  }
  const bash = opts.bash || 'bash';
  const quoted = [scriptPath, ...args].map((a) => `"${String(a).replace(/"/g, '\\"')}"`).join(' ');
  const execFn = opts.execFn || ((cmd) => execSync(cmd, { stdio: opts.stdio || 'pipe', cwd: opts.cwd }));
  execFn(`${bash} ${quoted}`);
  return { ok: true };
}

/**
 * 升级后维护：clean 废弃文件 + verify 回归（子脚本承载细节，编排器保持薄）。
 */
function runPostUpdateMaintenance(kernelRoot, homeDir, profile, opts = {}) {
  const results = [];
  if (opts.skipClean !== true) {
    const clean = path.join(kernelRoot, 'scripts', 'update', 'clean-airein.sh');
    results.push({
      step: 'clean',
      ...runShellScript(clean, [kernelRoot], opts),
    });
  }
  if (opts.skipVerify !== true) {
    const verify = path.join(kernelRoot, 'scripts', 'update', 'verify-airein.sh');
    results.push({
      step: 'verify-kernel',
      ...runShellScript(verify, [kernelRoot], opts),
    });
    for (const h of (profile && profile.hosts) || []) {
      if (h.id === 'cursor') {
        results.push({
          step: 'verify-cursor',
          ...runShellScript(verify, ['--host', 'cursor', '--root', homeDir], opts),
        });
      }
    }
  }
  return results;
}

function printUsage(out = process.stdout) {
  const lines = [
    'Airein — 统一安装 / 升级 / 卸载',
    '',
    '用法:',
    '  airein setup    [--hosts claude-code,cursor] [--yes] [--source <dir|tar.gz|zip>] [--sha256 <hex>]',
    '  airein update   [--source <dir|tar.gz|zip>] [--sha256 <hex>]',
    '  airein uninstall [--keep-kernel]',
    '',
    '常见示例:',
    '',
    '  # 首次安装（自动探测本机宿主）',
    '  bash airein setup --yes',
    '',
    '  # 仅 Claude Code',
    '  bash airein setup --hosts claude-code --yes',
    '',
    '  # Claude Code + Cursor 同机',
    '  bash airein setup --hosts claude-code,cursor --yes',
    '',
    '  # 升级（在线拉取 GitHub 最新，推荐）',
    '  bash ~/.airein/airein update',
    '',
    '  # 升级（本地仓库 / 离线 archive）',
    '  bash ~/.airein/airein update --source /path/to/airein-repo',
    '  bash ~/.airein/airein update --source airein-main.tar.gz',
    '',
    '  # 卸载（保留内核目录备查）',
    '  bash ~/.airein/airein uninstall --keep-kernel',
    '',
    '  # 手动验证安装完整性',
    '  bash ~/.airein/scripts/update/verify-airein.sh ~/.airein',
    '  bash ~/.airein/scripts/update/verify-airein.sh --host cursor --root "$HOME"',
    '',
    '说明:',
    '  · 内核目录: ~/.airein/（skills / hooks / scripts 真相源）',
    '  · CC 注册层: ~/.claude/（symlink + settings.json hooks）',
    '  · Cursor 注册层: ~/.cursor/（skills / rules / hooks.json）',
    '  · 更多文档: README.md · docs/deployment.md',
    '',
  ];
  for (const line of lines) out.write(`${line}\n`);
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
  const log = opts.log || ((m) => process.stdout.write(`${m}\n`));
  const profile = readProfile(kernelRoot);
  if (!profile) {
    throw new Error(`no install-profile at ${kernelRoot}; run airein setup first`);
  }

  const resolved = resolveUpdateSource({
    ...opts,
    kernelRoot,
    homeDir,
    scriptDir: opts.scriptDir || kernelRoot,
  });
  const pkgVer = resolved.version;
  const installedVer = readInstalledVersion(kernelRoot);
  if (pkgVer) {
    const guard = checkGuard({ pkgVer, installedVer });
    if (!guard.ok) throw new Error(guard.message);
    if (guard.action === 'same' && guard.message) log(guard.message);
  }

  const sync = syncKernelFromSource(resolved.sourceDir, kernelRoot);
  if (sync.action === 'noop' && !opts.source && !opts.sourceDir) {
    throw new Error('update: 源与内核相同且无新版本；请使用 --source 指定外部目录或检查网络 clone');
  }

  runPostUpdateMaintenance(kernelRoot, homeDir, profile, opts);

  try { resolved.cleanup(); } catch { /* noop */ }

  const results = [];
  for (const h of profile.hosts) {
    const r = registerHost(h.id, { kernelRoot, homeDir, platform: h.platform });
    results.push({ hostId: h.id, ...r });
  }

  profile.installedVersion = pkgVer || profile.installedVersion;
  profile.installedAt = new Date().toISOString();
  writeProfile(kernelRoot, profile);

  return { ok: results.every((r) => r.ok), kernelRoot, results, version: pkgVer, sync };
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
    if (a === '--help' || a === '-h') { flags.help = true; continue; }
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

  if (flags.help || !cmd) {
    printUsage();
    process.exit(0);
  }

  if (cmd === 'setup') {
    const r = await setup(base);
    process.stdout.write(`setup: ok=${r.ok} kernel=${r.kernelRoot} hosts=${r.hosts.join(',')}\n`);
    process.exit(r.ok ? 0 : 1);
  }
  if (cmd === 'update') {
    const r = await update(base);
    process.stdout.write(`update: ok=${r.ok} kernel=${r.kernelRoot} sync=${r.sync.action}\n`);
    process.exit(r.ok ? 0 : 1);
  }
  if (cmd === 'uninstall') {
    const r = uninstall(base);
    process.stdout.write(`uninstall: ok=${r.ok} kernel=${r.kernelRoot}\n`);
    process.exit(r.ok ? 0 : 1);
  }

  process.stderr.write(`未知命令: ${cmd}\n\n`);
  printUsage(process.stderr);
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
  REPO_HTTPS,
  KERNEL_ENTRY_RELPATHS,
  getDefaultKernelRoot,
  setup,
  update,
  uninstall,
  syncKernelFromSource,
  resolveSetupSource,
  resolveUpdateSource,
  cloneRepoToTemp,
  runPostUpdateMaintenance,
  printUsage,
  registerHost,
  runCli,
};
