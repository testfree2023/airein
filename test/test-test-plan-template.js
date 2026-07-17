/**
 * test-test-plan-template.js — resolveTestPlanTemplate by pipeline (m/l)
 *
 * Spec: plan test-plan.md uses templates/docs/test-plan/{m|l}.md when pipeline
 * includes test-plan; m-feature includes test-plan; s-* default does not.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  describe, assertEqual, assertOk, printSummary, projectRoot,
} = require('./helpers');

const {
  resolveTestPlanTemplate,
} = require(path.join(projectRoot(), 'scripts', 'lib', 'test-plan-template.js'));

const DEFINITIONS = {
  's-feature': { docs: ['requirements', 'tasks'] },
  'm-feature': { docs: ['requirements', 'design', 'test-plan', 'tasks'] },
  'm-bugfix': { docs: ['requirements', 'tasks'] },
  'l-feature': { docs: ['requirements', 'design', 'test-plan', 'deployment', 'tasks'] },
  'l-bugfix': { docs: ['requirements', 'design', 'test-plan', 'tasks'] },
  'custom-with-tp': { docs: ['test-plan', 'tasks'] },
};

function resolve(pipeline) {
  return resolveTestPlanTemplate(pipeline, { definitions: DEFINITIONS });
}

describe('resolveTestPlanTemplate: tier mapping', (suite) => {
  suite.test('m-feature → m template', () => {
    const r = resolve('m-feature');
    assertOk(r.applicable, 'applicable');
    assertEqual(r.tier, 'm', 'tier m');
    assertEqual(r.relativePath, 'templates/docs/test-plan/m.md', 'path');
    assertEqual(r.fallback, false, 'no fallback');
  });

  suite.test('l-feature and l-bugfix → l', () => {
    assertEqual(resolve('l-feature').tier, 'l', 'l-feature');
    assertEqual(resolve('l-bugfix').tier, 'l', 'l-bugfix');
    assertEqual(resolve('l-feature').relativePath, 'templates/docs/test-plan/l.md', 'l path');
  });

  suite.test('s-feature has no test-plan step → not applicable', () => {
    const r = resolve('s-feature');
    assertEqual(r.applicable, false, 's-feature no test-plan');
  });

  suite.test('m-bugfix has no test-plan step → not applicable', () => {
    const r = resolve('m-bugfix');
    assertEqual(r.applicable, false, 'm-bugfix no test-plan');
  });
});

describe('resolveTestPlanTemplate: fallback and errors', (suite) => {
  suite.test('custom pipeline with test-plan falls back to m', () => {
    const r = resolve('custom-with-tp');
    assertOk(r.applicable, 'applicable');
    assertEqual(r.tier, 'm', 'fallback m');
    assertOk(r.fallback, 'fallback flag');
  });

  suite.test('unknown pipeline throws', () => {
    let threw = false;
    try {
      resolve('no-such-pipeline');
    } catch (err) {
      threw = true;
      assertOk(String(err.message).includes('unknown'), 'mentions unknown');
    }
    assertOk(threw, 'threw');
  });
});

describe('test-plan templates: files and content gates', (suite) => {
  suite.test('m/l template files exist; stub points to resolver', () => {
    for (const tier of ['m', 'l']) {
      const abs = path.join(projectRoot(), 'templates', 'docs', 'test-plan', tier + '.md');
      assertOk(fs.existsSync(abs), tier + '.md exists');
    }
    const stub = fs.readFileSync(path.join(projectRoot(), 'templates', 'docs', 'test-plan.md'), 'utf8');
    assertOk(stub.includes('stub') || stub.includes('COMPATIBILITY'), 'marked stub');
    assertOk(stub.includes('resolveTestPlanTemplate'), 'resolver name');
    assertOk(stub.includes('test-plan/'), 'points to tier dir');
  });

  suite.test('l has VS-by-UC body; m has Critical + lighter VS', () => {
    const m = fs.readFileSync(path.join(projectRoot(), 'templates/docs/test-plan/m.md'), 'utf8');
    const l = fs.readFileSync(path.join(projectRoot(), 'templates/docs/test-plan/l.md'), 'utf8');
    assertOk(l.includes('Verification Specs by UC'), 'l VS body');
    assertOk(l.includes('Invariant Verification Specs'), 'l invariants');
    assertOk(l.includes('精炼 ≠ 稀疏'), 'l anti-thin');
    assertOk(m.includes('Critical Acceptance Index'), 'm critical index');
    assertOk(m.includes('Verification Specs'), 'm has VS section');
    assertOk(m.includes('关键 UC') || m.includes('按需') || m.includes('不必七维'), 'm lighter VS guidance');
  });

  suite.test('pipelines.json m-feature includes test-plan after design', () => {
    const raw = JSON.parse(fs.readFileSync(
      path.join(projectRoot(), 'templates', 'pipelines.json'), 'utf8'));
    assertEqual(
      JSON.stringify(raw.definitions['m-feature'].docs),
      JSON.stringify(['requirements', 'design', 'test-plan', 'tasks']),
      'm-feature docs order',
    );
  });

  suite.test('sync-airein lists lib + tier templates', () => {
    const sync = fs.readFileSync(path.join(projectRoot(), 'scripts/update/sync-airein.sh'), 'utf8');
    assertOk(sync.includes('scripts/lib/test-plan-template.js'), 'lib in CORE');
    assertOk(sync.includes('templates/docs/test-plan/m.md'), 'm.md sync');
    assertOk(sync.includes('templates/docs/test-plan/l.md'), 'l.md sync');
  });
});

process.exit(printSummary());
