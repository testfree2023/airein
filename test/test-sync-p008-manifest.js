/**
 * sync-airein / clean-airein manifest must ship P008 gates + prune legacy agents.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  describe, assertOk, assertContains, printSummary, projectRoot,
} = require('./helpers');

const root = projectRoot();
const sync = fs.readFileSync(path.join(root, 'scripts', 'update', 'sync-airein.sh'), 'utf8');
const clean = fs.readFileSync(path.join(root, 'scripts', 'update', 'clean-airein.sh'), 'utf8');
const { CC_ASSET_DIRS } = require(path.join(root, 'scripts', 'lib', 'cc-register.js'));

describe('P008 install manifest', (suite) => {
  for (const rel of [
    'scripts/hooks/roadmap-gate.js',
    'scripts/hooks/tests-ledger-gate.js',
    'scripts/hooks/progress-completion-gate.js',
    'scripts/lib/roadmap-contract.js',
    'scripts/lib/tests-ledger-gate.js',
    'scripts/lib/parse-tests-ledger.js',
    'scripts/lib/pipeline-roles-banner.js',
    'templates/docs/roadmap.md',
  ]) {
    suite.test(`sync-airein lists ${rel}`, () => {
      assertContains(sync, '"' + rel + '"', rel);
    });
  }

  suite.test('clean-airein prunes legacy architect agent', () => {
    assertContains(clean, '"agents/architect.md"', 'architect stale');
    assertContains(clean, '"agents/code-reviewer.md"', 'code-reviewer stale');
  });

  suite.test('cc-register delivers agents', () => {
    assertOk(CC_ASSET_DIRS.indexOf('agents') >= 0, 'agents in CC_ASSET_DIRS');
  });
});

process.exit(printSummary());
