#!/usr/bin/env node
/**
 * PreToolUse Hook: Commit Verification Gate
 *
 * Intercepts `git commit` commands. Before allowing the commit:
 * 1. Checks if build passes (only for detected build tools) — exit 2 blocks on failure
 * 2. Runs test suite (only for detected test frameworks) — exit 2 blocks on failure
 * 3. Warns if staged source files have no corresponding tests
 *
 * Gate skip: if the commit stages NO source or test files (doc/config-only),
 * build+test are skipped entirely — see 20-workflow.md "流程豁免". Block reasons
 * are written to stderr so CC surfaces them (never swallowed on stdout).
 *
 * Project detection: skips build/test tools whose config file is absent.
 * For example, if no package.json exists, npm/pnpm are skipped entirely.
 *
 * Exit code 2 = block the commit
 * Exit code 0 = allow (with optional warnings)
 */

const { execSync } = require('child_process');
const path = require('path');
const { loadQualityConfig } = require('../lib/quality-config');
const { aireinLog } = require('../lib/airein-logger');
const { getBuildCommands, getTestCommands, getSourceExtensions, isTestFile } = require('../lib/language-config');
const { classifyStagedFiles } = require('../lib/commit-gate');

const MAX_STDIN = 1024 * 1024;
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (stdinData.length < MAX_STDIN) stdinData += chunk;
});
process.stdin.on('end', () => {
  try { main(); } catch (e) { process.exit(0); }
});

function formatCommand(command) {
  return {
    cmd: `${command.cmd} 2>&1`,
    name: command.cmd,
    config: command.configFile
  };
}

function tryRun(cmd, timeout) {
  try {
    const output = execSync(cmd, { timeout, stdio: 'pipe', encoding: 'utf8' });
    return { success: true, output };
  } catch (e) {
    const output = (e.stdout || '') + (e.stderr || '') || '';
    const isNotFound = output.includes('not found') || output.includes('not recognized');
    if (isNotFound) return { success: null, output: '' };
    return { success: false, output };
  }
}

// Build/test commands with project config detection
function buildChecks() {
  return getBuildCommands(process.cwd()).map(formatCommand);
}

function testChecks() {
  return getTestCommands(process.cwd()).map(formatCommand);
}

/**
 * Read staged file paths. Returns null if git is unavailable / not a repo /
 * diff fails — callers treat null as "unknown" and fail-safe (run the gate)
 * rather than silently weakening it.
 */
function readStagedFiles() {
  try {
    const out = execSync('git diff --cached --name-only', { encoding: 'utf8', timeout: 5000 });
    return out.split('\n').map(l => l.replace(/\r$/, '')).filter(Boolean);
  } catch {
    return null;
  }
}

function main() {
  let input;
  try { input = JSON.parse(stdinData); } catch { process.exit(0); }

  const command = input.tool_input?.command || input.input?.command || '';
  if (!command.match(/\bgit\s+commit\b/) || command.includes('--amend')) process.exit(0);

  aireinLog('info', 'pre-commit-gate', 'Commit detected, running build and test checks');

  const config = loadQualityConfig();
  const blocking = config.blocking || {};
  const blockOnBuild = blocking.buildFailure !== false;
  const blockOnTest = blocking.testFailure !== false;

  // ── Classify staged files: skip build/test for non-source commits ─────
  // Build+test only matter when the commit touches compilable/tested source.
  // Doc/config-only commits are exempt (20-workflow.md "流程豁免"). This also
  // prevents a pre-existing failure from blocking unrelated doc work. If git
  // diff fails (stagedFiles === null) we fail-safe: run the gate.
  const stagedFiles = readStagedFiles();
  const classification = stagedFiles === null
    ? null
    : classifyStagedFiles(stagedFiles, { sourceExtensions: getSourceExtensions(), isTestFile });
  const runGate = classification ? classification.runGate : true;
  if (!runGate) {
    aireinLog('info', 'pre-commit-gate',
      `Non-source commit (${classification.otherFiles.length} doc/config file(s)); skipping build/test gate`);
  }

  const warnings = [];
  let shouldBlock = false;

  // ── Check 1: Build (only for tools whose config file exists) ──────
  let buildPassed = null;
  if (runGate) {
    for (const { cmd, name } of buildChecks()) {
      const result = tryRun(cmd, 30000);
      if (result.success === null) continue;
      if (result.success) {
        buildPassed = true;
        break;
      } else {
        buildPassed = false;
        const tail = result.output.split('\n').slice(-6).join('\n');
        warnings.push(`❌ [Commit Gate] ${name} FAILED:\n${tail}\nFix build errors before committing.`);
        aireinLog('error', 'pre-commit-gate', `${name} failed, blocking commit`);
        if (blockOnBuild) shouldBlock = true;
        break;
      }
    }
  }

  // ── Check 2: Tests (only if build passed or no build tool found) ──
  if (runGate && buildPassed !== false) {
    for (const { cmd, name } of testChecks()) {
      const result = tryRun(cmd, 120000);
      if (result.success === null) continue;
      if (result.success) {
        if (result.output.includes('failed') || result.output.includes('FAIL')) {
          const failLines = result.output.split('\n').filter(l =>
            l.includes('FAIL') || l.includes('fail')
          ).slice(0, 5);
          warnings.push(`❌ [Commit Gate] ${name} has failures:\n${failLines.join('\n')}`);
          aireinLog('error', 'pre-commit-gate', `${name} has test failures`);
          if (blockOnTest) shouldBlock = true;
        }
        break;
      } else {
        const tail = result.output.split('\n').slice(-8).join('\n');
        warnings.push(`❌ [Commit Gate] ${name} FAILED:\n${tail}\nFix failing tests before committing.`);
        aireinLog('error', 'pre-commit-gate', `${name} failed, blocking commit`);
        if (blockOnTest) shouldBlock = true;
        break;
      }
    }
  }

  // ── Check 3: Staged source files vs tests (warning only) ─────────
  // Reuses the classification computed above (no second git diff).
  if (classification && classification.sourceFiles.length > 0 && classification.testFiles.length === 0) {
    const sourceFiles = classification.sourceFiles;
    warnings.push(`📋 [Commit Gate] ${sourceFiles.length} source file(s) staged but no test files:\n${sourceFiles.slice(0, 5).map(f => `  - ${f}`).join('\n')}`);
    warnings.push('Consider adding tests before committing.');
    aireinLog('warn', 'pre-commit-gate', `${sourceFiles.length} source files staged without tests`);
  }

  // Warnings → stderr. CC surfaces stderr on the exit-2 block, so the author
  // sees WHY the commit was blocked (stdout would be swallowed → the old
  // "No stderr output" bug). Follows conventions-javascript §6.
  if (warnings.length > 0) {
    process.stderr.write(warnings.join('\n') + '\n');
  }

  if (shouldBlock) {
    aireinLog('warn', 'pre-commit-gate', 'Commit blocked — build or test failures');
    process.exit(2);
  }

  aireinLog('info', 'pre-commit-gate', 'All checks passed, allowing commit');
  process.exit(0);
}
