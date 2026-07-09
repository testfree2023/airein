#!/usr/bin/env node
/**
 * Test: archive-trigger PostToolUse hook — completion detection
 *
 * P016 Task 2.1. Verifies the hook nudges the model to run /archive-plan
 * when a plan's progress.md becomes complete (isPlanCompleted && status≠archived),
 * stays silent otherwise, dedups per-plan within a session, and never blocks (exit 0).
 *
 * Visibility note: for PostToolUse hooks, stderr (console.error) is the channel
 * the model sees (see read-dedup.js precedent); stdout is invisible to the model.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  describe, assertEqual, assertContains, assertNotContains, projectRoot, printSummary
} = require('./helpers');

const HOOK_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'archive-trigger.js');
const PLAN_DIR_REL = path.join('docs', 'plans', 'P016-test');

function dedupFile(sessionId) {
  return path.join(os.tmpdir(), `.archive-trigger-${sessionId}.tmp`);
}

function makeTempProject(progressContent) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-trig-'));
  fs.mkdirSync(path.join(dir, PLAN_DIR_REL), { recursive: true });
  fs.writeFileSync(path.join(dir, PLAN_DIR_REL, 'progress.md'), progressContent);
  return dir;
}

function runHook(cwd, progressPath, sessionId) {
  const input = JSON.stringify({ tool_input: { file_path: progressPath } });
  const result = spawnSync('node', [HOOK_PATH], {
    input,
    cwd,
    timeout: 5000,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_SESSION_ID: sessionId },
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

const COMPLETE_INPROGRESS = `# Progress: test
status: in_progress
plan: P016-test

## Task Stats
total: 2
completed: 2
in_progress: 0
pending: 0
`;

const INCOMPLETE = `# Progress: test
status: in_progress
plan: P016-test

## Task Stats
total: 2
completed: 1
in_progress: 1
pending: 0
`;

const COMPLETE_ARCHIVED = `# Progress: test
status: archived
plan: P016-test

## Task Stats
total: 2
completed: 2
in_progress: 0
pending: 0
`;

describe('archive-trigger: completion detection', suite => {
  suite.test('complete + not archived → nudges via stderr, exit 0', () => {
    const sid = 't-complete-' + process.pid;
    fs.rmSync(dedupFile(sid), { force: true });
    const dir = makeTempProject(COMPLETE_INPROGRESS);
    const pp = path.join(dir, PLAN_DIR_REL, 'progress.md');
    const r = runHook(dir, pp, sid);
    assertEqual(r.exitCode, 0, 'non-blocking exit 0');
    assertContains(r.stderr, 'archive', 'nudge mentions archive');
    assertContains(r.stderr, 'P016-test', 'nudge mentions plan id');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(dedupFile(sid), { force: true });
  });

  suite.test('incomplete → silent, exit 0', () => {
    const sid = 't-incomplete-' + process.pid;
    fs.rmSync(dedupFile(sid), { force: true });
    const dir = makeTempProject(INCOMPLETE);
    const pp = path.join(dir, PLAN_DIR_REL, 'progress.md');
    const r = runHook(dir, pp, sid);
    assertEqual(r.exitCode, 0, 'exit 0');
    assertNotContains(r.stderr, 'archive', 'no nudge when incomplete');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(dedupFile(sid), { force: true });
  });

  suite.test('complete + status archived → silent (already archived)', () => {
    const sid = 't-archived-' + process.pid;
    fs.rmSync(dedupFile(sid), { force: true });
    const dir = makeTempProject(COMPLETE_ARCHIVED);
    const pp = path.join(dir, PLAN_DIR_REL, 'progress.md');
    const r = runHook(dir, pp, sid);
    assertEqual(r.exitCode, 0, 'exit 0');
    assertNotContains(r.stderr, 'archive', 'no nudge when already archived');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(dedupFile(sid), { force: true });
  });

  suite.test('dedup: same plan twice in one session → nudge once', () => {
    const sid = 't-dedup-' + process.pid;
    fs.rmSync(dedupFile(sid), { force: true });
    const dir = makeTempProject(COMPLETE_INPROGRESS);
    const pp = path.join(dir, PLAN_DIR_REL, 'progress.md');
    const r1 = runHook(dir, pp, sid);
    const r2 = runHook(dir, pp, sid);
    assertContains(r1.stderr, 'archive', 'first run nudges');
    assertNotContains(r2.stderr, 'archive', 'second run silent (deduped)');
    assertEqual(r2.exitCode, 0, 'second run still exit 0');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(dedupFile(sid), { force: true });
  });

  suite.test('different plans → nudge independently (separate dedup keys)', () => {
    const sid = 't-multi-' + process.pid;
    fs.rmSync(dedupFile(sid), { force: true });
    // Plan A
    const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-trig-'));
    fs.mkdirSync(path.join(dirA, 'docs', 'plans', 'P100-a'), { recursive: true });
    const ppA = path.join(dirA, 'docs', 'plans', 'P100-a', 'progress.md');
    fs.writeFileSync(ppA, COMPLETE_INPROGRESS.replace(/P016-test/g, 'P100-a'));
    // Plan B
    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-trig-'));
    fs.mkdirSync(path.join(dirB, 'docs', 'plans', 'P200-b'), { recursive: true });
    const ppB = path.join(dirB, 'docs', 'plans', 'P200-b', 'progress.md');
    fs.writeFileSync(ppB, COMPLETE_INPROGRESS.replace(/P016-test/g, 'P200-b'));

    const rA = runHook(dirA, ppA, sid);
    const rB = runHook(dirB, ppB, sid);
    assertContains(rA.stderr, 'P100-a', 'plan A nudged');
    assertContains(rB.stderr, 'P200-b', 'plan B nudged independently');
    fs.rmSync(dirA, { recursive: true, force: true });
    fs.rmSync(dirB, { recursive: true, force: true });
    fs.rmSync(dedupFile(sid), { force: true });
  });

  suite.test('non-progress.md file → silent, exit 0', () => {
    const sid = 't-nonprogress-' + process.pid;
    fs.rmSync(dedupFile(sid), { force: true });
    const dir = makeTempProject(COMPLETE_INPROGRESS);
    // Feed a tasks.md path, not progress.md
    const tp = path.join(dir, PLAN_DIR_REL, 'tasks.md');
    const r = runHook(dir, tp, sid);
    assertEqual(r.exitCode, 0, 'exit 0');
    assertNotContains(r.stderr, 'archive', 'no nudge for non-progress file');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(dedupFile(sid), { force: true });
  });
});

process.exit(printSummary());
