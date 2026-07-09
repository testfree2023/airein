/**
 * Test: L0 Rules Deployment (P017 — Path B)
 *
 * Verifies the airein L0 instruction channel was consolidated into
 * ~/.claude/rules/*.md (top-level, CC-native-loaded) and that the airein
 * no longer deploys/overwrites the user's ~/.claude/CLAUDE.md.
 *
 * Structural test: asserts REPO state + sync-airein.sh manifest.
 * (End-to-end deploy verification lives in T14 / verify-airein.sh.)
 *
 * RED anchor: all assertions fail until T2–T10 land.
 */

const { describe, assertOk, assertContains, assertNotContains, projectRoot, printSummary } = require('./helpers');
const fs = require('fs');
const path = require('path');
const root = projectRoot();

const RULES_THREE = [
  'rules/00-iron-rules.md',
  'rules/10-architecture.md',
  'rules/20-workflow.md',
];

// ── rules/ three L0 files exist and are non-empty ──────────────────

describe('P017: rules/ three L0 files exist (Path B consolidation)', suite => {
  for (const rel of RULES_THREE) {
    suite.test(`${rel} exists`, () => {
      const p = path.join(root, rel);
      assertOk(fs.existsSync(p), `${rel} should exist`);
    });

    suite.test(`${rel} is non-empty`, () => {
      const p = path.join(root, rel);
      if (!fs.existsSync(p)) return; // existence test reports the failure
      const content = fs.readFileSync(p, 'utf8');
      assertOk(content.trim().length > 0, `${rel} should be non-empty`);
    });
  }
});

// ── rules/common/core-rules.md retired ─────────────────────────────

describe('P017: rules/common/core-rules.md retired (content distributed)', suite => {
  suite.test('rules/common/core-rules.md does NOT exist', () => {
    const p = path.join(root, 'rules', 'common', 'core-rules.md');
    assertOk(!fs.existsSync(p), 'rules/common/core-rules.md should be removed');
  });

  suite.test('rules/common/ directory removed if empty', () => {
    const dir = path.join(root, 'rules', 'common');
    if (!fs.existsSync(dir)) {
      assertOk(true, 'rules/common/ already removed');
      return;
    }
    const remaining = fs.readdirSync(dir);
    assertOk(remaining.length === 0, `rules/common/ should be empty (found: ${remaining.join(', ')})`);
  });
});

// ── CLAUDE.md slimmed: 铁律 moved out ─────────────────────────────

describe('P017: CLAUDE.md slimmed (铁律 relocated to rules/00)', suite => {
  suite.test('CLAUDE.md does NOT contain ## 铁律 section', () => {
    const p = path.join(root, 'CLAUDE.md');
    if (!fs.existsSync(p)) {
      assertOk(false, 'CLAUDE.md should exist (slimmed)');
      return;
    }
    const content = fs.readFileSync(p, 'utf8');
    assertNotContains(content, '## 铁律', 'CLAUDE.md should not host 铁律 (moved to rules/00-iron-rules.md)');
  });

  suite.test('CLAUDE.md points to rules/ as L0 home', () => {
    const p = path.join(root, 'CLAUDE.md');
    if (!fs.existsSync(p)) return;
    const content = fs.readFileSync(p, 'utf8');
    assertContains(content, 'rules/', 'CLAUDE.md entry note should point to rules/');
  });
});

// ── sync-airein.sh manifest: stops owning ~/.claude/CLAUDE.md ─────

describe('P017: sync-airein.sh manifest (stops deploying ~/.claude/CLAUDE.md)', suite => {
  const syncPath = path.join(root, 'scripts', 'update', 'sync-airein.sh');
  let content = '';
  try { content = fs.readFileSync(syncPath, 'utf8'); } catch { /* handled below */ }

  suite.test('sync-airein.sh exists', () => {
    assertOk(content.length > 0, 'sync-airein.sh should be readable');
  });

  if (!content) return;

  suite.test('manifest does NOT deploy CLAUDE.md to target root', () => {
    // The bare "CLAUDE.md" CORE_FILES entry deploys repo CLAUDE.md → ~/.claude/CLAUDE.md.
    // Path B: airein must not own the user's ~/.claude/CLAUDE.md.
    assertNotContains(content, '"CLAUDE.md"', 'sync-airein.sh should not deploy CLAUDE.md to target root');
  });

  suite.test('manifest does NOT reference rules/common/core-rules.md', () => {
    assertNotContains(content, 'rules/common/core-rules.md', 'sync-airein.sh should not reference retired core-rules.md');
  });

  for (const rel of RULES_THREE) {
    suite.test(`manifest deploys ${rel}`, () => {
      assertContains(content, `"${rel}"`, `sync-airein.sh should deploy ${rel}`);
    });
  }
});

// ── no deploy script owns the user's ~/.claude/CLAUDE.md ────────────
// Path B invariant: airein does not manage/overwrite user CLAUDE.md.
// Covers sibling deploy scripts beyond sync-airein.sh.

describe('P017: sibling deploy scripts do not own ~/.claude/CLAUDE.md', suite => {
  suite.test('cleanup-airein.sh does NOT manage CLAUDE.md as a top-level file', () => {
    const p = path.join(root, 'scripts', 'cleanup-airein.sh');
    const content = fs.readFileSync(p, 'utf8');
    // The managed-file loops (`for f in CLAUDE.md ...`) would scan the user's
    // CLAUDE.md and either flag it stale (→ delete) or missing (→ restore),
    // both violating Path B.
    assertNotContains(content, 'in CLAUDE.md', 'cleanup-airein.sh must not list CLAUDE.md as a managed file');
  });

  suite.test('cleanup-airein.sh repo-detection uses rules/00-iron-rules.md (durable marker)', () => {
    const p = path.join(root, 'scripts', 'cleanup-airein.sh');
    const content = fs.readFileSync(p, 'utf8');
    assertContains(content, 'rules/00-iron-rules.md', 'cleanup-airein.sh should detect the airein repo via rules/00, not CLAUDE.md');
  });

  suite.test('airein-unpack.sh does NOT advertise CLAUDE.md as an install artifact', () => {
    const p = path.join(root, 'airein-unpack.sh');
    const content = fs.readFileSync(p, 'utf8');
    assertNotContains(content, '✅ CLAUDE.md', 'airein-unpack.sh must not report CLAUDE.md as installed by airein');
  });
});

// ── Run standalone ─────────────────────────────────────────────────
process.exit(printSummary());
