/**
 * T06 — install-host 集成测试（P001-cross-platform · deployment §2-3 · test-plan §3.5）
 *
 * 被测：`installHost(host, {targetRoot, repoRoot, platform, dryRun}) → {written, state, errors}`
 * （`scripts/install-host.js` 编排器）。编排 K1 skill-place + K2 rule-generate + K3 hook-register
 * + 归一化入口引用 + install-state（JSON）。零 ECC 耦合；路径白名单不含 ~/.claude/。
 *
 * 6 用例（test-plan §3.5）：
 *   ① 4 宿主产物完整（skills + 规则入口 + hook 注册配置），结构符合 design §3 矩阵
 *   ② 幂等可重入（同 host 2 次 → hash 不变、无重复）
 *   ③ skill 内容单一真相源（SKILL.md hash == CC 副本 hash）
 *   ④ CDX command_windows（Windows 时）
 *   ⑤ 未知 host fail-fast
 *   ⑥ OC Stop/UserPromptSubmit 物理不可达 → 报错（不静默注册悬空 hook）
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const { describe, assertEqual, assertOk, assertContains, assertNotContains, printSummary, projectRoot } = require('./helpers');
const { installHost, uninstallHost, KNOWN_HOSTS } = require('../scripts/install-host');
const { HOST_SKILLS_DIR } = require('../scripts/lib/skill-place');
const { HOST_COMMANDS_DIR } = require('../scripts/lib/command-place');

const ROOT = projectRoot();
const COMMAND_COUNT = 16;
const COPY_OPTS = { platform: 'linux', delivery: 'copy' };
const UNIFIED_OPTS = { platform: 'linux', delivery: 'unified' };

// 每宿主产物矩阵（deployment §3 + P003 K4）—— skills dir / rules 入口 / hook 配置 / commands dir
const MATRIX = {
  cursor: { skillsDir: '.cursor/skills', rules: '.cursor/rules', hook: '.cursor/hooks.json', commandsDir: '.cursor/commands', entryFrag: 'host/cursor' },
  codex: { skillsDir: '.agents/skills', rules: 'AGENTS.md', hook: '.codex/config.toml', commandsDir: null, entryFrag: 'host/codex' },
  codebuddy: { skillsDir: '.codebuddy/skills', rules: 'CODEBUDDY.md', hook: '.codebuddy/settings.json', commandsDir: '.codebuddy/commands', entryFrag: 'host/codebuddy' },
  opencode: { skillsDir: null, rules: 'AGENTS.md', hook: 'opencode.json', commandsDir: 'commands', entryFrag: 'airein-bridge' },
};

// ── fixture helpers ───────────────────────────────────────────────
function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'install-host-')); }
function rmTmp(d) { fs.rmSync(d, { recursive: true, force: true }); }
function shaFile(p) { return crypto.createHash('sha256').update(fs.readFileSync(p, 'utf8'), 'utf8').digest('hex'); }
function exists(d, rel) { return fs.existsSync(path.join(d, ...rel.split('/'))); }
function read(d, rel) { return fs.readFileSync(path.join(d, ...rel.split('/')), 'utf8'); }
function listSkillNames(d, skillsDir) {
  const dir = path.join(d, ...skillsDir.split('/'));
  return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
}
function listCommandFiles(d, commandsDir) {
  const dir = path.join(d, ...commandsDir.split('/'));
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort() : [];
}

describe('installHost: ① 4 宿主产物完整（design §3 矩阵）', (suite) => {
  for (const host of KNOWN_HOSTS) {
    suite.test(`${host}: skills + rules 入口 + hook 配置就位 + 引用归一化入口`, () => {
      const tmp = mkTmp();
      try {
        const m = MATRIX[host];
        const { errors } = installHost(host, { targetRoot: tmp, repoRoot: ROOT, ...COPY_OPTS });

        // K1 skills（OC 零放置）
        if (m.skillsDir) {
          const names = listSkillNames(tmp, m.skillsDir);
          assertOk(names.length > 0, `${host} skills 目录非空`);
          for (const n of names) {
            assertOk(exists(tmp, `${m.skillsDir}/${n}/SKILL.md`), `${host} ${n}/SKILL.md 就位`);
          }
        } else {
          assertOk(!exists(tmp, '.opencode/skills'), `${host} 零 skill 放置`);
        }

        // K2 rules 入口（CUR 校验目录存在且有 .mdc；其他校验单文件）
        if (host === 'cursor') {
          assertOk(exists(tmp, m.rules) && fs.readdirSync(path.join(tmp, ...m.rules.split('/'))).some((f) => f.endsWith('.mdc')), 'CUR .mdc 规则就位');
        } else {
          assertOk(exists(tmp, m.rules), `${host} rules 入口 ${m.rules} 存在`);
        }

        // K3 hook 配置 + 归一化入口引用
        assertOk(exists(tmp, m.hook), `${host} hook 配置 ${m.hook} 存在`);
        const hc = read(tmp, m.hook);
        assertOk(hc.trim().length > 0, `${host} hook 配置非空`);
        assertContains(hc, m.entryFrag, `${host} hook 配置引用归一化入口`);
        // K4 commands（CDX N/A 不放置）
        if (m.commandsDir) {
          const cmds = listCommandFiles(tmp, m.commandsDir);
          assertEqual(cmds.length, COMMAND_COUNT, `${host} commands 数量 == ${COMMAND_COUNT}`);
          assertOk(exists(tmp, `${m.commandsDir}/tdd.md`), `${host} tdd.md 就位`);
        } else {
          assertOk(!exists(tmp, '.codex/commands'), `${host} 无 commands 放置`);
        }
        // M1 回归（M2 补强）：非 OC 宿主 hook 配置含真实路由 hookId，绝不被错标 run-with-flags
        if (host !== 'opencode') {
          assertContains(hc, 'session-start', `${host} hook 配置含 session-start hookId`);
          assertContains(hc, 'quality-gate', `${host} hook 配置含 quality-gate hookId`);
          assertOk(
            !/host\/(cursor|codex|codebuddy)\.js["\s]+run-with-flags/.test(hc),
            `${host} 不以 run-with-flags 作 hookId 参数`,
          );
        }
      } finally { rmTmp(tmp); }
    });
  }
});

describe('installHost: ② 幂等可重入', (suite) => {
  suite.test('cursor 连续 install 2 次 → hooks.json hash 不变 + written 条目不增', () => {
    const tmp = mkTmp();
    try {
      const r1 = installHost('cursor', { targetRoot: tmp, repoRoot: ROOT, platform: 'linux', delivery: 'copy' });
      const h1 = shaFile(path.join(tmp, '.cursor', 'hooks.json'));
      const r2 = installHost('cursor', { targetRoot: tmp, repoRoot: ROOT, platform: 'linux', delivery: 'copy' });
      const h2 = shaFile(path.join(tmp, '.cursor', 'hooks.json'));
      assertEqual(h1, h2, '二次 install hooks.json hash 不变');
      assertEqual(r2.written.length, r1.written.length, 'written 条目数不变（无重复注册）');
      assertEqual(r2.state.files.length, r1.state.files.length, 'install-state files 数稳定');
    } finally { rmTmp(tmp); }
  });
});

describe('installHost: ③ skill 单一真相源（SKILL.md hash == CC 副本）', (suite) => {
  for (const host of ['cursor', 'codex', 'codebuddy']) {
    suite.test(`${host}: 每个 SKILL.md 逐字节等价真相源`, () => {
      const tmp = mkTmp();
      try {
        installHost(host, { targetRoot: tmp, repoRoot: ROOT, platform: 'linux', delivery: 'copy' });
        const m = MATRIX[host];
        const names = listSkillNames(tmp, m.skillsDir);
        for (const n of names) {
          const ccHash = shaFile(path.join(ROOT, 'skills', n, 'SKILL.md'));
          const destHash = shaFile(path.join(tmp, ...`${m.skillsDir}/${n}/SKILL.md`.split('/')));
          assertEqual(ccHash, destHash, `${host} ${n}/SKILL.md hash == CC 副本`);
        }
      } finally { rmTmp(tmp); }
    });
  }
});

describe('installHost: ③b command 单一真相源（*.md hash == 仓库 commands/ 副本）', (suite) => {
  for (const host of ['cursor', 'codebuddy', 'opencode']) {
    suite.test(`${host}: 每个 command.md 逐字节等价真相源`, () => {
      const tmp = mkTmp();
      try {
        installHost(host, { targetRoot: tmp, repoRoot: ROOT, platform: 'linux', delivery: 'copy' });
        const m = MATRIX[host];
        const files = listCommandFiles(tmp, m.commandsDir);
        for (const f of files) {
          const ccHash = shaFile(path.join(ROOT, 'commands', f));
          const destHash = shaFile(path.join(tmp, ...`${m.commandsDir}/${f}`.split('/')));
          assertEqual(ccHash, destHash, `${host} ${f} hash == 仓库 commands/ 副本`);
        }
      } finally { rmTmp(tmp); }
    });
  }
});

describe('installHost: ④ CDX command_windows（Windows）', (suite) => {
  suite.test('CDX Windows → config.toml 含 command_windows', () => {
    const tmp = mkTmp();
    try {
      installHost('codex', { targetRoot: tmp, repoRoot: ROOT, platform: 'windows' });
      const toml = read(tmp, '.codex/config.toml');
      assertContains(toml, 'command_windows', 'Windows 含 command_windows 字段');
    } finally { rmTmp(tmp); }
  });

  suite.test('CDX Linux → config.toml 不含 command_windows', () => {
    const tmp = mkTmp();
    try {
      installHost('codex', { targetRoot: tmp, repoRoot: ROOT, platform: 'linux', delivery: 'copy' });
      const toml = read(tmp, '.codex/config.toml');
      assertNotContains(toml, 'command_windows', 'Linux 不含 command_windows');
    } finally { rmTmp(tmp); }
  });
});

describe('installHost: ⑤ 未知 host fail-fast', (suite) => {
  suite.test('未知 host 抛错（不静默跳过）', () => {
    let threw = false;
    try { installHost('gemini', { targetRoot: '/tmp/airein-x', repoRoot: ROOT, platform: 'linux', delivery: 'copy' }); } catch { threw = true; }
    assertOk(threw, '未知 host 抛错');
  });
});

describe('installHost: ⑥ OC Stop/UserPromptSubmit 物理不可达 → 报错', (suite) => {
  suite.test('OC errors 含 Stop/UserPromptSubmit N/A 提示（不注册悬空 hook）', () => {
    const tmp = mkTmp();
    try {
      const { errors } = installHost('opencode', { targetRoot: tmp, repoRoot: ROOT, platform: 'linux', delivery: 'copy' });
      const all = errors.join('\n');
      assertOk(all.includes('Stop') || all.includes('UserPromptSubmit'), 'errors 含 N/A 事件提示');
      assertOk(all.toLowerCase().includes('n/a') || all.includes('不可达'), 'errors 标注 N/A / 不可达');
      // opencode.json 不含 OC 不支持事件的注册（session.idle = Stop 映射）
      const oc = read(tmp, 'opencode.json');
      assertNotContains(oc, 'session.idle', 'OC 不注册 Stop(session.idle) 悬空 hook');
    } finally { rmTmp(tmp); }
  });
});

describe('installHost: ⑦ OC bridge.ts 实体落盘 + AIREIN_ROOT 注入（design §6.3 · T08）', (suite) => {
  suite.test('OC install → .opencode/plugin/airein-bridge.ts 落盘 + 占位符替换为 repoRoot 正斜杠', () => {
    const tmp = mkTmp();
    try {
      installHost('opencode', { targetRoot: tmp, repoRoot: ROOT, platform: 'linux', delivery: 'copy' });
      const bridgePath = '.opencode/plugin/airein-bridge.ts';
      assertOk(exists(tmp, bridgePath), 'bridge.ts 落盘 .opencode/plugin/');
      const bridge = read(tmp, bridgePath);
      const rootPosix = ROOT.replace(/\\/g, '/');
      assertContains(bridge, rootPosix, 'bridge.ts 含注入 AIREIN_ROOT 正斜杠绝对路径');
      assertNotContains(bridge, '__AIREIN_ROOT__', 'bridge.ts 占位符 __AIREIN_ROOT__ 已全替换');
      // 源占位符保留（install 只改副本不改源——源是仓库真相，多次 install 可重渲染）
      const bridgeSrc = fs.readFileSync(path.join(ROOT, 'opencode', 'bridge.ts'), 'utf8');
      assertContains(bridgeSrc, '__AIREIN_ROOT__', '源 bridge.ts 占位符保留（install 不改源）');
    } finally { rmTmp(tmp); }
  });

  suite.test('OC bridge.ts 幂等（二次 install hash 不变）', () => {
    const tmp = mkTmp();
    try {
      installHost('opencode', { targetRoot: tmp, repoRoot: ROOT, platform: 'linux', delivery: 'copy' });
      const h1 = shaFile(path.join(tmp, ...'.opencode/plugin/airein-bridge.ts'.split('/')));
      installHost('opencode', { targetRoot: tmp, repoRoot: ROOT, platform: 'linux', delivery: 'copy' });
      const h2 = shaFile(path.join(tmp, ...'.opencode/plugin/airein-bridge.ts'.split('/')));
      assertEqual(h1, h2, '二次 install bridge.ts hash 不变（同 repoRoot → 同注入）');
    } finally { rmTmp(tmp); }
  });

  suite.test('OC bridge.ts 走 written + manifest（uninstall 据 hash 删）', () => {
    const tmp = mkTmp();
    try {
      const { written } = installHost('opencode', { targetRoot: tmp, repoRoot: ROOT, platform: 'linux', delivery: 'copy' });
      const bridgeEntry = written.find((w) => w.path === '.opencode/plugin/airein-bridge.ts');
      assertOk(bridgeEntry && bridgeEntry.kind === 'opencode-bridge', 'written 含 bridge.ts 条目 (kind=opencode-bridge)');
      uninstallHost('opencode', { targetRoot: tmp });
      assertOk(!exists(tmp, '.opencode/plugin/airein-bridge.ts'), 'uninstall 据 manifest 删 bridge.ts');
      assertOk(!exists(tmp, 'opencode.json'), 'uninstall 删 opencode.json');
    } finally { rmTmp(tmp); }
  });
});

describe('installHost: install 回滚（deployment §8 · 中途失败回滚已写文件）', (suite) => {
  suite.test('K3 抛错（hooks.json 缺失）→ K1 已写 skill 文件回滚 + 无 state', () => {
    const tmpRepo = mkTmp();
    const tmpTarget = mkTmp();
    try {
      // fixture：repoRoot 有合法 skills（K1 成功写盘）但无 hooks/hooks.json（K3 readFileSync 抛错）
      fs.mkdirSync(path.join(tmpRepo, 'skills', 'demo-skill'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpRepo, 'skills', 'demo-skill', 'SKILL.md'),
        '---\nname: demo-skill\ndescription: demo\n---\n# demo\n',
      );
      let threw = null;
      try {
        installHost('cursor', { targetRoot: tmpTarget, repoRoot: tmpRepo, platform: 'linux', delivery: 'copy' });
      } catch (e) { threw = e; }
      assertOk(threw, 'installHost 应抛错（hooks.json 缺失）');
      // deployment §8 line 119：install 中途失败 → 已写文件回滚
      assertOk(!exists(tmpTarget, '.cursor/skills/demo-skill/SKILL.md'), '回滚：K1 skill 文件已删');
      assertOk(!exists(tmpTarget, '.airein-install-state.json'), '回滚：无 install-state 残留');
    } finally { rmTmp(tmpRepo); rmTmp(tmpTarget); }
  });
});

describe('uninstallHost: hash drift 保护 + --force', (suite) => {
  suite.test('install 后改动 manifest 文件 → 默认 uninstall 抛 hash mismatch', () => {
    const tmp = mkTmp();
    try {
      installHost('cursor', { targetRoot: tmp, repoRoot: ROOT, platform: 'linux', delivery: 'copy' });
      const st = JSON.parse(read(tmp, '.airein-install-state.json'));
      const rule = st.files.find((f) => f.path.endsWith('.mdc'));
      assertOk(rule, 'manifest 含 .mdc 规则');
      fs.appendFileSync(path.join(tmp, ...rule.path.split('/')), '\n# user edit\n');
      let threw = false;
      try {
        uninstallHost('cursor', { targetRoot: tmp });
      } catch (err) {
        threw = true;
        assertContains(err.message, 'hash mismatch', '默认拒绝删已改动文件');
      }
      assertOk(threw, 'hash mismatch 应 throw');
      assertOk(exists(tmp, '.airein-install-state.json'), '失败时 manifest 保留');
    } finally { rmTmp(tmp); }
  });

  suite.test('install 后改动 manifest 文件 → uninstall --force 仍删除', () => {
    const tmp = mkTmp();
    try {
      installHost('cursor', { targetRoot: tmp, repoRoot: ROOT, platform: 'linux', delivery: 'copy' });
      const st = JSON.parse(read(tmp, '.airein-install-state.json'));
      const rule = st.files.find((f) => f.path.endsWith('.mdc'));
      fs.appendFileSync(path.join(tmp, ...rule.path.split('/')), '\n# user edit\n');
      const res = uninstallHost('cursor', { targetRoot: tmp, force: true });
      assertOk(res.removed.includes(rule.path), 'force 删除 drift 文件');
      assertOk(res.warnings.length > 0, 'force 记录 warnings');
      assertOk(!exists(tmp, '.airein-install-state.json'), 'force 后 manifest 已删');
    } finally { rmTmp(tmp); }
  });
});

describe('uninstallHost: 清空目录外壳（deployment §8 · 不残留空壳）', (suite) => {
  suite.test('install cursor → uninstall → airein 创建的空目录外壳清理', () => {
    const tmp = mkTmp();
    try {
      installHost('cursor', { targetRoot: tmp, repoRoot: ROOT, platform: 'linux', delivery: 'copy' });
      assertOk(exists(tmp, '.cursor'), 'install 后 .cursor/ 存在');
      uninstallHost('cursor', { targetRoot: tmp });
      assertOk(!exists(tmp, '.airein-install-state.json'), 'uninstall 后 state 已删');
      // deployment §8：清理该宿主产物——airein 创建的空目录外壳应一并清掉
      assertOk(!exists(tmp, '.cursor'), 'uninstall 后 .cursor/ 空目录外壳已删');
    } finally { rmTmp(tmp); }
  });

  suite.test('uninstall 不碰用户其他文件（含非空父目录保留）', () => {
    const tmp = mkTmp();
    try {
      installHost('codebuddy', { targetRoot: tmp, repoRoot: ROOT, platform: 'linux', delivery: 'copy' });
      // 模拟用户在 .codebuddy/ 下放了自有文件
      fs.writeFileSync(path.join(tmp, '.codebuddy', 'user-keep.txt'), 'mine');
      uninstallHost('codebuddy', { targetRoot: tmp });
      assertOk(exists(tmp, '.codebuddy/user-keep.txt'), '用户文件保留');
      assertOk(exists(tmp, '.codebuddy'), '.codebuddy/ 因含用户文件而保留（非空）');
    } finally { rmTmp(tmp); }
  });
});

describe('installHost: install-state 写盘 + ~/.claude/ 隔离', (suite) => {
  suite.test('写 .airein-install-state.json（host + files[]）', () => {
    const tmp = mkTmp();
    try {
      installHost('cursor', { targetRoot: tmp, repoRoot: ROOT, platform: 'linux', delivery: 'copy' });
      assertOk(exists(tmp, '.airein-install-state.json'), 'install-state 存在');
      const st = JSON.parse(read(tmp, '.airein-install-state.json'));
      assertEqual(st.host, 'cursor', 'state.host');
      assertEqual(st.platform, 'linux', 'state.platform');
      assertOk(Array.isArray(st.files) && st.files.length > 0, 'state.files 非空');
      for (const f of st.files) {
        assertOk(typeof f.path === 'string' && typeof f.hash === 'string', 'state 每条含 path+hash');
      }
    } finally { rmTmp(tmp); }
  });

  suite.test('written 路径白名单：永不落 .claude/', () => {
    const tmp = mkTmp();
    try {
      const { written } = installHost('codebuddy', { targetRoot: tmp, repoRoot: ROOT, platform: 'linux', delivery: 'copy' });
      assertOk(written.length > 0, '有产物');
      for (const w of written) {
        assertNotContains(w.path, '.claude/', `产物路径不含 .claude/: ${w.path}`);
      }
    } finally { rmTmp(tmp); }
  });
});

describe('installHost: ⑧ Bug A/B 集成回归（command 入口可达 + node 可执行 · 真机 smoke 发现）', (suite) => {
  // Bug A：install 注入的入口绝对路径必须真实存在（非 $VAR 悬空——曾用 $CURSOR_PROJECT_DIR，
  //       运行时指用户项目而非仓库 → 入口不可达）。Bug B：入口必须可被 node 解析（曾用 bash 启
  //       node-shebang 脚本 → bash 读 JS 当 shell，语法错 fail-open，比报错更危险）。
  // 入口路径在 JSON（cursor/cb：JSON.stringify 把 command 内的 " 转义为 \"）或 TOML（codex：
  // 原样双引号）里都以正斜杠绝对路径出现；匹配「非空白/非引号/非反斜杠字符 + 入口相对路径」
  // 即可跨格式提取完整入口绝对路径（不受 JSON 转义引号干扰）。
  const ENTRY_RE = /([^\s"\\]+\/scripts\/hooks\/host\/(cursor|codex|codebuddy)\.js)/;
  for (const host of ['cursor', 'codex', 'codebuddy']) {
    suite.test(`${host}: hook command 入口 fs.existsSync（Bug A）+ node --check exit 0（Bug B）`, () => {
      const tmp = mkTmp();
      try {
        installHost(host, { targetRoot: tmp, repoRoot: ROOT, platform: 'linux', delivery: 'copy' });
        const hc = read(tmp, MATRIX[host].hook);
        const match = hc.match(ENTRY_RE);
        assertOk(match, `${host} hook 配置含入口绝对路径`);
        const entry = match[1];
        // Bug A：入口可达（install 注入仓库绝对路径，非运行时 $VAR 悬空）
        assertOk(!entry.includes('$'), `${host} 入口不含 $ 变量（Bug A）`);
        assertOk(fs.existsSync(entry), `${host} 入口存在（Bug A）：${entry}`);
        // Bug B：入口是合法 node 脚本（node --check exit 0；bash 读 JS 会语法错 fail-open）
        const chk = spawnSync(process.execPath, ['--check', entry], { encoding: 'utf8' });
        assertEqual(chk.status, 0, `${host} 入口 node --check exit 0（Bug B）：${chk.stderr || ''}`);
      } finally { rmTmp(tmp); }
    });
  }
});

describe('installHost: delivery unified', (suite) => {
  suite.test('cursor unified: skills/commands 为软链，rules 仍为 .mdc 文件', () => {
    const tmp = mkTmp();
    try {
      installHost('cursor', { targetRoot: tmp, repoRoot: ROOT, ...UNIFIED_OPTS });
      const skillsPath = path.join(tmp, '.cursor', 'skills');
      const commandsPath = path.join(tmp, '.cursor', 'commands');
      assertOk(fs.lstatSync(skillsPath).isSymbolicLink(), 'skills symlink');
      assertOk(fs.lstatSync(commandsPath).isSymbolicLink(), 'commands symlink');
      assertOk(fs.existsSync(path.join(skillsPath, 'tdd-workflow', 'SKILL.md')), 'skill via link');
      assertOk(
        fs.readdirSync(path.join(tmp, '.cursor', 'rules')).some((f) => f.endsWith('.mdc')),
        'rules mdc files',
      );
    } finally { rmTmp(tmp); }
  });

  suite.test('cursor hooks merge 保留用户 hook', () => {
    const tmp = mkTmp();
    try {
      fs.mkdirSync(path.join(tmp, '.cursor'), { recursive: true });
      fs.writeFileSync(path.join(tmp, '.cursor', 'hooks.json'), JSON.stringify({
        version: 1,
        hooks: { preToolUse: [{ type: 'command', command: 'echo user-hook' }] },
      }, null, 2));
      installHost('cursor', { targetRoot: tmp, repoRoot: ROOT, ...COPY_OPTS });
      const cfg = JSON.parse(read(tmp, '.cursor/hooks.json'));
      const cmds = (cfg.hooks.preToolUse || []).map((h) => h.command);
      assertOk(cmds.some((c) => c.includes('user-hook')), 'user hook kept');
      assertOk(cmds.some((c) => c.includes('host/cursor.js')), 'airein hook added');
    } finally { rmTmp(tmp); }
  });
});

process.exit(printSummary());
