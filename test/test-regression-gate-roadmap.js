#!/usr/bin/env node
/**
 * Test: regression-test-gate hook — parsing Issues from roadmap.md
 *
 * Verifies the hook correctly extracts the ## Issues section from
 * docs/roadmap.md and detects open bugs referencing edited files.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  describe, assertEqual, assertContains, projectRoot, printSummary
} = require('./helpers');

const GATE_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'regression-test-gate.js');

function createTempProject(roadmapContent) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regress-test-'));
  fs.mkdirSync(path.join(dir, 'docs'));
  if (roadmapContent !== null) {
    fs.writeFileSync(path.join(dir, 'docs', 'roadmap.md'), roadmapContent);
  }
  return dir;
}

function createTranscript(dir, sourceFiles, testFiles) {
  const transcriptPath = path.join(dir, 'transcript.jsonl');
  const lines = [];

  for (const f of sourceFiles) {
    lines.push(JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'Edit', input: { file_path: f } }]
      }
    }));
  }
  for (const f of testFiles) {
    lines.push(JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'Edit', input: { file_path: f } }]
      }
    }));
  }

  fs.writeFileSync(transcriptPath, lines.join('\n'));
  return transcriptPath;
}

function runGate(cwd, transcriptPath) {
  const input = JSON.stringify({ transcript_path: transcriptPath });
  const result = spawnSync('node', [GATE_PATH], {
    input,
    cwd,
    timeout: 5000,
    encoding: 'utf8',
    // Ensure GATE_PATH is resolved relative to the test file, not cwd
    env: { ...process.env },
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

const ROADMAP_WITH_ISSUE = `# Project Roadmap: Test

## Project Overview
- **Name**: Test

## Current Priority
- **Active plan**: none

## Issues

| ID | Title | Status | Priority | Related Plan | Discovered |
|----|-------|--------|----------|-------------|------------|
| I001 | login bug in auth.ts | open | P1 | P001 | 2026-06-07 |

## Recent Changes

### 2026-06-07 Init: test
**Context**: test

## Completed

## On Hold
`;

const ROADMAP_NO_ISSUES_SECTION = `# Project Roadmap: Test

## Project Overview
- **Name**: Test

## Current Priority
- **Active plan**: none

## Completed
`;

describe('regression-test-gate: roadmap.md Issues parsing', suite => {
  suite.test('detects open bug from roadmap.md ## Issues section', () => {
    const dir = createTempProject(ROADMAP_WITH_ISSUE);
    const tp = createTranscript(dir, [path.join(dir, 'src/auth.ts')], []);
    const r = runGate(dir, tp);
    assertEqual(r.exitCode, 0, 'hook exits 0 (warn only)');
    assertContains(r.stdout, 'Regression test missing', 'detects missing regression test for auth.ts');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('no warning when test file also edited', () => {
    const dir = createTempProject(ROADMAP_WITH_ISSUE);
    const tp = createTranscript(dir, [path.join(dir, 'src/auth.ts')], [path.join(dir, 'src/auth.test.ts')]);
    const r = runGate(dir, tp);
    assertEqual(r.exitCode, 0, 'hook exits 0');
    const hasWarning = r.stdout.includes('Regression test missing');
    assertEqual(hasWarning, false, 'no warning when test exists');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('exits cleanly when no ## Issues section', () => {
    const dir = createTempProject(ROADMAP_NO_ISSUES_SECTION);
    const tp = createTranscript(dir, [path.join(dir, 'src/auth.ts')], []);
    const r = runGate(dir, tp);
    assertEqual(r.exitCode, 0, 'exits 0 when no Issues section');
    const hasWarning = r.stdout.includes('Regression test missing');
    assertEqual(hasWarning, false, 'no warning without Issues section');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('exits cleanly when no roadmap.md', () => {
    const dir = createTempProject(null);
    const tp = createTranscript(dir, [path.join(dir, 'src/auth.ts')], []);
    const r = runGate(dir, tp);
    assertEqual(r.exitCode, 0, 'exits 0 when no roadmap');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('path with "test" in directory name does not false-classify as test file', () => {
    // Regression guard: isTest regex must match basename only, not full path.
    // A file at .../test-runner/src/auth.ts should be classified as source,
    // not test, because the directory "test-runner" contains "test" but
    // the filename "auth.ts" does not.
    const dir = createTempProject(ROADMAP_WITH_ISSUE);
    const srcDir = path.join(dir, 'test-runner', 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const srcFile = path.join(srcDir, 'auth.ts');
    const tp = createTranscript(dir, [srcFile], []);
    const r = runGate(dir, tp);
    assertEqual(r.exitCode, 0, 'hook exits 0 (warn only)');
    assertContains(r.stdout, 'Regression test missing', 'auth.ts in test-runner/ dir still detected as source');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('wontfix issues are ignored', () => {
    const wontfixRoadmap = `# Project Roadmap: Test

## Issues

| ID | Title | Status | Priority | Related Plan | Discovered |
|----|-------|--------|----------|-------------|------------|
| I001 | login bug in auth.ts | wontfix | P1 | P001 | 2026-06-07 |

## Recent Changes
`;
    const dir = createTempProject(wontfixRoadmap);
    const tp = createTranscript(dir, [path.join(dir, 'src/auth.ts')], []);
    const r = runGate(dir, tp);
    assertEqual(r.exitCode, 0, 'exits 0');
    const hasWarning = r.stdout.includes('Regression test missing');
    assertEqual(hasWarning, false, 'wontfix issues are ignored');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite.test('fixed issues are ignored', () => {
    const fixedRoadmap = `# Project Roadmap: Test

## Issues

| ID | Title | Status | Priority | Related Plan | Discovered |
|----|-------|--------|----------|-------------|------------|
| I001 | login bug in auth.ts | fixed | P1 | P001 | 2026-06-07 |

## Recent Changes
`;
    const dir = createTempProject(fixedRoadmap);
    const tp = createTranscript(dir, [path.join(dir, 'src/auth.ts')], []);
    const r = runGate(dir, tp);
    assertEqual(r.exitCode, 0, 'exits 0');
    const hasWarning = r.stdout.includes('Regression test missing');
    assertEqual(hasWarning, false, 'fixed issues are ignored');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

process.exit(printSummary());
