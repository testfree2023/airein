#!/usr/bin/env node
/**
 * PostToolUse Hook: Structure Sync
 *
 * Updates token estimates in docs/steering/structure.md when source
 * files are created or edited. Runs async — never blocks.
 *
 * Always exits 0.
 */

const path = require('path');
const fs = require('fs');
const { getSourceExtensions } = require('../lib/language-config');

const MAX_STDIN = 1024 * 1024;
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (stdinData.length < MAX_STDIN) stdinData += chunk;
});
process.stdin.on('end', () => {
  try { main(); } catch { process.exit(0); }
});

function findProjectRoot(filePath) {
  let dir = path.dirname(path.resolve(filePath));
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir;
}

function estimateTokens(content) {
  return Math.max(1, Math.round(Buffer.byteLength(content, 'utf8') / 4));
}

function main() {
  let input;
  try { input = JSON.parse(stdinData); } catch { process.exit(0); }

  const filePath = input.tool_input?.file_path || input.input?.file_path || '';
  if (!filePath) process.exit(0);

  // Only process source files
  const ext = path.extname(filePath).toLowerCase();
  if (!getSourceExtensions().has(ext)) process.exit(0);

  // Find project root and structure.md
  const projectRoot = findProjectRoot(filePath);
  const structurePath = path.join(projectRoot, 'docs', 'steering', 'structure.md');
  if (!fs.existsSync(structurePath)) process.exit(0);

  // Read the edited file to estimate tokens
  if (!fs.existsSync(filePath)) process.exit(0);
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { process.exit(0); }

  const tokenEstimate = estimateTokens(content);
  const fileName = path.basename(filePath);

  // Read structure.md
  let structureContent;
  try { structureContent = fs.readFileSync(structurePath, 'utf8'); } catch { process.exit(0); }

  // Find and update the entry for this file
  const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match: ~N,NNN tok) — numbers may have comma separators
  const entryRegex = new RegExp(
    `(- ${escaped} — .+?\\(\\s*~)[\\d,]+(\\s*tok\\))`, 'g'
  );

  // Use replace directly — test() advances lastIndex on global regex
  const updated = structureContent.replace(
    entryRegex,
    `$1${tokenEstimate.toLocaleString()}$2`
  );

  if (updated !== structureContent) {
    try { fs.writeFileSync(structurePath, updated, 'utf8'); } catch {}
  }
  // If no existing entry, we don't auto-add (would require knowing the description)

  process.exit(0);
}
