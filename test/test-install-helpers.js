/**
 * Test: install-helpers.sh — installer logic (node resolution + remote check)
 *
 * Covers two installer defects found in the first real deploy (2026-07-09,
 * 192.168.3.14 macOS, nvm node v22):
 *
 *   Bug 1 — node fallback list missed the nvm install dir
 *           (~/.nvm/versions/node/<ver>/bin/node). In a non-interactive
 *           SSH/cron shell (nvm not sourced), `command -v node` failed AND
 *           the hardcoded fallback (homebrew + /usr/local) missed nvm →
 *           false "Node.js 未安装" + abort.
 *   Bug 2 — legacy installer blindly `git pull`ed any existing ~/.claude/.git.
 *           A foreign harness repo was silently pulled instead of installing
 *           airein. (`is_airein_remote_url` guard retained in install-helpers.)
 *
 * Logic lives in scripts/lib/install-helpers.sh (extracted so
 * airein CLI / airein-chores.sh / merge-hooks.sh share ONE resolver and
 * the logic is unit-testable — per conventions-bash §7, scripts with logic
 * branches need smoke tests).
 *
 * Run: node test/test-install-helpers.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  describe, assertOk, assertEqual, assertContains, assertNotContains,
  projectRoot, printSummary,
} = require('./helpers');

const LIB_BASH_NATIVE = path.join(projectRoot(), 'scripts', 'lib', 'install-helpers.sh');

// ── Path conversion ────────────────────────────────────────────────
// fs uses native Windows paths; bash (Git Bash) wants /c/... /f/... form.
// Convert before passing paths INTO bash (env HOME, script args).
function toBashPath(p) {
  let s = p.replace(/\\/g, '/');
  s = s.replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase());
  return s;
}

function libExists() {
  return fs.existsSync(LIB_BASH_NATIVE);
}

// Resolve the absolute bash.exe path ONCE. Tests override PATH in the child to
// strip node off it; if we spawned the bare name `bash`, node itself would
// fail to locate bash.exe (ENOENT) under that stripped PATH. An absolute path
// decouples node's ability to spawn from the child's PATH.
function findBash() {
  try {
    const r = spawnSync('where', ['bash.exe'], { encoding: 'utf8' });
    if (r.status === 0) {
      const p = (r.stdout || '').split(/\r?\n/)[0].trim();
      if (p && fs.existsSync(p)) return p;
    }
  } catch { /* fall through */ }
  return 'bash';
}
const BASH = findBash();

// Source the lib then run a bash snippet; return captured stdout (trimmed).
function runWithLib(snippet, env) {
  const libBash = toBashPath(LIB_BASH_NATIVE);
  const r = spawnSync(BASH, ['-c', `. "${libBash}"; ${snippet}`], {
    env: env || process.env,
    encoding: 'utf8',
    timeout: 8000,
  });
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

// env with a stripped PATH (no node) and HOME pointed at a temp dir.
function strippedEnv(homeBash) {
  return { ...process.env, HOME: homeBash, PATH: '/usr/bin:/bin' };
}

// Create a fake executable `node` at the given native path (chmod 755).
function makeFakeNode(nodeNative) {
  fs.mkdirSync(path.dirname(nodeNative), { recursive: true });
  fs.writeFileSync(nodeNative, '#!/usr/bin/env bash\nexit 0\n');
  fs.chmodSync(nodeNative, 0o755);
}

function rmTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

// ═══════════════════════════════════════════════════════════════════
// Suite 1 — is_airein_remote_url (Bug 2 decision logic)
// ═══════════════════════════════════════════════════════════════════

describe('is_airein_remote_url: recognizes airein remotes', suite => {
  suite.test('lib exists at scripts/lib/install-helpers.sh', () => {
    assertOk(libExists(), 'install-helpers.sh must exist (RED until implemented)');
  });

  if (!libExists()) return; // remaining tests can't run without the lib

  const aireinUrls = [
    'git@github.com:testfree2023/airein.git',
    'https://github.com/testfree2023/airein.git',
    'https://github.com/testfree2023/airein',
    'git@github.com:testfree2023/airein',
  ];
  for (const url of aireinUrls) {
    suite.test(`matches airein remote: ${url}`, () => {
      // Pass url as $1 so quotes/special chars in the URL never collide with
      // the snippet text.
      const r = spawnSync(BASH, ['-c',
        `. "${toBashPath(LIB_BASH_NATIVE)}"; if is_airein_remote_url "$1"; then echo MATCH; else echo NOMATCH; fi`,
        'bash', url], { env: process.env, encoding: 'utf8', timeout: 8000 });
      assertEqual((r.stdout || '').trim(), 'MATCH', `should match ${url}`);
    });
  }

  const foreignUrls = [
    'git@github.com:someone/my-ai-coder.git',
    'https://github.com/another/harness',
    'git@github.com:testfree2023/other-project.git',
    'git@github.com:testfree2023/airein-extras.git', // sibling repo (same author), NOT airein
    'git@github.com:testfree2023/aireindocs',          // substring of airein, not the repo
    '',
  ];
  for (const url of foreignUrls) {
    suite.test(`rejects foreign/empty remote: ${url || '(empty)'}`, () => {
      const r2 = spawnSync(BASH, ['-c',
        `. "${toBashPath(LIB_BASH_NATIVE)}"; if is_airein_remote_url "$1"; then echo MATCH; else echo NOMATCH; fi`,
        'bash', url], { env: process.env, encoding: 'utf8', timeout: 8000 });
      assertEqual((r2.stdout || '').trim(), 'NOMATCH', `should NOT match ${url || '(empty)'}`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// Suite 2 — resolve_node_bin (Bug 1)
// ═══════════════════════════════════════════════════════════════════

describe('resolve_node_bin: finds node off the default PATH', suite => {
  suite.test('lib exists (prerequisite)', () => {
    assertOk(libExists(), 'install-helpers.sh must exist (RED until implemented)');
  });
  if (!libExists()) return;

  suite.test('finds nvm-installed node via glob fallback (the reported bug)', () => {
    // Simulate a non-interactive shell: node NOT on PATH, no nvm.sh sourced,
    // but node installed under ~/.nvm/versions/node/<ver>/bin/node.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-node-nvm-'));
    const nodeNative = path.join(home, '.nvm', 'versions', 'node', 'v99.9.9', 'bin', 'node');
    makeFakeNode(nodeNative);
    const r = runWithLib('resolve_node_bin', strippedEnv(toBashPath(home)));
    rmTempDir(home);
    assertEqual(r.status, 0, 'resolve_node_bin exits 0');
    assertContains(r.stdout, 'v99.9.9/bin/node', 'should locate the nvm node via glob');
  });

  suite.test('finds node by sourcing nvm.sh (PATH populated by init)', () => {
    // node lives at a NON-glob path (~/.local/bin/node); only sourcing a fake
    // nvm.sh (which prepends it to PATH) can reveal it — isolates the
    // source-nvm code path from the glob fallback.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-node-src-'));
    const nodeNative = path.join(home, '.local', 'bin', 'node');
    makeFakeNode(nodeNative);
    const nvmShNative = path.join(home, '.nvm', 'nvm.sh');
    fs.mkdirSync(path.dirname(nvmShNative), { recursive: true });
    fs.writeFileSync(nvmShNative, `export PATH="$HOME/.local/bin:$PATH"\n`);
    fs.chmodSync(nvmShNative, 0o644);
    const r = runWithLib('resolve_node_bin', strippedEnv(toBashPath(home)));
    rmTempDir(home);
    assertEqual(r.status, 0, 'resolve_node_bin exits 0');
    assertContains(r.stdout, '.local/bin/node', 'should locate node after sourcing nvm.sh');
  });

  suite.test('returns empty when node is truly absent', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-node-none-'));
    const r = runWithLib('resolve_node_bin', strippedEnv(toBashPath(home)));
    rmTempDir(home);
    assertEqual(r.status, 0, 'resolve_node_bin still exits 0 (empty result, no crash)');
    assertEqual(r.stdout, '', 'should echo nothing when no node is found');
  });

  suite.test('prefers node already on PATH (no fallback needed)', () => {
    // Sanity: when node IS on the inherited PATH, return it immediately.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-node-path-'));
    const r = runWithLib('resolve_node_bin', { ...process.env, HOME: toBashPath(home) });
    rmTempDir(home);
    assertOk(r.stdout.length > 0, 'should find the real node on PATH');
    assertContains(r.stdout, 'node', 'result should be a node path');
  });
});

// ── Run ────────────────────────────────────────────────────────────
process.exit(printSummary());
