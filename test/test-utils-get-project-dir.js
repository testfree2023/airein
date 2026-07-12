/**
 * Test: utils.getProjectDir — cwd must win over stale session cache
 *
 * Dogfood 2026-07-11 (P003 plan pipeline run on airein itself): getProjectDir()
 * skipped its cwd branch whenever cwd contained hooks/hooks.json (it mistook the
 * airein SOURCE repo for an "airein install dir"), then fell back to the session
 * cache. In a real ~/.claude that cache pointed at a *different* project
 * (strat-ai) → approval-guard wrote confirmation files to the wrong project's
 * .claude/ → the entire plan-approval pipeline stalled inside the airein repo
 * (every progress.md approval-state Edit was blocked).
 *
 * Fix: trust process.cwd() whenever it is NOT the CC global config dir (~/.claude).
 * Every host (CC + P001 host-runner) sets cwd = project root; session cache is
 * ONLY for the CC edge case where cwd is mis-set to ~/.claude/.
 *
 * Test strategy: inject a decoy session cache that WOULD mislead the fallback,
 * then assert getProjectDir() still returns cwd. Pre-fix this returns the decoy.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  describe, assertEqual, projectRoot, printSummary
} = require('./helpers');

const UTILS_PATH = path.join(projectRoot(), 'scripts', 'lib', 'utils.js');

function runGetProjectDir(cwd, home, sessionId) {
  const r = spawnSync(process.execPath, ['-e',
    `const { getProjectDir } = require(${JSON.stringify(UTILS_PATH)});` +
    `process.stdout.write(getProjectDir() || '');`,
  ], {
    cwd,
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, USERPROFILE: home, HOME: home, CLAUDE_SESSION_ID: sessionId || '' },
  });
  return (r.stdout || '').trim().replace(/\\/g, '/');
}

function injectSessionCache(home, sessionId, cachedProject) {
  const fakeKeyDir = path.join(home, '.claude', 'projects', 'fake-project-key');
  fs.mkdirSync(fakeKeyDir, { recursive: true });
  fs.writeFileSync(path.join(fakeKeyDir, `${sessionId}.jsonl`), '');
  fs.writeFileSync(path.join(fakeKeyDir, '.project-path'), cachedProject);
}

describe('getProjectDir: cwd wins over stale session cache', suite => {
  suite.test('airein source (hooks/hooks.json + .claude) returns cwd, not cache decoy', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-gpd-home-'));
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-gpd-cwd-'));
    const decoy = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-gpd-decoy-'));
    try {
      fs.mkdirSync(path.join(cwd, 'hooks'), { recursive: true });
      fs.writeFileSync(path.join(cwd, 'hooks', 'hooks.json'), '{}');
      fs.mkdirSync(path.join(cwd, '.claude', 'config'), { recursive: true });
      fs.writeFileSync(path.join(cwd, '.claude', 'config', 'quality.json'), '{}');
      fs.mkdirSync(path.join(decoy, '.claude'), { recursive: true });
      injectSessionCache(home, 'fakesess', decoy);

      const got = runGetProjectDir(cwd, home, 'fakesess');
      assertEqual(got, cwd.replace(/\\/g, '/'),
        'airein source cwd should resolve to itself, not the session-cache decoy');
    } finally {
      for (const d of [home, cwd, decoy]) {
        try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
      }
    }
  });

  suite.test('plain project without .claude still returns cwd, not cache decoy', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-gpd-home2-'));
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-gpd-cwd2-'));
    const decoy = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-gpd-decoy2-'));
    try {
      // Non-git, no .claude — approval-guard non-git dogfood shape.
      fs.mkdirSync(path.join(decoy, '.claude'), { recursive: true });
      injectSessionCache(home, 'sess2', decoy);

      const got = runGetProjectDir(cwd, home, 'sess2');
      assertEqual(got, cwd.replace(/\\/g, '/'),
        'any non-~/.claude cwd should win over stale cache (no .claude markers required)');
    } finally {
      for (const d of [home, cwd, decoy]) {
        try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
      }
    }
  });

  suite.test('cwd === ~/.claude falls back to session cache (CC edge case)', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-gpd-home3-'));
    const claudeDir = path.join(home, '.claude');
    const realProject = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-gpd-proj3-'));
    try {
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.mkdirSync(path.join(realProject, '.airein', 'config'), { recursive: true });
      fs.writeFileSync(path.join(realProject, '.airein', 'config', 'quality.json'), '{}');
      injectSessionCache(home, 'sess3', realProject);

      const got = runGetProjectDir(claudeDir, home, 'sess3');
      assertEqual(got, realProject.replace(/\\/g, '/'),
        'when cwd is ~/.claude, session cache should resolve the real project');
    } finally {
      for (const d of [home, realProject]) {
        try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
      }
    }
  });
});

process.exit(printSummary());
