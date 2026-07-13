/**
 * test-install-orchestrator.js — P004 3.1/3.2 install-orchestrator
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { assertEqual, assert, assertOk, printSummary, projectRoot } = require('./helpers');
const {
  setup,
  update,
  uninstall,
  syncKernelFromSource,
  getDefaultKernelRoot,
  resolveSetupSource,
} = require('../scripts/lib/install-orchestrator');
const { installHost } = require('../scripts/install-host');
const { writeProfile, defaultProfile, upsertHost } = require('../scripts/lib/install-profile');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-orch-'));
const SRC = path.join(TMP, 'src');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.statSync(from).isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function seedSrc() {
  const pr = projectRoot();
  for (const d of ['scripts/lib', 'scripts/hooks', 'scripts/hooks/host', 'hooks', 'templates', 'rules', 'docs']) {
    fs.mkdirSync(path.join(SRC, d), { recursive: true });
  }
  copyDir(path.join(pr, 'skills'), path.join(SRC, 'skills'));
  copyDir(path.join(pr, 'commands'), path.join(SRC, 'commands'));
  copyDir(path.join(pr, 'rules'), path.join(SRC, 'rules'));
  fs.copyFileSync(path.join(pr, 'hooks', 'hooks.json'), path.join(SRC, 'hooks', 'hooks.json'));
  copyDir(path.join(pr, 'scripts', 'hooks'), path.join(SRC, 'scripts', 'hooks'));
  copyDir(path.join(pr, 'scripts', 'lib'), path.join(SRC, 'scripts', 'lib'));
  copyDir(path.join(pr, 'scripts', 'update'), path.join(SRC, 'scripts', 'update'));
  fs.copyFileSync(path.join(pr, 'airein'), path.join(SRC, 'airein'));
}

async function run() {
  seedSrc();

  const dest = path.join(TMP, 'k1');
  const r1 = syncKernelFromSource(SRC, dest);
  assertEqual(r1.action, 'install', 'sync install');
  assertOk(fs.existsSync(path.join(dest, 'hooks', 'hooks.json')), 'hooks copied');

  const HOME = path.join(TMP, 'home-cur');
  const KERNEL = path.join(HOME, '.airein');
  fs.mkdirSync(HOME, { recursive: true });
  const setupCur = await setup({
    homeDir: HOME,
    kernelRoot: KERNEL,
    sourceDir: SRC,
    hosts: 'cursor',
    yes: true,
  });
  assertEqual(setupCur.ok, true, 'setup cursor ok');
  assertOk(fs.existsSync(path.join(HOME, '.cursor', 'hooks.json')), 'cursor hooks');
  assertOk(fs.existsSync(path.join(KERNEL, 'install-profile.json')), 'profile');

  const home2 = path.join(TMP, 'home2');
  const kernel2 = path.join(home2, '.airein');
  fs.mkdirSync(home2, { recursive: true });
  const setupCc = await setup({
    homeDir: home2,
    kernelRoot: kernel2,
    sourceDir: SRC,
    hosts: 'claude-code',
    yes: true,
  });
  assertEqual(setupCc.ok, true, 'setup cc ok');
  assertOk(fs.existsSync(path.join(home2, '.claude', 'settings.json')), 'cc settings');

  const home3 = path.join(TMP, 'home3');
  const kernel3 = path.join(home3, '.airein');
  fs.mkdirSync(home3, { recursive: true });
  await setup({ homeDir: home3, kernelRoot: kernel3, sourceDir: SRC, hosts: 'cursor', yes: true });
  fs.writeFileSync(path.join(SRC, 'VERSION'), '2.02');
  const upd = await update({ homeDir: home3, kernelRoot: kernel3, sourceDir: SRC, scriptDir: SRC, skipVerify: true, skipClean: true });
  assertEqual(upd.ok, true, 'update ok');
  assertEqual(fs.readFileSync(path.join(kernel3, 'VERSION'), 'utf8').trim(), '2.02', 'version synced');

  const home4 = path.join(TMP, 'home4');
  const kernel4 = path.join(home4, '.airein');
  fs.mkdirSync(home4, { recursive: true });
  syncKernelFromSource(SRC, kernel4);
  installHost('cursor', { repoRoot: kernel4, targetRoot: home4, aireinRoot: kernel4.replace(/\\/g, '/') });
  const p = defaultProfile(kernel4);
  upsertHost(p, { id: 'cursor', platform: 'linux' });
  writeProfile(kernel4, p);
  const un = uninstall({ homeDir: home4, kernelRoot: kernel4, keepKernel: true });
  assertEqual(un.ok, true, 'uninstall ok');
  assertOk(fs.existsSync(kernel4), 'kernel kept');

  const home5 = path.join(TMP, 'home5');
  const kernel5 = path.join(home5, '.airein');
  fs.mkdirSync(home5, { recursive: true });
  syncKernelFromSource(SRC, kernel5);
  installHost('cursor', { repoRoot: kernel5, targetRoot: home5, platform: 'linux', delivery: 'copy' });
  const p5 = defaultProfile(kernel5);
  upsertHost(p5, { id: 'cursor', platform: 'macos' });
  writeProfile(kernel5, p5);
  const st5 = JSON.parse(fs.readFileSync(path.join(home5, '.airein-install-state.json'), 'utf8'));
  const rule5 = st5.files.find((f) => f.path.endsWith('.mdc'));
  fs.appendFileSync(path.join(home5, ...rule5.path.split('/')), '\n# drift\n');
  const un5 = uninstall({ homeDir: home5, kernelRoot: kernel5 });
  assertEqual(un5.ok, false, 'hash drift 时 ok=false');
  assertOk(!fs.existsSync(kernel5), 'hash drift 不阻塞内核删除');
  assertOk(fs.existsSync(path.join(home5, ...rule5.path.split('/'))), '未 --force 时 drift 文件保留');

  const home6 = path.join(TMP, 'home6');
  const kernel6 = path.join(home6, '.airein');
  fs.mkdirSync(home6, { recursive: true });
  syncKernelFromSource(SRC, kernel6);
  installHost('cursor', { repoRoot: kernel6, targetRoot: home6, platform: 'linux', delivery: 'copy' });
  const p6 = defaultProfile(kernel6);
  upsertHost(p6, { id: 'cursor', platform: 'macos' });
  writeProfile(kernel6, p6);
  const st6 = JSON.parse(fs.readFileSync(path.join(home6, '.airein-install-state.json'), 'utf8'));
  const rule6 = st6.files.find((f) => f.path.endsWith('.mdc'));
  fs.appendFileSync(path.join(home6, ...rule6.path.split('/')), '\n# drift\n');
  const un6 = uninstall({ homeDir: home6, kernelRoot: kernel6, force: true });
  assertEqual(un6.ok, true, 'force uninstall ok');
  assertOk(!fs.existsSync(kernel6), 'force 后内核已删');
  assertOk(!fs.existsSync(path.join(home6, '.airein-install-state.json')), 'force 后 manifest 已删');

  assertEqual(getDefaultKernelRoot(HOME), path.join(HOME, '.airein'), 'default kernel path');

  const incomplete = path.join(TMP, 'incomplete-kernel');
  fs.mkdirSync(path.join(incomplete, 'scripts', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(incomplete, 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(incomplete, 'scripts', 'lib', 'utils.js'), '//');
  fs.writeFileSync(path.join(incomplete, 'hooks', 'hooks.json'), '{}');
  let cloneCalled = false;
  const resolved = resolveSetupSource({
    kernelRoot: incomplete,
    scriptDir: incomplete,
    homeDir: TMP,
    cloneFn: () => {
      cloneCalled = true;
      return { sourceDir: SRC, version: '2.00', cleanup: () => {} };
    },
  });
  assert(cloneCalled, 'kernel 自指应走 clone 而非 noop');
  assertEqual(resolved.sourceDir, SRC, 'clone 返回外部源');
  syncKernelFromSource(resolved.sourceDir, incomplete);
  assertOk(fs.existsSync(path.join(incomplete, 'rules', '00-iron-rules.md')), 'sync 后 L0 rules 就位');
}

run()
  .then(() => process.exit(printSummary()))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
