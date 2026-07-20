/**
 * Spec: root CHANGELOG.md + skills/sync contract (user-facing release notes).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  describe, assertOk, assertEqual, assertContains, projectRoot, printSummary,
} = require('./helpers');

const root = projectRoot();

function readSkill(name) {
  const p = path.join(root, 'skills', name, 'SKILL.md');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

describe('CHANGELOG.md seed', suite => {
  suite.test('exists at repo root with Unreleased, Tags, and version sections', () => {
    const p = path.join(root, 'CHANGELOG.md');
    assertOk(fs.existsSync(p), 'CHANGELOG.md exists');
    const body = fs.readFileSync(p, 'utf8');
    assertContains(body, '## [Unreleased]', 'Unreleased');
    assertContains(body, '## Tags', 'Tags index');
    assertContains(body, '2026-07-13', 'release tag 2026-07-13');
    assertContains(body, 'pre-p004-2026-07-11', 'rollback tag');
    assertContains(body, '2026-07-18', 'checkpoint tag 2026-07-18');
    assertContains(body, 'P006-dashboard-progress-panel', 'P006');
    assertContains(body, 'P007-task-pickup-progress-sync', 'P007');
    assertContains(body, '## [2.06]', '2.06');
    assertContains(body, '## [2.05]', '2.05');
    assertContains(body, '## [2.03]', '2.03');
    assertContains(body, 'P008-pipeline-roles', 'P008');
    assertContains(body, 'P001-cross-platform', 'P001');
    assertContains(body, 'P002-local-source-install', 'P002');
    assertContains(body, 'P003-multi-host-commands', 'P003');
    assertContains(body, 'P004-unified-install-orchestrator', 'P004');
    assertContains(body, 'roadmap.md', 'points to process log');
  });
});

describe('skills require CHANGELOG.md (user-facing)', suite => {
  suite.test('archive-plan mandates CHANGELOG write', () => {
    const s = readSkill('archive-plan');
    assertContains(s, 'CHANGELOG.md', 'archive-plan mentions CHANGELOG.md');
    assertOk(/必做|must/i.test(s) && s.includes('CHANGELOG'), '必做/must with CHANGELOG');
    assertOk(!s.includes('changelog.md'), 'no legacy lowercase changelog.md path');
  });

  suite.test('tdd prompts CHANGELOG on completed === total', () => {
    const s = readSkill('tdd');
    assertContains(s, 'CHANGELOG.md', 'tdd mentions CHANGELOG.md');
    assertContains(s, '[Unreleased]', 'Unreleased');
  });

  suite.test('log-change separates roadmap vs CHANGELOG', () => {
    const s = readSkill('log-change');
    assertContains(s, 'CHANGELOG.md', 'log-change mentions CHANGELOG.md');
    assertContains(s, 'roadmap.md', 'still references roadmap');
    assertOk(!s.includes('changelog.md'), 'no legacy lowercase changelog.md');
  });

  suite.test('init-project documents CHANGELOG vs Recent Changes', () => {
    const s = readSkill('init-project');
    assertContains(s, 'CHANGELOG.md', 'init-project mentions CHANGELOG.md');
  });
});

describe('sync-airein ships CHANGELOG.md', suite => {
  suite.test('CORE_FILES includes CHANGELOG.md', () => {
    const sync = fs.readFileSync(path.join(root, 'scripts', 'update', 'sync-airein.sh'), 'utf8');
    assertOk(sync.includes('"CHANGELOG.md"'), 'CORE_FILES has CHANGELOG.md');
  });
});

describe('doc-file-warning allows root CHANGELOG.md', suite => {
  suite.test('exit 0 for CHANGELOG.md at project root', () => {
    const hook = path.join(root, 'scripts', 'hooks', 'doc-file-warning.js');
    const input = JSON.stringify({ tool_input: { file_path: path.join(root, 'CHANGELOG.md') } });
    const result = spawnSync('node', [hook], { input, timeout: 5000, encoding: 'utf8' });
    assertEqual(result.status, 0, 'CHANGELOG.md allowed');
  });
});

process.exit(printSummary());