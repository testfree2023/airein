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
});

process.exit(printSummary());
