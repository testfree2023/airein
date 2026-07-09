/**
 * Test: quality-config.js — DEFAULTS, deepMerge, flowControl switches
 *
 * Verifies:
 *   - DEFAULTS contains flowControl with correct default values
 *   - deepMerge merges nested objects correctly
 *   - loadQualityConfig returns defaults when no config file
 *   - loadQualityConfig respects user overrides
 */

const path = require('path');
const fs = require('fs');
const {
  describe, assert, assertEqual, assertOk,
  assertContains, projectRoot
} = require('./helpers');

// Load the module under test
const qualityConfig = require(path.join(projectRoot(), 'scripts', 'lib', 'quality-config'));
const { DEFAULTS, deepMerge, loadQualityConfig } = qualityConfig;

describe('quality-config: DEFAULTS structure', suite => {
  suite.test('DEFAULTS is an object', () => {
    assertOk(DEFAULTS, 'DEFAULTS should be truthy');
    assertEqual(typeof DEFAULTS, 'object', 'DEFAULTS type');
  });

  suite.test('DEFAULTS has testCoverage section', () => {
    assertOk(DEFAULTS.testCoverage, 'testCoverage exists');
    assertEqual(DEFAULTS.testCoverage.minRatio, 0.3, 'minRatio default');
    assertEqual(DEFAULTS.testCoverage.minSourceFiles, 2, 'minSourceFiles default');
  });

  suite.test('DEFAULTS has blocking section', () => {
    assertOk(DEFAULTS.blocking, 'blocking exists');
    assertEqual(DEFAULTS.blocking.testFailure, true, 'testFailure default');
    assertEqual(DEFAULTS.blocking.buildFailure, true, 'buildFailure default');
    assertEqual(DEFAULTS.blocking.untestedSource, true, 'untestedSource default');
  });

  suite.test('DEFAULTS has aireinLog section', () => {
    assertOk(DEFAULTS.aireinLog, 'aireinLog exists');
    assertEqual(DEFAULTS.aireinLog.enabled, true, 'aireinLog enabled');
    assertEqual(DEFAULTS.aireinLog.retentionDays, 7, 'retentionDays default');
  });

  suite.test('DEFAULTS has flowControl section (v2.4)', () => {
    assertOk(DEFAULTS.flowControl, 'flowControl exists');
    assertEqual(DEFAULTS.flowControl.perTaskReview, false, 'perTaskReview defaults to false');
    assertEqual(DEFAULTS.flowControl.worktreeIsolation, false, 'worktreeIsolation defaults to false');
  });
});

describe('quality-config: deepMerge behavior', suite => {
  suite.test('deepMerge overrides leaf values', () => {
    const result = deepMerge(
      { a: { b: 1, c: 2 } },
      { a: { b: 99 } }
    );
    assertEqual(result.a.b, 99, 'overridden value');
    assertEqual(result.a.c, 2, 'preserved value');
  });

  suite.test('deepMerge adds new keys', () => {
    const result = deepMerge(
      { a: 1 },
      { b: 2 }
    );
    assertEqual(result.a, 1, 'original key');
    assertEqual(result.b, 2, 'new key');
  });

  suite.test('deepMerge handles nested flowControl override', () => {
    const result = deepMerge(DEFAULTS, {
      flowControl: { perTaskReview: true }
    });
    assertEqual(result.flowControl.perTaskReview, true, 'perTaskReview overridden');
    assertEqual(result.flowControl.worktreeIsolation, false, 'worktreeIsolation preserved');
    // Other sections unchanged
    assertEqual(result.testCoverage.minRatio, 0.3, 'testCoverage unchanged');
  });

  suite.test('deepMerge replaces arrays (does not merge them)', () => {
    const result = deepMerge(
      { items: [1, 2, 3] },
      { items: [9] }
    );
    assertEqual(result.items.length, 1, 'array replaced, not merged');
    assertEqual(result.items[0], 9, 'array has new value');
  });

  suite.test('deepMerge handles null source values', () => {
    const result = deepMerge(
      { a: { b: 1 } },
      { a: null }
    );
    assertEqual(result.a, null, 'null replaces object');
  });

  suite.test('deepMerge handles empty source object', () => {
    const result = deepMerge(DEFAULTS, {});
    assertEqual(result.flowControl.perTaskReview, false, 'defaults preserved with empty source');
  });
});

describe('quality-config: loadQualityConfig integration', suite => {
  suite.test('loadQualityConfig returns object with all sections', () => {
    const config = loadQualityConfig();
    assertOk(config.testCoverage, 'testCoverage present');
    assertOk(config.blocking, 'blocking present');
    assertOk(config.flowControl, 'flowControl present');
  });

  suite.test('project quality.json has flowControl section (if exists)', () => {
    const qPath = path.join(projectRoot(), '.claude', 'config', 'quality.json');
    const legacyPath = path.join(projectRoot(), '.claude', 'quality.json');
    const configPath = fs.existsSync(qPath) ? qPath : (fs.existsSync(legacyPath) ? legacyPath : null);
    if (!configPath) {
      // No project quality.json — that's fine (fresh clone), defaults are tested above
      assert(true, 'no project quality.json (fresh clone), skipping');
      return;
    }
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assertOk(raw.flowControl, 'quality.json has flowControl');
    assertEqual(typeof raw.flowControl.perTaskReview, 'boolean', 'perTaskReview is boolean');
    assertEqual(typeof raw.flowControl.worktreeIsolation, 'boolean', 'worktreeIsolation is boolean');
  });
});

describe('quality-config: selfLearning section (P019)', suite => {
  suite.test('DEFAULTS has selfLearning section', () => {
    assertOk(DEFAULTS.selfLearning, 'selfLearning exists');
  });

  suite.test('selfLearning.enabled 默认 true', () => {
    assertEqual(DEFAULTS.selfLearning.enabled, true, 'enabled default true');
  });

  suite.test('selfLearning.promotionThreshold 默认 3', () => {
    assertEqual(DEFAULTS.selfLearning.promotionThreshold, 3, 'promotionThreshold default 3');
  });

  suite.test('deepMerge：用户覆盖 promotionThreshold 生效且 enabled 保留', () => {
    const result = deepMerge(DEFAULTS, { selfLearning: { promotionThreshold: 5 } });
    assertEqual(result.selfLearning.promotionThreshold, 5, 'promotionThreshold overridden');
    assertEqual(result.selfLearning.enabled, true, 'enabled preserved');
  });

  suite.test('deepMerge：缺省 selfLearning 键回落默认', () => {
    const result = deepMerge(DEFAULTS, {});
    assertEqual(result.selfLearning.enabled, true, 'enabled default preserved');
    assertEqual(result.selfLearning.promotionThreshold, 3, 'threshold default preserved');
  });
});

// ── Run standalone ─────────────────────────────────────────────────
const { printSummary } = require('./helpers');
process.exit(printSummary());
