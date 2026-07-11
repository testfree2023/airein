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

describe('verify-airein.sh: ④ CC 模式（位置参数 <install_dir>）不回归', (suite) => {
  suite.test('bash verify-airein.sh <repo-root> 仍 exit 0（airein 仓库结构完整）', () => {
    const r = runVerify([ROOT]);
    assertEqual(r.status, 0, `CC 模式 exit 0（既有契约不破）\n${r.stdout}`);
  });
});

process.exit(printSummary());
