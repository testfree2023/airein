/**
 * Test: No residual "superpowers" references in committed files
 *
 * After the v2.4 integration, all superpowers plugin references should
 * have been cleaned from skill/source files. writing-plans (Superpowers lineage)
 * was retired; README credits may name "Superpowers" as proper noun.
 *
 * Exception: this test file and README credits mention "Superpowers" as a proper noun.
 */

const fs = require('fs');
const path = require('path');
const { describe, assert, assertOk, projectRoot, readSkill } = require('./helpers');

function readText(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch { return null; }
}

describe('No residual superpowers references', suite => {
  suite.test('tdd SKILL.md has no superpowers references', () => {
    const content = readSkill('tdd');
    if (!content) return;
    assert(!content.toLowerCase().includes('superpowers'),
      'tdd should not mention superpowers');
  });

  suite.test('new-plan SKILL.md has no superpowers references', () => {
    const content = readSkill('new-plan');
    if (!content) return;
    assert(!content.toLowerCase().includes('superpowers'),
      'new-plan should not mention superpowers');
  });

  suite.test('CLAUDE.md has no superpowers: plugin-style references', () => {
    const content = readText(path.join(projectRoot(), 'CLAUDE.md'));
    if (!content) return;
    assert(!content.toLowerCase().includes('superpowers:'),
      'CLAUDE.md should not have superpowers: plugin references');
  });

  suite.test('quality-config.js has no superpowers references', () => {
    const content = readText(path.join(projectRoot(), 'scripts', 'lib', 'quality-config.js'));
    if (!content) return;
    assert(!content.toLowerCase().includes('superpowers'),
      'quality-config.js should not mention superpowers');
  });
});

// ── Run standalone ─────────────────────────────────────────────────
const { printSummary } = require('./helpers');
process.exit(printSummary());
