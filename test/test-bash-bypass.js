/**
 * Test: Bash Bypass Detection
 *
 * Verifies:
 *   - shell-split extractRedirectPaths() extracts file paths from shell commands
 *   - plan-gate blocks Bash commands that write source files without plan
 *   - test-guard blocks Bash commands that write source files without tests
 *   - hooks.json has Bash matcher for plan-gate and test-guard
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  describe, assertOk, assertEqual, assertContains, assertNotContains,
  assertMatch, projectRoot, printSummary
} = require('./helpers');

const SHELL_SPLIT_PATH = path.join(projectRoot(), 'scripts', 'lib', 'shell-split.js');
const PLAN_GATE_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'plan-gate.js');
const TEST_GUARD_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'test-guard.js');
const HOOKS_JSON_PATH = path.join(projectRoot(), 'hooks', 'hooks.json');

// ── Helpers ────────────────────────────────────────────────────────

function runHook(scriptPath, inputObj, cwd) {
  const input = JSON.stringify(inputObj);
  const result = spawnSync('node', [scriptPath], {
    input,
    cwd: cwd || projectRoot(),
    timeout: 5000,
    encoding: 'utf8',
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function createTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bash-bypass-test-'));
  const plansDir = path.join(dir, 'docs', 'plans');
  fs.mkdirSync(plansDir, { recursive: true });

  // Create .claude/config for quality.json
  const configDir = path.join(dir, '.claude', 'config');
  const memoryDir = path.join(dir, '.claude', 'memory');
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(memoryDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, 'quality.json'), '{"planGate":{"mode":"advisory"},"testGuard":{"mode":"strict","enabled":true}}');

  // Create .git so findProjectRoot works
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main');

  return dir;
}

function removeTempProject(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ── shell-split: extractRedirectPaths ──────────────────────────────

describe('shell-split: extractRedirectPaths', suite => {
  const { extractRedirectPaths } = require(SHELL_SPLIT_PATH);

  suite.test('extracts simple redirect path', () => {
    const paths = extractRedirectPaths('echo "hello" > src/feature.ts');
    assertOk(paths.includes('src/feature.ts'), 'should find src/feature.ts');
  });

  suite.test('extracts append redirect path', () => {
    const paths = extractRedirectPaths('echo "line" >> src/utils.js');
    assertOk(paths.includes('src/utils.js'), 'should find src/utils.js');
  });

  suite.test('extracts heredoc redirect path', () => {
    const paths = extractRedirectPaths("cat > src/module.py << 'EOF'");
    assertOk(paths.includes('src/module.py'), 'should find src/module.py');
  });

  suite.test('extracts tee path', () => {
    const paths = extractRedirectPaths('echo "x" | tee src/output.rs');
    assertOk(paths.includes('src/output.rs'), 'should find tee target');
  });

  suite.test('handles multi-segment commands with &&', () => {
    const paths = extractRedirectPaths('mkdir -p src && echo "x" > src/a.js && echo "y" > src/b.ts');
    assertOk(paths.includes('src/a.js'), 'should find src/a.js');
    assertOk(paths.includes('src/b.ts'), 'should find src/b.ts');
  });

  suite.test('handles multi-segment commands with ;', () => {
    const paths = extractRedirectPaths('echo "x" > a.go; echo "y" > b.java');
    assertOk(paths.includes('a.go'), 'should find a.go');
    assertOk(paths.includes('b.java'), 'should find b.java');
  });

  suite.test('handles quoted paths', () => {
    const paths = extractRedirectPaths('echo "x" > "my file.ts"');
    assertOk(paths.includes('my file.ts'), 'should strip quotes');
  });

  suite.test('returns empty for non-write commands', () => {
    const paths = extractRedirectPaths('ls -la && git status');
    assertEqual(paths.length, 0, 'no paths for non-write commands');
  });

  suite.test('returns empty for null/undefined', () => {
    assertEqual(extractRedirectPaths(null).length, 0, 'null returns empty');
    assertEqual(extractRedirectPaths(undefined).length, 0, 'undefined returns empty');
    assertEqual(extractRedirectPaths('').length, 0, 'empty returns empty');
  });
});

// ── plan-gate: Bash bypass detection ───────────────────────────────

describe('plan-gate: Bash command detection', suite => {
  const tmpDir = createTempProject();
  const srcDir = path.join(tmpDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  const inputFile = path.join(srcDir, 'feature.js');

  suite.test('blocks Bash redirect to source file without plan', () => {
    const result = runHook(PLAN_GATE_PATH, {
      tool_name: 'Bash',
      tool_input: {
        command: `echo "code" > ${inputFile}`
      }
    }, tmpDir);
    assertEqual(result.exitCode, 2, 'should block Bash redirect');
    assertContains(result.stderr, '[Plan Gate]', 'should show plan gate message');
  });

  suite.test('blocks Bash heredoc without plan', () => {
    const result = runHook(PLAN_GATE_PATH, {
      tool_name: 'Bash',
      tool_input: {
        command: `cat > ${inputFile} << 'EOF'\nexport function hello() {}\nEOF`
      }
    }, tmpDir);
    assertEqual(result.exitCode, 2, 'should block heredoc');
    assertContains(result.stderr, '[Plan Gate]', 'should show plan gate message');
  });

  suite.test('allows Bash commands without file writes', () => {
    const result = runHook(PLAN_GATE_PATH, {
      tool_name: 'Bash',
      tool_input: {
        command: 'ls -la && git status'
      }
    }, tmpDir);
    assertEqual(result.exitCode, 0, 'should allow non-write Bash');
  });

  suite.test('allows Bash redirect to non-source file', () => {
    const mdFile = path.join(tmpDir, 'notes.md');
    const result = runHook(PLAN_GATE_PATH, {
      tool_name: 'Bash',
      tool_input: {
        command: `echo "notes" > ${mdFile}`
      }
    }, tmpDir);
    assertEqual(result.exitCode, 0, 'should allow .md write via Bash');
  });

  // Cleanup
  suite.test('cleanup temp dir', () => {
    removeTempProject(tmpDir);
    assertOk(true, 'cleaned up');
  });
});

// ── test-guard: Bash bypass detection ──────────────────────────────

describe('test-guard: Bash command detection', suite => {
  const tmpDir = createTempProject();
  const srcDir = path.join(tmpDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  const srcFile = path.join(srcDir, 'calculator.js');

  suite.test('blocks Bash redirect to untested source file', () => {
    const result = runHook(TEST_GUARD_PATH, {
      tool_name: 'Bash',
      tool_input: {
        command: `echo "export function add(a,b){return a+b}" > ${srcFile}`
      }
    }, tmpDir);
    assertEqual(result.exitCode, 2, 'should block Bash redirect to untested file');
    assertContains(result.stderr, '[Test Guard]', 'should show test guard message');
  });

  suite.test('blocks Bash heredoc to untested source file', () => {
    const tsFile = path.join(srcDir, 'service.ts');
    const result = runHook(TEST_GUARD_PATH, {
      tool_name: 'Bash',
      tool_input: {
        command: `cat > ${tsFile} << 'EOF'\nexport const x = 1;\nEOF`
      }
    }, tmpDir);
    assertEqual(result.exitCode, 2, 'should block heredoc to untested file');
  });

  suite.test('allows Bash redirect when test file exists', () => {
    // Create test file first
    const testFile = path.join(srcDir, 'calculator.test.js');
    fs.writeFileSync(testFile, "test('add', () => {});");

    const result = runHook(TEST_GUARD_PATH, {
      tool_name: 'Bash',
      tool_input: {
        command: `echo "code" > ${srcFile}`
      }
    }, tmpDir);
    assertEqual(result.exitCode, 0, 'should allow when test exists');
  });

  suite.test('allows Bash commands without file writes', () => {
    const result = runHook(TEST_GUARD_PATH, {
      tool_name: 'Bash',
      tool_input: {
        command: 'npm test'
      }
    }, tmpDir);
    assertEqual(result.exitCode, 0, 'should allow npm test');
  });

  // Cleanup
  suite.test('cleanup temp dir', () => {
    removeTempProject(tmpDir);
    assertOk(true, 'cleaned up');
  });
});

// ── hooks.json: Bash matcher verification ──────────────────────────

describe('hooks.json: Bash matcher for enforcement hooks', suite => {
  const hooksDef = JSON.parse(fs.readFileSync(HOOKS_JSON_PATH, 'utf8'));

  suite.test('plan-gate matcher includes Bash', () => {
    const entry = hooksDef.hooks.PreToolUse.find(h =>
      h.description && h.description.includes('Plan gate'));
    assertOk(entry, 'plan-gate entry exists');
    assertContains(entry.matcher, 'Bash', 'matcher includes Bash');
  });

  suite.test('test-guard matcher includes Bash', () => {
    const entry = hooksDef.hooks.PreToolUse.find(h =>
      h.description && h.description.includes('Test guard'));
    assertOk(entry, 'test-guard entry exists');
    assertContains(entry.matcher, 'Bash', 'matcher includes Bash');
  });

  suite.test('doc-file-warning is in PreToolUse', () => {
    const entry = hooksDef.hooks.PreToolUse.find(h =>
      h.description && h.description.includes('Doc file warning'));
    assertOk(entry, 'doc-file-warning in PreToolUse');
  });

  suite.test('doc-file-warning is NOT in PostToolUse', () => {
    const entry = hooksDef.hooks.PostToolUse.find(h =>
      h.description && h.description.includes('doc file warning'));
    assertOk(!entry, 'doc-file-warning should not be in PostToolUse');
  });
});

// ── Run ────────────────────────────────────────────────────────────
process.exit(printSummary());
