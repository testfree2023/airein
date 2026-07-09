/**
 * Test: Global pipeline loader integration for approval-sequence.js
 *
 * Verifies approval-sequence.js reads pipeline definitions from
 * global templates/pipelines.json instead of per-project config.
 */

const fs = require('fs');
const path = require('path');
const {
  describe, assertContains, projectRoot, printSummary
} = require('./helpers');

const SEQ_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'approval-sequence.js');

describe('approval-sequence: global pipeline loader', suite => {
  const src = fs.readFileSync(SEQ_PATH, 'utf8');

  suite.test('imports loadGlobalPipelines from quality-config', () => {
    assertContains(src, 'loadGlobalPipelines', 'approval-sequence uses global pipeline loader');
  });

  suite.test('does not use inline DEFAULT_PIPELINES for primary pipeline', () => {
    // After refactor, getPlanPipeline should delegate to loadGlobalPipelines
    assertContains(src, 'loadGlobalPipelines()', 'calls loadGlobalPipelines function');
  });
});

process.exit(printSummary());
