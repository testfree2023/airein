/**
 * test-dashboard-tools-api.js — Dashboard tools registry API
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  describe, assertEqual, assertOk, projectRoot, printSummary,
} = require('./helpers');

const SERVER_PATH = path.join(projectRoot(), 'dashboard', 'server.js');

function mockReq(method, urlPath, body) {
  const parsed = new URL(urlPath, 'http://localhost');
  return {
    method,
    url: parsed.pathname + parsed.search,
    headers: { host: 'localhost', 'content-type': 'application/json' },
    on(event, fn) {
      if (event === 'data' && body) {
        fn(Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
      }
      if (event === 'end') fn();
    },
  };
}

function mockRes() {
  let _body = '';
  let _statusCode = 0;
  return {
    writeHead(status) { _statusCode = status; },
    end(data) { _body = data || ''; },
    get json() { return JSON.parse(_body); },
    get status() { return _statusCode; },
  };
}

function mkRegistryHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-tools-'));
  const registryPath = path.join(home, '.airein', 'dashboard', 'projects.json');
  return { home, registryPath };
}

function mkProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-tools-proj-'));
  fs.mkdirSync(path.join(dir, '.airein', 'config'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.airein', 'config', 'quality.json'), '{}\n');
  return dir;
}

describe('dashboard tools API: registry', (suite) => {
  suite.test('GET registry lists entries with exists flag', () => {
    const { registryPath } = mkRegistryHome();
    const proj = mkProject();
    const prev = process.env.AIREIN_DASHBOARD_REGISTRY;
    process.env.AIREIN_DASHBOARD_REGISTRY = registryPath;
    try {
      const mod = require(SERVER_PATH);
      const { registerProject } = require('../scripts/lib/dashboard-projects');
      registerProject(proj, { registryPath });
      const res = mockRes();
      mod.handleGetRegistryTools(res);
      assertEqual(res.status, 200, '200');
      assertEqual(res.json.total, 1, 'one entry');
      assertOk(res.json.entries[0].exists, 'exists true');
    } finally {
      if (prev === undefined) delete process.env.AIREIN_DASHBOARD_REGISTRY;
      else process.env.AIREIN_DASHBOARD_REGISTRY = prev;
      fs.rmSync(path.dirname(path.dirname(path.dirname(registryPath))), { recursive: true, force: true });
      fs.rmSync(proj, { recursive: true, force: true });
      delete require.cache[require.resolve(SERVER_PATH)];
    }
  });

  suite.test('POST prune removes stale registry rows', async () => {
    const { registryPath } = mkRegistryHome();
    const alive = mkProject();
    const dead = mkProject();
    const prev = process.env.AIREIN_DASHBOARD_REGISTRY;
    process.env.AIREIN_DASHBOARD_REGISTRY = registryPath;
    try {
      const mod = require(SERVER_PATH);
      const { registerProject } = require('../scripts/lib/dashboard-projects');
      registerProject(alive, { registryPath });
      registerProject(dead, { registryPath });
      fs.rmSync(dead, { recursive: true, force: true });
      const res = mockRes();
      mod.handlePruneRegistry(res);
      assertEqual(res.status, 200, '200');
      assertEqual(res.json.removed, 1, 'one pruned');
      const listRes = mockRes();
      mod.handleGetRegistryTools(listRes);
      assertEqual(listRes.json.total, 1, 'one left');
    } finally {
      if (prev === undefined) delete process.env.AIREIN_DASHBOARD_REGISTRY;
      else process.env.AIREIN_DASHBOARD_REGISTRY = prev;
      fs.rmSync(path.dirname(path.dirname(path.dirname(registryPath))), { recursive: true, force: true });
      fs.rmSync(alive, { recursive: true, force: true });
      delete require.cache[require.resolve(SERVER_PATH)];
    }
  });

  suite.test('POST register rejects missing directory', async () => {
    const { registryPath } = mkRegistryHome();
    const prev = process.env.AIREIN_DASHBOARD_REGISTRY;
    process.env.AIREIN_DASHBOARD_REGISTRY = registryPath;
    try {
      const mod = require(SERVER_PATH);
      const res = mockRes();
      const req = mockReq('POST', '/api/tools/registry/register', { path: '/no/such/project' });
      await mod.handleRegisterRegistry(req, res);
      assertEqual(res.status, 400, '400');
      assertOk(res.json.error, 'error message');
    } finally {
      if (prev === undefined) delete process.env.AIREIN_DASHBOARD_REGISTRY;
      else process.env.AIREIN_DASHBOARD_REGISTRY = prev;
      fs.rmSync(path.dirname(path.dirname(path.dirname(registryPath))), { recursive: true, force: true });
      delete require.cache[require.resolve(SERVER_PATH)];
    }
  });
});

process.exit(printSummary());
