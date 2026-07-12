/**
 * T10 — verify-airein.sh --host 模式冒烟回归（P001-cross-platform · deployment §6.2）
 *
 * 被测：`scripts/update/verify-airein.sh` 增加 `--host <X> [--root <dir>]` 模式——按 deployment §3
 * 产物矩阵校验指定宿主产物就位（K1 skills / K2 rules / K3 hook 配置 / 归一化入口）+ install-manifest
 * 存在。node 驱动 bash（spawnSync），用 installHost 真实 install 到 tmp 构造 fixture。
 *
 * conventions-bash §7：含逻辑分支（4 宿主矩阵）的 .sh 必须有冒烟测试——本文件补 roadmap Issues
 * 「verify 脚本自身未被测」。CC 模式（位置参数 <install_dir>）契约锁住不回归。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { describe, assertEqual, assertOk, assertContains, printSummary, projectRoot } = require('./helpers');
const { installHost, KNOWN_HOSTS } = require('../scripts/install-host');
const { registerCc } = require('../scripts/lib/cc-register');
const { writeProfile, defaultProfile, upsertHost } = require('../scripts/lib/install-profile');

const ROOT = projectRoot();
const VERIFY = path.join(ROOT, 'scripts', 'update', 'verify-airein.sh');

function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'verify-airein-')); }
function rmTmp(d) { fs.rmSync(d, { recursive: true, force: true }); }

/** 跑 verify-airein.sh，返回 {status, stdout, stderr}。 */
function runVerify(args) {
  const r = spawnSync('bash', [VERIFY, ...args], { encoding: 'utf8' });
  return { status: typeof r.status === 'number' ? r.status : -1, stdout: r.stdout || '', stderr: r.stderr || '' };
}

describe('verify-airein.sh --host: ① 4 宿主 installHost 后 verify 通过（deployment §3 矩阵）', (suite) => {
  for (const host of KNOWN_HOSTS) {
    suite.test(`${host}: installHost → verify --host ${host} --root <tmp> exit 0`, () => {
      const tmp = mkTmp();
      try {
        installHost(host, { targetRoot: tmp, repoRoot: ROOT, platform: 'linux' });
        const r = runVerify(['--host', host, '--root', tmp]);
        assertEqual(r.status, 0, `${host} verify exit 0（产物完整）\n${r.stdout}\n${r.stderr}`);
      } finally { rmTmp(tmp); }
    });
  }
});

describe('verify-airein.sh --host: ② 缺产物 → exit 1 + 报告缺失', (suite) => {
  suite.test('cursor: 删 .cursor/hooks.json → verify exit 1 + 报 hooks.json', () => {
    const tmp = mkTmp();
    try {
      installHost('cursor', { targetRoot: tmp, repoRoot: ROOT, platform: 'linux' });
      fs.rmSync(path.join(tmp, '.cursor', 'hooks.json'));
      const r = runVerify(['--host', 'cursor', '--root', tmp]);
      assertOk(r.status !== 0, '删 hooks.json → verify 非 0');
      assertContains(r.stdout + r.stderr, 'hooks.json', 'verify 报告缺失 hooks.json');
    } finally { rmTmp(tmp); }
  });

  suite.test('cursor: 删 skills 目录 → verify exit 1 + 报 skills', () => {
    const tmp = mkTmp();
    try {
      installHost('cursor', { targetRoot: tmp, repoRoot: ROOT, platform: 'linux' });
      fs.rmSync(path.join(tmp, '.cursor', 'skills'), { recursive: true, force: true });
      const r = runVerify(['--host', 'cursor', '--root', tmp]);
      assertOk(r.status !== 0, '删 skills → verify 非 0');
      assertContains(r.stdout + r.stderr, 'skills', 'verify 报告缺失 skills');
    } finally { rmTmp(tmp); }
  });

  suite.test('cursor: 删 .cursor/commands → verify exit 1 + 报 commands', () => {
    const tmp = mkTmp();
    try {
      installHost('cursor', { targetRoot: tmp, repoRoot: ROOT, platform: 'linux' });
      fs.rmSync(path.join(tmp, '.cursor', 'commands'), { recursive: true, force: true });
      const r = runVerify(['--host', 'cursor', '--root', tmp]);
      assertOk(r.status !== 0, '删 commands → verify 非 0');
      assertContains(r.stdout + r.stderr, 'commands', 'verify 报告缺失 commands');
    } finally { rmTmp(tmp); }
  });

  suite.test('opencode: 删 .opencode/plugin/airein-bridge.ts → verify exit 1', () => {
    const tmp = mkTmp();
    try {
      installHost('opencode', { targetRoot: tmp, repoRoot: ROOT, platform: 'linux' });
      fs.rmSync(path.join(tmp, ...'.opencode/plugin/airein-bridge.ts'.split('/')));
      const r = runVerify(['--host', 'opencode', '--root', tmp]);
      assertOk(r.status !== 0, '删 bridge.ts → verify 非 0');
      assertContains(r.stdout + r.stderr, 'bridge', 'verify 报告缺失 bridge.ts');
    } finally { rmTmp(tmp); }
  });
});

describe('verify-airein.sh --host: ③ 前置错误（未知 host / 缺 manifest / 缺 --root）', (suite) => {
  suite.test('未知 host → verify exit 1（不静默跳过）', () => {
    const tmp = mkTmp();
    try {
      const r = runVerify(['--host', 'gemini', '--root', tmp]);
      assertOk(r.status !== 0, '未知 host → verify 非 0');
    } finally { rmTmp(tmp); }
  });

  suite.test('缺 install-manifest → verify exit 1 + 指引先 install', () => {
    const tmp = mkTmp();
    try {
      const r = runVerify(['--host', 'cursor', '--root', tmp]);
      assertOk(r.status !== 0, '无 manifest → verify 非 0');
      assertContains(r.stdout + r.stderr, 'install', 'verify 指引先 install');
    } finally { rmTmp(tmp); }
  });
});

describe('verify-airein.sh: ④ 内核模式（--kernel / 位置参数）不回归', (suite) => {
  suite.test('bash verify-airein.sh <repo-root> 仍 exit 0（内核结构完整）', () => {
    const r = runVerify([ROOT]);
    assertEqual(r.status, 0, `内核模式 exit 0\n${r.stdout}`);
    assertContains(r.stdout, '内核层', '输出标明内核层');
  });

  suite.test('--kernel <repo-root> 与位置参数等价', () => {
    const r = runVerify(['--kernel', ROOT]);
    assertEqual(r.status, 0, '--kernel exit 0');
  });
});

describe('verify-airein.sh: ⑤ --cc-registration CC 注册层', (suite) => {
  suite.test('registerCc 后 --cc-registration exit 0', () => {
    const tmp = mkTmp();
    const home = path.join(tmp, 'home');
    fs.mkdirSync(home, { recursive: true });
    try {
      const reg = registerCc({ kernelRoot: ROOT, homeDir: home });
      assertOk(reg.ok, `registerCc ok: ${reg.errors.join('; ')}`);
      const r = runVerify(['--cc-registration', '--home', home, '--kernel', ROOT]);
      assertEqual(r.status, 0, `--cc-registration exit 0\n${r.stdout}\n${r.stderr}`);
      assertContains(r.stdout, 'CC 注册层', '输出标明 CC 注册层');
    } finally { rmTmp(tmp); }
  });

  suite.test('缺注册 → --cc-registration exit 1', () => {
    const tmp = mkTmp();
    const home = path.join(tmp, 'home');
    fs.mkdirSync(home, { recursive: true });
    try {
      const r = runVerify(['--cc-registration', '--home', home, '--kernel', ROOT]);
      assertOk(r.status !== 0, '未注册 CC → 非 0');
      assertContains(r.stdout + r.stderr, 'skills', '报告 skills 问题');
    } finally { rmTmp(tmp); }
  });
});

describe('verify-airein.sh: ⑥ --full 按 profile 验全部层', (suite) => {
  suite.test('profile 含 claude-code+cursor → --full exit 0', () => {
    const tmp = mkTmp();
    const home = path.join(tmp, 'home');
    fs.mkdirSync(home, { recursive: true });
    const profilePath = path.join(ROOT, 'install-profile.json');
    const hadProfile = fs.existsSync(profilePath);
    const backup = hadProfile ? fs.readFileSync(profilePath, 'utf8') : null;
    try {
      const reg = registerCc({ kernelRoot: ROOT, homeDir: home });
      assertOk(reg.ok, 'registerCc');
      installHost('cursor', { targetRoot: home, repoRoot: ROOT, platform: 'linux' });
      const profile = defaultProfile(ROOT);
      upsertHost(profile, { id: 'claude-code', platform: 'linux' });
      upsertHost(profile, { id: 'cursor', platform: 'linux' });
      writeProfile(ROOT, profile);
      const r = runVerify(['--full', '--home', home, '--kernel', ROOT]);
      assertEqual(r.status, 0, `--full exit 0\n${r.stdout}\n${r.stderr}`);
      assertContains(r.stdout, '完整验证通过', '汇总通过');
      assertContains(r.stdout, '内核层', '含内核层');
      assertContains(r.stdout, 'CC 注册层', '含 CC 层');
      assertContains(r.stdout, 'cursor', '含 cursor 层');
    } finally {
      if (hadProfile) fs.writeFileSync(profilePath, backup);
      else if (fs.existsSync(profilePath)) fs.unlinkSync(profilePath);
      rmTmp(tmp);
    }
  });
});

process.exit(printSummary());
