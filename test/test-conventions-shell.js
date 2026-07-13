#!/usr/bin/env node
/**
 * Test: conventions-shell validator — P018 T3
 *
 * Verifies validateConventionsShell() correctly validates the thin-shell
 * structure: (1) legal frontmatter with non-empty `paths`, (2) an @include
 * directive in the body, (3) the @include target file exists on disk
 * (fail-fast, not silent — CC silently ignores missing includes, so the
 * airein must catch this at generation/deploy time).
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  describe, assertEqual, assertOk, projectRoot, printSummary
} = require('./helpers');

const SHELL_LIB_PATH = path.join(projectRoot(), 'scripts', 'lib', 'conventions-shell.js');

// Require the module under test (throws if missing → RED).
let validateConventionsShell;
try {
  ({ validateConventionsShell } = require(SHELL_LIB_PATH));
} catch (e) {
  validateConventionsShell = null;
}

function makeTempProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conv-shell-'));
  for (const rel of Object.keys(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, files[rel]);
  }
  return dir;
}

describe('conventions-shell validator (P018 T3)', suite => {
  suite.test('module exports validateConventionsShell', () => {
    assertOk(typeof validateConventionsShell === 'function', 'validateConventionsShell is a function');
  });

  suite.test('valid shell (paths + @include target exists) → valid', () => {
    const dir = makeTempProject({
      '.airein/rules/conventions-nodejs.md': '---\npaths: ["scripts/**/*.js"]\n---\n@../../docs/conventions-nodejs.md\n',
      'docs/conventions-nodejs.md': '# Node Conventions',
    });
    const shell = path.join(dir, '.airein/rules', 'conventions-nodejs.md');
    const r = validateConventionsShell(shell);
    assertEqual(r.valid, true, 'valid shell → valid:true; errors: ' + JSON.stringify(r.errors || []));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('@include target missing → invalid with clear error', () => {
    const dir = makeTempProject({
      '.airein/rules/conventions-nodejs.md': '---\npaths: ["scripts/**/*.js"]\n---\n@../../docs/conventions-nodejs.md\n',
      // docs/conventions-nodejs.md intentionally absent
    });
    const shell = path.join(dir, '.airein/rules', 'conventions-nodejs.md');
    const r = validateConventionsShell(shell);
    assertEqual(r.valid, false, 'missing target → invalid');
    assertOk(r.errors.some(e => /not found/i.test(e)), 'error mentions "not found"');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('frontmatter missing → invalid', () => {
    const dir = makeTempProject({
      '.airein/rules/x.md': '@../../docs/conventions-x.md\n',
      'docs/conventions-x.md': '# X',
    });
    const shell = path.join(dir, '.airein/rules', 'x.md');
    const r = validateConventionsShell(shell);
    assertEqual(r.valid, false, 'no frontmatter → invalid');
    assertOk(r.errors.some(e => /frontmatter/i.test(e)), 'error mentions frontmatter');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('paths missing or empty → invalid', () => {
    const dir = makeTempProject({
      '.airein/rules/x.md': '---\n---\n@../../docs/conventions-x.md\n',
      'docs/conventions-x.md': '# X',
    });
    const shell = path.join(dir, '.airein/rules', 'x.md');
    const r = validateConventionsShell(shell);
    assertEqual(r.valid, false, 'empty frontmatter (no paths) → invalid');
    assertOk(r.errors.some(e => /paths/i.test(e)), 'error mentions paths');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('no @include directive → invalid', () => {
    const dir = makeTempProject({
      '.airein/rules/x.md': '---\npaths: ["**/*.js"]\n---\nSome prose without include.\n',
    });
    const shell = path.join(dir, '.airein/rules', 'x.md');
    const r = validateConventionsShell(shell);
    assertEqual(r.valid, false, 'no @include → invalid');
    assertOk(r.errors.some(e => /include/i.test(e)), 'error mentions include');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('shell file missing → invalid', () => {
    const dir = makeTempProject({});
    const r = validateConventionsShell(path.join(dir, 'nonexistent.md'));
    assertEqual(r.valid, false, 'missing file → invalid');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('relative @include with .. resolves across dirs', () => {
    const dir = makeTempProject({
      '.airein/rules/conventions-bash.md': '---\npaths: ["**/*.sh"]\n---\n@../../docs/conventions-bash.md\n',
      'docs/conventions-bash.md': '# Bash',
    });
    const shell = path.join(dir, '.airein/rules', 'conventions-bash.md');
    const r = validateConventionsShell(shell);
    assertEqual(r.valid, true, '@../../ resolves to project docs/; errors: ' + JSON.stringify(r.errors || []));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

process.exit(printSummary());
