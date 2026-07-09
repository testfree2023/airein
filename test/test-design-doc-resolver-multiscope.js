#!/usr/bin/env node
/**
 * Test: design-doc-resolver — P018 multi-scope conventions support
 *
 * P018 Task T2. Verifies resolveProjectDesignDocs() detects the new
 * multi-scope conventions files (docs/conventions-{scope}.md) in addition
 * to the legacy single file (docs/conventions.md). An archived multi-scope
 * project must NOT be misjudged as establishing.
 *
 * Backward-compat + establishing cases for the legacy single file are
 * covered by test-new-plan-establishing.js; this file focuses on the
 * multi-scope additions.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  describe, assertEqual, assertOk, projectRoot, printSummary
} = require('./helpers');

const RESOLVER_PATH = path.join(projectRoot(), 'scripts', 'lib', 'design-doc-resolver.js');

// Require the module under test (throws if missing → RED).
let resolveProjectDesignDocs;
try {
  ({ resolveProjectDesignDocs } = require(RESOLVER_PATH));
} catch (e) {
  resolveProjectDesignDocs = null;
}

function makeTempProject(layout) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolver-multi-'));
  for (const rel of Object.keys(layout)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, layout[rel]);
  }
  return dir;
}

describe('design-doc-resolver: multi-scope conventions (P018 T2)', suite => {
  suite.test('module is require-able and exports resolveProjectDesignDocs', () => {
    assertOk(typeof resolveProjectDesignDocs === 'function', 'resolveProjectDesignDocs is a function');
  });

  suite.test('single new-scope file conventions-nodejs.md → referencing, archived', () => {
    const dir = makeTempProject({ 'docs/conventions-nodejs.md': '# Node.js Conventions' });
    const r = resolveProjectDesignDocs(dir);
    assertEqual(r.conventions.exists, true, 'conventions-nodejs.md detected');
    assertEqual(r.conventions.source, 'archived', 'archived source');
    assertEqual(r.establishing, false, 'not establishing (multi-scope conventions present)');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('multiple new-scope files → referencing', () => {
    const dir = makeTempProject({
      'docs/conventions-nodejs.md': '# Node',
      'docs/conventions-bash.md': '# Bash',
    });
    const r = resolveProjectDesignDocs(dir);
    assertEqual(r.conventions.exists, true, 'multi-scope conventions detected');
    assertEqual(r.establishing, false, 'not establishing');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('returned path points to an existing conventions file', () => {
    const dir = makeTempProject({ 'docs/conventions-python.md': '# Python' });
    const r = resolveProjectDesignDocs(dir);
    assertEqual(r.conventions.exists, true, 'detected');
    assertOk(r.conventions.path && fs.existsSync(r.conventions.path), 'path exists on disk');
    assertOk(
      /^conventions(-[a-z0-9]+)?\.md$/i.test(path.basename(r.conventions.path)),
      'basename matches conventions(-scope)?.md pattern',
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('legacy single file + new scope coexist → referencing (backward compat)', () => {
    const dir = makeTempProject({
      'docs/conventions.md': '# Legacy',
      'docs/conventions-nodejs.md': '# Node',
    });
    const r = resolveProjectDesignDocs(dir);
    assertEqual(r.conventions.exists, true, 'conventions detected when legacy + new coexist');
    assertEqual(r.establishing, false, 'not establishing');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('non-matching docs files do not trigger conventions detection', () => {
    const dir = makeTempProject({
      'docs/conventions-draft.txt': 'not md',
      'docs/my-conventions.md': 'wrong prefix',
      'docs/conventions.old.md': 'wrong suffix',
      'docs/random.md': 'unrelated',
    });
    const r = resolveProjectDesignDocs(dir);
    assertEqual(r.conventions.exists, false, 'non-matching files not detected as conventions');
    assertEqual(r.establishing, true, 'establishing=true when no valid conventions file');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('multi-scope conventions + architecture → both detected, not establishing', () => {
    const dir = makeTempProject({
      'docs/conventions-nodejs.md': '# Node',
      'docs/architecture.md': '# Arch',
    });
    const r = resolveProjectDesignDocs(dir);
    assertEqual(r.conventions.exists, true, 'conventions detected');
    assertEqual(r.architecture.exists, true, 'architecture detected');
    assertEqual(r.establishing, false, 'not establishing');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

process.exit(printSummary());
