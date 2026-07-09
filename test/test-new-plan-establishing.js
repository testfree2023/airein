#!/usr/bin/env node
/**
 * Test: design-doc-resolver — establishing vs referencing judgment
 *
 * P016 Task 1.1. Verifies resolveProjectDesignDocs() correctly detects
 * whether a project already has project-level design docs (conventions /
 * architecture), in either archived (docs/*.md) or in-flight plan
 * archived (docs/conventions.md, docs/architecture.md) or in-flight plan
 * (docs/plans/{plan}/design-conventions.md, design-architecture.md) locations.
 *
 * establishing = no project-level docs anywhere → first design-bearing
 * plan must generate BOTH conventions + architecture, regardless of
 * project size / complexity tier / frontend-or-backend.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
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
  // layout: { 'docs/conventions.md': '...', 'docs/plans/P001/design-architecture.md': '...', ... }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolver-'));
  for (const rel of Object.keys(layout)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, layout[rel]);
  }
  return dir;
}

describe('design-doc-resolver: establishing vs referencing', suite => {
  suite.test('module is require-able and exports resolveProjectDesignDocs', () => {
    assertOk(typeof resolveProjectDesignDocs === 'function', 'resolveProjectDesignDocs is a function');
  });

  suite.test('empty project (no docs/) → establishing, both missing', () => {
    const dir = makeTempProject({});
    const r = resolveProjectDesignDocs(dir);
    assertEqual(r.establishing, true, 'establishing=true when no docs anywhere');
    assertEqual(r.conventions.exists, false, 'conventions missing');
    assertEqual(r.architecture.exists, false, 'architecture missing');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('docs/conventions.md exists → referencing, archived source', () => {
    const dir = makeTempProject({ 'docs/conventions.md': '# Conventions' });
    const r = resolveProjectDesignDocs(dir);
    assertEqual(r.establishing, false, 'establishing=false when archived conventions exists');
    assertEqual(r.conventions.exists, true, 'conventions detected');
    assertEqual(r.conventions.source, 'archived', 'archived source');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('docs/architecture.md exists → referencing, archived source', () => {
    const dir = makeTempProject({ 'docs/architecture.md': '# Architecture' });
    const r = resolveProjectDesignDocs(dir);
    assertEqual(r.establishing, false, 'establishing=false when archived architecture exists');
    assertEqual(r.architecture.exists, true, 'architecture detected');
    assertEqual(r.architecture.source, 'archived', 'archived source');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('docs/plans/P001/design-conventions.md exists → referencing, plan source', () => {
    const dir = makeTempProject({ 'docs/plans/P001-x/design-conventions.md': '# C' });
    const r = resolveProjectDesignDocs(dir);
    assertEqual(r.establishing, false, 'establishing=false when plan conventions exists');
    assertEqual(r.conventions.exists, true, 'conventions detected in plan dir');
    assertEqual(r.conventions.source, 'plan', 'plan source');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('docs/plans/*/design-architecture.md exists → referencing, plan source', () => {
    const dir = makeTempProject({ 'docs/plans/P002-y/design-architecture.md': '# A' });
    const r = resolveProjectDesignDocs(dir);
    assertEqual(r.establishing, false, 'establishing=false when plan architecture exists');
    assertEqual(r.architecture.exists, true, 'architecture detected in plan dir');
    assertEqual(r.architecture.source, 'plan', 'plan source');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('both archived exist → referencing, both archived', () => {
    const dir = makeTempProject({
      'docs/conventions.md': '# C',
      'docs/architecture.md': '# A',
    });
    const r = resolveProjectDesignDocs(dir);
    assertEqual(r.establishing, false, 'establishing=false');
    assertEqual(r.conventions.source, 'archived', 'conventions archived');
    assertEqual(r.architecture.source, 'archived', 'architecture archived');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('archived takes priority over plan source', () => {
    const dir = makeTempProject({
      'docs/conventions.md': '# C archived',
      'docs/plans/P001-x/design-conventions.md': '# C plan',
    });
    const r = resolveProjectDesignDocs(dir);
    assertEqual(r.conventions.source, 'archived', 'archived wins over plan');
    assertEqual(r.establishing, false, 'establishing=false');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('partial existence (only conventions) → not establishing', () => {
    // Only conventions exists, architecture missing — still NOT establishing
    // (conservative: don't overwrite the existing conventions pair).
    const dir = makeTempProject({ 'docs/conventions.md': '# C' });
    const r = resolveProjectDesignDocs(dir);
    assertEqual(r.establishing, false, 'establishing=false even if only one doc exists');
    assertEqual(r.architecture.exists, false, 'architecture still missing');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('docs/plans/ exists but has no design docs → establishing', () => {
    // A plan dir with only design.md (no split conventions/architecture) does
    // NOT count as having project-level design docs → still establishing.
    const dir = makeTempProject({
      'docs/plans/P001-x/design.md': '# unified design',
      'docs/plans/P001-x/tasks.md': '# tasks',
    });
    const r = resolveProjectDesignDocs(dir);
    assertEqual(r.establishing, true, 'establishing=true — unified design.md is not project-level conventions/architecture');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('design-doc-resolver: CLI mode', suite => {
  suite.test('running as CLI prints JSON with establishing field', () => {
    const dir = makeTempProject({ 'docs/conventions.md': '# C' });
    const result = spawnSync('node', [RESOLVER_PATH, dir], {
      timeout: 5000,
      encoding: 'utf8',
    });
    assertEqual(result.status, 0, 'CLI exits 0');
    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch (e) {
      assertOk(false, `CLI output is valid JSON (got: ${result.stdout.slice(0, 80)})`);
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    }
    assertEqual(parsed.establishing, false, 'CLI reports establishing=false for project with conventions');
    assertEqual(parsed.conventions.exists, true, 'CLI reports conventions.exists=true');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('CLI with no arg defaults to process.cwd()', () => {
    // Run in a temp empty dir → establishing should be true.
    const dir = makeTempProject({});
    const result = spawnSync('node', [RESOLVER_PATH], {
      cwd: dir,
      timeout: 5000,
      encoding: 'utf8',
    });
    assertEqual(result.status, 0, 'CLI exits 0 with no arg');
    const parsed = JSON.parse(result.stdout);
    assertEqual(parsed.establishing, true, 'CLI defaults to cwd, empty project → establishing');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('frontend / no-exact-template fallback (Task 1.3)', suite => {
  // P016 decision #2: even pure-frontend projects establish architecture.
  // Fallback target is typescript.md for JS/TS frontends. Verify the fallback
  // templates exist so an establishing frontend plan never fails for lack of a
  // template, and the SKILL documents the fallback.
  const { readSkill } = require('./helpers');
  const TEMPLATES = path.join(projectRoot(), 'templates', 'docs');

  suite.test('typescript fallback templates exist for architecture + conventions', () => {
    assertOk(fs.existsSync(path.join(TEMPLATES, 'design-architecture', 'typescript.md')), 'design-architecture/typescript.md exists');
    assertOk(fs.existsSync(path.join(TEMPLATES, 'design-conventions', 'typescript.md')), 'design-conventions/typescript.md exists');
  });

  suite.test('new-plan SKILL documents frontend establishing + fallback', () => {
    const skill = readSkill('new-plan');
    const hasFrontend = /pure-frontend|frontend.*architecture|frontend.*fallback/i.test(skill);
    assertOk(hasFrontend, 'SKILL mentions frontend establishing/fallback');
    const hasResolver = /design-doc-resolver/.test(skill);
    assertOk(hasResolver, 'SKILL references design-doc-resolver');
    const hasEstablishing = /establishing/.test(skill);
    assertOk(hasEstablishing, 'SKILL documents establishing vs referencing');
  });
});

process.exit(printSummary());
