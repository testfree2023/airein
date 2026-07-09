/**
 * Test: JavaScript syntax — all .js files parse without error
 *
 * Uses vm.Script to verify no syntax errors in project source files.
 * Only scans scripts/ and skills/ directories (not node_modules, test, etc).
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { describe, assertOk, assert, projectRoot } = require('./helpers');

// Directories to scan (relative to project root)
const SCAN_DIRS = ['scripts', 'skills'];
// Directories to always skip when recursing
const SKIP_DIRS = new Set(['node_modules', 'test', 'tests', 'vendor', 'dist', 'build', '.git', '.claude']);
const MAX_FILES = 150;

function findJsFiles(dir, depth = 0) {
  if (depth > 5) return [];
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (results.length >= MAX_FILES) break;
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.js')) {
        results.push(fullPath);
      } else if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
        results.push(...findJsFiles(fullPath, depth + 1));
      }
    }
  } catch { /* permission errors */ }
  return results.slice(0, MAX_FILES);
}

describe('JavaScript syntax validity', suite => {
  // Scan only designated source directories
  let jsFiles = [];
  for (const scanDir of SCAN_DIRS) {
    const absDir = path.join(projectRoot(), scanDir);
    if (fs.existsSync(absDir)) {
      jsFiles.push(...findJsFiles(absDir));
    }
  }
  // Deduplicate (in case of symlinks)
  jsFiles = [...new Set(jsFiles.map(f => path.resolve(f)))];

  suite.test(`found ${jsFiles.length} JS files to validate`, () => {
    assertOk(jsFiles.length > 0, 'should find JS files');
  });

  for (const filePath of jsFiles) {
    const relPath = path.relative(projectRoot(), filePath);
    suite.test(`${relPath} parses without syntax error`, () => {
      try {
        const code = fs.readFileSync(filePath, 'utf8');
        new vm.Script(code, { filename: relPath });
        assert(true, `${relPath} syntax OK`);
      } catch (err) {
        assert(false, `${relPath}: ${err.message}`);
      }
    });
  }
});

// ── Run standalone ─────────────────────────────────────────────────
const { printSummary } = require('./helpers');
process.exit(printSummary());
