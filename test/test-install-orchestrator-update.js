/**
 * test-install-orchestrator-update.js — P004 update 自升级 + 用法说明
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  assertEqual,
  assertOk,
  assertContains,
  assertNotContains,
  printSummary,
  projectRoot,
} = require('./helpers');
const {
  update,
  resolveUpdateSource,
  syncKernelFromSource,
  printUsage,
  runPostUpdateMaintenance,
  KERNEL_ENTRY_RELPATHS,
} = require('../scripts/lib/install-orchestrator');
const { writeProfile, defaultProfile, upsertHost } = require('../scripts/lib/install-profile');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-orch-upd-'));
const PR = projectRoot();

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

function seedMinimalKernel(dir, version, entryTag) {
  for (const d of ['scripts', 'hooks', 'rules', 'skills', 'commands', 'templates', 'docs', 'opencode']) {
    const src = path.join(PR, d);
    if (fs.existsSync(src)) copyDir(src, path.join(dir, d));
  }
  fs.writeFileSync(path.join(dir, 'VERSION'), version);
  fs.writeFileSync(path.join(dir, 'airein'), `#!/bin/bash\necho ${entryTag}\n`);
}

function run() {
  const srcA = path.join(TMP, 'src-a');
  const srcB = path.join(TMP, 'src-b');
  seedMinimalKernel(srcA, '2.01', 'old-entry');
  seedMinimalKernel(srcB, '2.02', 'new-entry');
  fs.writeFileSync(path.join(srcB, 'setup-airein.sh'), '# legacy\n');

  const kernel = path.join(TMP, 'kernel');
  copyDir(srcA, kernel);
  const home = path.join(TMP, 'home');
  fs.mkdirSync(home, { recursive: true });
  const profile = defaultProfile(kernel);
  upsertHost(profile, { id: 'cursor', platform: 'linux' });
  writeProfile(kernel, profile);

  const explicit = resolveUpdateSource({
    kernelRoot: kernel,
    sourceDir: srcB,
  });
  assertEqual(path.resolve(explicit.sourceDir), path.resolve(srcB), 'explicit sourceDir');

  let cloneCalled = false;
  const fakeClone = () => {
    cloneCalled = true;
    const d = path.join(TMP, 'cloned');
    copyDir(srcB, d);
    return {
      sourceDir: d,
      version: '2.02',
      cleanup: () => {},
      cleanupDir: '',
    };
  };
  const resolved = resolveUpdateSource({
    kernelRoot: kernel,
    scriptDir: kernel,
    cloneFn: fakeClone,
  });
  assertOk(cloneCalled, 'update without --source should clone');
  assertEqual(resolved.version, '2.02', 'clone version');

  const dest = path.join(TMP, 'sync-target');
  syncKernelFromSource(srcB, dest);
  assertOk(fs.existsSync(path.join(dest, 'VERSION')), 'sync copied VERSION');
  assertEqual(
    fs.readFileSync(path.join(dest, 'airein'), 'utf8').trim(),
    '#!/bin/bash\necho new-entry',
    'entry script updated last phase',
  );
  assertOk(
    KERNEL_ENTRY_RELPATHS.every((rel) => fs.existsSync(path.join(dest, rel))),
    'entry rel paths exist after sync',
  );

  const chunks = [];
  printUsage({ write: (s) => chunks.push(s) });
  const help = chunks.join('');
  assertContains(help, 'bash ./airein setup', 'usage uses repo-relative ./airein');
  assertContains(help, 'verify-airein.sh --full', 'usage recommends --full verify');
  assertContains(help, 'airein update', 'usage mentions update');
  assertContains(help, '--hosts claude-code,cursor', 'usage mentions hosts example');
  assertContains(help, 'update --source', 'usage mentions offline update');
  assertNotContains(help, 'setup-airein.sh', 'usage must not reference removed scripts');

  return update({
    homeDir: home,
    kernelRoot: kernel,
    sourceDir: srcB,
    skipVerify: true,
    skipClean: true,
  }).then((upd) => {
    assertEqual(upd.ok, true, 'update ok');
    assertEqual(fs.readFileSync(path.join(kernel, 'VERSION'), 'utf8').trim(), '2.02', 'kernel version');
    assertOk(fs.existsSync(path.join(kernel, 'setup-airein.sh')), 'sync copied legacy file before clean');
    assertEqual(
      fs.readFileSync(path.join(kernel, 'airein'), 'utf8').includes('new-entry'),
      true,
      'kernel entry script refreshed',
    );

    runPostUpdateMaintenance(kernel, home, profile, {
      skipVerify: true,
      execFn: (cmd) => {
        if (cmd.includes('clean-airein.sh')) {
          for (const f of ['setup-airein.sh', 'update-airein.sh']) {
            const p = path.join(kernel, f);
            if (fs.existsSync(p)) fs.unlinkSync(p);
          }
        }
      },
    });
    assertOk(!fs.existsSync(path.join(kernel, 'setup-airein.sh')), 'clean removed legacy script');

    let maintenanceRan = { clean: false, verify: false };
    runPostUpdateMaintenance(kernel, home, profile, {
      execFn: (cmd) => {
        if (cmd.includes('clean-airein.sh')) maintenanceRan.clean = true;
        if (cmd.includes('verify-airein.sh') && cmd.includes('--full')) maintenanceRan.verify = true;
      },
    });
    assertOk(maintenanceRan.clean, 'maintenance runs clean');
    assertOk(maintenanceRan.verify, 'maintenance runs verify');
  });
}

run()
  .then(() => process.exit(printSummary()))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
