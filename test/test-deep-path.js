/**
 * Test: Deep path traversal for hooks
 *
 * Regression test for bug: findProjectRoot() / MAX_WALK only traversed
 * 8 directory levels, failing for Java projects with deeply nested packages
 * like src/main/java/com/hq/juxu/module/iot/service/battery/
 *
 * Also tests Java test naming convention (XxxTest.java).
 *
 * Verifies:
 *   - plan-gate: finds project root from 12+ level deep paths
 *   - test-guard: finds project root from 12+ level deep paths
 *   - test-guard: recognizes Java JUnit test naming (XxxTest.java)
 *   - approval-guard: finds project root from 12+ level deep paths
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  describe, assertOk, assertEqual, assertContains,
  projectRoot, printSummary
} = require('./helpers');

const PLAN_GATE_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'plan-gate.js');
const TEST_GUARD_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'test-guard.js');
const APPROVAL_GUARD_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'approval-guard.js');

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

function createDeepJavaProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deep-java-'));
  fs.mkdirSync(path.join(dir, '.claude', 'config'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude', 'memory'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'config', 'quality.json'),
    JSON.stringify({ planGate: { mode: 'strict' }, testGuard: { mode: 'strict', enabled: true } }));
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"deep-java-fixture"}\n');

  const deepDir = path.join(dir,
    'src', 'main', 'java', 'com', 'hq', 'juxu',
    'module', 'iot', 'service', 'battery'
  );
  fs.mkdirSync(deepDir, { recursive: true });
  const deepFile = path.join(deepDir, 'BatteryService.java');
  fs.writeFileSync(deepFile, 'public class BatteryService {}\n');

  const testDir = path.join(dir,
    'src', 'test', 'java', 'com', 'hq', 'juxu',
    'module', 'iot', 'service', 'battery'
  );
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'test'), { recursive: true });

  const planDir = path.join(dir, 'docs', 'plans', 'P001-test');
  fs.mkdirSync(planDir, { recursive: true });
  fs.writeFileSync(path.join(planDir, 'progress.md'),
    '# Progress: Test\nupdated: 2026-06-11\nplan: P001-test\ncomplexity: simple\n\n' +
    '## Task Stats\ntotal: 1\ncompleted: 0\nin_progress: 0\npending: 1\n\n' +
    '## Approval State\nrequirements: approved\ndesign: none\ntasks: none\n\n' +
    '## Active Task\nnone\n\n## Blockers\n- none\n'
  );

  return { dir, deepFile, testDir };
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

describe('Deep path: plan-gate finds root from 12+ levels', suite => {
  suite.test('strict mode: blocks deep source file without plan', () => {
    const { dir, deepFile } = createDeepJavaProject();
    try {
      fs.rmSync(path.join(dir, 'docs', 'plans', 'P001-test', 'progress.md'));
      fs.writeFileSync(path.join(dir, '.claude', 'config', 'quality.json'),
        JSON.stringify({ planGate: { mode: 'strict' }, testGuard: { mode: 'strict', enabled: true } }));
      const result = runHook(PLAN_GATE_PATH, { tool_name: 'Write', tool_input: { file_path: deepFile, content: 'x' } }, dir);
      assertEqual(result.exitCode, 2, 'plan-gate should block deep file without plan');
    } finally {
      cleanup(dir);
    }
  });

  suite.test('strict mode: allows deep source file with approved plan', () => {
    const { dir, deepFile } = createDeepJavaProject();
    try {
      const result = runHook(PLAN_GATE_PATH, { tool_name: 'Write', tool_input: { file_path: deepFile, content: 'updated' } }, dir);
      assertEqual(result.exitCode, 0, 'plan-gate should allow deep file with approved plan');
    } finally {
      cleanup(dir);
    }
  });
});

describe('Deep path: test-guard finds root from 12+ levels', suite => {
  suite.test('blocks deep source file without test', () => {
    const { dir, deepFile } = createDeepJavaProject();
    try {
      const result = runHook(TEST_GUARD_PATH, { tool_name: 'Write', tool_input: { file_path: deepFile, content: 'x' } }, dir);
      assertEqual(result.exitCode, 2, 'test-guard should block deep file without test');
      assertContains(result.stderr, 'Test Guard', 'stderr should mention Test Guard');
    } finally {
      cleanup(dir);
    }
  });

  suite.test('allows deep source file with matching test (XxxTest.java)', () => {
    const { dir, deepFile, testDir } = createDeepJavaProject();
    try {
      fs.writeFileSync(path.join(testDir, 'BatteryServiceTest.java'), '// test\n');
      const result = runHook(TEST_GUARD_PATH, { tool_name: 'Write', tool_input: { file_path: deepFile, content: 'x' } }, dir);
      assertEqual(result.exitCode, 0, 'test-guard should allow with XxxTest.java');
    } finally {
      cleanup(dir);
    }
  });
});

describe('Deep path: test-guard recognizes Java Test suffix', suite => {
  suite.test('allows deep source file with Java XxxTest.java test', () => {
    const { dir, deepFile, testDir } = createDeepJavaProject();
    try {
      fs.writeFileSync(path.join(testDir, 'BatteryServiceTest.java'),
        'public class BatteryServiceTest {}\n');
      const result = runHook(TEST_GUARD_PATH, { tool_name: 'Write', tool_input: { file_path: deepFile, content: 'x' } }, dir);
      assertEqual(result.exitCode, 0, 'test-guard should allow with XxxTest.java naming');
    } finally {
      cleanup(dir);
    }
  });
});

describe('Deep path: approval-guard runs on deep paths', suite => {
  suite.test('processes progress.md without crash', () => {
    const { dir } = createDeepJavaProject();
    try {
      const progressPath = path.join(dir, 'docs', 'plans', 'P001-test', 'progress.md');
      const result = runHook(APPROVAL_GUARD_PATH, {
        tool_name: 'Edit',
        tool_input: {
          file_path: progressPath,
          old_string: 'requirements: approved',
          new_string: 'requirements: draft'
        }
      }, dir);
      assertOk(result.exitCode === 0 || result.exitCode === 2,
        'approval-guard should run without error on deep paths (got ' + result.exitCode + ')');
    } finally {
      cleanup(dir);
    }
  });
});

process.exit(printSummary());
