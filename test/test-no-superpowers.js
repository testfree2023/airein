/**
 * Test: No residual "superpowers" references in committed files
 *
 * After the v2.4 integration, all superpowers plugin references should
 * have been cleaned from:
 *   - writing-plans/SKILL.md (was referencing superpowers:subagent-driven-development)
 *   - Any other skill files or repo files
 *
 * Exception: this test file mentions "Superpowers" as a proper noun.
 */

const fs = require('fs');
const path = require('path');
const { describe, assert, assertOk, projectRoot, readSkill } = require('./helpers');

function readText(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch { return null; }
}

describe('No residual superpowers references', suite => {
  suite.test('writing-plans SKILL.md has no superpowers references', () => {
    const content = readSkill('writing-plans');
    if (!content) return;
    assert(!content.toLowerCase().includes('superpowers'),
      'writing-plans should not mention superpowers');
  });

  suite.test('tdd-workflow SKILL.md has no superpowers references', () => {
    const content = readSkill('tdd-workflow');
    if (!content) return;
    assert(!content.toLowerCase().includes('superpowers'),
      'tdd-workflow should not mention superpowers');
  });

  suite.test('new-plan SKILL.md has no superpowers references', () => {
    const content = readSkill('new-plan');
    if (!content) return;
    assert(!content.toLowerCase().includes('superpowers'),
      'new-plan should not mention superpowers');
  });

  suite.test('verification-loop SKILL.md has no superpowers references', () => {
    const content = readSkill('verification-loop');
    if (!content) return;
    assert(!content.toLowerCase().includes('superpowers'),
      'verification-loop should not mention superpowers');
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
