#!/usr/bin/env node
/**
 * PreToolUse Hook: Test Guard
 *
 * Blocks when a source file is created or edited (Write/Edit/Bash tools) without a
 * corresponding test file. Enforces Iron Rule #1: "No production code without tests."
 *
 * Triggered by hooks.json for Write|Edit|Bash. Bash matching prevents the model from
 * bypassing a blocked Write by using shell commands like `echo "code" > file.ts`.
 * Edit coverage prevents the model from bypassing a blocked Write by changing an
 * existing untested source file.
 *
 * Exit code 2 = block the tool call before the file is changed
 * Exit code 0 = allow the tool call (stdout must passthrough original stdin)
 */

const path = require('path');
const fs = require('fs');
const { loadQualityConfig } = require('../lib/quality-config');
const { extractRedirectPaths } = require('../lib/shell-split');
const {
  getSourceExtensions,
  isTestFile: isConfiguredTestFile,
  isExemptFile,
  findTestFile: findConfiguredTestFile,
  getMergedConfig
} = require('../lib/language-config');

const MAX_STDIN = 1024 * 1024;
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (stdinData.length < MAX_STDIN) stdinData += chunk;
});
process.stdin.on('end', () => {
  try { main(); } catch { allow(); }
});

/**
 * Check if a file path looks like a test file.
 */
function isTestFile(filePath) {
  return isConfiguredTestFile(filePath);
}

/**
 * Check if a file is exempt from testing requirements.
 */
function isExempt(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return isExemptFile(filePath) || /\/types\//i.test(normalizedPath) || /\/interfaces?\//i.test(normalizedPath);
}

/**
 * Find the project root by walking up from filePath looking for .git.
 * Falls back to stopping after MAX_WALK levels.
 */
function findProjectRoot(filePath) {
  let dir = path.dirname(path.resolve(filePath));
  let fallback = null;
  const MAX_WALK = 20;
  for (let i = 0; i < MAX_WALK; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    if (!fallback && fs.existsSync(path.join(dir, 'package.json'))) fallback = dir;
    const parent = path.dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  return fallback || dir;
}

/**
 * Search for a corresponding test file.
 * Walks up from the source file's directory to the project root,
 * checking all common test directory names and naming conventions.
 */
function findTestFile(filePath) {
  const configured = findConfiguredTestFile(filePath);
  if (configured && fs.existsSync(configured)) return configured;

  const resolved = path.resolve(filePath);
  const ext = path.extname(resolved);
  const base = path.basename(resolved, ext);
  const startDir = path.dirname(resolved);
  const projectRoot = findProjectRoot(resolved);

  // Maven/Gradle Java convention: src/main/java → src/test/java
  if (ext === '.java') {
    const mainSep = resolved.indexOf(path.sep + 'src' + path.sep + 'main' + path.sep + 'java' + path.sep);
    if (mainSep >= 0) {
      const testPath = resolved.substring(0, mainSep) +
        path.sep + 'src' + path.sep + 'test' + path.sep + 'java' + path.sep +
        resolved.substring(mainSep + ('/src/main/java/'.length));
      const mavenTest = path.join(path.dirname(testPath), base + 'Test' + ext);
      if (fs.existsSync(mavenTest)) return mavenTest;
    }
  }

  // Generate all candidate test file paths
  const candidates = [];
  let dir = startDir;

  const config = getMergedConfig();
  const templates = config.testNameTemplates || [];
  const testDirs = config.testDirectories || [];

  while (true) {
    // Check same-directory test names
    for (const tpl of templates) {
      candidates.push(path.join(dir, tpl.replace('{base}', base).replace('{ext}', ext)));
    }
    // Check test subdirectories at this level
    for (const testDir of testDirs) {
      for (const tpl of templates) {
        candidates.push(path.join(dir, testDir, tpl.replace('{base}', base).replace('{ext}', ext)));
      }
    }

    // Stop at project root
    if (dir === projectRoot) break;
    const parent = path.dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function allow() {
  process.stdout.write(stdinData);
  process.exit(0);
}

function warn(filePath) {
  const fileName = path.basename(filePath);
  console.error(
    `[Test Guard] ⚠️ ${fileName}: 即将创建/编辑源文件但未发现对应测试。\n` +
    `铁律 1: 任何生产代码必须有测试。请先创建测试文件，再创建/编辑源码文件。`
  );
}

function warnAdvisory(filePath) {
  const fileName = path.basename(filePath);
  console.error(
    `[Test Guard] ⚠️ ${fileName}: 源文件无对应测试 (advisory 模式，已放行)。\n` +
    `建议先创建测试文件，再创建/编辑源码文件。`
  );
}

function main() {
  let input;
  try { input = JSON.parse(stdinData); } catch { allow(); }

  const filePath = input.tool_input?.file_path || input.input?.file_path || '';
  const command = input.tool_input?.command || input.input?.command || '';

  // Collect source file paths to check
  let pathsToCheck = [];

  if (filePath) {
    // Write/Edit: single file path
    pathsToCheck = [filePath];
  } else if (command) {
    // Bash: extract file paths from command
    pathsToCheck = extractRedirectPaths(command);
  }

  if (pathsToCheck.length === 0) allow();

  const config = loadQualityConfig();

  // Check if test guard is completely disabled
  if (config.testGuard?.enabled === false) allow();

  // Determine mode: 'strict' (block) or 'advisory' (warn only)
  const isAdvisory = config.testGuard?.mode === 'advisory';

  // Check each source file path
  for (const fp of pathsToCheck) {
    // Only check source code extensions
    const ext = path.extname(fp).toLowerCase();
    if (!getSourceExtensions().has(ext)) continue;

    // Skip test files
    if (isTestFile(fp)) continue;

    // Skip exempt files
    if (isExempt(fp)) continue;

    // Look for a corresponding test file that already exists
    const testFile = findTestFile(fp);
    if (testFile) continue;

    // No test found — warn
    if (isAdvisory) {
      warnAdvisory(fp);
      allow();
    }

    warn(fp);

    // Legacy config: blocking.untestedSource=false → warn only
    if (config.blocking?.untestedSource === false) {
      allow();
    }

    process.exit(2);
  }

  // All paths passed checks
  allow();
}
