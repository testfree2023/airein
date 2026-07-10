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
  });
  return { stdout: res.stdout || '', stderr: res.stderr || '', status: res.status };
}

// Isolated temp project so the hook's session-state/log writes don't touch the
// real repo. A bare dir (no lock file, no package.json) → pm.source === 'default',
// which is exactly the condition that triggered the noise.
function makeTempProject(opts = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-start-proj-'));
  fs.mkdirSync(path.join(cwd, '.claude', 'memory'), { recursive: true });
  // Seed a session-state.md so the hook has real context to inject — lets the
  // regression guard verify context injection still works after silencing PM.
  if (opts.seedState) {
    fs.writeFileSync(
      path.join(cwd, '.claude', 'memory', 'session-state.md'),
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
});

process.exit(printSummary());
