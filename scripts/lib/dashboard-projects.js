#!/usr/bin/env node
/**
 * dashboard-projects — 面板项目注册表（P004）
 *
 * init-project 将当前项目路径写入 ~/.airein/dashboard/projects.json；
 * Dashboard 优先读此列表发现项目，无需 scanDirs 多目录扫描。
 *
 * CLI:
 *   node dashboard-projects.js register <project-path>
 *   node dashboard-projects.js unregister <project-path>
 *   node dashboard-projects.js list
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const REGISTRY_VERSION = 1;

function defaultRegistryPath(homeDir) {
  const home = homeDir || os.homedir();
  return path.join(home, '.airein', 'dashboard', 'projects.json');
}

function normalizeProjectPath(projectPath) {
  if (!projectPath || typeof projectPath !== 'string') {
    throw new Error('dashboard-projects: project path required');
  }
  return path.resolve(projectPath);
}

function readRegistry(registryPath) {
  if (!fs.existsSync(registryPath)) {
    return { version: REGISTRY_VERSION, projects: [] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const projects = Array.isArray(raw.projects) ? raw.projects : [];
    return { version: raw.version || REGISTRY_VERSION, projects };
  } catch {
    return { version: REGISTRY_VERSION, projects: [] };
  }
}

function writeRegistry(registryPath, data) {
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(data, null, 2) + '\n');
}

function dedupeKey(projectPath) {
  return normalizeProjectPath(projectPath).replace(/\\/g, '/').toLowerCase();
}

/**
 * @param {string} projectPath
 * @param {{ registryPath?: string, name?: string }} [opts]
 */
function registerProject(projectPath, opts = {}) {
  const registryPath = opts.registryPath || defaultRegistryPath();
  const abs = normalizeProjectPath(projectPath);
  if (!fs.existsSync(abs)) {
    return { ok: false, error: 'project path not found: ' + abs };
  }

  const registry = readRegistry(registryPath);
  const key = dedupeKey(abs);
  let added = false;
  const now = new Date().toISOString();
  const existing = registry.projects.find((p) => dedupeKey(p.path) === key);

  if (existing) {
    existing.path = abs;
    existing.updatedAt = now;
    if (opts.name) existing.name = opts.name;
  } else {
    registry.projects.push({
      path: abs,
      name: opts.name || path.basename(abs),
      addedAt: now,
      updatedAt: now,
    });
    added = true;
  }

  writeRegistry(registryPath, registry);
  return { ok: true, path: abs, added, registryPath };
}

/**
 * @param {{ registryPath?: string }} [opts]
 * @returns {Array<{ path: string, name?: string, addedAt?: string, updatedAt?: string }>}
 */
function listRegisteredProjects(opts = {}) {
  const registryPath = opts.registryPath || defaultRegistryPath();
  const registry = readRegistry(registryPath);
  return registry.projects
    .map((p) => ({ ...p, path: normalizeProjectPath(p.path) }))
    .filter((p) => fs.existsSync(p.path));
}

function unregisterProject(projectPath, opts = {}) {
  const registryPath = opts.registryPath || defaultRegistryPath();
  const key = dedupeKey(projectPath);
  const registry = readRegistry(registryPath);
  const before = registry.projects.length;
  registry.projects = registry.projects.filter((p) => dedupeKey(p.path) !== key);
  writeRegistry(registryPath, registry);
  return { ok: true, removed: before - registry.projects.length, registryPath };
}

module.exports = {
  defaultRegistryPath,
  readRegistry,
  writeRegistry,
  registerProject,
  listRegisteredProjects,
  unregisterProject,
  dedupeKey,
};

if (require.main === module) {
  const cmd = process.argv[2];
  const arg = process.argv[3];
  try {
    if (cmd === 'register') {
      if (!arg) throw new Error('usage: dashboard-projects.js register <project-path>');
      const r = registerProject(arg);
      if (!r.ok) {
        process.stderr.write(r.error + '\n');
        process.exit(1);
      }
      process.stdout.write(JSON.stringify(r, null, 2) + '\n');
      process.exit(0);
    }
    if (cmd === 'unregister') {
      if (!arg) throw new Error('usage: dashboard-projects.js unregister <project-path>');
      const r = unregisterProject(arg);
      process.stdout.write(JSON.stringify(r, null, 2) + '\n');
      process.exit(0);
    }
    if (cmd === 'list') {
      process.stdout.write(JSON.stringify(listRegisteredProjects(), null, 2) + '\n');
      process.exit(0);
    }
    process.stderr.write('usage: dashboard-projects.js register|unregister|list\n');
    process.exit(2);
  } catch (err) {
    process.stderr.write(String(err.message || err) + '\n');
    process.exit(1);
  }
}
