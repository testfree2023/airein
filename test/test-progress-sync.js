/**
 * Spec: scripts/hooks/progress-sync.js — P007 wire + panel-compatible fixtures
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  describe, assertEqual, assertContains, assertOk, projectRoot, printSummary,
} = require('./helpers');

const HOOK = path.join(projectRoot(), 'scripts', 'hooks', 'progress-sync.js');

function runSync(tasksPath, cwd) {
  const input = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: tasksPath },
  });
  return spawnSync(process.execPath, [HOOK], {
    input,
    encoding: 'utf8',
    cwd: cwd || path.dirname(tasksPath),
    timeout: 15000,
  });
}

describe('progress-sync hook', suite => {
  suite.test('advances ready and updates progress short pointer', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-psync-'));
    try {
      const planDir = path.join(tmp, 'docs', 'plans', 'P007-demo');
      fs.mkdirSync(planDir, { recursive: true });
      const tasksPath = path.join(planDir, 'tasks.md');
      const progressPath = path.join(planDir, 'progress.md');
      fs.writeFileSync(tasksPath, `# Tasks: Demo

## 1.0 Implement

### 1.1 Done
- **Status**: ✅ completed
- **Depends on**: none

### 1.2 Next
- **Status**: ⏳ pending
- **Depends on**: 1.1
`);
      fs.writeFileSync(progressPath, `# Progress: Demo
status: in_progress
updated: 2026-01-01
plan: P007-demo
complexity: s-feature
grilling: completed

## Task Stats
total: 0
completed: 0
in_progress: 0
pending: 0

## Approval State
tasks: approved

## Active Task
long prose overwrite risk

## Blockers
- none
`);
      const result = runSync(tasksPath, tmp);
      assertEqual(result.status, 0, 'exit 0');
      const tasks = fs.readFileSync(tasksPath, 'utf8');
      const progress = fs.readFileSync(progressPath, 'utf8');
      assertOk(/in_progress/i.test(tasks), 'tasks advanced');
      assertContains(progress, 'in_progress: 1');
      assertContains(progress, '## Active Task\n1.2');
      assertOk(!/long prose/.test(progress), 'prose cleared');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

process.exit(printSummary());
