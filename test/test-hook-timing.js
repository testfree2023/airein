#!/usr/bin/env node
/**
 * Test: hook-timing — duration log level + message formatting
 */

const path = require('path');
const { describe, assertEqual, projectRoot, printSummary } = require('./helpers');

const { durationLogLevel, formatDurationMessage } = require(
  path.join(projectRoot(), 'scripts', 'lib', 'hook-timing.js'),
);

describe('hook-timing: durationLogLevel', suite => {
  suite.test('below threshold → debug', () => {
    assertEqual(durationLogLevel(100, 2000), 'debug', 'fast hook');
  });

  suite.test('at threshold → warn', () => {
    assertEqual(durationLogLevel(2000, 2000), 'warn', 'slow hook');
  });

  suite.test('above threshold → warn', () => {
    assertEqual(durationLogLevel(5000, 2000), 'warn', 'very slow hook');
  });

  suite.test('invalid threshold → debug', () => {
    assertEqual(durationLogLevel(9000, 0), 'debug', 'disabled threshold');
  });
});

describe('hook-timing: formatDurationMessage', suite => {
  suite.test('formats hook id and rounded ms', () => {
    assertEqual(
      formatDurationMessage('test-guard', 12.7),
      'test-guard durationMs=13',
      'rounded duration',
    );
  });
});

process.exit(printSummary());
