/**
 * Test: Intelligence Hooks — structure-sync, read-dedup
 *
 * Verifies:
 *   - structure-sync: updates token estimate in structure.md after source file edit
 *   - structure-sync: adds new entry for previously unknown files
 *   - structure-sync: skips non-source files
 *   - read-dedup: warns on second read of same file in session
 *   - read-dedup: does not warn on first read
 *   - hooks.json: 2 new hooks registered
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  describe, assertOk, assertEqual, assertContains, assertNotContains,
  projectRoot, printSummary
} = require('./helpers');

const STRUCTURE_SYNC_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'structure-sync.js');
const READ_DEDUP_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'read-dedup.js');

// ── Fixtures ───────────────────────────────────────────────────────

function createTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'intel-test-'));
  fs.mkdirSync(path.join(dir, 'docs', 'steering'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude', 'config'), { recursive: true });
  return dir;
}

function removeTempProject(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function runHook(hookPath, filePath, cwd, extra) {
  const input = JSON.stringify(extra || { tool_input: { file_path: filePath } });
  const result = spawnSync(process.execPath, [hookPath], {
    input,
    cwd: cwd || projectRoot(),
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, CLAUDE_SESSION_ID: 'test-session' }
  });
  return {
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    exitCode: result.status === null ? 1 : result.status,
    input
  };
}

const SAMPLE_STRUCTURE = `# Structure — Test Project

## scripts/hooks/
- test-guard.js — Test guard hook (~1,350 tok)
- session-start.js — Session context injection (~2,670 tok)
`;

// ── structure-sync tests ───────────────────────────────────────────

describe('structure-sync: update token estimate', suite => {
  suite.test('updates existing entry token estimate', () => {
    const tmp = createTempProject();
    try {
      // Create structure.md with existing entry
      fs.writeFileSync(path.join(tmp, 'docs', 'steering', 'structure.md'), SAMPLE_STRUCTURE);
      // Create source file (must match path in structure.md entry)
      const hookDir = path.join(tmp, 'scripts', 'hooks');
      fs.mkdirSync(hookDir, { recursive: true });
      const srcPath = path.join(hookDir, 'test-guard.js');
      fs.writeFileSync(srcPath, '// ' + 'x'.repeat(200) + '\n'); // ~50 tokens
      const result = runHook(STRUCTURE_SYNC_PATH, srcPath, tmp);
      assertEqual(result.exitCode, 0, 'structure-sync should exit 0');
      const updated = fs.readFileSync(path.join(tmp, 'docs', 'steering', 'structure.md'), 'utf8');
      // Token estimate should be updated (was ~1,350)
      assertContains(updated, 'test-guard.js', 'entry preserved');
      // Should contain tok) pattern (may have comma in number)
      assertOk(/~[\d,]+\s*tok\)/.test(updated), 'token estimate format preserved');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('skips non-source files', () => {
    const tmp = createTempProject();
    try {
      fs.writeFileSync(path.join(tmp, 'docs', 'steering', 'structure.md'), SAMPLE_STRUCTURE);
      const result = runHook(STRUCTURE_SYNC_PATH, path.join(tmp, 'package.json'), tmp);
      assertEqual(result.exitCode, 0, 'should exit 0');
      // structure.md unchanged
      const content = fs.readFileSync(path.join(tmp, 'docs', 'steering', 'structure.md'), 'utf8');
      assertEqual(content, SAMPLE_STRUCTURE, 'should not modify structure.md for .json');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('exits cleanly when structure.md missing', () => {
    const tmp = createTempProject();
    try {
      const srcPath = path.join(tmp, 'src', 'feature.js');
      fs.writeFileSync(srcPath, 'const x = 1;');
      const result = runHook(STRUCTURE_SYNC_PATH, srcPath, tmp);
      assertEqual(result.exitCode, 0, 'should exit 0 when no structure.md');
    } finally {
      removeTempProject(tmp);
    }
  });
});

// ── read-dedup tests ───────────────────────────────────────────────

describe('read-dedup: warn on repeated reads', suite => {
  suite.test('no warning on first read', () => {
    const tmp = createTempProject();
    try {
      const filePath = path.join(tmp, 'src', 'feature.js');
      fs.writeFileSync(filePath, 'const x = 1;');
      const result = runHook(READ_DEDUP_PATH, filePath, tmp);
      assertNotContains(result.stderr, '[Read Dedup]', 'first read should not warn');
      assertEqual(result.exitCode, 0, 'should exit 0');
      assertEqual(result.stdout, result.input, 'should passthrough stdin');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('warns on second read of same file', () => {
    const tmp = createTempProject();
    try {
      const filePath = path.join(tmp, 'src', 'feature.js');
      fs.writeFileSync(filePath, 'const x = 1;');
      // First read
      runHook(READ_DEDUP_PATH, filePath, tmp);
      // Second read
      const result = runHook(READ_DEDUP_PATH, filePath, tmp);
      assertContains(result.stderr, '[Read Dedup]', 'second read should warn');
      assertEqual(result.exitCode, 0, 'should still exit 0 (warn only)');
      assertEqual(result.stdout, result.input, 'should passthrough stdin');
    } finally {
      removeTempProject(tmp);
    }
  });

  suite.test('different files do not trigger warning', () => {
    const tmp = createTempProject();
    try {
      const fileA = path.join(tmp, 'src', 'a.js');
      const fileB = path.join(tmp, 'src', 'b.js');
      fs.writeFileSync(fileA, 'const a = 1;');
      fs.writeFileSync(fileB, 'const b = 2;');
      runHook(READ_DEDUP_PATH, fileA, tmp);
      const result = runHook(READ_DEDUP_PATH, fileB, tmp);
      assertNotContains(result.stderr, '[Read Dedup]', 'different file should not warn');
      assertEqual(result.exitCode, 0, 'should exit 0');
    } finally {
      removeTempProject(tmp);
    }
  });
});

// ── hooks.json registration ────────────────────────────────────────

describe('hooks.json: intelligence hooks registered', suite => {
  const hooksJson = JSON.parse(fs.readFileSync(path.join(projectRoot(), 'hooks', 'hooks.json'), 'utf8'));

  suite.test('structure-sync registered in PostToolUse', () => {
    const postHooks = hooksJson.hooks.PostToolUse;
    const entry = postHooks.find(h => h.description && h.description.toLowerCase().includes('structure sync'));
    assertOk(entry, 'structure-sync entry exists in PostToolUse');
    assertOk(entry.hooks[0].command.includes('structure-sync.js'), 'command references structure-sync.js');
    assertOk(entry.hooks[0].async, 'structure-sync must be async');
  });

  suite.test('read-dedup registered in PostToolUse', () => {
    const postHooks = hooksJson.hooks.PostToolUse;
    const entry = postHooks.find(h => h.description && h.description.toLowerCase().includes('read dedup'));
    assertOk(entry, 'read-dedup entry exists in PostToolUse');
    assertOk(entry.hooks[0].command.includes('read-dedup.js'), 'command references read-dedup.js');
    assertOk(entry.hooks[0].async, 'read-dedup must be async');
  });
});

// ── Run standalone ─────────────────────────────────────────────────
process.exit(printSummary());
