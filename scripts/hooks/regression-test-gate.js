#!/usr/bin/env node
/**
 * Stop Hook: Regression Test Gate
 *
 * After each response, checks if bug-fix files were edited without
 * corresponding test file changes. Warns if a regression test is missing.
 *
 * Always exits 0 (never blocks, only warns).
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { aireinLog } = require('../lib/airein-logger');

const MAX_STDIN = 1024 * 1024;
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (stdinData.length < MAX_STDIN) stdinData += chunk;
});
process.stdin.on('end', () => {
  try { main(); } catch (e) { /* silent */ process.exit(0); }
});

function main() {
  let input;
  try { input = JSON.parse(stdinData); } catch { process.exit(0); }

  const transcriptPath = input.transcript_path;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) process.exit(0);

  // Parse transcript for files modified
  const content = fs.readFileSync(transcriptPath, 'utf8');
  const sourceFiles = new Set();
  const testFiles = new Set();

  for (const line of content.split('\n').filter(Boolean)) {
    try {
      const entry = JSON.parse(line);

      // Collect file paths from Edit/Write tool calls
      const toolName = entry.tool_name || entry.name || '';
      const filePath = entry.tool_input?.file_path || entry.input?.file_path || '';

      if ((toolName === 'Edit' || toolName === 'Write') && filePath) {
        const base = path.basename(filePath);
        const isTest = /(?:test|spec|_test|\.test\.|\.spec\.)/i.test(base);
        if (isTest) {
          testFiles.add(filePath);
        } else {
          sourceFiles.add(filePath);
        }
      }

      // Also check assistant message content blocks
      if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
        for (const block of entry.message.content) {
          if (block.type === 'tool_use' && (block.name === 'Edit' || block.name === 'Write')) {
            const fp = block.input?.file_path || '';
            if (fp) {
              const base = path.basename(fp);
              const isTest = /(?:test|spec|_test|\.test\.|\.spec\.)/i.test(base);
              if (isTest) testFiles.add(fp);
              else sourceFiles.add(fp);
            }
          }
        }
      }
    } catch { /* skip unparseable lines */ }
  }

  if (sourceFiles.size === 0) process.exit(0);

  aireinLog('info', 'regression-test-gate', `Checking ${sourceFiles.size} source files for missing regression tests`);

  // Check roadmap.md ## Issues section for open bugs referencing these files
  const roadmapFile = path.join(process.cwd(), 'docs', 'roadmap.md');
  if (!fs.existsSync(roadmapFile)) process.exit(0);

  const roadmapContent = fs.readFileSync(roadmapFile, 'utf8');

  // Extract the ## Issues section (stops at next ## heading)
  const issuesSection = roadmapContent.match(/##\s+Issues[\s\S]*?(?=\n## |\n*$)/i);
  if (!issuesSection) process.exit(0);

  const issuesContent = issuesSection[0];

  // Find open bug entries that reference edited files
  const warnings = [];
  for (const srcFile of sourceFiles) {
    const baseName = path.basename(srcFile, path.extname(srcFile));

    // Check if this file is mentioned in an open issue
    const issueMatch = issuesContent.match(new RegExp(`\\|\\s*I\\d+\\s*\\|[^|]*${baseName}[^|]*\\|\\s*open\\s*`, 'i'));

    if (issueMatch) {
      // Check if there's a corresponding test file edit
      const hasTest = Array.from(testFiles).some(t =>
        path.basename(t, path.extname(t)).includes(baseName)
      );

      if (!hasTest) {
        warnings.push(`🧪 Regression test missing: bug fix in ${baseName} but no test file was edited`);
        aireinLog('warn', 'regression-test-gate', `Regression test missing for bug fix in ${baseName}`);
      }
    }
  }

  if (warnings.length > 0) {
    console.log(`[Regression Gate]\n${warnings.join('\n')}\nWrite a regression test before closing the issue. Use /tdd or the tdd-guide agent.`);
  } else {
    aireinLog('info', 'regression-test-gate', 'No missing regression tests detected');
  }

  process.exit(0);
}
