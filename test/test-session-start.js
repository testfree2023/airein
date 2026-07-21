/**
 * Test: hooks/session-start.js — SessionStart context injection
 *
 * Bug 2026-07-09 (local deploy, this Windows dev machine): session-start.js
 * unconditionally logged package-manager detection + an 8-line "selection
 * prompt" to STDERR on every session start when no PM preference was
 * configured (pm.source === 'default'). CC renders hook stderr as red error
 * text → the user saw "a bunch of errors" on every `claude` startup. The PM
 * detection result (`pm`) was used ONLY for that reporting (the code comment
 * even says "no context injection"), so the whole block was pure startup noise
 * with zero functional value.
 *
 * This test pins the fix: SessionStart stderr must not contain the PM
 * selection prompt. Spawn the real hook with an isolated temp project so the
 * assertion reflects what CC actually executes.
 *
 * Run: node test/test-session-start.js
 */

const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  describe, assertEqual, assertNotContains, assertContains,
  projectRoot, printSummary,
} = require('./helpers');

const hookPath = path.join(projectRoot(), 'scripts', 'hooks', 'session-start.js');

function runHook(stdinPayload, options = {}) {
  const input = JSON.stringify(stdinPayload);
  const res = spawnSync(process.execPath, [hookPath], {
    input,
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
  });
  return { stdout: res.stdout || '', stderr: res.stderr || '', status: res.status };
}

// Isolated temp project so the hook's session-state/log writes don't touch the
// real repo. A bare dir (no lock file, no package.json) → pm.source === 'default',
// which is exactly the condition that triggered the noise.
function makeTempProject(opts = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-start-proj-'));
  fs.mkdirSync(path.join(cwd, '.airein', 'memory'), { recursive: true });
  // Seed a session-state.md so the hook has real context to inject — lets the
  // regression guard verify context injection still works after silencing PM.
  if (opts.seedState) {
    fs.writeFileSync(
      path.join(cwd, '.airein', 'memory', 'session-state.md'),
      [
        '# Session State',
        '',
        '## Current Task',
        '- **Status**: In Progress',
        '- **Last Active**: 2026-07-09',
        '',
        '## Last Files Edited',
        '- src/app.js',
        '',
      ].join('\n')
    );
  }
  return cwd;
}

describe('session-start.js: clean startup (no PM noise)', suite => {
  suite.test('hook runs and exits 0 (fail-open)', () => {
    const cwd = makeTempProject();
    const { status } = runHook(
      { hook_event_name: 'SessionStart', session_id: 'test-ss-1', cwd },
      { cwd }
    );
    fs.rmSync(cwd, { recursive: true, force: true });
    assertEqual(status, 0, 'SessionStart hook must exit 0 (fail-open)');
  });

  suite.test('stderr has NO package-manager selection prompt (the bug)', () => {
    const cwd = makeTempProject();
    const { stderr } = runHook(
      { hook_event_name: 'SessionStart', session_id: 'test-ss-2', cwd },
      { cwd }
    );
    fs.rmSync(cwd, { recursive: true, force: true });
    // The bug printed all three on every startup when pm.source === 'default'.
    assertNotContains(stderr, 'Supported package managers',
      'must not print the PM selection prompt');
    assertNotContains(stderr, 'No package manager preference',
      'must not print "No package manager preference"');
    assertNotContains(stderr, 'To set your preferred package manager',
      'must not print PM setup instructions');
  });

  suite.test('still injects session-state context to stdout (regression guard)', () => {
    // Ensure silencing the PM noise did not also kill the legitimate context
    // injection. Seed a session-state.md → stdout should carry the "Previous:"
    // line with the last_active field parsed from it.
    const cwd = makeTempProject({ seedState: true });
    const { stdout } = runHook(
      { hook_event_name: 'SessionStart', session_id: 'test-ss-3', cwd },
      { cwd }
    );
    fs.rmSync(cwd, { recursive: true, force: true });
    assertContains(stdout, 'Previous:', 'stdout should inject the Previous: context line');
    assertContains(stdout, 'last_active=2026-07-09',
      'stdout should parse Last Active from seeded session-state');
  });

  suite.test('P007: advances ready task and injects Current task hint', () => {
    const cwd = makeTempProject();
    const planDir = path.join(cwd, 'docs', 'plans', 'P007-ss');
    fs.mkdirSync(planDir, { recursive: true });
    fs.writeFileSync(path.join(planDir, 'tasks.md'), `# Tasks: SS

## 1.0 Implement

### 1.1 Ready
- **Status**: ⏳ pending
- **Depends on**: none
`);
    fs.writeFileSync(path.join(planDir, 'progress.md'), `# Progress: SS
status: in_progress
updated: 2026-07-18
plan: P007-ss
complexity: s-feature
grilling: completed

## Task Stats
total: 1
completed: 0
in_progress: 0
pending: 1

## Approval State
tasks: approved

## Active Task
none

## Blockers
- none
`);
    const { stdout, status } = runHook(
      { hook_event_name: 'SessionStart', session_id: 'test-ss-p007', cwd },
      { cwd }
    );
    assertEqual(status, 0, 'exit 0');
    assertContains(stdout, 'Current task:', 'injects current task');
    assertContains(stdout, '1.1', 'mentions task id');
    const tasks = fs.readFileSync(path.join(planDir, 'tasks.md'), 'utf8');
    assertContains(tasks, 'in_progress', 'tasks advanced on session-start');
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  suite.test('injects Agent Teams ON by default', () => {
    const cwd = makeTempProject();
    const { stdout, status } = runHook(
      { hook_event_name: 'SessionStart', session_id: 'test-ss-teams-on', cwd },
      { cwd }
    );
    assertEqual(status, 0, 'exit 0');
    assertContains(stdout, 'Agent Teams ON', 'default teams on');
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  suite.test('injects Agent Teams OFF when pipelineRoles.enabled=false', () => {
    const cwd = makeTempProject();
    fs.mkdirSync(path.join(cwd, '.airein', 'config'), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, '.airein', 'config', 'quality.json'),
      JSON.stringify({ pipelineRoles: { enabled: false } })
    );
    const { stdout, status } = runHook(
      { hook_event_name: 'SessionStart', session_id: 'test-ss-teams-off', cwd },
      { cwd }
    );
    assertEqual(status, 0, 'exit 0');
    assertContains(stdout, 'Agent Teams OFF', 'teams off');
    assertContains(stdout, 'Solo PM', 'solo pm hint');
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  suite.test('P009: warns when kernel missing (AIREIN_TEST_HOME empty)', () => {
    const cwd = makeTempProject();
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-no-kernel-'));
    const { stdout, status } = runHook(
      { hook_event_name: 'SessionStart', session_id: 'test-ss-kr-miss', cwd },
      { cwd, env: { AIREIN_TEST_HOME: fakeHome } }
    );
    assertEqual(status, 0, 'exit 0');
    assertContains(stdout, 'kernel not ready', 'warns incomplete');
    assertContains(stdout, 'airein setup', 'points at setup');
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  suite.test('P009: silent when kernel ready under AIREIN_TEST_HOME', () => {
    const cwd = makeTempProject();
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-has-kernel-'));
    const kernel = path.join(fakeHome, '.airein');
    fs.mkdirSync(path.join(kernel, 'hooks'), { recursive: true });
    fs.mkdirSync(path.join(kernel, 'scripts', 'lib'), { recursive: true });
    fs.writeFileSync(path.join(kernel, 'VERSION'), '2.06\n');
    fs.writeFileSync(path.join(kernel, 'hooks', 'hooks.json'), '{"hooks":{}}\n');
    const { stdout, status } = runHook(
      { hook_event_name: 'SessionStart', session_id: 'test-ss-kr-ok', cwd },
      { cwd, env: { AIREIN_TEST_HOME: fakeHome } }
    );
    assertEqual(status, 0, 'exit 0');
    assertNotContains(stdout, 'kernel not ready', 'no warning when ready');
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });
});

process.exit(printSummary());
