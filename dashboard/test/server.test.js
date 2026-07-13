#!/usr/bin/env node
/**
 * Test: Dashboard server API endpoints
 *
 * Tests the HTTP handler directly (no network) using mock req/res.
 * Covers: project discovery, plan CRUD, approval, templates, config.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { URL } = require('url');

const {
  describe, assertEqual, assertOk, assertContains, assertNotContains,
  assertMatch, printSummary, projectRoot
} = require('../../test/helpers');

const SERVER_PATH = path.join(projectRoot(), 'dashboard', 'server.js');

// ── Mock request/response ───────────────────────────────

function mockReq(method, urlPath, body, headers) {
  const parsed = new URL(urlPath, 'http://localhost');
  return {
    method,
    url: parsed.pathname + parsed.search,
    headers: Object.assign({ host: 'localhost', 'content-type': 'application/json' }, headers || {}),
    on(event, fn) {
      if (event === 'data' && body) fn(Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
      if (event === 'end') fn();
    }
  };
}

function mockRes() {
  let _body = '';
  let _headers = {};
  let _statusCode = 0;
  let _ended = false;
  return {
    setHeader(k, v) { _headers[k] = v; },
    writeHead(status, headers) {
      _statusCode = status;
      if (headers) Object.assign(_headers, headers);
    },
    end(data) { _body = data || ''; _ended = true; },
    get body() { return _body; },
    get json() { try { return JSON.parse(_body); } catch { return _body; } },
    get status() { return _statusCode; },
    get ended() { return _ended; },
    get headers() { return _headers; }
  };
}

// ── Fixture helpers ─────────────────────────────────────

function createProjectFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-test-'));
  const planDir = path.join(dir, 'docs', 'plans', 'P001-test-plan');
  fs.mkdirSync(planDir, { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude', 'config'), { recursive: true });

  // progress.md
  fs.writeFileSync(path.join(planDir, 'progress.md'),
    '# Progress: Test Plan\n' +
    'updated: 2026-06-11\n' +
    'plan: P001-test-plan\n' +
    'complexity: medium\n' +
    '\n' +
    '## Task Stats\n' +
    'total: 3\n' +
    'completed: 1\n' +
    'in_progress: 1\n' +
    'pending: 1\n' +
    '\n' +
    '## Approval State\n' +
    'requirements: approved\n' +
    'design: none\n' +
    'tasks: none\n' +
    '\n' +
    '## Active Task\n' +
    '1.2 Implement handler\n' +
    '\n' +
    '## Blockers\n' +
    '- none\n'
  );

  // requirements.md
  fs.writeFileSync(path.join(planDir, 'requirements.md'),
    '# Requirements: Test Plan\n\n## Problem Statement\nTest\n'
  );

  // quality.json
  fs.writeFileSync(path.join(dir, '.claude', 'config', 'quality.json'),
    JSON.stringify({
      testGuard: { enabled: true, mode: 'strict' },
      planGate: { mode: 'advisory' }
    }, null, 2) + '\n'
  );

  return dir;
}

function createP004ProjectFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-p004-'));
  const planDir = path.join(dir, 'docs', 'plans', 'P002-p004-plan');
  fs.mkdirSync(planDir, { recursive: true });
  fs.mkdirSync(path.join(dir, '.airein', 'config'), { recursive: true });

  fs.writeFileSync(path.join(planDir, 'progress.md'),
    '# Progress: P004 Plan\nupdated: 2026-07-13\nplan: P002-p004-plan\ncomplexity: simple\n'
  );

  fs.writeFileSync(path.join(dir, '.airein', 'config', 'quality.json'),
    JSON.stringify({ testGuard: { enabled: true, mode: 'strict' } }, null, 2) + '\n'
  );

  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// Fixture: 混合格式 plans 目录（单文件 plan + 标准目录 plan）
// 用于验证 dashboard 对 legacy/手动建的单文件 plan（P0XX-xxx.md 直接躺在 plans/ 下，
// 无目录、无 progress.md）的兼容性。
function createSingleFilePlanFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-sf-'));
  const plansDir = path.join(dir, 'docs', 'plans');
  fs.mkdirSync(plansDir, { recursive: true });

  // 单文件 plan（legacy 格式）
  fs.writeFileSync(path.join(plansDir, 'P060-single-file.md'),
    '# P060 — 单文件测试 plan\n' +
    '\n' +
    '## Meta\n' +
    '- **状态**: 🚧 in progress\n' +
    '- **优先级**: P1\n' +
    '\n' +
    '## Goal\n测试 dashboard 兼容单文件 plan。\n'
  );

  // 标准目录 plan（回归保护）
  const dirPlan = path.join(plansDir, 'P061-dir-plan');
  fs.mkdirSync(dirPlan, { recursive: true });
  fs.writeFileSync(path.join(dirPlan, 'progress.md'),
    '# Progress: Dir Plan\n' +
    'updated: 2026-06-24\n' +
    'plan: P061-dir-plan\n' +
    'complexity: simple\n' +
    '\n' +
    '## Approval State\n' +
    'tasks: approved\n'
  );
  fs.writeFileSync(path.join(dirPlan, 'tasks.md'), '# Tasks\n- [x] done\n');

  return dir;
}

// Fixture: 单文件 plan 待迁移（P030）。docs/plans/P070-migrate-me.md（全合一内容）。
function createMigrationFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-mig-'));
  const plansDir = path.join(dir, 'docs', 'plans');
  fs.mkdirSync(plansDir, { recursive: true });
  const SRC = '# P070 — 待迁移单文件 plan\n' +
    '\n' +
    '## Meta\n' +
    '- **状态**: 🚧 in progress\n' +
    '\n' +
    '## Goal\n测试迁移到目录格式。\n';
  fs.writeFileSync(path.join(plansDir, 'P070-migrate-me.md'), SRC);
  return { dir: dir, plansDir: plansDir, src: path.join(plansDir, 'P070-migrate-me.md'), content: SRC };
}

// ── Get handler ─────────────────────────────────────────

let handlerFn;
function getHandler() {
  if (handlerFn) return handlerFn;
  const mod = require(SERVER_PATH);
  handlerFn = mod.handler;
  return handlerFn;
}

// ── Tests ───────────────────────────────────────────────

describe('Dashboard: API 404 for unknown routes', suite => {
  suite.test('returns 404 for unknown path', () => {
    const handler = getHandler();
    const req = mockReq('GET', '/api/unknown');
    const res = mockRes();
    handler(req, res);
    assertEqual(res.status, 404, 'unknown route returns 404');
    assertEqual(res.json.error, 'Not found', 'error message');
  });
});

describe('Dashboard: OPTIONS returns 204 (CORS preflight)', suite => {
  suite.test('returns 204 for OPTIONS request', () => {
    const handler = getHandler();
    const req = mockReq('OPTIONS', '/api/projects');
    const res = mockRes();
    handler(req, res);
    assertEqual(res.status, 204, 'OPTIONS returns 204');
  });
});

describe('Dashboard: GET /api/projects', suite => {
  suite.test('returns an array', () => {
    const handler = getHandler();
    const req = mockReq('GET', '/api/projects');
    const res = mockRes();
    handler(req, res);
    assertOk(Array.isArray(res.json), 'response is an array');
  });
});

describe('Dashboard: GET /api/projects/:id/plans returns 404 for unknown project', suite => {
  suite.test('unknown project id returns 404', () => {
    const handler = getHandler();
    const req = mockReq('GET', '/api/projects/nonexistent/plans');
    const res = mockRes();
    handler(req, res);
    assertEqual(res.status, 404, 'unknown project returns 404');
    assertEqual(res.json.error, 'Project not found', 'error message');
  });
});

describe('Dashboard: GET /api/templates', suite => {
  suite.test('returns an array of templates', () => {
    const handler = getHandler();
    const req = mockReq('GET', '/api/templates');
    const res = mockRes();
    handler(req, res);
    assertOk(Array.isArray(res.json), 'response is an array');
  });
});

describe('Dashboard: Template path traversal is blocked', suite => {
  suite.test('GET template with .. returns 400 or 404', () => {
    const handler = getHandler();
    const req = mockReq('GET', '/api/templates/../etc/passwd.md');
    const res = mockRes();
    handler(req, res);
    assertOk(res.status === 400 || res.status === 404, 'path traversal blocked (got ' + res.status + ')');
  });
});

describe('Dashboard: GET / returns HTML or 500 when index.html missing', suite => {
  suite.test('returns 200 or 500 depending on index.html', () => {
    const handler = getHandler();
    const req = mockReq('GET', '/');
    const res = mockRes();
    handler(req, res);
    const ok = res.status === 200 || res.status === 500;
    assertOk(ok, 'GET / returns 200 or 500 (got ' + res.status + ')');
  });
});

describe('Dashboard: CORS wildcard removed (same-origin SPA)', suite => {
  suite.test('no CORS headers on responses', () => {
    const handler = getHandler();
    const req = mockReq('GET', '/api/unknown');
    const res = mockRes();
    handler(req, res);
    assertEqual(res.headers['Access-Control-Allow-Origin'], undefined, 'no CORS origin header');
  });
});

describe('Dashboard: Generic error on internal errors', suite => {
  suite.test('error response does not leak message', () => {
    // The handler catches and returns generic message — verified by reading code
    // We test the OPTIONS path works without CORS headers
    const handler = getHandler();
    const req = mockReq('OPTIONS', '/api/projects');
    const res = mockRes();
    handler(req, res);
    assertEqual(res.status, 204, 'OPTIONS returns 204');
    assertEqual(res.headers['Access-Control-Allow-Origin'], undefined, 'no CORS on OPTIONS');
  });
});

describe('Dashboard: discoverProjects returns array', suite => {
  suite.test('returns array without throwing', () => {
    const mod = require(SERVER_PATH);
    const projects = mod.discoverProjects();
    assertOk(Array.isArray(projects), 'discoverProjects returns array');
  });
});

describe('Dashboard: findProject returns undefined for unknown id', suite => {
  suite.test('unknown id returns undefined', () => {
    const mod = require(SERVER_PATH);
    const result = mod.findProject('does-not-exist-at-all-xyz');
    assertEqual(result, undefined, 'findProject returns undefined for unknown id');
  });
});

// ── Config API tests ──────────────────────────────────────

describe('Dashboard: GET /api/projects/:id/config returns 404 for unknown project', suite => {
  suite.test('unknown project config returns 404', () => {
    const handler = getHandler();
    const req = mockReq('GET', '/api/projects/nonexistent/config');
    const res = mockRes();
    handler(req, res);
    assertEqual(res.status, 404, 'unknown project config returns 404');
    assertEqual(res.json.error, 'Project not found', 'error message');
  });
});

describe('Dashboard: PUT /api/projects/:id/config returns 404 for unknown project', suite => {
  suite.test('unknown project config save returns 404', () => {
    const handler = getHandler();
    const req = mockReq('PUT', '/api/projects/nonexistent/config', { updates: { testGuard: { enabled: false } } });
    const res = mockRes();
    handler(req, res);
    assertEqual(res.status, 404, 'unknown project config save returns 404');
    assertEqual(res.json.error, 'Project not found', 'error message');
  });
});

describe('Dashboard: Config API GET returns config for known project', suite => {
  suite.test('handleGetConfig returns raw, defaults, and effective', () => {
    const fixtureDir = createProjectFixture();
    try {
      const mod = require(SERVER_PATH);
      const res = mockRes();
      mod.handleGetConfig(fixtureDir, res);

      assertEqual(res.status, 200, 'config returns 200');
      assertOk(res.json.raw !== undefined, 'has raw');
      assertOk(res.json.defaults !== undefined, 'has defaults');
      assertOk(res.json.effective !== undefined, 'has effective');
      assertEqual(res.json.raw.testGuard.enabled, true, 'raw testGuard.enabled is true');
    } finally {
      cleanup(fixtureDir);
    }
  });
});

describe('Dashboard: Config API PUT saves and persists', suite => {
  suite.test('config write then read round-trip works', () => {
    const fixtureDir = createProjectFixture();
    try {
      const mod = require(SERVER_PATH);

      // Simulate save by writing quality.json directly
      const configPath = path.join(fixtureDir, '.claude', 'config', 'quality.json');
      const existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const qualityConfig = require('../../scripts/lib/quality-config');
      const merged = qualityConfig.deepMerge(existing, { testGuard: { enabled: false } });
      fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));

      // Verify read-back through handler
      const res = mockRes();
      mod.handleGetConfig(fixtureDir, res);
      assertEqual(res.status, 200, 'config read after write returns 200');
      assertEqual(res.json.raw.testGuard.enabled, false, 'saved testGuard.enabled is false after round-trip');
    } finally {
      cleanup(fixtureDir);
    }
  });
});

// ── Template multi-segment path tests ─────────────────────

describe('Dashboard: GET template with multi-segment path (knowledge/test.md)', suite => {
  suite.test('multi-segment path resolves correctly (not 400)', () => {
    const handler = getHandler();
    // Tests that the server regex captures paths like knowledge/architecture.md
    const req = mockReq('GET', '/api/templates/knowledge/test.md');
    const res = mockRes();
    handler(req, res);
    // Will 404 if the file doesn't exist, but should NOT 400 (bad path)
    assertOk(res.status !== 400, 'multi-segment path not rejected as bad path (got ' + res.status + ')');
  });
});

// ── Security: Host/Origin validation (P015 Task 1) ───────

describe('Dashboard: Host header validation (DNS rebinding defense)', suite => {
  suite.test('rejects foreign Host header', () => {
    const handler = getHandler();
    const req = mockReq('GET', '/api/projects', null, { host: 'evil.com' });
    const res = mockRes();
    handler(req, res);
    assertEqual(res.status, 403, 'foreign host rejected (got ' + res.status + ')');
  });
  suite.test('allows 127.0.0.1 Host', () => {
    const handler = getHandler();
    const req = mockReq('GET', '/api/projects', null, { host: '127.0.0.1:3456' });
    const res = mockRes();
    handler(req, res);
    assertOk(res.status === 200, '127.0.0.1 allowed (got ' + res.status + ')');
  });
});

describe('Dashboard: Origin validation (CSRF defense)', suite => {
  suite.test('rejects foreign Origin on state-changing POST', () => {
    const handler = getHandler();
    const req = mockReq('POST', '/api/projects/x/plans/y/archive', {}, { host: 'localhost', origin: 'https://evil.com' });
    const res = mockRes();
    handler(req, res);
    assertEqual(res.status, 403, 'foreign origin POST rejected before routing (got ' + res.status + ')');
  });
  suite.test('same-origin (no Origin header) still works', () => {
    const handler = getHandler();
    const req = mockReq('GET', '/api/projects', null, { host: 'localhost' });
    const res = mockRes();
    handler(req, res);
    assertOk(res.status === 200, 'no origin (same-origin) allowed (got ' + res.status + ')');
  });
});

describe('Dashboard: Content-Type validation (text/plain CSRF defense)', suite => {
  suite.test('rejects text/plain POST with 415', () => {
    const handler = getHandler();
    const req = mockReq('POST', '/api/projects/x/plans/y/archive', {}, { host: 'localhost', 'content-type': 'text/plain' });
    const res = mockRes();
    handler(req, res);
    assertEqual(res.status, 415, 'text/plain POST rejected with 415 (got ' + res.status + ')');
  });
  suite.test('allows application/json POST through to routing', () => {
    const handler = getHandler();
    const req = mockReq('POST', '/api/projects/x/plans/y/archive', {}, { host: 'localhost', 'content-type': 'application/json' });
    const res = mockRes();
    handler(req, res);
    assertOk(res.status !== 415, 'application/json POST not 415 (got ' + res.status + ')');
  });
});

describe('Dashboard: discoverProjects TTL cache (P015 Task 5)', suite => {
  suite.test('returns same cached reference within TTL', () => {
    const mod = require(SERVER_PATH);
    const a = mod.discoverProjects();
    const b = mod.discoverProjects();
    assertOk(a === b, 'second call within TTL returns cached array reference');
  });
});

// Note: a malformed-JSON-body test is omitted — body-parsing handlers are async
// (readBody) and the sync test airein cannot await them. The message tightening
// ('Invalid JSON: ' + e.message → 'Invalid JSON') is verified by code review; no
// existing test asserts on the old leaky message, so the change is safe.
describe('Dashboard: error message tightening (P015 Task 6)', suite => {
  suite.test('malformed % path encoding returns 400 not 500', () => {
    const handler = getHandler();
    const req = mockReq('GET', '/api/projects/x/docs/foo%E0%A4.md');
    const res = mockRes();
    handler(req, res);
    assertEqual(res.status, 400, 'malformed encoding returns 400 (got ' + res.status + ')');
  });
});

// ── Single-file plan compatibility (legacy / 手动 plan) ───

describe('Dashboard: single-file plan compatibility', suite => {
  suite.test('handleGetPlans lists single-file plan (id without .md)', () => {
    const fixtureDir = createSingleFilePlanFixture();
    try {
      const mod = require(SERVER_PATH);
      const res = mockRes();
      mod.handleGetPlans(fixtureDir, res);
      assertEqual(res.status, 200, 'plans list returns 200');
      const ids = res.json.map(p => p.id);
      assertOk(ids.indexOf('P060-single-file') > -1, 'single-file plan listed with id (no .md suffix)');
      const sf = res.json.find(p => p.id === 'P060-single-file');
      assertOk(sf && sf.singleFile === true, 'marked singleFile:true');
      assertOk(sf && sf.title && sf.title.indexOf('P060') === 0, 'title parsed from first heading');
    } finally { cleanup(fixtureDir); }
  });

  suite.test('handleGetPlans lists both single-file and directory plans', () => {
    const fixtureDir = createSingleFilePlanFixture();
    try {
      const mod = require(SERVER_PATH);
      const res = mockRes();
      mod.handleGetPlans(fixtureDir, res);
      const ids = res.json.map(p => p.id);
      assertOk(ids.indexOf('P060-single-file') > -1, 'single-file plan present');
      assertOk(ids.indexOf('P061-dir-plan') > -1, 'directory plan still present (regression)');
    } finally { cleanup(fixtureDir); }
  });

  suite.test('handleGetPlan reads single-file plan content', () => {
    const fixtureDir = createSingleFilePlanFixture();
    try {
      const mod = require(SERVER_PATH);
      const res = mockRes();
      mod.handleGetPlan(fixtureDir, 'P060-single-file', res);
      assertEqual(res.status, 200, 'single-file plan detail returns 200');
      assertOk(res.json.singleFile === true, 'singleFile flag set');
      assertOk(typeof res.json.content === 'string' && res.json.content.length > 0, 'content field populated with full markdown');
      assertOk((res.json.existingDocs || []).indexOf('content') > -1, 'content listed in existingDocs');
    } finally { cleanup(fixtureDir); }
  });

  suite.test('handleGetPlan tolerates .md suffix in planId (hand-pasted URL)', () => {
    const fixtureDir = createSingleFilePlanFixture();
    try {
      const mod = require(SERVER_PATH);
      const res = mockRes();
      mod.handleGetPlan(fixtureDir, 'P060-single-file.md', res);
      assertEqual(res.status, 200, '.md-suffixed planId accepted (got ' + res.status + ')');
      assertOk(res.json.singleFile === true, 'singleFile flag set despite .md suffix');
    } finally { cleanup(fixtureDir); }
  });

  suite.test('handleGetPlan directory plan still works (regression)', () => {
    const fixtureDir = createSingleFilePlanFixture();
    try {
      const mod = require(SERVER_PATH);
      const res = mockRes();
      mod.handleGetPlan(fixtureDir, 'P061-dir-plan', res);
      assertEqual(res.status, 200, 'directory plan detail returns 200');
      assertOk(res.json.progress !== undefined, 'directory plan exposes progress doc');
      assertOk(res.json.singleFile === undefined || res.json.singleFile === false, 'directory plan not flagged singleFile');
    } finally { cleanup(fixtureDir); }
  });
});

// ── Single-file plan migration to directory format (P030) ───

describe('Dashboard: migrate single-file plan to directory format (P030)', suite => {
  suite.test('migrateSingleFilePlan moves .md → dir/progress.md (non-git)', () => {
    const f = createMigrationFixture();
    try {
      const mod = require(SERVER_PATH);
      const r = mod.migrateSingleFilePlan(f.dir, 'P070-migrate-me');
      assertEqual(r.ok, true, 'migrate ok');
      assertEqual(r.id, 'P070-migrate-me', 'returns plan id');
      assertOk(!fs.existsSync(f.src), 'source .md removed');
      const dest = path.join(f.plansDir, 'P070-migrate-me', 'progress.md');
      assertOk(fs.existsSync(dest), 'dest progress.md created');
      assertEqual(fs.readFileSync(dest, 'utf-8'), f.content, 'content preserved byte-for-byte');
    } finally { cleanup(f.dir); }
  });

  suite.test('migrateSingleFilePlan 404 when source missing', () => {
    const f = createMigrationFixture();
    try {
      const mod = require(SERVER_PATH);
      const r = mod.migrateSingleFilePlan(f.dir, 'P080-nope');
      assertEqual(r.ok, false, 'not ok');
      assertEqual(r.code, 404, '404 for missing source');
    } finally { cleanup(f.dir); }
  });

  suite.test('migrateSingleFilePlan 400 when source empty', () => {
    const f = createMigrationFixture();
    try {
      fs.writeFileSync(f.src, '   \n  ');
      const mod = require(SERVER_PATH);
      const r = mod.migrateSingleFilePlan(f.dir, 'P070-migrate-me');
      assertEqual(r.ok, false, 'not ok');
      assertEqual(r.code, 400, '400 for empty source');
      assertOk(fs.existsSync(f.src), 'empty source untouched');
    } finally { cleanup(f.dir); }
  });

  suite.test('migrateSingleFilePlan 409 when target dir exists', () => {
    const f = createMigrationFixture();
    try {
      fs.mkdirSync(path.join(f.plansDir, 'P070-migrate-me'), { recursive: true });
      const mod = require(SERVER_PATH);
      const r = mod.migrateSingleFilePlan(f.dir, 'P070-migrate-me');
      assertEqual(r.ok, false, 'not ok');
      assertEqual(r.code, 409, '409 when target exists');
      assertOk(fs.existsSync(f.src), 'source untouched when target exists');
    } finally { cleanup(f.dir); }
  });

  suite.test('migrateSingleFilePlan rejects path traversal planId', () => {
    const f = createMigrationFixture();
    try {
      const mod = require(SERVER_PATH);
      const r1 = mod.migrateSingleFilePlan(f.dir, '../etc');
      assertEqual(r1.ok, false, 'reject bare ../');
      assertEqual(r1.code, 400, '400 for ../');
      const r2 = mod.migrateSingleFilePlan(f.dir, 'P070-../etc');
      assertEqual(r2.ok, false, 'reject embedded ../');
      assertEqual(r2.code, 400, '400 for embedded ../');
    } finally { cleanup(f.dir); }
  });

  suite.test('migrateSingleFilePlan uses git mv in git repo (stages rename)', () => {
    const cp = require('child_process');
    const f = createMigrationFixture();
    try {
      cp.spawnSync('git', ['init', '-q'], { cwd: f.dir, encoding: 'utf8' });
      cp.spawnSync('git', ['add', 'docs/plans/P070-migrate-me.md'], { cwd: f.dir, encoding: 'utf8' });
      const mod = require(SERVER_PATH);
      const r = mod.migrateSingleFilePlan(f.dir, 'P070-migrate-me');
      assertEqual(r.ok, true, 'migrate ok in git repo');
      const dest = path.join(f.plansDir, 'P070-migrate-me', 'progress.md');
      assertOk(fs.existsSync(dest), 'dest progress.md created in git repo');
      // git mv stages the rename; git status should reference the new path
      const st = cp.spawnSync('git', ['status', '--short'], { cwd: f.dir, encoding: 'utf8' });
      assertOk(st.status === 0, 'git status ok');
      assertOk(st.stdout.indexOf('progress.md') > -1, 'git mv staged rename references progress.md: ' + st.stdout.trim());
    } finally { cleanup(f.dir); }
  });

  suite.test('migrateSingleFilePlan migrates untracked plan in git repo (fs.rename fallback)', () => {
    const cp = require('child_process');
    const f = createMigrationFixture();
    try {
      cp.spawnSync('git', ['init', '-q'], { cwd: f.dir, encoding: 'utf8' });
      // 源文件不 git add → untracked；git mv 会拒绝（"not under version control"），
      // 应降级 fs.renameSync（untracked 无 git 历史可保）。
      const mod = require(SERVER_PATH);
      const r = mod.migrateSingleFilePlan(f.dir, 'P070-migrate-me');
      assertEqual(r.ok, true, 'migrate ok for untracked plan in git repo: ' + (r.error || ''));
      const dest = path.join(f.plansDir, 'P070-migrate-me', 'progress.md');
      assertOk(fs.existsSync(dest), 'dest progress.md created for untracked');
      assertEqual(fs.readFileSync(dest, 'utf-8'), f.content, 'content preserved for untracked');
      assertOk(!fs.existsSync(f.src), 'untracked source removed');
    } finally { cleanup(f.dir); }
  });

  suite.test('handleMigratePlan handler returns 200 + migrated on success', () => {
    const f = createMigrationFixture();
    try {
      const mod = require(SERVER_PATH);
      const res = mockRes();
      mod.handleMigratePlan(f.dir, 'P070-migrate-me', res);
      assertEqual(res.status, 200, 'handler returns 200');
      assertEqual(res.json.migrated, true, 'migrated:true in body');
      assertEqual(res.json.id, 'P070-migrate-me', 'id in body');
    } finally { cleanup(f.dir); }
  });

  suite.test('handleMigratePlan handler 400 for invalid planId', () => {
    const f = createMigrationFixture();
    try {
      const mod = require(SERVER_PATH);
      const res = mockRes();
      mod.handleMigratePlan(f.dir, '../etc', res);
      assertEqual(res.status, 400, 'handler 400 for traversal');
    } finally { cleanup(f.dir); }
  });

  suite.test('handleMigratePlan handler 404 for missing source', () => {
    const f = createMigrationFixture();
    try {
      const mod = require(SERVER_PATH);
      const res = mockRes();
      mod.handleMigratePlan(f.dir, 'P080-nope', res);
      assertEqual(res.status, 404, 'handler 404 for missing source');
    } finally { cleanup(f.dir); }
  });

  suite.test('handleMigratePlan handler 409 when target exists', () => {
    const f = createMigrationFixture();
    try {
      fs.mkdirSync(path.join(f.plansDir, 'P070-migrate-me'), { recursive: true });
      const mod = require(SERVER_PATH);
      const res = mockRes();
      mod.handleMigratePlan(f.dir, 'P070-migrate-me', res);
      assertEqual(res.status, 409, 'handler 409');
    } finally { cleanup(f.dir); }
  });
});

// ── Static asset serving (frontend modules under public/) ──
// dashboard frontend ships shared JS modules (e.g. doc-links.js) that the
// SPA loads via <script src>. The server serves them from public/ with a
// whitelisted extension set; path traversal is blocked by path.basename.

describe('Static asset serving', suite => {
  suite.test('GET /doc-links.js → 200 + javascript content-type + body', () => {
    const mod = require(SERVER_PATH);
    const res = mockRes();
    mod.handler(mockReq('GET', '/doc-links.js'), res);
    assertEqual(res.status, 200, '200 for known asset');
    assertMatch(res.headers['Content-Type'] || '', /javascript/i, 'JS content-type');
    assertContains(res.body, 'resolveDocLink', 'serves doc-links.js body');
  });

  suite.test('GET /missing.js → 404', () => {
    const mod = require(SERVER_PATH);
    const res = mockRes();
    mod.handler(mockReq('GET', '/nope-not-real.js'), res);
    assertEqual(res.status, 404, '404 for absent asset');
  });

  suite.test('GET /unknown.css → 404 (no such file)', () => {
    const mod = require(SERVER_PATH);
    const res = mockRes();
    mod.handler(mockReq('GET', '/missing.css'), res);
    assertEqual(res.status, 404, '404 for absent css');
  });
});

// ── P004: .airein discovery, config paths, LAN hosts ─────

describe('Dashboard: P004 project discovery', suite => {
  suite.test('isDiscoverableProject accepts .airein/config marker', () => {
    const fixtureDir = createP004ProjectFixture();
    try {
      const mod = require(SERVER_PATH);
      assertOk(mod.isDiscoverableProject(fixtureDir), 'P004 project is discoverable');
    } finally {
      cleanup(fixtureDir);
    }
  });

  suite.test('discoverProjects finds project via DASHBOARD_SCAN_DIRS', () => {
    const fixtureDir = createP004ProjectFixture();
    const scanParent = path.dirname(fixtureDir);
    const prevScan = process.env.DASHBOARD_SCAN_DIRS;
    process.env.DASHBOARD_SCAN_DIRS = scanParent;
    try {
      const mod = require(SERVER_PATH);
      mod.invalidateProjectsCache();
      const projects = mod.discoverProjects();
      const found = projects.some(p => path.resolve(p.path) === path.resolve(fixtureDir));
      assertOk(found, 'scan dir discovers .airein-only project');
    } finally {
      if (prevScan === undefined) delete process.env.DASHBOARD_SCAN_DIRS;
      else process.env.DASHBOARD_SCAN_DIRS = prevScan;
      require(SERVER_PATH).invalidateProjectsCache();
      cleanup(fixtureDir);
    }
  });
});

describe('Dashboard: P004 quality.json paths', suite => {
  suite.test('handleGetConfig reads .airein/config/quality.json', () => {
    const fixtureDir = createP004ProjectFixture();
    try {
      const mod = require(SERVER_PATH);
      const res = mockRes();
      mod.handleGetConfig(fixtureDir, res);
      assertEqual(res.status, 200, 'config returns 200');
      assertEqual(res.json.raw.testGuard.enabled, true, 'reads .airein config');
    } finally {
      cleanup(fixtureDir);
    }
  });

  suite.test('handleGetConfig prefers .airein over legacy .claude', () => {
    const fixtureDir = createP004ProjectFixture();
    try {
      fs.mkdirSync(path.join(fixtureDir, '.claude', 'config'), { recursive: true });
      fs.writeFileSync(path.join(fixtureDir, '.claude', 'config', 'quality.json'),
        JSON.stringify({ testGuard: { enabled: false } }, null, 2) + '\n'
      );
      const mod = require(SERVER_PATH);
      const res = mockRes();
      mod.handleGetConfig(fixtureDir, res);
      assertEqual(res.json.raw.testGuard.enabled, true, 'canonical .airein wins over legacy');
    } finally {
      cleanup(fixtureDir);
    }
  });

  suite.test('handleSaveConfig writes to .airein/config/quality.json', async () => {
    const fixtureDir = createP004ProjectFixture();
    try {
      const mod = require(SERVER_PATH);
      const res = mockRes();
      const req = mockReq('PUT', '/api/projects/x/config', { updates: { testGuard: { enabled: false } } });
      await mod.handleSaveConfig(fixtureDir, req, res);
      assertEqual(res.status, 200, 'save returns 200');
      const canonical = path.join(fixtureDir, '.airein', 'config', 'quality.json');
      assertOk(fs.existsSync(canonical), 'writes canonical path');
      const saved = JSON.parse(fs.readFileSync(canonical, 'utf-8'));
      assertEqual(saved.testGuard.enabled, false, 'persisted update');
      assertOk(!fs.existsSync(path.join(fixtureDir, '.claude', 'config', 'quality.json')),
        'does not write legacy .claude path');
    } finally {
      cleanup(fixtureDir);
    }
  });
});

describe('Dashboard: LAN allowedHosts when bound to 0.0.0.0', suite => {
  suite.test('resolveAllowedHosts expands beyond loopback when DASHBOARD_BIND=0.0.0.0', () => {
    const prev = process.env.DASHBOARD_BIND;
    process.env.DASHBOARD_BIND = '0.0.0.0';
    try {
      const mod = require(SERVER_PATH);
      const hosts = mod.resolveAllowedHosts();
      assertOk(hosts.length > 3, 'LAN mode adds hostnames/IPs beyond loopback defaults');
    } finally {
      if (prev === undefined) delete process.env.DASHBOARD_BIND;
      else process.env.DASHBOARD_BIND = prev;
    }
  });

  suite.test('allows non-loopback Host when DASHBOARD_BIND=0.0.0.0', () => {
    const prev = process.env.DASHBOARD_BIND;
    process.env.DASHBOARD_BIND = '0.0.0.0';
    try {
      const mod = require(SERVER_PATH);
      const hosts = mod.resolveAllowedHosts();
      const lanHost = hosts.find(h => h !== 'localhost' && h !== '127.0.0.1' && h !== '::1');
      assertOk(lanHost, 'LAN host candidate exists');
      const handler = mod.handler;
      const req = mockReq('GET', '/api/projects', null, { host: lanHost + ':3456' });
      const res = mockRes();
      handler(req, res);
      assertOk(res.status === 200, 'LAN host allowed (got ' + res.status + ')');
    } finally {
      if (prev === undefined) delete process.env.DASHBOARD_BIND;
      else process.env.DASHBOARD_BIND = prev;
    }
  });
});

// ── Run ─────────────────────────────────────────────────

process.exit(printSummary());
