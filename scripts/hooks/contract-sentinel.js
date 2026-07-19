#!/usr/bin/env node
/**
 * PostToolUse Hook: Contract Sentinel
 *
 * After Edit/Write to source files, detects changes to exported
 * function signatures and interface/type definitions. Compares
 * against cached exports and warns on contract changes.
 *
 * Always exits 0 (never blocks, only warns).
 */

const path = require('path');
const fs = require('fs');
const { aireinLog } = require('../lib/airein-logger');
const { isTestFile, getExportPatterns } = require('../lib/language-config');

const MAX_STDIN = 1024 * 1024;
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (stdinData.length < MAX_STDIN) stdinData += chunk;
});
process.stdin.on('end', () => {
  try { main(); } catch (e) { process.exit(0); }
});

// Extract exports from file content
function extractExports(content, ext) {
  const exports = [];

  if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    // Named exports: export function, export class, export const, export interface, export type
    const patterns = [
      /export\s+function\s+(\w+)\s*\(([^)]*)\)/g,
      /export\s+async\s+function\s+(\w+)\s*\(([^)]*)\)/g,
      /export\s+const\s+(\w+)\s*=/g,
      /export\s+class\s+(\w+)/g,
      /export\s+interface\s+(\w+)\s*\{([^}]*)\}/g,
      /export\s+type\s+(\w+)\s*=/g,
    ];
    for (const pat of patterns) {
      let match;
      while ((match = pat.exec(content)) !== null) {
        exports.push(match[1] + (match[2] ? `(${match[2].trim().slice(0, 80)})` : ''));
      }
    }
  } else if (ext === '.py') {
    // def functions and class definitions at module level
    const funcPattern = /^def\s+(\w+)\s*\(([^)]*)\)/gm;
    const classPattern = /^class\s+(\w+)/gm;
    let match;
    while ((match = funcPattern.exec(content)) !== null) exports.push(match[1] + `(${match[2].trim().slice(0, 80)})`);
    while ((match = classPattern.exec(content)) !== null) exports.push(match[1]);
  } else if (ext === '.java') {
    const methodPattern = /(?:public|protected|private)\s+\w+(?:<[^>]+>)?\s+(\w+)\s*\(([^)]*)\)/g;
    const classPattern = /(?:public|protected)\s+(?:abstract\s+)?(?:class|interface)\s+(\w+)/g;
    let match;
    while ((match = methodPattern.exec(content)) !== null) exports.push(match[1] + `(${match[2].trim().slice(0, 80)})`);
    while ((match = classPattern.exec(content)) !== null) exports.push(match[1]);
  }

  return exports.sort();
}

function main() {
  let input;
  try { input = JSON.parse(stdinData); } catch { process.exit(0); }

  const filePath = input.tool_input?.file_path || input.input?.file_path || '';
  if (!filePath) process.exit(0);

  const ext = path.extname(filePath).toLowerCase();
  if (getExportPatterns(ext).length === 0) process.exit(0);

  // Skip test files
  if (isTestFile(filePath)) process.exit(0);

  // Read current file
  if (!fs.existsSync(filePath)) process.exit(0);
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { process.exit(0); }

  const currentExports = extractExports(content, ext);
  if (currentExports.length === 0) process.exit(0);

  aireinLog('info', 'contract-sentinel', `Checking ${path.basename(filePath)} with ${currentExports.length} exports`);

  // Load cached exports
  const cacheDir = path.join(process.cwd(), '.claude', 'contract-cache');
  const cacheFile = path.join(cacheDir, path.basename(filePath) + '.json');

  if (fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      const cachedExports = cached.exports || [];

      // Compare exports
      const added = currentExports.filter(e => !cachedExports.includes(e));
      const removed = cachedExports.filter(e => !currentExports.includes(e));

      if (removed.length > 0) {
        console.log(`⚠️ [Contract Change] Removed exports in ${path.basename(filePath)}:\n${removed.map(e => `  - REMOVED: ${e}`).join('\n')}\nCheck consumers that reference these. Consider using tech-lead (mode: review).`);
        aireinLog('warn', 'contract-sentinel', `Removed ${removed.length} exports from ${path.basename(filePath)}: ${removed.join(', ')}`);
      } else if (added.length > 0) {
        console.log(`ℹ️ [Contract Change] New exports in ${path.basename(filePath)}:\n${added.map(e => `  + ADDED: ${e}`).join('\n')}`);
        aireinLog('info', 'contract-sentinel', `Added ${added.length} exports to ${path.basename(filePath)}: ${added.join(', ')}`);
      }
    } catch { /* cache corrupt, skip comparison */ }
  }

  // Update cache
  try {
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify({ exports: currentExports, updated: new Date().toISOString() }));
  } catch { /* cache write failed, non-critical */ }

  process.exit(0);
}
