#!/usr/bin/env node
/**
 * PreToolUse Hook: Impact Analysis
 *
 * Before Edit/Write to source files, checks how many other files
 * import/reference the target file. Warns for high-impact edits.
 *
 * Always exits 0 (never blocks, only warns).
 */

const path = require('path');
const { execSync } = require('child_process');
const { aireinLog } = require('../lib/airein-logger');
const { getSourceExtensions, isTestFile, getImportPatterns, getImpactThresholds } = require('../lib/language-config');

const MAX_STDIN = 1024 * 1024;
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (stdinData.length < MAX_STDIN) stdinData += chunk;
});
process.stdin.on('end', () => {
  try { main(); } catch (e) { process.exit(0); }
});

function main() {
  let input;
  try { input = JSON.parse(stdinData); } catch { process.exit(0); }

  const filePath = input.tool_input?.file_path || input.input?.file_path || '';
  if (!filePath) process.exit(0);

  const ext = path.extname(filePath).toLowerCase();
  if (!getSourceExtensions().has(ext)) process.exit(0);

  // Skip test files
  if (isTestFile(filePath)) process.exit(0);

  aireinLog('info', 'pre-edit-impact', `Analyzing impact for ${path.basename(filePath)}`);

  // Derive the module name from the file path
  const baseName = path.basename(filePath, ext);
  const dirName = path.basename(path.dirname(filePath));

  // Different import patterns per language
  const grepPatterns = getImportPatterns(ext).map(pattern => {
    if (pattern.includes('require')) return `require\\(['\"].*${baseName}['\"]\\)`;
    if (pattern.includes(' from')) return `from ['\"].*${baseName}['\"]`;
    if (pattern.includes('from ')) return `from .*${baseName} import`;
    if (pattern.includes('use ')) return `use.*${baseName}`;
    if (pattern.includes('import')) return `import.*${baseName}`;
    return pattern.replace(/\^/g, '').replace(/\s\+/g, '.*') + `.*${baseName}`;
  });

  if (grepPatterns.length === 0) process.exit(0);

  // Count dependents using grep
  let totalDependents = 0;
  for (const pattern of grepPatterns) {
    try {
      const result = execSync(
        `grep -rl --include="*${ext}" "${pattern}" . 2>/dev/null || true`,
        { encoding: 'utf8', timeout: 5000, cwd: process.cwd() }
      );
      const files = result.split('\n').filter(f => f && f !== filePath);
      totalDependents += files.length;
    } catch { /* grep failed, skip */ }
  }

  // Categorize impact
  const thresholds = getImpactThresholds();
  if (totalDependents >= thresholds.high) {
    console.log(`🔴 [Impact: HIGH] ${path.basename(filePath)} is imported by ~${totalDependents} files. Consider:\n  (1) Running full test suite after edit\n  (2) Using code-reviewer agent before committing\n  (3) Updating docs/roadmap.md or docs/adr/ if architecture changes`);
    aireinLog('warn', 'pre-edit-impact', `HIGH impact: ${path.basename(filePath)} has ~${totalDependents} dependents`);
  } else if (totalDependents >= thresholds.medium) {
    console.log(`🟡 [Impact: MEDIUM] ${path.basename(filePath)} is imported by ~${totalDependents} files. Check consumers after editing.`);
    aireinLog('info', 'pre-edit-impact', `MEDIUM impact: ${path.basename(filePath)} has ~${totalDependents} dependents`);
  }
  // Low impact (0-2 dependents): silent, no warning needed

  process.exit(0);
}
