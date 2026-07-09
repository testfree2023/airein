#!/usr/bin/env node
/**
 * Stop Hook: Test Verification Gate
 *
 * When Claude is about to stop (declare "done"), automatically:
 * 1. Run the project's test suite — exit 2 (hard block) on failures
 * 2. Check edited source files have corresponding test files
 *
 * Exit code 2 = block stop, force Claude to fix
 * Exit code 0 = allow stop (with optional warnings)
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { loadQualityConfig } = require('../lib/quality-config');
const { aireinLog } = require('../lib/airein-logger');
const { getSourceExtensions, isTestFile, getTestCommands } = require('../lib/language-config');

const MAX_STDIN = 1024 * 1024;
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (stdinData.length < MAX_STDIN) stdinData += chunk;
});
process.stdin.on('end', () => {
  try { main(); } catch (e) { cleanExit(0); }
});

// ── Unified exit: always delegate session-end before exiting ────
// CC only runs the first hook per event group, so we chain
// session-end from stop-test-gate to guarantee it always fires.
function cleanExit(code) {
  try {
    const sessionEndPath = path.join(__dirname, 'session-end.js');
    if (fs.existsSync(sessionEndPath)) {
      const src = fs.readFileSync(sessionEndPath, 'utf8');
      const hasRun = /\bmodule\.exports\b/.test(src) && /\brun\b/.test(src);
      if (hasRun) {
        const mod = require(sessionEndPath);
        if (typeof mod.run === 'function') mod.run(stdinData);
      } else {
        execSync(`"${process.execPath}" "${sessionEndPath}"`, {
          input: stdinData, encoding: 'utf8', timeout: 10000
        });
      }
    }
  } catch (e) {
    aireinLog('warn', 'stop-test-gate', `session-end delegation failed: ${e.message}`);
  }
  process.exit(code);
}

function main() {
  let input;
  try { input = JSON.parse(stdinData); } catch { cleanExit(0); }

  // Only run if code files were modified in this session
  const transcriptPath = input.transcript_path;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) cleanExit(0);

  const content = fs.readFileSync(transcriptPath, 'utf8');
  const sourceFiles = new Set();
  const testFiles = new Set();
  let hasCodeEdits = false;

  for (const line of content.split('\n').filter(Boolean)) {
    try {
      const entry = JSON.parse(line);
      const tool = entry.tool_name || entry.name || '';
      const fp = entry.tool_input?.file_path || entry.input?.file_path || '';

      if ((tool === 'Edit' || tool === 'Write') && fp) {
        const ext = path.extname(fp).toLowerCase();
        if (getSourceExtensions().has(ext)) {
          hasCodeEdits = true;
          if (isTestFile(fp)) testFiles.add(fp);
          else sourceFiles.add(fp);
        }
      }

      // Also check assistant message content blocks
      if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
        for (const block of entry.message.content) {
          if (block.type === 'tool_use' && (block.name === 'Edit' || block.name === 'Write')) {
            const fp2 = block.input?.file_path || '';
            const ext2 = path.extname(fp2).toLowerCase();
            if (fp2 && getSourceExtensions().has(ext2)) {
              hasCodeEdits = true;
              if (isTestFile(fp2)) testFiles.add(fp2);
              else sourceFiles.add(fp2);
            }
          }
        }
      }
    } catch { return false; }
  }

  if (!hasCodeEdits) cleanExit(0);

  aireinLog('info', 'stop-test-gate', `Session has ${sourceFiles.size} source files, ${testFiles.size} test files`);

  const cwd = process.cwd();
  const config = loadQualityConfig();
  const warnings = [];
  let shouldBlock = false;

  // ── Gate 1: Run test suite ──────────────────────────────────────
  const testCommands = getTestCommands(cwd).map(command => ({
    cmd: `${command.cmd} 2>&1`,
    name: command.cmd
  }));

  if (testCommands.length > 0) {
    let testRan = false;
    for (const { cmd, name } of testCommands) {
      try {
        const output = execSync(cmd, {
          encoding: 'utf8',
          timeout: 120000,
          cwd: cwd,
          stdio: 'pipe'
        });

        testRan = true;
        // Check output for failure indicators even with exit code 0
        if (output.includes('failed') || output.includes('FAIL') || output.includes('ERROR')) {
          const failLines = output.split('\n').filter(l =>
            l.includes('FAIL') || l.includes('fail') || l.includes('Error')
          ).slice(0, 5);
          warnings.push(`❌ [Test Gate] ${name} has failures:\n${failLines.join('\n')}`);
          aireinLog('error', 'stop-test-gate', `${name} detected failures in test output`);
          if (config.blocking.testFailure !== false) shouldBlock = true;
        }
        // If tests passed, no need to try other commands
        if (!shouldBlock) break;
      } catch (e) {
        const output = (e.stdout || '') + (e.stderr || '');
        // Only count as test failure if the tool exists
        if (!output.includes('not found') && !output.includes('not recognized') && !output.includes('ENOENT')) {
          const tailLines = output.split('\n').slice(-10).join('\n');
          warnings.push(`❌ [Test Gate] ${name} FAILED:\n${tailLines}`);
          aireinLog('error', 'stop-test-gate', `${name} failed with non-zero exit code`);
          if (config.blocking.testFailure !== false) shouldBlock = true;
          testRan = true;
        }
      }
    }

    if (testRan && shouldBlock) {
      warnings.push('Do NOT declare done until all tests pass.');
    }
  }

  // ── Gate 2: Test coverage check ─────────────────────────────────
  const cov = config.testCoverage;
  if (sourceFiles.size >= cov.minSourceFiles) {
    const uncoveredFiles = [];

    for (const srcFile of sourceFiles) {
      const baseName = path.basename(srcFile, path.extname(srcFile));

      const hasMatchingTest = Array.from(testFiles).some(t => {
        const testBase = path.basename(t, path.extname(t));
        return testBase === baseName + '.test' ||
               testBase === baseName + '.spec' ||
               testBase === baseName + '_test' ||
               testBase === 'test_' + baseName ||
               testBase === baseName + 'Test' ||
               testBase.includes(baseName);
      });

      if (!hasMatchingTest) {
        uncoveredFiles.push(path.basename(srcFile));
      }
    }

    if (uncoveredFiles.length > 0) {
      const ratio = testFiles.size / (sourceFiles.size + testFiles.size);
      if (ratio < cov.minRatio) {
        warnings.push(`🚨 [Coverage Gate] Test ratio ${(ratio * 100).toFixed(0)}% < threshold ${(cov.minRatio * 100).toFixed(0)}%. ${uncoveredFiles.length} source file(s) without tests:\n${uncoveredFiles.slice(0, 8).map(f => `  - ${f}`).join('\n')}`);
        warnings.push('Write tests for these files before declaring done. Use TDD: write test → implement → verify.');
        aireinLog('warn', 'stop-test-gate', `Coverage ${(ratio * 100).toFixed(0)}% below threshold, ${uncoveredFiles.length} uncovered files`);
        if (config.blocking.lowCoverage) shouldBlock = true;
      } else {
        warnings.push(`⚠️ [Coverage Gate] ${uncoveredFiles.length} source file(s) without matching tests:\n${uncoveredFiles.slice(0, 5).map(f => `  - ${f}`).join('\n')}`);
        warnings.push('Consider adding tests for these files.');
        aireinLog('info', 'stop-test-gate', `${uncoveredFiles.length} files without matching tests (coverage OK)`);
      }
    }
  }

  // ── Output and decide ───────────────────────────────────────────
  if (warnings.length > 0) {
    console.log(warnings.join('\n'));
  }

  // Hard block on test failures or zero-test-coverage edits
  if (shouldBlock) {
    aireinLog('warn', 'stop-test-gate', 'Blocking stop — tests failed or coverage too low');
    cleanExit(2);
  }

  aireinLog('info', 'stop-test-gate', 'All gates passed, allowing stop');
  cleanExit(0);
}
