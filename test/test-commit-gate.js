#!/usr/bin/env node
/**
 * Test: commit-gate.js — staged-file classification for the pre-commit gate.
 *
 * The pre-commit gate runs build+test on every `git commit`. That is expensive
 * and wrong for commits that touch no compilable/tested source (doc-only,
 * config-only). classifyStagedFiles decides whether the gate should run at all,
 * so pre-commit-gate.js can skip it for non-source commits (see 20-workflow.md
 * "流程豁免" — 文档/注释修改 → 全部流程可跳过).
 *
 * Pure function — no git, no filesystem. Drives the hook's gate decision.
 */

const path = require('path');
const { describe, assertEqual, assertOk, printSummary, projectRoot }
  = require('./helpers');

const { classifyStagedFiles } = require(path.join(projectRoot(), 'scripts', 'lib', 'commit-gate'));

// A representative source-extension set (mirrors language-config getSourceExtensions).
const JS_EXTS = new Set(['.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.go', '.rs', '.kt']);
// Classifier matching the airein test-file convention (test-*.js).
const aireinIsTest = f => /^test[-_].*\.js$/i.test(path.basename(f)) || /\.test\.js$/i.test(f);

// ── runGate: false for non-source-only commits ─────────────────────

describe('classifyStagedFiles: doc-only commit → runGate false', suite => {
  suite.test('single .md', () => {
    const r = classifyStagedFiles(['docs/design.md'], { sourceExtensions: JS_EXTS, isTestFile: aireinIsTest });
    assertEqual(r.runGate, false, 'doc-only does not run gate');
    assertEqual(r.sourceFiles.length, 0, 'no source files');
    assertEqual(r.otherFiles.length, 1, 'one other file');
    assertEqual(r.otherFiles[0], 'docs/design.md', 'md classified as other');
  });

  suite.test('mixed docs (.md + .txt + .adoc)', () => {
    const r = classifyStagedFiles(['a.md', 'b.txt', 'docs/c.adoc'], { sourceExtensions: JS_EXTS, isTestFile: aireinIsTest });
    assertEqual(r.runGate, false, 'doc-only does not run gate');
    assertEqual(r.otherFiles.length, 3, 'all classified as other');
  });

  suite.test('CJK filename preserved', () => {
    const r = classifyStagedFiles(['docs/老系统对比需求缺失分析.md'], { sourceExtensions: JS_EXTS, isTestFile: aireinIsTest });
    assertEqual(r.runGate, false, 'CJK doc does not run gate');
    assertEqual(r.otherFiles[0], 'docs/老系统对比需求缺失分析.md', 'CJK path preserved');
  });
});

describe('classifyStagedFiles: config-only commit → runGate false', suite => {
  suite.test('.json/.yml/.sh are not source', () => {
    const r = classifyStagedFiles(['package.json', '.claude/config/quality.json', 'scripts/update/x.sh', 'ci.yml'],
      { sourceExtensions: JS_EXTS, isTestFile: aireinIsTest });
    assertEqual(r.runGate, false, 'config/scripts do not run gate');
    assertEqual(r.otherFiles.length, 4, 'all other');
    assertEqual(r.sourceFiles.length, 0, 'no source');
  });
});

describe('classifyStagedFiles: empty / blank input → runGate false', suite => {
  suite.test('empty array', () => {
    const r = classifyStagedFiles([], { sourceExtensions: JS_EXTS, isTestFile: aireinIsTest });
    assertEqual(r.runGate, false, 'empty does not run gate');
  });
  suite.test('blank/whitespace entries filtered', () => {
    const r = classifyStagedFiles(['', '   ', '\t'], { sourceExtensions: JS_EXTS, isTestFile: aireinIsTest });
    assertEqual(r.runGate, false, 'blanks do not run gate');
    assertEqual(r.otherFiles.length, 0, 'nothing classified');
  });
});

// ── runGate: true when source or test present ──────────────────────

describe('classifyStagedFiles: source present → runGate true', suite => {
  suite.test('single .js', () => {
    const r = classifyStagedFiles(['scripts/lib/commit-gate.js'], { sourceExtensions: JS_EXTS, isTestFile: aireinIsTest });
    assertEqual(r.runGate, true, 'source runs gate');
    assertEqual(r.sourceFiles[0], 'scripts/lib/commit-gate.js', 'js is source');
  });

  suite.test('doc + source mixed → true, both buckets filled', () => {
    const r = classifyStagedFiles(['docs/x.md', 'scripts/hooks/pre-commit-gate.js'],
      { sourceExtensions: JS_EXTS, isTestFile: aireinIsTest });
    assertEqual(r.runGate, true, 'mixed runs gate');
    assertEqual(r.sourceFiles.length, 1, 'one source');
    assertEqual(r.otherFiles.length, 1, 'one doc');
  });

  suite.test('non-JS source ext (.py/.go/.java)', () => {
    const r = classifyStagedFiles(['app/main.py', 'svc/handler.go', 'src/Main.java'],
      { sourceExtensions: JS_EXTS, isTestFile: aireinIsTest });
    assertEqual(r.runGate, true, 'polyglot source runs gate');
    assertEqual(r.sourceFiles.length, 3, 'all three source');
  });
});

describe('classifyStagedFiles: test-only commit → runGate true', suite => {
  suite.test('staging only a test file still runs gate (tests are code)', () => {
    const r = classifyStagedFiles(['test/test-commit-gate.js'], { sourceExtensions: JS_EXTS, isTestFile: aireinIsTest });
    assertEqual(r.runGate, true, 'test-only runs gate');
    assertEqual(r.testFiles.length, 1, 'classified as test');
    assertEqual(r.sourceFiles.length, 0, 'not double-counted as source');
  });
});

// ── robustness ─────────────────────────────────────────────────────

describe('classifyStagedFiles: robustness', suite => {
  suite.test('CRLF line endings stripped (git diff output on Windows)', () => {
    const r = classifyStagedFiles(['docs/x.md\r\n', 'scripts/y.js\r\n'], { sourceExtensions: JS_EXTS, isTestFile: aireinIsTest });
    assertEqual(r.runGate, true, 'mixed with CRLF runs gate');
    assertEqual(r.sourceFiles[0], 'scripts/y.js', 'trailing CR stripped from source');
    assertEqual(r.otherFiles[0], 'docs/x.md', 'trailing CR stripped from doc');
  });

  suite.test('uppercase extension normalized', () => {
    const r = classifyStagedFiles(['App.PY'], { sourceExtensions: JS_EXTS, isTestFile: aireinIsTest });
    assertEqual(r.runGate, true, 'uppercase ext still source');
    assertEqual(r.sourceFiles[0], 'App.PY', 'original case preserved in output');
  });

  suite.test('isTestFile defaults to no-op when omitted', () => {
    const r = classifyStagedFiles(['test/test-x.js'], { sourceExtensions: JS_EXTS });
    assertEqual(r.runGate, true, 'still runs gate (it is a source file by ext)');
    assertEqual(r.sourceFiles[0], 'test/test-x.js', 'falls into source when no test classifier');
    assertEqual(r.testFiles.length, 0, 'no test bucket without classifier');
  });

  suite.test('null/undefined entries ignored', () => {
    const r = classifyStagedFiles([null, undefined, 'docs/x.md'], { sourceExtensions: JS_EXTS, isTestFile: aireinIsTest });
    assertEqual(r.runGate, false, 'nulls ignored, doc-only');
    assertEqual(r.otherFiles.length, 1, 'only the md counted');
  });

  suite.test('null stagedFiles → empty result, runGate false', () => {
    const r = classifyStagedFiles(null, { sourceExtensions: JS_EXTS, isTestFile: aireinIsTest });
    assertEqual(r.runGate, false, 'null input safe');
    assertEqual(r.sourceFiles.length, 0, 'empty buckets');
  });
});

process.exit(printSummary());
