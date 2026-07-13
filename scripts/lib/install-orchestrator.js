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
  readDelivery,
  DEFAULT_DELIVERY,
} = require('./install-profile');
const { registerCc, unregisterCc } = require('./cc-register');
const { installHost, uninstallHost } = require('../install-host');
const { normalizeDelivery } = require('./asset-delivery');

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

function cloneRepoToTemp(repoUrl, opts = {}) {
  const execFn = opts.execFn || execSync;
  const log = opts.log || (() => {});
  const branch = opts.branch || '';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-update-'));
  const cloneDest = path.join(tmp, 'airein');
  const branchArg = branch ? `--branch "${branch}" ` : '';
  log('📥 正在从 GitHub 拉取 airein 源码（git clone，网络慢时可能需 1–3 分钟）...');
  log(`   仓库: ${repoUrl}${branch ? ` · 分支: ${branch}` : ' · 默认分支（通常为 main）'}`);
  log('   （feat 分支未合并前请用: airein update --source <本地仓库路径>）');
  try {
    execFn(
      `git clone --depth 1 ${branchArg}--progress "${repoUrl}" "${cloneDest}"`,
      { stdio: opts.stdio || 'inherit' },
    );
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
  const kernelRoot = path.resolve(opts.kernelRoot || getDefaultKernelRoot(opts.homeDir));
  const scriptDir = opts.scriptDir ? path.resolve(opts.scriptDir) : path.resolve(__dirname, '..', '..');
  // 外部 checkout（与内核目录不同）→ 直用
  if (isAireinSource(scriptDir) && scriptDir !== kernelRoot) {
    return { sourceDir: scriptDir, version: readVersion(scriptDir), cleanup: () => {} };
  }
  // 禁止 scriptDir === kernelRoot 自指空转（缺 rules / 旧 verify 等无法自愈）→ git clone
  const cloneFn = opts.cloneFn || (() => cloneRepoToTemp(REPO_HTTPS, {
    execFn: opts.execSync,
    log: opts.log,
    branch: opts.branch,
    stdio: opts.stdio,
  }));
  return cloneFn();
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
  const cloneFn = opts.cloneFn || (() => cloneRepoToTemp(REPO_HTTPS, {
    execFn: opts.execSync,
    log: opts.log,
    branch: opts.branch,
    stdio: opts.stdio,
  }));
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
  const log = opts.log || (() => {});
  const results = [];
  const shellOpts = { ...opts, stdio: opts.stdio || 'inherit' };
  if (opts.skipClean !== true) {
    const clean = path.join(kernelRoot, 'scripts', 'update', 'clean-airein.sh');
    log('🧹 清理废弃文件 (clean-airein.sh)...');
    results.push({
      step: 'clean',
      ...runShellScript(clean, [kernelRoot], shellOpts),
    });
    log('   ✅ clean 完成');
  }
  if (opts.skipVerify !== true) {
    const verify = path.join(kernelRoot, 'scripts', 'update', 'verify-airein.sh');
    log('🔍 完整性校验 (verify-airein.sh --full)...');
    results.push({
      step: 'verify-full',
      ...runShellScript(verify, ['--full', '--home', homeDir, '--kernel', kernelRoot], shellOpts),
    });
    log('   ✅ verify 完成');
  }
  const installDash = path.join(kernelRoot, 'scripts', 'dashboard', 'install-dashboard.sh');
  if (opts.skipDashboard !== true && fs.existsSync(installDash)) {
    log('🖥️  同步 Dashboard (~/.airein/dashboard)...');
    results.push({
      step: 'dashboard',
      ...runShellScript(installDash, [kernelRoot, '--with-dashboard'], shellOpts),
    });
    log('   ✅ Dashboard 同步完成');
  }
  return results;
}

function printUsage(out = process.stdout) {
  const lines = [
    'Airein — 统一安装 / 升级 / 卸载',
    '',
    '用法:',
    '  airein setup    [--hosts claude-code,cursor] [--yes] [--source <dir|tar.gz|zip>] [--sha256 <hex>]',
    '  airein update   [--source <dir|tar.gz|zip>] [--sha256 <hex>] [--branch <name>]',
    '  airein uninstall [--keep-kernel] [--force]',
    '',
    '常见示例:',
    '',
    '  # 首次安装（在 airein 仓库内，自动探测本机宿主）',
    '  bash ./airein setup --yes',
    '',
    '  # 仅 Claude Code',
    '  bash ./airein setup --hosts claude-code --yes',
    '',
    '  # Claude Code + Cursor 同机',
    '  bash ./airein setup --hosts claude-code,cursor --yes',
    '  bash ./airein setup --delivery copy --hosts cursor --yes   # skills/commands 拷贝模式',
    '',
    '  # 升级（在线拉取 GitHub 最新，推荐）',
    '  bash ~/.airein/airein update',
    '',
    '  # 升级（本地 feat 分支仓库，P004 真机验证推荐）',
    '  bash ~/.airein/airein update --source /path/to/airein-repo',
    '',
    '  # 升级（在线拉取指定分支）',
    '  bash ~/.airein/airein update --branch feat/p004-unified-install-orchestrator',
    '  bash ~/.airein/airein update --source airein-main.tar.gz',
    '',
    '  # 卸载（保留内核目录备查）',
    '  bash ~/.airein/airein uninstall --keep-kernel',
    '',
    '  # 卸载（manifest 文件被改动时强制清理宿主产物）',
    '  bash ~/.airein/airein uninstall --force',
    '',
    '  # 验证安装完整性（推荐：一条命令验内核 + 全部已注册宿主）',
    '  bash ~/.airein/scripts/update/verify-airein.sh --full',
    '',
    '  # 分层排查（仅当 --full 报错、需定位哪一层失败时）',
    '  bash ~/.airein/scripts/update/verify-airein.sh --kernel ~/.airein',
    '    → ① 内核层：hooks/lib/rules 真相源是否完整',
    '  bash ~/.airein/scripts/update/verify-airein.sh --cc-registration --home "$HOME" --kernel ~/.airein',
    '    → ② CC 注册层：~/.claude symlink + settings.json hooks',
    '  bash ~/.airein/scripts/update/verify-airein.sh --host cursor --root "$HOME"',
    '    → ③ Cursor 注册层：~/.cursor/ 产物（全局安装时 --root 为 $HOME）',
    '',
    '说明:',
    '  · 内核目录: ~/.airein/（skills / hooks / scripts 真相源）',
    '  · delivery: unified（软链 skills/commands）| copy（拷贝）；rules 始终 deploy；hooks 始终 merge',
    '  · CC 注册层: ~/.claude/（skills/commands 按 delivery + rules deploy + settings.json merge）',
    '  · Cursor 注册层: ~/.cursor/（skills/commands 按 delivery + rules .mdc + hooks.json merge）',
    '  · update 后自动跑 verify --full；手动复验用上面 --full 命令',
    '  · 项目迁移（老 .claude 结构）: node ~/.airein/scripts/migrate-project-to-airein.js',
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

function normalizeDeliveryArg(value) {
  if (!value) return null;
  return normalizeDelivery(value);
}

function registerHost(hostId, opts) {
  const { kernelRoot, homeDir, platform, dryRun, delivery } = opts;
  const mode = delivery || DEFAULT_DELIVERY;
  if (hostId === 'claude-code') {
    return registerCc({ kernelRoot, homeDir, dryRun, delivery: mode });
  }
  if (hostId === 'cursor') {
    if (dryRun) {
      return { ok: true, written: [{ kind: 'cursor', dryRun: true, delivery: mode }], errors: [] };
    }
    const res = installHost('cursor', {
      repoRoot: kernelRoot,
      targetRoot: homeDir,
      platform: platform || (process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'),
      dryRun: false,
      delivery: mode,
    });
    return { ok: res.errors.length === 0, written: res.written, errors: res.errors, delivery: mode };
  }
  return { ok: false, errors: [`unsupported host: ${hostId}`] };
}

function unregisterHostRecord(hostId, opts) {
  const { kernelRoot, homeDir, dryRun, delivery, force } = opts;
  const mode = delivery || DEFAULT_DELIVERY;
  if (hostId === 'claude-code') {
    return unregisterCc({ kernelRoot, homeDir, dryRun, delivery: mode });
  }
  if (hostId === 'cursor') {
    if (dryRun) return { ok: true, removed: [] };
    try {
      const res = uninstallHost('cursor', { targetRoot: homeDir, force: force === true });
      return { ok: true, removed: res.removed, warnings: res.warnings || [] };
    } catch (err) {
      return { ok: false, errors: [err.message], removed: [] };
    }
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

  const delivery = normalizeDeliveryArg(opts.delivery) || DEFAULT_DELIVERY;

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
      delivery,
    });
    results.push({ hostId, ...r });
    if (!r.ok) {
      return { ok: false, kernelRoot, hosts, results, errors: r.errors || [] };
    }
  }

  if (!dryRun) {
    const profile = readProfile(kernelRoot) || defaultProfile(kernelRoot, { delivery });
    profile.installedVersion = pkgVer || profile.installedVersion;
    profile.installedAt = new Date().toISOString();
    profile.delivery = delivery;
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

  const installedVer = readInstalledVersion(kernelRoot);
  log('');
  log('🔄 airein update 开始');
  log(`   内核目录: ${kernelRoot}`);
  log(`   已装版本: ${installedVer || '(无 VERSION 记录)'}`);

  if (opts.source || opts.sourceDir) {
    log(`   源: ${opts.source || opts.sourceDir}（本地 --source）`);
  } else if (opts.branch) {
    log(`   源: ${REPO_HTTPS} · 分支 ${opts.branch}`);
  } else {
    log(`   源: ${REPO_HTTPS}（在线 clone 默认分支）`);
  }

  log('');
  log('① 解析升级源...');
  const resolved = resolveUpdateSource({
    ...opts,
    kernelRoot,
    homeDir,
    scriptDir: opts.scriptDir || kernelRoot,
    log,
  });
  const pkgVer = resolved.version;
  log(`   包版本: ${pkgVer || '(无 VERSION)'}`);
  if (pkgVer) {
    const guard = checkGuard({ pkgVer, installedVer });
    if (!guard.ok) throw new Error(guard.message);
    if (guard.action === 'upgrade') {
      log(`   ⬆️  升级: ${installedVer} → ${pkgVer}`);
    } else if (guard.action === 'same' && guard.message) {
      log(`   ℹ️  ${guard.message}`);
    } else if (guard.action === 'install') {
      log('   📦 首次写入版本号');
    }
  }

  log('');
  log('② 同步内核文件...');
  const sync = syncKernelFromSource(resolved.sourceDir, kernelRoot);
  log(`   动作: ${sync.action}${sync.action === 'sync' ? '（覆盖更新）' : sync.action === 'install' ? '（新建）' : ''}`);
  if (sync.action === 'noop' && !opts.source && !opts.sourceDir) {
    throw new Error('update: 源与内核相同且无新版本；请使用 --source 指定外部目录或检查网络 clone');
  }

  log('');
  log('③ 升级后维护 (clean + verify)...');
  runPostUpdateMaintenance(kernelRoot, homeDir, profile, { ...opts, log });

  try { resolved.cleanup(); } catch { /* noop */ }

  const delivery = readDelivery(profile);
  log('');
  log('④ 按 install-profile 刷新宿主注册层...');
  log(`   delivery: ${delivery}（skills/commands）；rules 固定 deploy；hooks 固定 merge`);
  const results = [];
  for (const h of profile.hosts) {
    log(`   · 注册 ${h.id}...`);
    const r = registerHost(h.id, { kernelRoot, homeDir, platform: h.platform, delivery });
    results.push({ hostId: h.id, ...r });
    if (r.ok) log(`     ✅ ${h.id}`);
    else log(`     ❌ ${h.id}: ${(r.errors || []).join('; ')}`);
  }

  profile.installedVersion = pkgVer || profile.installedVersion;
  profile.installedAt = new Date().toISOString();
  writeProfile(kernelRoot, profile);

  log('');
  log(`✅ airein update 完成 · 版本 ${pkgVer || installedVer || '?'}`);
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
  const force = opts.force === true;
  const delivery = profile ? readDelivery(profile) : DEFAULT_DELIVERY;
  const hosts = profile ? profile.hosts.map((h) => h.id) : [];

  const results = [];
  for (const hostId of hosts) {
    results.push({
      hostId,
      ...unregisterHostRecord(hostId, { kernelRoot, homeDir, dryRun, delivery, force }),
    });
  }

  if (!dryRun && profile) {
    const empty = defaultProfile(kernelRoot);
    empty.installedAt = new Date().toISOString();
    writeProfile(kernelRoot, empty);
  }

  if (!keepKernel && !dryRun && fs.existsSync(kernelRoot)) {
    fs.rmSync(kernelRoot, { recursive: true, force: true });
  }

  const hostOk = results.every((r) => r.ok !== false);
  return { ok: hostOk, kernelRoot, results, keepKernel, force };
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
    if (a === '--force') { flags.force = true; continue; }
    if (a === '--kernel-root') { flags.kernelRoot = argv[++i]; continue; }
    if (a === '--branch') { flags.branch = argv[++i]; continue; }
    if (a.startsWith('--branch=')) { flags.branch = a.slice(9); continue; }
    if (a === '--delivery') { flags.delivery = argv[++i]; continue; }
    if (a.startsWith('--delivery=')) { flags.delivery = a.slice(11); continue; }
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
    force: flags.force,
    kernelRoot: flags.kernelRoot,
    branch: flags.branch,
    delivery: flags.delivery,
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
    for (const res of r.results || []) {
      for (const e of res.errors || []) {
        process.stderr.write(`  ${res.hostId}: ${e}\n`);
      }
      for (const w of res.warnings || []) {
        process.stderr.write(`  ${res.hostId}: ⚠ ${w}\n`);
      }
    }
    if (!r.ok && !base.force) {
      process.stderr.write('hint: manifest 文件 install 后被改动；加 --force 强制清理宿主产物\n');
    }
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
