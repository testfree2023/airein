#!/usr/bin/env node
/**
 * Test: design-doc-resolver — P020 deployment field support
 *
 * P020 Task 1.2. Verifies resolveProjectDesignDocs() detects deployment docs
 * in both archived (docs/deployment.md) and in-flight plan deployment.md
 * locations, with proper priority (archived > plan) and backward compatibility.
 *
 * Test cases:
 * - No deployment anywhere → deployment.exists: false
 * - Archived docs/deployment.md → deployment.exists: true, source: archived
 * - In-flight plan deployment.md → deployment.exists: true, source: plan
 * - Both archived and in-flight → archived takes priority
 * - Backward compat: existing fields unchanged
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolver-deploy-'));
  for (const rel of Object.keys(layout)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, layout[rel]);
  }
  return dir;
}

describe('design-doc-resolver: deployment field (P020 T1.2)', suite => {
  suite.test('module is require-able and exports resolveProjectDesignDocs', () => {
    assertOk(typeof resolveProjectDesignDocs === 'function', 'resolveProjectDesignDocs is a function');
  });

  suite.test('no deployment anywhere → deployment.exists: false', () => {
    const dir = makeTempProject({ 'docs/roadmap.md': '# Roadmap' });
    const r = resolveProjectDesignDocs(dir);
    assertEqual(r.deployment && r.deployment.exists, false, 'deployment.exists is false when none found');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('archived docs/deployment.md → deployment.exists: true, source: archived', () => {
    const dir = makeTempProject({ 'docs/deployment.md': '# Deployment' });
    const r = resolveProjectDesignDocs(dir);
    assertEqual(r.deployment && r.deployment.exists, true, 'deployment detected at docs/deployment.md');
    assertEqual(r.deployment && r.deployment.source, 'archived', 'source is archived');
    assertOk(r.deployment && r.deployment.path && fs.existsSync(r.deployment.path), 'path exists on disk');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('in-flight plan deployment.md → deployment.exists: true, source: plan', () => {
    const dir = makeTempProject({
      'docs/plans/P001-test/deployment.md': '# Plan Deployment',
    });
    const r = resolveProjectDesignDocs(dir);
    assertEqual(r.deployment && r.deployment.exists, true, 'deployment detected in plan');
    assertEqual(r.deployment && r.deployment.source, 'plan', 'source is plan');
    assertOk(r.deployment && r.deployment.path && r.deployment.path.includes('P001-test'), 'path points to in-flight plan');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('both archived and in-flight → archived takes priority', () => {
    const dir = makeTempProject({
      'docs/deployment.md': '# Archived',
      'docs/plans/P001-test/deployment.md': '# In-flight',
    });
    const r = resolveProjectDesignDocs(dir);
    assertEqual(r.deployment && r.deployment.exists, true, 'deployment exists');
    assertEqual(r.deployment && r.deployment.source, 'archived', 'archived prioritized over plan');
    assertOk(r.deployment && r.deployment.path && path.basename(r.deployment.path) === 'deployment.md', 'path points to archived');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('backward compat: establishing/conventions/architecture fields unchanged', () => {
    const dir = makeTempProject({
      'docs/conventions.md': '# Conventions',
      'docs/architecture.md': '# Architecture',
      'docs/deployment.md': '# Deployment',
    });
    const r = resolveProjectDesignDocs(dir);
    // Existing fields must exist and work as before
    assertEqual(typeof r.establishing, 'boolean', 'establishing is boolean');
    assertEqual(typeof r.conventions, 'object', 'conventions is object');
    assertEqual(typeof r.architecture, 'object', 'architecture is object');
    // Values: conventions + architecture exist → establishing = false
    assertEqual(r.establishing, false, 'establishing=false when conventions+architecture exist');
    assertEqual(r.conventions.exists, true, 'conventions detected');
    assertEqual(r.architecture.exists, true, 'architecture detected');
    // New field
    assertEqual(r.deployment && r.deployment.exists, true, 'deployment detected');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('deployment establishing independent of conventions/architecture', () => {
    // Scenario: conventions/architecture established, deployment not
    const dir = makeTempProject({
      'docs/conventions.md': '# Conventions',
      'docs/architecture.md': '# Architecture',
    });
    const r = resolveProjectDesignDocs(dir);
    assertEqual(r.establishing, false, 'establishing=false (conventions+architecture exist)');
    assertEqual(r.deployment && r.deployment.exists, false, 'deployment.exists=false (no deployment doc)');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

process.exit(printSummary());
