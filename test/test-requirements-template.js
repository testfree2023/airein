/**
 * test-requirements-template.js — P005 resolveRequirementsTemplate
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  describe, assertEqual, assertOk, printSummary, projectRoot,
} = require('./helpers');

const libPath = path.join(projectRoot(), 'scripts', 'lib', 'requirements-template.js');
const {
  resolveRequirementsTemplate,
} = require(libPath);

const DEFINITIONS = {
  's-feature': { docs: ['requirements', 'tasks'] },
  's-bugfix': { docs: ['tasks'] },
  'm-feature': { docs: ['requirements', 'design', 'test-plan', 'tasks'] },
  'm-bugfix': { docs: ['requirements', 'tasks'] },
  'm-urgent': { docs: ['tasks'] },
  'l-feature': { docs: ['requirements', 'design', 'test-plan', 'deployment', 'tasks'] },
  'l-bugfix': { docs: ['requirements', 'design', 'test-plan', 'tasks'] },
  hotfix: { docs: ['tasks'] },
  'custom-flow': { docs: ['requirements', 'tasks'] },
};

function resolve(pipeline) {
  return resolveRequirementsTemplate(pipeline, { definitions: DEFINITIONS });
}

describe('resolveRequirementsTemplate: tier mapping', (suite) => {
  suite.test('s-feature → s template', () => {
    const r = resolve('s-feature');
    assertOk(r.applicable, 'applicable');
    assertEqual(r.tier, 's', 'tier s');
    assertEqual(r.relativePath, 'templates/docs/requirements/s.md', 'path');
    assertEqual(r.fallback, false, 'no fallback');
  });

  suite.test('m-feature and m-bugfix → m', () => {
    assertEqual(resolve('m-feature').tier, 'm', 'm-feature');
    assertEqual(resolve('m-bugfix').tier, 'm', 'm-bugfix');
    assertEqual(resolve('m-feature').relativePath, 'templates/docs/requirements/m.md', 'm path');
  });

  suite.test('l-feature and l-bugfix → l', () => {
    assertEqual(resolve('l-feature').tier, 'l', 'l-feature');
    assertEqual(resolve('l-bugfix').tier, 'l', 'l-bugfix');
  });
});

describe('resolveRequirementsTemplate: not applicable', (suite) => {
  suite.test('pipelines without requirements are not applicable', () => {
    for (const name of ['s-bugfix', 'm-urgent', 'hotfix']) {
      const r = resolve(name);
      assertEqual(r.applicable, false, name + ' not applicable');
      assertEqual(r.tier, null, name + ' tier null');
      assertEqual(r.relativePath, null, name + ' path null');
    }
  });
});

describe('resolveRequirementsTemplate: fallback and errors', (suite) => {
  suite.test('custom pipeline with requirements falls back to m', () => {
    const r = resolve('custom-flow');
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

describe('resolveRequirementsTemplate: files exist', (suite) => {
  suite.test('resolved paths exist under project root when applicable', () => {
    for (const name of ['s-feature', 'm-feature', 'l-feature']) {
      const r = resolve(name);
      const abs = path.join(projectRoot(), r.relativePath);
      assertOk(fs.existsSync(abs), name + ' template exists: ' + r.relativePath);
    }
  });
});

describe('PRD templates: content gates', (suite) => {
  suite.test('s/m/l declare PRD and required sections', () => {
    const s = fs.readFileSync(path.join(projectRoot(), 'templates/docs/requirements/s.md'), 'utf8');
    const m = fs.readFileSync(path.join(projectRoot(), 'templates/docs/requirements/m.md'), 'utf8');
    const l = fs.readFileSync(path.join(projectRoot(), 'templates/docs/requirements/l.md'), 'utf8');
    assertOk(s.includes('产品需求说明书') || s.includes('PRD'), 's PRD');
    assertOk(s.includes('Users & Roles') && s.includes('User Story') && s.includes('Use Case'), 's roles/story/uc');
    assertOk(s.includes('Acceptance Criteria') && s.includes('Out of Scope'), 's acceptance/oos');
    assertOk(m.includes('User Story') && m.includes('Non-Functional'), 'm story+NFR');
    assertOk(m.includes('禁止'), 'm negative constraint');
    assertOk(l.includes('Success Metrics') && l.includes('Business Process Overview'), 'l metrics+overview');
    assertOk(l.includes('requirements-{topic}'), 'l split guidance');
  });

  suite.test('compat stub is not authoritative thin template', () => {
    const stub = fs.readFileSync(path.join(projectRoot(), 'templates/docs/requirements.md'), 'utf8');
    assertOk(stub.includes('stub') || stub.includes('COMPATIBILITY'), 'marked stub');
    assertOk(stub.includes('requirements/'), 'points to tier files');
    assertOk(!stub.includes('WHEN {条件} THEN {预期结果}'), 'no authoritative WHEN/THEN checklist');
  });

  suite.test('sync-airein lists lib + three tier templates', () => {
    const sync = fs.readFileSync(path.join(projectRoot(), 'scripts/update/sync-airein.sh'), 'utf8');
    assertOk(sync.includes('scripts/lib/requirements-template.js'), 'lib in CORE_FILES');
    assertOk(sync.includes('templates/docs/requirements/s.md'), 's.md sync');
    assertOk(sync.includes('templates/docs/requirements/m.md'), 'm.md sync');
    assertOk(sync.includes('templates/docs/requirements/l.md'), 'l.md sync');
  });
});

process.exit(printSummary());
