#!/usr/bin/env node
/**
 * Test: doc-links.js — pure link resolver for dashboard project doc views.
 *
 * Markdown rendered inside a project doc view contains relative links like
 * `[LLD_00](./lld/LLD_00_公共架构与规范.md)`. The browser resolves these
 * against the page base URL (http://localhost:3456/, hash excluded) and
 * navigates to a non-existent /lld/... path → 404. resolveDocLink classifies
 * each href so the SPA click handler can rewrite internal doc links into
 * hash routes (#/projects/<id>/docs/<resolved>).
 *
 * Pure functions — no DOM. Shared by the browser (<script src>) and node tests.
 */

const path = require('path');
const { describe, assertEqual, assertOk, assertContains, assertMatch, printSummary, projectRoot }
  = require('../../test/helpers');

const MOD = require(path.join(projectRoot(), 'dashboard', 'public', 'doc-links.js'));
const { resolveDocLink, joinRelative } = MOD;

// ── joinRelative ────────────────────────────────────────

describe('joinRelative: base dir + rel → project-relative doc path', suite => {
  suite.test('./ sibling under docs/', () => {
    assertEqual(joinRelative('docs', './lld/x.md'), 'docs/lld/x.md', './lld/x.md');
  });
  suite.test('no ./ prefix', () => {
    assertEqual(joinRelative('docs', 'lld/x.md'), 'docs/lld/x.md', 'lld/x.md');
  });
  suite.test('parent dir ..', () => {
    assertEqual(joinRelative('docs/lld', '../requirements.md'), 'docs/requirements.md', '../requirements.md');
  });
  suite.test('two levels up', () => {
    assertEqual(joinRelative('docs/lld/sub', '../../design.md'), 'docs/design.md', '../../design.md');
  });
  suite.test('empty base + ./', () => {
    assertEqual(joinRelative('', './x.md'), 'x.md', 'empty base + ./x.md');
  });
  suite.test('empty base, bare name', () => {
    assertEqual(joinRelative('', 'x.md'), 'x.md', 'empty base + x.md');
  });
  suite.test('trailing segments collapse correctly', () => {
    assertEqual(joinRelative('docs/a', './b/c.md'), 'docs/a/b/c.md', 'nested add');
  });
  suite.test('escape above root → null (defense-in-depth)', () => {
    assertEqual(joinRelative('docs', '../../../etc/passwd'), null, 'over-traversal blocked');
  });
});

// ── resolveDocLink: relative .md → internal ─────────────

describe('resolveDocLink: relative .md/.txt → internal', suite => {
  suite.test('relative .md under docs/ (JuXu design.md → LLD case)', () => {
    const r = resolveDocLink('./lld/LLD_00_公共架构与规范.md', 'docs/design.md');
    assertEqual(r.internal, true, 'internal');
    assertEqual(r.docPath, 'docs/lld/LLD_00_公共架构与规范.md', 'docPath with CJK preserved');
    assertEqual(r.anchor, null, 'no anchor');
  });
  suite.test('relative .md with trailing anchor', () => {
    const r = resolveDocLink('./lld/x.md#sec-1', 'docs/design.md');
    assertEqual(r.internal, true, 'internal');
    assertEqual(r.docPath, 'docs/lld/x.md', 'docPath strips anchor');
    assertEqual(r.anchor, 'sec-1', 'anchor captured');
  });
  suite.test('parent directory traversal stays under docs/', () => {
    const r = resolveDocLink('../requirements.md', 'docs/lld/deep.md');
    assertEqual(r.internal, true, 'internal');
    assertEqual(r.docPath, 'docs/requirements.md', 'one level up');
  });
  suite.test('.txt also routed (server serves .txt docs)', () => {
    const r = resolveDocLink('./notes.txt', 'docs/design.md');
    assertEqual(r.internal, true, '.txt is a doc');
    assertEqual(r.docPath, 'docs/notes.txt', '.txt docPath');
  });
  suite.test('bare name (same dir)', () => {
    const r = resolveDocLink('test-plan.md', 'docs/design.md');
    assertEqual(r.internal, true, 'internal');
    assertEqual(r.docPath, 'docs/test-plan.md', 'same-dir docPath');
  });
});

// ── resolveDocLink: non-internal → leave to browser ─────

describe('resolveDocLink: non-internal → leave to browser', suite => {
  suite.test('https external', () => {
    assertEqual(resolveDocLink('https://gitee.com/x', 'docs/design.md').internal, false, 'https not internal');
  });
  suite.test('http external', () => {
    assertEqual(resolveDocLink('http://ex.com', 'docs/design.md').internal, false, 'http not internal');
  });
  suite.test('mailto', () => {
    assertEqual(resolveDocLink('mailto:a@b.com', 'docs/design.md').internal, false, 'mailto not internal');
  });
  suite.test('same-page anchor only', () => {
    const r = resolveDocLink('#section-1', 'docs/design.md');
    assertEqual(r.internal, false, 'anchor not internal');
    assertEqual(r.anchor, 'section-1', 'anchor captured for scroll');
  });
  suite.test('non-doc extension (.png)', () => {
    assertEqual(resolveDocLink('./img/diag.png', 'docs/design.md').internal, false, '.png not internal');
  });
  suite.test('empty href', () => {
    assertEqual(resolveDocLink('', 'docs/design.md').internal, false, 'empty not internal');
  });
  suite.test('no doc context (currentDocPath empty)', () => {
    assertEqual(resolveDocLink('./x.md', '').internal, false, 'no context → not internal');
  });
  suite.test('protocol-relative //host', () => {
    assertEqual(resolveDocLink('//cdn.ex.com/x.md', 'docs/design.md').internal, false, 'protocol-relative not internal');
  });
  suite.test('over-traversal above docs/ root → not internal (defense-in-depth)', () => {
    assertEqual(resolveDocLink('../../../etc/passwd.md', 'docs/design.md').internal, false, 'client blocks escape');
  });
  suite.test('javascript: scheme (XSS) → not internal', () => {
    assertEqual(resolveDocLink('javascript:alert(1)', 'docs/design.md').internal, false, 'javascript: not internal');
  });
});

process.exit(printSummary());
