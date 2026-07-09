/**
 * Test: JSON validity — all JSON files parse correctly
 *
 * Checks hooks.json, quality.json, and any other JSON in the repo.
 */

const fs = require('fs');
const path = require('path');
const { describe, assertOk, assert, projectRoot } = require('./helpers');

function findJsonFiles(dir, depth = 0) {
  if (depth > 3) return [];
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && depth === 0) continue; // skip .git etc at root
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.json')) {
        results.push(fullPath);
      } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        results.push(...findJsonFiles(fullPath, depth + 1));
      }
    }
  } catch { /* permission errors */ }
  return results;
}

describe('JSON validity', suite => {
  const jsonFiles = findJsonFiles(projectRoot());

  suite.test(`found ${jsonFiles.length} JSON files to validate`, () => {
    assertOk(jsonFiles.length > 0, 'should find at least 1 JSON file');
  });

  for (const filePath of jsonFiles) {
    const relPath = path.relative(projectRoot(), filePath);
    suite.test(`${relPath} parses as valid JSON`, () => {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        JSON.parse(raw);
        assert(true, `${relPath} is valid JSON`);
      } catch (err) {
        assert(false, `${relPath}: ${err.message}`);
      }
    });
  }

  // Specific structural checks
  suite.test('hooks.json has required event keys', () => {
    const hooksPath = path.join(projectRoot(), 'hooks', 'hooks.json');
    if (!fs.existsSync(hooksPath)) return;
    const data = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    assertOk(data.hooks, 'has hooks key');
    assertOk(data.hooks.PreToolUse, 'has PreToolUse');
    assertOk(data.hooks.PostToolUse, 'has PostToolUse');
    assertOk(data.hooks.SessionStart, 'has SessionStart');
    assertOk(data.hooks.Stop, 'has Stop');
    assertOk(data.hooks.PreCompact, 'has PreCompact');
  });
});

// ── Run standalone ─────────────────────────────────────────────────
const { printSummary } = require('./helpers');
process.exit(printSummary());
