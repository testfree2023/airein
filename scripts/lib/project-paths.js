/**
 * project-paths — P004 项目数据层路径解析（纯函数）
 *
 * Canonical: <project>/.airein/
 * Legacy read-only fallback: <project>/.claude/
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const AIREIN_PROJECT_DIR = '.airein';
const LEGACY_PROJECT_DIR = '.claude';

const AIREIN_MARKERS = [
  ['config', 'quality.json'],
  ['memory'],
  ['logs'],
];

const LEGACY_MARKERS = [
  ['config', 'quality.json'],
  ['quality.json'],
  ['memory'],
];

function pathExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function hasMarkers(projectRoot, projectDir, markers) {
  const base = path.join(projectRoot, projectDir);
  if (!pathExists(base)) return false;
  for (const segs of markers) {
    if (pathExists(path.join(base, ...segs))) return true;
  }
  return false;
}

function hasAireinMarkers(projectRoot) {
  return hasMarkers(projectRoot, AIREIN_PROJECT_DIR, AIREIN_MARKERS);
}

function hasLegacyMarkers(projectRoot) {
  return hasMarkers(projectRoot, LEGACY_PROJECT_DIR, LEGACY_MARKERS);
}

function isHomeDir(dir) {
  return path.resolve(dir) === path.resolve(os.homedir());
}

/**
 * Project roots may use .airein/ or (legacy) <repo>/.claude/.
 * ~/.claude alone is CC global config — not a project root (same rule as utils.getProjectDir).
 */
function isProjectRootCandidate(dir) {
  if (hasAireinMarkers(dir)) return true;
  if (hasLegacyMarkers(dir) && !isHomeDir(dir)) return true;
  return false;
}

/**
 * Walk up from startDir to find project root (directory containing .airein or legacy .claude markers).
 * @param {string} startDir
 * @returns {string|null}
 */
function findProjectRoot(startDir) {
  let current = path.resolve(startDir);
  const root = path.parse(current).root;

  while (true) {
    if (isProjectRootCandidate(current)) {
      return current;
    }
    if (current === root) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

/**
 * Absolute path to <project>/.airein (creates logical path even if dir not yet on disk).
 * @param {string} cwd
 * @returns {string}
 */
function getAireinProjectDir(cwd) {
  const root = findProjectRoot(cwd) || path.resolve(cwd);
  return path.join(root, AIREIN_PROJECT_DIR);
}

/**
 * Resolve a path under the canonical .airein project directory.
 * @param {string} cwd
 * @param {...string} segments
 * @returns {string}
 */
function resolveProjectSubpath(cwd, ...segments) {
  return path.join(getAireinProjectDir(cwd), ...segments);
}

/**
 * Path to quality.json for read or write.
 * Read: prefer .airein/config/quality.json, then legacy .claude paths.
 * Write: always .airein/config/quality.json.
 *
 * @param {string} cwd
 * @param {{ forRead?: boolean, forWrite?: boolean }} [opts]
 * @returns {string|null} null when forRead and no file exists
 */
function qualityConfigPath(cwd, opts = {}) {
  const forWrite = opts.forWrite === true;
  const forRead = opts.forRead === true || !forWrite;

  const root = findProjectRoot(cwd) || path.resolve(cwd);
  const canonical = path.join(root, AIREIN_PROJECT_DIR, 'config', 'quality.json');

  if (forWrite) {
    return canonical;
  }

  if (forRead) {
    if (pathExists(canonical)) return canonical;
    const legacyConfig = path.join(root, LEGACY_PROJECT_DIR, 'config', 'quality.json');
    if (pathExists(legacyConfig)) return legacyConfig;
    const legacyRoot = path.join(root, LEGACY_PROJECT_DIR, 'quality.json');
    if (pathExists(legacyRoot)) return legacyRoot;
    return null;
  }

  return canonical;
}

/**
 * Canonical write path under <project>/.airein/.
 * @param {string} cwd
 * @param {...string} segments
 * @returns {string}
 */
function projectDataSubpath(cwd, ...segments) {
  const root = findProjectRoot(cwd) || path.resolve(cwd);
  return path.join(root, AIREIN_PROJECT_DIR, ...segments);
}

/**
 * Read path: prefer .airein/, fallback legacy .claude/. Returns canonical when neither exists.
 * @param {string} cwd
 * @param {...string} segments
 * @returns {string}
 */
function projectDataSubpathForRead(cwd, ...segments) {
  const root = findProjectRoot(cwd) || path.resolve(cwd);
  const canonical = path.join(root, AIREIN_PROJECT_DIR, ...segments);
  if (pathExists(canonical)) return canonical;
  const legacy = path.join(root, LEGACY_PROJECT_DIR, ...segments);
  if (pathExists(legacy)) return legacy;
  return canonical;
}

/**
 * Directory containing L1 thin-shell conventions rules (canonical .airein/rules, legacy fallback).
 * @param {string} cwd
 * @returns {string}
 */
function thinShellRulesDir(cwd) {
  const root = findProjectRoot(cwd) || path.resolve(cwd);
  const canonical = path.join(root, AIREIN_PROJECT_DIR, 'rules');
  if (pathExists(canonical)) return canonical;
  const legacy = path.join(root, LEGACY_PROJECT_DIR, 'rules');
  if (pathExists(legacy)) return legacy;
  return canonical;
}

module.exports = {
  AIREIN_PROJECT_DIR,
  LEGACY_PROJECT_DIR,
  findProjectRoot,
  getAireinProjectDir,
  resolveProjectSubpath,
  qualityConfigPath,
  hasAireinMarkers,
  hasLegacyMarkers,
  projectDataSubpath,
  projectDataSubpathForRead,
  thinShellRulesDir,
};
