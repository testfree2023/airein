/**
 * Test: Monorepo project root detection
 *
 * Regression test for bug: findProjectRoot() returned immediately on nested
 * package.json, so hooks treated frontend subprojects as roots instead of the
 * monorepo .git root.
 *
 * Verifies:
 *   - plan-gate prefers .git over nested package.json
 *   - test-guard prefers .git over nested package.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  describe, assertEqual,
  projectRoot, printSummary
} = require('./helpers');

const PLAN_GATE_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'plan-gate.js');
const TEST_GUARD_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'test-guard.js');

function runHook(hookPath, input, cwd) {
  const result = spawnSync('node', [hookPath], {
    input: JSON.stringify(input),
    cwd: cwd || projectRoot(),
    encoding: 'utf-8',
    timeout: 10000
  });
  return {
    exitCode: result.status === null ? 1 : result.status,
    stderr: (result.stderr || '').trim(),
    stdout: (result.stdout || '').trim()
  };
}

function createMonorepoFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'monorepo-root-'));
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude', 'config'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'config', 'quality.json'), JSON.stringify({
    planGate: { mode: 'strict' },
    testGuard: { mode: 'strict' }
  }, null, 2));

  const frontendDir = path.join(dir, 'JuXu-ui-admin-vue3');
  fs.mkdirSync(path.join(frontendDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(frontendDir, 'package.json'), '{"name":"frontend"}\n');

  const planDir = path.join(dir, 'docs', 'plans', 'P001-monorepo');
  fs.mkdirSync(planDir, { recursive: true });
  fs.writeFileSync(path.join(planDir, 'progress.md'),
    '# Progress: Monorepo\nupdated: 2026-06-11\nplan: P001-monorepo\ncomplexity: simple\n\n' +
    '## Task Stats\ntotal: 1\ncompleted: 0\nin_progress: 0\npending: 1\n\n' +
    '## Approval State\nrequirements: approved\ndesign: none\ntasks: none\n\n' +
    '## Active Task\nnone\n\n## Blockers\n- none\n'
  );

  const sourceFile = path.join(frontendDir, 'src', 'app.js');
  const testFile = path.join(frontendDir, 'src', 'app.test.js');
  fs.writeFileSync(testFile, 'test("app", () => {});\n');

  return { dir, frontendDir, sourceFile };
}

function createPackageOnlyFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'package-root-'));
  fs.mkdirSync(path.join(dir, '.claude', 'config'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'config', 'quality.json'), JSON.stringify({
    planGate: { mode: 'strict' },
    testGuard: { mode: 'strict' }
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"package-only"}\n');

  const srcDir = path.join(dir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  const sourceFile = path.join(srcDir, 'app.js');
  fs.writeFileSync(path.join(srcDir, 'app.test.js'), 'test("app", () => {});\n');

  const planDir = path.join(dir, 'docs', 'plans', 'P001-package');
  fs.mkdirSync(planDir, { recursive: true });
  fs.writeFileSync(path.join(planDir, 'progress.md'),
    '# Progress: Package\nupdated: 2026-06-11\nplan: P001-package\ncomplexity: simple\n\n' +
    '## Task Stats\ntotal: 1\ncompleted: 0\nin_progress: 0\npending: 1\n\n' +
    '## Approval State\nrequirements: approved\ndesign: none\ntasks: none\n\n' +
    '## Active Task\nnone\n\n## Blockers\n- none\n'
  );

  return { dir, sourceFile };
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

describe('Monorepo root: plan-gate prefers .git over nested package.json', suite => {
  suite.test('allows frontend source edit using plan from monorepo root', () => {
    const { dir, sourceFile } = createMonorepoFixture();
    try {
      const result = runHook(PLAN_GATE_PATH, {
        tool_name: 'Write',
        tool_input: { file_path: sourceFile, content: 'const app = true;' }
      }, dir);
      assertEqual(result.exitCode, 0, 'plan-gate should use monorepo root plan');
    } finally {
      cleanup(dir);
    }
  });
});

describe('Monorepo root: test-guard prefers .git over nested package.json', suite => {
  suite.test('allows frontend source edit using test beside source file', () => {
    const { dir, sourceFile } = createMonorepoFixture();
    try {
      const result = runHook(TEST_GUARD_PATH, {
        tool_name: 'Write',
        tool_input: { file_path: sourceFile, content: 'const app = true;' }
      }, dir);
      assertEqual(result.exitCode, 0, 'test-guard should find matching test under frontend package');
    } finally {
      cleanup(dir);
    }
  });
});

describe('Package-only root fallback still works without .git', suite => {
  suite.test('plan-gate uses package.json root when no .git exists', () => {
    const { dir, sourceFile } = createPackageOnlyFixture();
    try {
      const result = runHook(PLAN_GATE_PATH, {
        tool_name: 'Write',
        tool_input: { file_path: sourceFile, content: 'const app = true;' }
      }, dir);
      assertEqual(result.exitCode, 0, 'plan-gate should fallback to package.json root');
    } finally {
      cleanup(dir);
    }
  });

  suite.test('test-guard uses package.json root when no .git exists', () => {
    const { dir, sourceFile } = createPackageOnlyFixture();
    try {
      const result = runHook(TEST_GUARD_PATH, {
        tool_name: 'Write',
        tool_input: { file_path: sourceFile, content: 'const app = true;' }
      }, dir);
      assertEqual(result.exitCode, 0, 'test-guard should fallback to package.json root');
    } finally {
      cleanup(dir);
    }
  });
});

process.exit(printSummary());
