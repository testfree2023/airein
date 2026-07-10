#!/usr/bin/env node
/**
 * install-host — P001 跨宿主分发框架（design §9 · deployment §2-3 · test-plan §3.5）
 *
 * 独立轻量分发器，**零耦合 ECC**（deployment §1.2 偏差登记）。编排：
 *   K1 skill-place（T03）+ K2 rule-generate（T04）+ K3 hook-register + 归一化入口引用 + 轻量 install-manifest（JSON）
 *
 * 子命令（幂等可重入）：install / plan（=install --dry-run）/ uninstall（hash 校验删）/ verify
 *
 * 硬约束（deployment §5）：路径白名单**永不落 `.claude/`**（CC 领地物理隔离，test-cc-no-impact T07）。
 *
 * 导出 `installHost(host, opts)` 供 test-install-host.js 直接调用（不 spawn CLI）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { skillPlace, HOST_SKILLS_DIR } = require('./lib/skill-place');
const { ruleGenerate } = require('./lib/rule-generate');
const { translateHooks } = require('./lib/hook-register');
const { hashContent, hashFile, buildManifest } = require('./lib/install-manifest');

const KNOWN_HOSTS = ['cursor', 'codex', 'codebuddy', 'opencode'];
const STATE_FILE = '.airein-install-state.json';
const HOST_ENTRY_REL = {
  cursor: 'scripts/hooks/host/cursor.js',
  codex: 'scripts/hooks/host/codex.js',
  codebuddy: 'scripts/hooks/host/codebuddy.js',
  // opencode 走 bridge.ts（T08 落地），无 host/*.js 入口
};

function detectPlatform() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  return 'linux';
}

/** 硬约束：install 永不写 .claude/（deployment §5 CC 物理隔离）。 */
function assertNotClaudeDir(rel) {
  if (rel === '.claude' || rel.startsWith('.claude/')) {
    throw new Error(
      `installHost: refuse to write under .claude/ (CC isolation hard-constraint, deployment §5): ${rel}`,
    );
  }
}

function toAbs(targetRoot, rel) {
  return path.join(targetRoot, ...rel.split('/'));
}

/** Write one file (relative POSIX path) under targetRoot + record in written[]. */
function writeRel(targetRoot, rel, content, written, kind, dryRun) {
  assertNotClaudeDir(rel);
  if (!dryRun) {
    const abs = toAbs(targetRoot, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  written.push({ path: rel, hash: hashContent(content), kind });
}

/** Recursively copy a source directory tree to destRel (relative POSIX) under targetRoot. */
function copyTree(srcDir, destRel, targetRoot, written, kind, dryRun) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const e of entries) {
    const childRel = `${destRel}/${e.name}`;
    const childSrc = path.join(srcDir, e.name);
    if (e.isDirectory()) {
      copyTree(childSrc, childRel, targetRoot, written, kind, dryRun);
    } else {
      writeRel(targetRoot, childRel, fs.readFileSync(childSrc, 'utf8'), written, kind, dryRun);
    }
  }
}

/**
 * 删除 targetRoot 下由本次 install/uninstall 清空的空目录外壳（deployment §8）。
 * rmdirSync 仅删空目录——含用户其他文件的目录抛 ENOTEMPTY → 忽略保留。
 * @param {string} targetRoot
 * @param {Array<{path:string}>|string[]} filesOrPaths - POSIX 相对路径（对象取 .path）
 */
function pruneEmptyDirs(targetRoot, filesOrPaths) {
  const dirs = new Set();
  for (const item of filesOrPaths) {
    const rel = typeof item === 'string' ? item : item.path;
    const parts = rel.split('/');
    for (let i = parts.length - 1; i > 0; i -= 1) dirs.add(parts.slice(0, i).join('/'));
  }
  // 深路径优先（先删叶子目录，父目录才可能变空），rmdirSync 仅删空目录
  for (const rel of [...dirs].sort((a, b) => b.length - a.length)) {
    try { fs.rmdirSync(toAbs(targetRoot, rel)); } catch { /* 非空/不存在 → 安全保留 */ }
  }
}

/**
 * install 中途失败回滚：best-effort 删本次已写文件 + 空目录（deployment §8 line 119）。
 * 逆序删（深路径先）；不写 state；不吞原始错误（调用方 catch 再 throw）。
 */
function rollbackWritten(targetRoot, written) {
  for (const w of [...written].reverse()) {
    try {
      const abs = toAbs(targetRoot, w.path);
      if (fs.existsSync(abs)) fs.rmSync(abs, { force: true });
    } catch { /* best-effort，不阻塞 rethrow */ }
  }
  pruneEmptyDirs(targetRoot, written);
}

/**
 * Install airein into a host target (K1 + K2 + K3 + install-manifest).
 * @param {string} host - cursor/codex/codebuddy/opencode
 * @param {{targetRoot:string, repoRoot:string, platform?:string, dryRun?:boolean}} opts
 * @returns {{written:Array<{path:string,hash:string,kind:string}>, state:object, errors:string[]}}
 * @throws {Error} unknown host / missing opts / .claude/ violation
 */
function installHost(host, opts) {
  if (!KNOWN_HOSTS.includes(host)) {
    throw new Error(
      `installHost: unknown host "${host}" (known: ${KNOWN_HOSTS.join('/')}). ` +
        'See docs/plans/P001-cross-platform/deployment.md §2.',
    );
  }
  const { targetRoot, repoRoot, dryRun = false, platform = detectPlatform() } = opts || {};
  if (!targetRoot) throw new Error('installHost: opts.targetRoot required');
  if (!repoRoot) throw new Error('installHost: opts.repoRoot required (airein truth source)');

  const errors = [];
  const written = [];

  try {
    // K1 — skills（OC 零放置；其余 copy 整个 skill 目录到宿主发现路径）
    const skillRes = skillPlace(path.join(repoRoot, 'skills'), host, targetRoot);
    errors.push(...skillRes.errors);
    for (const a of skillRes.actions) {
      if (a.type !== 'copy') continue; // OC type:'none' 跳过
      const rel = `${HOST_SKILLS_DIR[host]}/${a.name}`;
      copyTree(a.src, rel, targetRoot, written, 'skill', dryRun);
    }

    // K2 — rules 入口（ruleGenerate 读真相源 rules/ + docs/ + .claude/rules/）
    const ruleRes = ruleGenerate(repoRoot, host);
    errors.push(...ruleRes.errors);
    for (const f of ruleRes.files) {
      writeRel(targetRoot, f.path, f.content, written, 'rule', dryRun);
    }

    // K3 — hook 注册配置（翻译 hooks.json → 宿主配置；OC N/A 进 errors）
    // Bug A 修复：aireinRoot = 仓库绝对路径（正斜杠），由 translateHooks 注入到各宿主 hook command
    // （node "<aireinRoot>/scripts/hooks/host/<host>.js" <hookId>）。入口脚本留在仓库不复制。
    const hooksJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'hooks', 'hooks.json'), 'utf8'));
    const hookRes = translateHooks(host, hooksJson, { platform, aireinRoot: repoRoot.replace(/\\/g, '/') });
    errors.push(...hookRes.errors);
    for (const f of hookRes.files) {
      writeRel(targetRoot, f.path, f.content, written, 'hook-config', dryRun);
    }

    // OC 独轨（design §6.3 · T08）：复制 bridge.ts 实体到 .opencode/plugin/，注入 AIREIN_ROOT
    // （正斜杠绝对路径，node spawn 跨平台接受；opencode.json 已引用此路径）。CUR/CDX/CB 的 hook
    // command 同样由上面 translateHooks 注入仓库绝对路径（aireinRoot，Bug A 修复）——入口脚本留在
    // 仓库不复制（host-runner 靠 __dirname 定位 run-with-flags）；唯 OC 的 bridge.ts 是 TS 插件实体，
    // OC 加载器需物理文件落在 .opencode/plugin/，故单独复制 + 路径注入（其他宿主无此需要）。
    if (host === 'opencode') {
      const bridgeSrc = fs.readFileSync(path.join(repoRoot, 'opencode', 'bridge.ts'), 'utf8');
      const aireinRootPosix = repoRoot.replace(/\\/g, '/'); // Windows 反斜杠 → 正斜杠（TS 字符串字面量安全）
      const bridgeRendered = bridgeSrc.replace(/__AIREIN_ROOT__/g, aireinRootPosix);
      writeRel(targetRoot, '.opencode/plugin/airein-bridge.ts', bridgeRendered, written, 'opencode-bridge', dryRun);
    }

    // install-manifest（轻量 JSON，非 SQLite；幂等——同 host 二次 install manifest 等价）
    const state = buildManifest(host, platform, written);
    if (!dryRun) {
      fs.writeFileSync(toAbs(targetRoot, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);
    }

    return { written, state, errors };
  } catch (err) {
    // deployment §8 line 119：install 中途失败 → 已写文件回滚（保持 install 前状态），不写 state
    if (!dryRun) rollbackWritten(targetRoot, written);
    throw err;
  }
}

/**
 * Uninstall a host's airein artifacts by install-manifest (hash-checked, deployment §8).
 * Refuses to delete files whose current hash ≠ recorded hash (protect user edits).
 * @returns {{removed:string[]}}
 * @throws {Error} missing state / hash mismatch / .claude/ violation
 */
function uninstallHost(host, opts) {
  const { targetRoot } = opts || {};
  if (!targetRoot) throw new Error('uninstallHost: opts.targetRoot required');
  const statePath = toAbs(targetRoot, STATE_FILE);
  if (!fs.existsSync(statePath)) {
    throw new Error(
      `uninstallHost: no install-manifest at ${statePath} — refusing blind delete (install first)`,
    );
  }
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  if (state.host && state.host !== host) {
    throw new Error(`uninstallHost: manifest host="${state.host}" ≠ requested "${host}"`);
  }
  const removed = [];
  for (const f of state.files || []) {
    assertNotClaudeDir(f.path);
    const abs = toAbs(targetRoot, f.path);
    if (!fs.existsSync(abs)) continue; // 已删（幂等）
    const cur = hashFile(abs);
    if (cur !== f.hash) {
      throw new Error(
        `uninstallHost: hash mismatch for ${f.path} (file changed since install) — manual review required`,
      );
    }
    fs.rmSync(abs, { force: true });
    removed.push(f.path);
  }
  fs.rmSync(statePath, { force: true });
  // 清理 airein 创建的空目录外壳（deployment §8）—— rmdirSync 仅删空目录，用户文件受保护
  pruneEmptyDirs(targetRoot, removed);
  return { removed };
}

/**
 * Verify a host's installed artifacts against the install-manifest.
 * @returns {{ok:boolean, errors:string[]}}
 */
function verifyHost(host, opts) {
  const { targetRoot, repoRoot } = opts || {};
  const errors = [];
  const statePath = toAbs(targetRoot, STATE_FILE);
  if (!fs.existsSync(statePath)) {
    return { ok: false, errors: [`verify: no install-manifest at ${statePath}`] };
  }
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

  for (const f of state.files || []) {
    const abs = toAbs(targetRoot, f.path);
    if (!fs.existsSync(abs)) {
      errors.push(`verify: missing ${f.path}`);
      continue;
    }
    if (hashFile(abs) !== f.hash) {
      errors.push(`verify: hash drift ${f.path}（content ≠ install-time）`);
    }
  }

  // 归一化入口脚本存在（无悬空 command）—— OC bridge.ts 由 T08 落地，此处跳过
  if (host !== 'opencode' && repoRoot) {
    const entryRel = HOST_ENTRY_REL[host];
    if (entryRel && !fs.existsSync(path.join(repoRoot, entryRel))) {
      errors.push(`verify: host entry missing in repo: ${entryRel}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// ── CLI（install / plan / uninstall / verify）─────────────────────────
function parseFlags(rest) {
  const flags = { _pos: [] };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      flags[key] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[(i += 1)] : true;
    } else {
      flags._pos.push(a);
    }
  }
  return flags;
}

function main(argv) {
  const [sub, ...rest] = argv.slice(2);
  const flags = parseFlags(rest);
  const host = flags.host;
  const repoRoot = path.resolve(__dirname, '..');
  const targetRoot = flags.root ? path.resolve(flags.root) : path.resolve(repoRoot, '..');
  const platform = flags.platform || detectPlatform();

  if (sub === 'install' || sub === 'plan') {
    if (!host) {
      process.stderr.write('error: --host <cursor|codex|codebuddy|opencode> required\n');
      process.exit(2);
    }
    const dryRun = sub === 'plan' || Boolean(flags['dry-run']);
    const res = installHost(host, { targetRoot, repoRoot, platform, dryRun });
    process.stdout.write(
      `${dryRun ? '[plan] ' : ''}host=${host} platform=${platform} written=${res.written.length} errors=${res.errors.length}\n`,
    );
    for (const e of res.errors) process.stdout.write(`  ⚠ ${e}\n`);
    process.exit(res.errors.length ? 1 : 0);
  }

  if (sub === 'uninstall') {
    if (!host) { process.stderr.write('error: --host required\n'); process.exit(2); }
    const res = uninstallHost(host, { targetRoot });
    process.stdout.write(`uninstall ${host}: removed ${res.removed.length} files\n`);
    process.exit(0);
  }

  if (sub === 'verify') {
    if (!host) { process.stderr.write('error: --host required\n'); process.exit(2); }
    const res = verifyHost(host, { targetRoot, repoRoot });
    process.stdout.write(`verify ${host}: ${res.ok ? 'OK' : `${res.errors.length} issue(s)`}\n`);
    for (const e of res.errors) process.stdout.write(`  ✗ ${e}\n`);
    process.exit(res.ok ? 0 : 1);
  }

  process.stderr.write(
    'usage: install-host.js <install|plan|uninstall|verify> --host <X> [--platform <windows|macos|linux>] [--root <dir>] [--dry-run]\n',
  );
  process.exit(2);
}

if (require.main === module) main(process.argv);

module.exports = { installHost, uninstallHost, verifyHost, KNOWN_HOSTS, detectPlatform, STATE_FILE };
