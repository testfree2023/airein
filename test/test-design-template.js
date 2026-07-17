/**
 * test-design-template.js — resolveDesignTemplate by pipeline (s/m/l)
 *
 * Spec: plan design.md uses templates/docs/design/{s|m|l}.md when pipeline
 * includes design; Impact mandatory; Permissions N/A-or-detail; Cross-module thicken.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  describe, assertEqual, assertOk, printSummary, projectRoot,
} = require('./helpers');

const {
  resolveDesignTemplate,
} = require(path.join(projectRoot(), 'scripts', 'lib', 'design-template.js'));

const DEFINITIONS = {
  's-feature': { docs: ['requirements', 'tasks'] },
  's-bugfix': { docs: ['tasks'] },
  'm-feature': { docs: ['requirements', 'design', 'test-plan', 'tasks'] },
  'm-bugfix': { docs: ['requirements', 'tasks'] },
  'm-urgent': { docs: ['tasks'] },
  'l-feature': { docs: ['requirements', 'design', 'test-plan', 'deployment', 'tasks'] },
  'l-bugfix': { docs: ['requirements', 'design', 'test-plan', 'tasks'] },
  hotfix: { docs: ['tasks'] },
  'custom-with-design': { docs: ['design', 'tasks'] },
};

function resolve(pipeline) {
  return resolveDesignTemplate(pipeline, { definitions: DEFINITIONS });
}

describe('resolveDesignTemplate: tier mapping', (suite) => {
  suite.test('m-feature → m template', () => {
    const r = resolve('m-feature');
    assertOk(r.applicable, 'applicable');
    assertEqual(r.tier, 'm', 'tier m');
    assertEqual(r.relativePath, 'templates/docs/design/m.md', 'path');
    assertEqual(r.fallback, false, 'no fallback');
  });

  suite.test('l-feature and l-bugfix → l', () => {
    assertEqual(resolve('l-feature').tier, 'l', 'l-feature');
    assertEqual(resolve('l-bugfix').tier, 'l', 'l-bugfix');
    assertEqual(resolve('l-feature').relativePath, 'templates/docs/design/l.md', 'l path');
  });

  suite.test('s-feature has no design step → not applicable', () => {
    const r = resolve('s-feature');
    assertEqual(r.applicable, false, 's-feature no design in default pipeline');
  });
});

describe('resolveDesignTemplate: not applicable', (suite) => {
  suite.test('pipelines without design are not applicable', () => {
    for (const name of ['s-bugfix', 'm-bugfix', 'm-urgent', 'hotfix']) {
      const r = resolve(name);
      assertEqual(r.applicable, false, name + ' not applicable');
      assertEqual(r.relativePath, null, name + ' path null');
    }
  });
});

describe('resolveDesignTemplate: fallback and errors', (suite) => {
  suite.test('custom pipeline with design falls back to m', () => {
    const r = resolve('custom-with-design');
    assertOk(r.applicable, 'applicable');
    assertEqual(r.tier, 'm', 'fallback m');
    assertOk(r.fallback, 'fallback flag');
  });

  suite.test('s-* pipeline that includes design → s template', () => {
    const r = resolveDesignTemplate('s-feature', {
      definitions: { 's-feature': { docs: ['requirements', 'design', 'tasks'] } },
    });
    assertOk(r.applicable, 'applicable');
    assertEqual(r.tier, 's', 'tier s');
    assertEqual(r.relativePath, 'templates/docs/design/s.md', 's path');
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

describe('resolveDesignTemplate: files exist', (suite) => {
  suite.test('s/m/l template files exist', () => {
    for (const tier of ['s', 'm', 'l']) {
      const abs = path.join(projectRoot(), 'templates', 'docs', 'design', tier + '.md');
      assertOk(fs.existsSync(abs), tier + '.md exists');
    }
  });
});

describe('Design templates: content gates', (suite) => {
  suite.test('s/m/l share Impact + Permissions + Cross-module rules', () => {
    for (const tier of ['s', 'm', 'l']) {
      const body = fs.readFileSync(
        path.join(projectRoot(), 'templates', 'docs', 'design', tier + '.md'),
        'utf8',
      );
      assertOk(body.includes('Impact & Follow-up Checks'), tier + ' Impact');
      assertOk(body.includes('Permissions & AuthZ'), tier + ' Permissions');
      assertOk(body.includes('Cross-module Dependencies'), tier + ' Cross-module');
      assertOk(/N\/A|显式 N\/A|否则.*N\/A/i.test(body) || body.includes('N/A'), tier + ' N/A guidance');
    }
  });

  suite.test('s emphasizes change surface + sequence; l requires architecture + full UC traceability', () => {
    const s = fs.readFileSync(path.join(projectRoot(), 'templates/docs/design/s.md'), 'utf8');
    const m = fs.readFileSync(path.join(projectRoot(), 'templates/docs/design/m.md'), 'utf8');
    const l = fs.readFileSync(path.join(projectRoot(), 'templates/docs/design/l.md'), 'utf8');
    assertOk(s.includes('Change Surface') && s.includes('Sequence'), 's surface+seq');
    assertOk(s.includes('禁止') || s.includes('薄概要') || s.includes('详细设计为主'), 's guidance');
    assertOk(m.includes('Target Architecture') && m.includes('Traceability'), 'm arch+trace');
    assertOk(l.includes('Target Architecture') && l.includes('Subsystem Design'), 'l arch+subsystem');
    assertOk(l.includes('Traceability') && l.includes('Consistency & Failure'), 'l trace+consistency');
    assertOk(l.includes('## Sub-documents'), 'l sub-documents');
    assertOk(l.includes('design: approved') || l.includes('Sub-documents'), 'l compound approval hint');
  });

  suite.test('architect-quality gates: diagram legend, partition, self-contained UC, model before DD, API funcs', () => {
    const s = fs.readFileSync(path.join(projectRoot(), 'templates/docs/design/s.md'), 'utf8');
    const m = fs.readFileSync(path.join(projectRoot(), 'templates/docs/design/m.md'), 'utf8');
    const l = fs.readFileSync(path.join(projectRoot(), 'templates/docs/design/l.md'), 'utf8');

    assertOk(l.includes('子系统划分原则'), 'l partition rationale');
    assertOk(l.includes('读图说明'), 'l diagram read guide');
    assertOk(l.includes('外部系统') || l.includes('外部边界'), 'l external boundary');
    assertOk(l.includes('Logical Model & Services'), 'l model/services before DD');
    assertOk(l.includes('一句话意图'), 'l self-contained UC intent');
    assertOk(l.includes('自洽'), 'l self-contained doc');
    assertOk(l.includes('methodName') || l.includes('method('), 'l API method contract');
    assertOk(!l.includes('禁止只有接口名') || l.includes('禁止只有'), 'l forbids name-only API');

    assertOk(m.includes('读图说明'), 'm diagram read guide');
    assertOk(m.includes('Logical Model & Services'), 'm model/services');
    assertOk(m.includes('一句话意图'), 'm UC intent');
    assertOk(m.includes('method('), 'm API method');

    assertOk(s.includes('一句话意图'), 's UC intent');
    assertOk(s.includes('方法级契约') || s.includes('method(args)'), 's method contract');
    assertOk(s.includes('自洽'), 's self-contained');
  });

  suite.test('benyue-style framework absorb: constraints, principles, viewpoints, integration, open issues', () => {
    const s = fs.readFileSync(path.join(projectRoot(), 'templates/docs/design/s.md'), 'utf8');
    const m = fs.readFileSync(path.join(projectRoot(), 'templates/docs/design/m.md'), 'utf8');
    const l = fs.readFileSync(path.join(projectRoot(), 'templates/docs/design/l.md'), 'utf8');

    assertOk(l.includes('Design Constraints'), 'l constraints');
    assertOk(l.includes('Design Principles'), 'l principles');
    assertOk(l.includes('Architecture Decisions'), 'l arch decisions');
    assertOk(l.includes('架构多视图') || l.includes('逻辑（服务边界'), 'l multi-view');
    assertOk(l.includes('配置态') || l.includes('运行时'), 'l viewpoint');
    assertOk(l.includes('Integration Guide'), 'l integration guide');
    assertOk(l.includes('Open Issues'), 'l open issues');
    assertOk(l.includes('关系'), 'l model relations');
    assertOk(l.includes('禁止照搬') || l.includes('精炼'), 'l anti-bloat hint');

    assertOk(m.includes('Design Constraints'), 'm constraints');
    assertOk(m.includes('Open Issues'), 'm open issues');
    assertOk(m.includes('Integration Guide'), 'm integration');
    assertOk(m.includes('关系'), 'm model relations');

    assertOk(s.includes('Open Issues'), 's open issues optional');
    assertOk(s.includes('关系') || s.includes('关联'), 's model relation hint');
  });

  suite.test('compat stub points to tier files', () => {
    const stub = fs.readFileSync(path.join(projectRoot(), 'templates/docs/design.md'), 'utf8');
    assertOk(stub.includes('stub') || stub.includes('COMPATIBILITY'), 'marked stub');
    assertOk(stub.includes('design/'), 'points to tier dir');
    assertOk(stub.includes('resolveDesignTemplate'), 'resolver name');
  });

  suite.test('sync-airein lists lib + three tier templates', () => {
    const sync = fs.readFileSync(path.join(projectRoot(), 'scripts/update/sync-airein.sh'), 'utf8');
    assertOk(sync.includes('scripts/lib/design-template.js'), 'lib in CORE');
    assertOk(sync.includes('templates/docs/design/s.md'), 's.md sync');
    assertOk(sync.includes('templates/docs/design/m.md'), 'm.md sync');
    assertOk(sync.includes('templates/docs/design/l.md'), 'l.md sync');
  });
});

process.exit(printSummary());
