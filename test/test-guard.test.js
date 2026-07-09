/**
 * Test: test-guard.js — PreToolUse hook for Iron Rule #1 enforcement
 *
 * Verifies:
 *   - Blocks when a new source file has no corresponding test
 *   - Blocks Edit on existing source files with no corresponding test
 *   - Allows files that have tests (walks up to project root)
 *   - Allows test files (.test., .spec., _test.)
 *   - Allows exempt files (.d.ts, .config., types/)
 *   - Allows non-source extensions (.md, .json, .css)
 *   - Can be downgraded to warn-only via blocking.untestedSource=false
 *   - Can be completely disabled via testGuard.enabled=false
 *   - Advisory mode: warns but allows via testGuard.mode='advisory'
 *   - Strict mode: blocks via testGuard.mode='strict' (default)
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const { describe, assertOk, assertEqual, assertContains, assertNotContains, projectRoot } = require('./helpers');

const HOOK_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'test-guard.js');

function createTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-guard-'));
  fs.mkdirSync(path.join(dir, '.claude', 'config'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"test-guard-fixture"}\n');
  return dir;
}

function removeTempProject(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

/**
 * Run test-guard with simulated PreToolUse stdin and capture stdout/stderr.
 */
function runHook(filePath, cwd, inputShape) {
  const input = JSON.stringify(inputShape || { tool_input: { file_path: filePath } });
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input,
    cwd: cwd || projectRoot(),
    encoding: 'utf8',
    timeout: 5000
  });
  return {
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    exitCode: result.status === null ? 1 : result.status,
    input
  };
}

describe('test-guard: source file without test', suite => {
  suite.test('blocks source file creation when no corresponding test exists', () => {
    const tmpProject = createTempProject();
    try {
      const sourceFile = path.join(tmpProject, 'src', 'feature.js');
      const result = runHook(sourceFile, tmpProject);
      assertContains(result.stderr, '[Test Guard]', 'should output test guard block message');
      assertContains(result.stderr, '创建/编辑源文件', 'should mention create/edit source file');
      assertContains(result.stderr, '铁律 1', 'should reference iron rule');
      assertEqual(result.exitCode, 2, 'should exit 2 (hard block)');
      assertEqual(result.stdout, '', 'should not passthrough stdin when blocking');
    } finally {
      removeTempProject(tmpProject);
    }
  });
});

describe('test-guard: Edit tool enforcement', suite => {
  suite.test('blocks Edit on existing source file when no corresponding test exists', () => {
    const tmpProject = createTempProject();
    try {
      const sourceFile = path.join(tmpProject, 'src', 'feature.js');
      fs.writeFileSync(sourceFile, 'module.exports = {};\n');
      const inputShape = {
        tool_name: 'Edit',
        tool_input: {
          file_path: sourceFile,
          old_string: 'module.exports = {};',
          new_string: 'module.exports = { enabled: true };'
        }
      };
      const result = runHook(sourceFile, tmpProject, inputShape);
      assertContains(result.stderr, '[Test Guard]', 'should output test guard block message for Edit');
      assertContains(result.stderr, '铁律 1', 'should reference iron rule for Edit');
      assertEqual(result.exitCode, 2, 'should exit 2 for untested source Edit');
      assertEqual(result.stdout, '', 'should not passthrough stdin when blocking Edit');
    } finally {
      removeTempProject(tmpProject);
    }
  });

  suite.test('allows Edit on existing source file when corresponding test exists', () => {
    const tmpProject = createTempProject();
    try {
      const sourceFile = path.join(tmpProject, 'src', 'feature.js');
      fs.writeFileSync(sourceFile, 'module.exports = {};\n');
      fs.writeFileSync(path.join(tmpProject, 'test', 'test-feature.js'), '// test\n');
      const inputShape = {
        tool_name: 'Edit',
        tool_input: {
          file_path: sourceFile,
          old_string: 'module.exports = {};',
          new_string: 'module.exports = { enabled: true };'
        }
      };
      const result = runHook(sourceFile, tmpProject, inputShape);
      assertNotContains(result.stderr, '[Test Guard]', 'should NOT warn for tested source Edit');
      assertEqual(result.exitCode, 0, 'should exit 0 for tested source Edit');
      assertEqual(result.stdout, result.input, 'should passthrough original Edit stdin when allowing');
    } finally {
      removeTempProject(tmpProject);
    }
  });
});

describe('test-guard: allows files with tests', suite => {
  suite.test('allows source file when test exists in project test/ dir', () => {
    const tmpProject = createTempProject();
    try {
      const sourceFile = path.join(tmpProject, 'src', 'feature.js');
      fs.writeFileSync(path.join(tmpProject, 'test', 'test-feature.js'), '// test\n');
      const result = runHook(sourceFile, tmpProject);
      assertNotContains(result.stderr, '[Test Guard]', 'should NOT warn — test exists at project root test/');
      assertEqual(result.exitCode, 0, 'should exit 0 when corresponding test exists');
      assertEqual(result.stdout, result.input, 'should passthrough original stdin when allowing');
    } finally {
      removeTempProject(tmpProject);
    }
  });

  suite.test('allows source file when test exists in same directory', () => {
    const tmpProject = createTempProject();
    try {
      const sourceFile = path.join(tmpProject, 'src', 'feature.js');
      fs.writeFileSync(path.join(tmpProject, 'src', 'feature.test.js'), '// test\n');
      const result = runHook(sourceFile, tmpProject);
      assertNotContains(result.stderr, '[Test Guard]', 'should NOT warn — same-directory test exists');
      assertEqual(result.exitCode, 0, 'should exit 0 when same-directory test exists');
    } finally {
      removeTempProject(tmpProject);
    }
  });

  suite.test('allows source file when test exists in __tests__ directory', () => {
    const tmpProject = createTempProject();
    try {
      const sourceFile = path.join(tmpProject, 'src', 'feature.js');
      fs.mkdirSync(path.join(tmpProject, 'src', '__tests__'), { recursive: true });
      fs.writeFileSync(path.join(tmpProject, 'src', '__tests__', 'feature.spec.js'), '// test\n');
      const result = runHook(sourceFile, tmpProject);
      assertNotContains(result.stderr, '[Test Guard]', 'should NOT warn — __tests__ spec exists');
      assertEqual(result.exitCode, 0, 'should exit 0 when __tests__ spec exists');
    } finally {
      removeTempProject(tmpProject);
    }
  });

  suite.test('accepts input.file_path fallback shape', () => {
    const tmpProject = createTempProject();
    try {
      const sourceFile = path.join(tmpProject, 'src', 'feature.js');
      fs.writeFileSync(path.join(tmpProject, 'test', 'test-feature.js'), '// test\n');
      const inputShape = { input: { file_path: sourceFile } };
      const result = runHook(sourceFile, tmpProject, inputShape);
      assertEqual(result.exitCode, 0, 'should allow input.file_path fallback shape');
      assertEqual(result.stdout, result.input, 'should passthrough original fallback-shape stdin');
    } finally {
      removeTempProject(tmpProject);
    }
  });
});

describe('test-guard: skips test files', suite => {
  suite.test('allows .test. files', () => {
    const tmpProject = createTempProject();
    try {
      const result = runHook(path.join(tmpProject, 'src', 'example.test.js'), tmpProject);
      assertNotContains(result.stderr, '[Test Guard]', 'should not warn for .test. files');
      assertEqual(result.exitCode, 0, 'should allow test files');
    } finally {
      removeTempProject(tmpProject);
    }
  });

  suite.test('allows .spec. files', () => {
    const tmpProject = createTempProject();
    try {
      const result = runHook(path.join(tmpProject, 'src', 'example.spec.ts'), tmpProject);
      assertNotContains(result.stderr, '[Test Guard]', 'should not warn for .spec. files');
      assertEqual(result.exitCode, 0, 'should allow spec files');
    } finally {
      removeTempProject(tmpProject);
    }
  });
});

describe('test-guard: skips exempt files', suite => {
  suite.test('allows .d.ts type definitions', () => {
    const tmpProject = createTempProject();
    try {
      const result = runHook(path.join(tmpProject, 'src', 'types.d.ts'), tmpProject);
      assertNotContains(result.stderr, '[Test Guard]', 'should not warn for .d.ts');
      assertEqual(result.exitCode, 0, 'should allow .d.ts files');
    } finally {
      removeTempProject(tmpProject);
    }
  });

  suite.test('allows .config. files', () => {
    const tmpProject = createTempProject();
    try {
      const result = runHook(path.join(tmpProject, 'src', 'jest.config.js'), tmpProject);
      assertNotContains(result.stderr, '[Test Guard]', 'should not warn for .config. files');
      assertEqual(result.exitCode, 0, 'should allow config files');
    } finally {
      removeTempProject(tmpProject);
    }
  });

  suite.test('allows files in types/ directory', () => {
    const tmpProject = createTempProject();
    try {
      fs.mkdirSync(path.join(tmpProject, 'src', 'types'), { recursive: true });
      const result = runHook(path.join(tmpProject, 'src', 'types', 'user.js'), tmpProject);
      assertNotContains(result.stderr, '[Test Guard]', 'should not warn for files in types/ directory');
      assertEqual(result.exitCode, 0, 'should allow type-only directory files');
    } finally {
      removeTempProject(tmpProject);
    }
  });
});

describe('test-guard: skips non-source extensions', suite => {
  suite.test('allows .md files', () => {
    const tmpProject = createTempProject();
    try {
      const result = runHook(path.join(tmpProject, 'README.md'), tmpProject);
      assertNotContains(result.stderr, '[Test Guard]', 'should not warn for .md');
      assertEqual(result.exitCode, 0, 'should allow .md files');
    } finally {
      removeTempProject(tmpProject);
    }
  });

  suite.test('allows .json files', () => {
    const tmpProject = createTempProject();
    try {
      const result = runHook(path.join(tmpProject, 'hooks.json'), tmpProject);
      assertNotContains(result.stderr, '[Test Guard]', 'should not warn for .json');
      assertEqual(result.exitCode, 0, 'should allow .json files');
    } finally {
      removeTempProject(tmpProject);
    }
  });
});

describe('test-guard: config toggle', suite => {
  suite.test('warns but allows when blocking.untestedSource is false', () => {
    const tmpProject = createTempProject();
    try {
      const configPath = path.join(tmpProject, '.claude', 'config', 'quality.json');
      fs.writeFileSync(configPath, JSON.stringify({ blocking: { untestedSource: false } }));
      const result = runHook(path.join(tmpProject, 'src', 'feature.js'), tmpProject);
      assertContains(result.stderr, '[Test Guard]', 'should still warn when downgraded');
      assertEqual(result.exitCode, 0, 'should allow when untestedSource blocking is false');
      assertEqual(result.stdout, result.input, 'should passthrough original stdin when allowing');
    } finally {
      removeTempProject(tmpProject);
    }
  });

  suite.test('completely skips when testGuard.enabled is false', () => {
    const tmpProject = createTempProject();
    try {
      const configPath = path.join(tmpProject, '.claude', 'config', 'quality.json');
      fs.writeFileSync(configPath, JSON.stringify({ testGuard: { enabled: false } }));
      const result = runHook(path.join(tmpProject, 'src', 'feature.js'), tmpProject);
      assertNotContains(result.stderr, '[Test Guard]', 'should NOT warn when disabled');
      assertEqual(result.exitCode, 0, 'should allow when testGuard.enabled is false');
      assertEqual(result.stdout, result.input, 'should passthrough original stdin when disabled');
    } finally {
      removeTempProject(tmpProject);
    }
  });

  suite.test('advisory mode: warns but allows (exit 0)', () => {
    const tmpProject = createTempProject();
    try {
      const configPath = path.join(tmpProject, '.claude', 'config', 'quality.json');
      fs.writeFileSync(configPath, JSON.stringify({ testGuard: { mode: 'advisory' } }));
      const result = runHook(path.join(tmpProject, 'src', 'feature.js'), tmpProject);
      assertContains(result.stderr, '[Test Guard]', 'should warn in advisory mode');
      assertContains(result.stderr, 'advisory', 'should mention advisory mode');
      assertEqual(result.exitCode, 0, 'advisory should allow (exit 0)');
      assertEqual(result.stdout, result.input, 'should passthrough original stdin in advisory');
    } finally {
      removeTempProject(tmpProject);
    }
  });

  suite.test('strict mode: blocks with exit 2', () => {
    const tmpProject = createTempProject();
    try {
      const configPath = path.join(tmpProject, '.claude', 'config', 'quality.json');
      fs.writeFileSync(configPath, JSON.stringify({ testGuard: { mode: 'strict' } }));
      const result = runHook(path.join(tmpProject, 'src', 'feature.js'), tmpProject);
      assertContains(result.stderr, '[Test Guard]', 'should warn in strict mode');
      assertEqual(result.exitCode, 2, 'strict should block (exit 2)');
    } finally {
      removeTempProject(tmpProject);
    }
  });

  suite.test('advisory mode with existing test: no warning', () => {
    const tmpProject = createTempProject();
    try {
      const configPath = path.join(tmpProject, '.claude', 'config', 'quality.json');
      fs.writeFileSync(configPath, JSON.stringify({ testGuard: { mode: 'advisory' } }));
      fs.writeFileSync(path.join(tmpProject, 'test', 'test-feature.js'), '// test\n');
      const result = runHook(path.join(tmpProject, 'src', 'feature.js'), tmpProject);
      assertNotContains(result.stderr, '[Test Guard]', 'should NOT warn when test exists');
      assertEqual(result.exitCode, 0, 'should allow when test exists');
    } finally {
      removeTempProject(tmpProject);
    }
  });

  suite.test('enabled:false overrides mode:strict', () => {
    const tmpProject = createTempProject();
    try {
      const configPath = path.join(tmpProject, '.claude', 'config', 'quality.json');
      fs.writeFileSync(configPath, JSON.stringify({ testGuard: { enabled: false, mode: 'strict' } }));
      const result = runHook(path.join(tmpProject, 'src', 'feature.js'), tmpProject);
      assertNotContains(result.stderr, '[Test Guard]', 'should NOT warn when disabled despite strict mode');
      assertEqual(result.exitCode, 0, 'should allow when disabled despite strict mode');
    } finally {
      removeTempProject(tmpProject);
    }
  });
});

describe('test-guard: hook registered in hooks.json', suite => {
  suite.test('hooks.json has blocking test-guard entry in PreToolUse', () => {
    const hooks = JSON.parse(fs.readFileSync(path.join(projectRoot(), 'hooks', 'hooks.json'), 'utf8'));
    const preHooks = hooks.hooks.PreToolUse;
    const postHooks = hooks.hooks.PostToolUse;
    const entry = preHooks.find(h => h.description && h.description.toLowerCase().includes('test guard'));
    const postEntry = postHooks.find(h => h.description && h.description.toLowerCase().includes('test guard'));
    assertOk(entry, 'test-guard entry exists in PreToolUse');
    assertOk(!postEntry, 'test-guard entry should not remain in PostToolUse');
    assertOk(entry.hooks[0].command.includes('test-guard.js'), 'command references test-guard.js');
    const matcherTools = entry.matcher.split('|');
    assertOk(matcherTools.includes('Write'), 'matcher includes Write');
    assertOk(matcherTools.includes('Edit'), 'matcher includes Edit');
    assertOk(!entry.hooks[0].async, 'blocking PreToolUse hook must not be async');
  });
});

// ── Run standalone ─────────────────────────────────────────────────
const { printSummary } = require('./helpers');
process.exit(printSummary());
