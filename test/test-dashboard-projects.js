/**
 * test-dashboard-projects.js — P004 dashboard 项目注册表
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  describe, assertEqual, assertOk, printSummary,
} = require('./helpers');

const {
  registerProject,
  listRegisteredProjects,
  listRegistryEntries,
  pruneStaleProjects,
  unregisterProject,
  readRegistry,
  defaultRegistryPath,
} = require('../scripts/lib/dashboard-projects');

function mkRegistryHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-reg-'));
  const registryPath = path.join(home, '.airein', 'dashboard', 'projects.json');
  return { home, registryPath };
}

function mkProject(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `proj-${name}-`));
  fs.mkdirSync(path.join(dir, '.airein', 'config'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.airein', 'config', 'quality.json'), '{}\n');
  return dir;
}

describe('dashboard-projects: register + list', (suite) => {
  suite.test('register adds project path to registry', () => {
    const { registryPath } = mkRegistryHome();
    const proj = mkProject('a');
    try {
      const r = registerProject(proj, { registryPath });
      assertOk(r.ok, 'register ok');
      assertOk(r.added, 'added new');
      const list = listRegisteredProjects({ registryPath });
      assertEqual(list.length, 1, 'one project');
      assertEqual(list[0].path, path.resolve(proj), 'path stored');
    } finally {
      fs.rmSync(path.dirname(path.dirname(path.dirname(registryPath))), { recursive: true, force: true });
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });

  suite.test('register is idempotent for same path', () => {
    const { registryPath } = mkRegistryHome();
    const proj = mkProject('b');
    try {
      registerProject(proj, { registryPath });
      const r2 = registerProject(proj, { registryPath });
      assertOk(r2.ok, 'second register ok');
      assertEqual(r2.added, false, 'not added again');
      assertEqual(listRegisteredProjects({ registryPath }).length, 1, 'still one');
    } finally {
      fs.rmSync(path.dirname(path.dirname(path.dirname(registryPath))), { recursive: true, force: true });
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });

  suite.test('list skips missing paths', () => {
    const { registryPath } = mkRegistryHome();
    const proj = mkProject('c');
    try {
      registerProject(proj, { registryPath });
      fs.rmSync(proj, { recursive: true, force: true });
      const list = listRegisteredProjects({ registryPath });
      assertEqual(list.length, 0, 'missing path filtered');
    } finally {
      fs.rmSync(path.dirname(path.dirname(path.dirname(registryPath))), { recursive: true, force: true });
    }
  });

  suite.test('unregister removes project', () => {
    const { registryPath } = mkRegistryHome();
    const proj = mkProject('d');
    try {
      registerProject(proj, { registryPath });
      const r = unregisterProject(proj, { registryPath });
      assertOk(r.ok, 'unregister ok');
      assertEqual(listRegisteredProjects({ registryPath }).length, 0, 'empty');
    } finally {
      fs.rmSync(path.dirname(path.dirname(path.dirname(registryPath))), { recursive: true, force: true });
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });

  suite.test('defaultRegistryPath ends with dashboard/projects.json', () => {
    assertOk(defaultRegistryPath().replace(/\\/g, '/').endsWith('.airein/dashboard/projects.json'), 'default path');
  });
});

describe('dashboard-projects: listRegistryEntries + prune', (suite) => {
  suite.test('listRegistryEntries includes missing paths with exists=false', () => {
    const { registryPath } = mkRegistryHome();
    const proj = mkProject('e');
    try {
      registerProject(proj, { registryPath });
      fs.rmSync(proj, { recursive: true, force: true });
      const entries = listRegistryEntries({ registryPath });
      assertEqual(entries.length, 1, 'one row');
      assertEqual(entries[0].exists, false, 'marked missing');
    } finally {
      fs.rmSync(path.dirname(path.dirname(path.dirname(registryPath))), { recursive: true, force: true });
    }
  });

  suite.test('pruneStaleProjects removes missing paths from registry file', () => {
    const { registryPath } = mkRegistryHome();
    const alive = mkProject('f');
    const dead = mkProject('g');
    try {
      registerProject(alive, { registryPath });
      registerProject(dead, { registryPath });
      fs.rmSync(dead, { recursive: true, force: true });
      const r = pruneStaleProjects({ registryPath });
      assertOk(r.ok, 'prune ok');
      assertEqual(r.removed, 1, 'one removed');
      assertEqual(r.remaining, 1, 'one left');
      const raw = readRegistry(registryPath);
      assertEqual(raw.projects.length, 1, 'file updated');
      assertEqual(path.resolve(raw.projects[0].path), path.resolve(alive), 'alive kept');
    } finally {
      fs.rmSync(path.dirname(path.dirname(path.dirname(registryPath))), { recursive: true, force: true });
      fs.rmSync(alive, { recursive: true, force: true });
    }
  });

  suite.test('pruneStaleProjects is noop when all paths exist', () => {
    const { registryPath } = mkRegistryHome();
    const proj = mkProject('h');
    try {
      registerProject(proj, { registryPath });
      const r = pruneStaleProjects({ registryPath });
      assertEqual(r.removed, 0, 'none removed');
      assertEqual(readRegistry(registryPath).projects.length, 1, 'unchanged');
    } finally {
      fs.rmSync(path.dirname(path.dirname(path.dirname(registryPath))), { recursive: true, force: true });
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });
});

process.exit(printSummary());
