/**
 * T07 — cc-no-impact 回归测试（P001-cross-platform · deployment §5 硬约束 + §7 必做）
 *
 * 被测不变量：installHost/uninstallHost 全程**不读写 `~/.claude/`**（CC 领地物理隔离）。
 * 叠加多宿主 install 时，CC 的 settings.json / hooks 配置 / memory 原样保留（hash 零修改），
 * `~/.claude/` 下无新增 airein 多宿主产物（.cursor/ .codex/ .codebuddy/ .opencode/ 等）。
 *
 * 本文件是**回归门禁**（被测 installHost/uninstallHost 于 T06 已 TDD 实现），锁住跨切面
 * 隔离不变量防未来回归。fixture 构造模拟 HOME（含 .claude/ 领地），install targetRoot=HOME，
 * 断言 CC_HOME（HOME/.claude/）install 前后 snapshot 等价。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const { describe, assertEqual, assertOk, printSummary, projectRoot } = require('./helpers');
const { installHost, uninstallHost, KNOWN_HOSTS } = require('../scripts/install-host');

const ROOT = projectRoot();

// 模拟 airein 多宿主产物路径前缀（install 可能落盘的——绝不应出现在 CC_HOME 内）
const AIREIN_PRODUCT_PREFIXES = ['.cursor', '.codex', '.codebuddy', '.opencode', 'AGENTS.md', 'CODEBUDDY.md', 'opencode.json'];

function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-no-impact-')); }
function rmTmp(d) { fs.rmSync(d, { recursive: true, force: true }); }

function shaFile(p) {
  return fs.existsSync(p) ? crypto.createHash('sha256').update(fs.readFileSync(p, 'utf8'), 'utf8').digest('hex') : null;
}

/** 递归列目录下全部文件（POSIX 相对路径，目录本身不返回）。 */
function listFiles(dir, base = '') {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const abs = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    return e.isDirectory() ? listFiles(abs, rel) : [rel];
  });
}

/**
 * 构造模拟 CC_HOME（HOME/.claude/ 领地）：settings.json（含代理 env + 模型映射 + permissions +
 * hooks，模拟真实用户关键配置）+ hooks.json + memory/{MEMORY.md,session-state.md}。
 */
function seedCcHome(homeDir) {
  const ccHome = path.join(homeDir, '.claude');
  fs.mkdirSync(path.join(ccHome, 'memory'), { recursive: true });
  fs.writeFileSync(
    path.join(ccHome, 'settings.json'),
    JSON.stringify({
      env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:5721', ANTHROPIC_MODEL: 'glm-4.6' },
      permissions: { allow: ['Bash(git:*)', 'Read(*)'], deny: ['Bash(rm -rf:*)'] },
      hooks: {
        PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo cc-pre-existing-hook' }] }],
        Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo cc-stop' }] }],
      },
    }, null, 2),
  );
  fs.writeFileSync(path.join(ccHome, 'hooks.json'), JSON.stringify({ hooks: { Stop: [] } }, null, 2));
  fs.writeFileSync(path.join(ccHome, 'memory', 'MEMORY.md'), '# Project Memory Index\n- [session-state.md](session-state.md)\n');
  fs.writeFileSync(path.join(ccHome, 'memory', 'session-state.md'), '# last session\nbranch=main\n');
  return ccHome;
}

/** CC_HOME 快照：关键文件 hash + 全文件列表 + 全文件内容 hash 指纹。 */
function snapshot(ccHome) {
  const files = listFiles(ccHome).sort();
  return {
    settingsHash: shaFile(path.join(ccHome, 'settings.json')),
    hooksHash: shaFile(path.join(ccHome, 'hooks.json')),
    files,
    // 全文件内容指纹（path:hash 拼）——任何新增/删除/改动都变
    fingerprint: files.map((f) => `${f}:${shaFile(path.join(ccHome, ...f.split('/')))}`).join('|'),
  };
}

describe('cc-no-impact: ① install 前后 CC_HOME（~/.claude/）零修改（deployment §5 硬约束）', (suite) => {
  for (const host of KNOWN_HOSTS) {
    suite.test(`${host}: install 前后 settings/hooks/memory 全文件 snapshot 等价`, () => {
      const home = mkTmp();
      try {
        const ccHome = seedCcHome(home);
        const before = snapshot(ccHome);
        installHost(host, { targetRoot: home, repoRoot: ROOT, platform: 'linux' });
        const after = snapshot(ccHome);
        assertEqual(before.settingsHash, after.settingsHash, `${host}: settings.json hash 不变（代理 env/permissions/hooks 原样）`);
        assertEqual(before.hooksHash, after.hooksHash, `${host}: hooks.json hash 不变`);
        assertEqual(JSON.stringify(before.files), JSON.stringify(after.files), `${host}: CC_HOME 文件列表不变（无新增/删除）`);
        assertEqual(before.fingerprint, after.fingerprint, `${host}: CC_HOME 全文件内容指纹不变`);
        // CC_HOME 内绝不出现 airein 多宿主产物
        const leaked = after.files.filter((f) => AIREIN_PRODUCT_PREFIXES.some((p) => f === p || f.startsWith(`${p}/`)));
        assertEqual(JSON.stringify(leaked), '[]', `${host}: CC_HOME 无 airein 多宿主产物泄漏`);
      } finally { rmTmp(home); }
    });
  }
});

describe('cc-no-impact: ② written 路径白名单永不落 .claude/（installHost 硬约束）', (suite) => {
  for (const host of KNOWN_HOSTS) {
    suite.test(`${host}: 全部 written 路径不以 .claude/ 开头`, () => {
      const home = mkTmp();
      try {
        const { written } = installHost(host, { targetRoot: home, repoRoot: ROOT, platform: 'linux' });
        assertOk(written.length > 0, `${host}: 有产物（断言非空）`);
        for (const w of written) {
          assertOk(
            w.path !== '.claude' && !w.path.startsWith('.claude/'),
            `${host}: written "${w.path}" 不落 .claude/（CC 领地物理隔离）`,
          );
        }
      } finally { rmTmp(home); }
    });
  }
});

describe('cc-no-impact: ③ uninstall 同样不碰 CC_HOME（deployment §5 + §8）', (suite) => {
  suite.test('cursor install + uninstall → CC_HOME 全程 snapshot 等价', () => {
    const home = mkTmp();
    try {
      const ccHome = seedCcHome(home);
      const before = snapshot(ccHome);
      installHost('cursor', { targetRoot: home, repoRoot: ROOT, platform: 'linux' });
      uninstallHost('cursor', { targetRoot: home });
      const after = snapshot(ccHome);
      assertEqual(before.settingsHash, after.settingsHash, 'uninstall 后 settings.json hash 不变');
      assertEqual(before.hooksHash, after.hooksHash, 'uninstall 后 hooks.json hash 不变');
      assertEqual(before.fingerprint, after.fingerprint, 'uninstall 后 CC_HOME 全文件指纹不变');
    } finally { rmTmp(home); }
  });

  suite.test('codebuddy install + uninstall 在 Windows platform → CC_HOME 不变', () => {
    const home = mkTmp();
    try {
      const ccHome = seedCcHome(home);
      const before = snapshot(ccHome);
      installHost('codebuddy', { targetRoot: home, repoRoot: ROOT, platform: 'windows' });
      uninstallHost('codebuddy', { targetRoot: home });
      const after = snapshot(ccHome);
      assertEqual(before.fingerprint, after.fingerprint, 'Windows platform uninstall 后 CC_HOME 指纹不变');
    } finally { rmTmp(home); }
  });
});

process.exit(printSummary());
