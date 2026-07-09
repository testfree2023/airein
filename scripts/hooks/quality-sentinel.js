#!/usr/bin/env node
/**
 * PostToolUse Hook: Quality Sentinel
 *
 * After every Edit/Write to a code file, checks for common issues:
 * - Missing test references
 * - Debug statements (console.log, print, System.out)
 * - Hardcoded secrets
 * - TODOs without issue numbers
 *
 * Outputs warnings via stdout (injected into Claude's context).
 * Always exits 0 (never blocks the workflow).
 */

const path = require('path');
const fs = require('fs');
const { loadQualityConfig } = require('../lib/quality-config');
const { aireinLog } = require('../lib/airein-logger');
const { getSourceExtensions, isTestFile, getDebugPatterns, getSecretPatterns } = require('../lib/language-config');

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

  // Only check code files
  const ext = path.extname(filePath).toLowerCase();
  if (!getSourceExtensions().has(ext)) process.exit(0);

  // Read the file content
  if (!fs.existsSync(filePath)) process.exit(0);
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { process.exit(0); }

  const warnings = [];
  const config = loadQualityConfig();

  // Check 1: Debug statements
  const debugPatterns = getDebugPatterns();
  for (const pat of debugPatterns) {
    const match = content.match(pat);
    if (match) {
      warnings.push(`⚠️ Debug statement found: ${match[0].trim()} — remove before commit`);
      break;
    }
  }

  // Check 2: Hardcoded secrets
  const secretPatterns = getSecretPatterns();
  for (const pat of secretPatterns) {
    if (pat.test(content)) {
      warnings.push('🔒 Possible hardcoded secret detected — use environment variables');
      break;
    }
  }

  // Check 3: TODOs without issue numbers
  const todoMatches = content.match(/\/\/\s*TODO|#\s*TODO|<!--\s*TODO/gi);
  if (todoMatches) {
    const badTodos = todoMatches.filter(t => !t.match(/#\d+|issue-\d+|\(\d+\)/i));
    if (badTodos.length > 0) {
      warnings.push(`📋 ${badTodos.length} TODO(s) without issue reference — add issue number`);
    }
  }

  // Check 4: New functions/methods without test (heuristic)
  // Only warn if this is a source file (not a test file)
  if (!isTestFile(filePath)) {
    const fnCount = (content.match(/(?:function\s+\w+|def\s+\w+|public\s+\w+\s+\w+\s*\(|func\s+\w+|fn\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?\()/g) || []).length;
    // Only warn for files exceeding function threshold (configurable, default 3)
    if (fnCount >= config.testCoverage.functionThreshold) {
      warnings.push(`🧪 File has ${fnCount} functions (threshold: ${config.testCoverage.functionThreshold}) — ensure corresponding tests exist`);
    }
  }

  if (warnings.length > 0) {
    aireinLog('warn', 'quality-sentinel', `${path.basename(filePath)}: ${warnings.length} issue(s) — ${warnings.map(w => w.replace(/[^\w\s:.()/-]/g, '').slice(0, 60)).join('; ')}`);
    console.log(`[Quality Sentinel] ${path.basename(filePath)}:\n${warnings.join('\n')}`);
  } else {
    aireinLog('debug', 'quality-sentinel', `${path.basename(filePath)}: clean`);
  }

  process.exit(0);
}
