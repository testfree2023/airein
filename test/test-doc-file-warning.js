#!/usr/bin/env node
/**
 * Test: doc-file-warning hook — path allowlist logic
 *
 * Verifies isAllowedDocPath recognizes standard locations.
 */

const path = require('path');
const { spawnSync } = require('child_process');
const {
  describe, assertEqual, assertOk, projectRoot, printSummary
} = require('./helpers');

const DOC_WARN_PATH = path.join(projectRoot(), 'scripts', 'hooks', 'doc-file-warning.js');

function runDocWarn(filePath) {
  const input = JSON.stringify({ tool_input: { file_path: filePath } });
  const result = spawnSync('node', [DOC_WARN_PATH], {
    input,
    timeout: 5000,
    encoding: 'utf8',
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

describe('doc-file-warning: path allowlist', suite => {
  suite.test('allows templates/docs/*.md', () => {
    const r = runDocWarn(path.join(projectRoot(), 'templates', 'docs', 'requirements.md'));
    assertEqual(r.exitCode, 0, 'templates/docs allowed');
  });

  suite.test('allows docs/*.md', () => {
    const r = runDocWarn(path.join(projectRoot(), 'docs', 'roadmap.md'));
    assertEqual(r.exitCode, 0, 'docs/ allowed');
  });

  suite.test('allows skills/*.md', () => {
    const r = runDocWarn(path.join(projectRoot(), 'skills', 'some-skill', 'SKILL.md'));
    assertEqual(r.exitCode, 0, 'skills/ allowed');
  });

  suite.test('blocks random/*.md', () => {
    const r = runDocWarn(path.join(projectRoot(), 'random', 'notes.md'));
    assertEqual(r.exitCode, 2, 'random path blocked');
  });

  suite.test('allows non-md files anywhere', () => {
    const r = runDocWarn(path.join(projectRoot(), 'anywhere', 'script.js'));
    assertEqual(r.exitCode, 0, 'non-md always allowed');
  });

  suite.test('allows README.md at project root', () => {
    const r = runDocWarn(path.join(projectRoot(), 'README.md'));
    assertEqual(r.exitCode, 0, 'README.md allowed');
  });

  suite.test('allows CONTEXT.md at project root', () => {
    const r = runDocWarn(path.join(projectRoot(), 'CONTEXT.md'));
    assertEqual(r.exitCode, 0, 'CONTEXT.md allowed');
  });

  suite.test('allows rules/*.md (L0 instruction channel)', () => {
    const r = runDocWarn(path.join(projectRoot(), 'rules', '00-iron-rules.md'));
    assertEqual(r.exitCode, 0, 'rules/*.md allowed');
  });

  suite.test('allows .claude/self-learning/*.md (self-learning buffer)', () => {
    const r = runDocWarn(path.join(projectRoot(), '.claude', 'self-learning', 'pending.md'));
    assertEqual(r.exitCode, 0, '.claude/self-learning allowed');
  });

  suite.test('blocked stderr must not contradict exit 2 (no 可以创建 wording)', () => {
    // exit 2 is a HARD block (Write denied this turn). The stderr must not
    // claim the file "可以创建" — that misleads the model/user into retrying
    // the same path expecting success. Dogfood-found 2026-07-10 (3.14 test).
    const r = runDocWarn(path.join(projectRoot(), 'NOTES.md'));
    assertEqual(r.exitCode, 2, 'root NOTES.md blocked');
    assertOk(!/可以创建/.test(r.stderr), 'stderr must not claim 可以创建 (contradicts exit 2 hard block)');
  });
});

process.exit(printSummary());
