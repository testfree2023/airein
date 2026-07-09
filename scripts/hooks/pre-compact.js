#!/usr/bin/env node
/**
 * PreCompact Hook — Context Preservation
 *
 * Runs before Claude compacts context. Outputs a structured summary
 * to stdout which CC appends to compact custom instructions.
 * This is the ONLY mechanism that lets critical info survive compaction.
 *
 * Output budget: ~800 tokens max (~3KB). Never blocks compaction.
 */

const path = require('path');
const fs = require('fs');
const { readStdinJson, output, readFile, ensureDir, log, resolveProjectDir } = require('../lib/utils');
const { aireinLog } = require('../lib/airein-logger');

const MAX_OUTPUT_BYTES = 3072; // ~800 tokens
const MAX_DECISIONS = 5;
const MAX_FILES = 10;
const MAX_PENDING = 3;
const MAX_TASK_LEN = 200;

/**
 * Get CC memory path for current project.
 * CC loads memory from ~/.claude/projects/{sanitized-path}/memory/
 */
function getCCMemoryDir() {
  const homeDir = require('os').homedir();
  const sessionId = process.env.CLAUDE_SESSION_ID;

  if (!sessionId) return null;

  // Scan project dirs to find the one containing our session transcript
  const projectsDir = path.join(homeDir, '.claude', 'projects');
  try {
    if (!fs.existsSync(projectsDir)) return null;
    for (const key of fs.readdirSync(projectsDir)) {
      const keyDir = path.join(projectsDir, key);
      try { if (!fs.statSync(keyDir).isDirectory()) continue; } catch { continue; }
      if (fs.existsSync(path.join(keyDir, `${sessionId}.jsonl`))) {
        return path.join(keyDir, 'memory');
      }
    }
  } catch {}
  return null;
}

/**
 * Read active plan from project docs/plans/ using plan-parser.
 * Returns a formatted string for pre-compact output, or null.
 */
function getActivePlan(projectDir) {
  if (!projectDir) return null;
  try {
    const { findActivePlan, parseProgress, getComplexity } = require('../lib/plan-parser');
    const active = findActivePlan(projectDir);
    if (!active) return null;
    const stats = parseProgress(active.progress);
    const complexity = getComplexity(active.progress);
    const parts = [active.dir];
    parts.push(`${stats.completed}/${stats.total} tasks`);
    if (stats.activeTask) parts.push(`active: ${stats.activeTask}`);
    parts.push(`(${complexity})`);
    return parts.join(' — ');
  } catch {}
  return null;
}

/**
 * Extract key information from transcript JSONL
 */
function extractFromTranscript(transcriptPath) {
  const result = {
    task: null,
    decisions: [],
    files: [],
    pending: []
  };

  if (!transcriptPath || !fs.existsSync(transcriptPath)) return result;

  try {
    // Read last 128KB of transcript (most recent context)
    const stat = fs.statSync(transcriptPath);
    const readSize = Math.min(131072, stat.size);
    const fd = fs.openSync(transcriptPath, 'r');
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
    fs.closeSync(fd);

    const content = buf.toString('utf8');
    const lines = content.split('\n').filter(Boolean);

    // Process in reverse (most recent first)
    for (let i = lines.length - 1; i >= 0; i--) {
      let entry;
      try { entry = JSON.parse(lines[i]); } catch { continue; }

      // Extract last user task
      if (!result.task && entry.type === 'human') {
        const msg = entry.message?.content || '';
        if (typeof msg === 'string' && msg.trim().length > 0) {
          result.task = msg.trim().substring(0, MAX_TASK_LEN);
        }
      }

      // Extract from assistant messages
      if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
        for (const block of entry.message.content) {
          if (block.type !== 'text' || !block.text) continue;

          // Decisions
          if (result.decisions.length < MAX_DECISIONS) {
            const decisionPatterns = [
              /(?:decision|决定)[：:]\s*(.{10,100})/i,
              /(?:decided to|we'll use|chose to)\s+(.{10,100})/i,
              /(?:方案[一二三四五])[：:]\s*(.{10,100})/,
            ];
            for (const pat of decisionPatterns) {
              const m = block.text.match(pat);
              if (m && result.decisions.length < MAX_DECISIONS) {
                result.decisions.push(m[1].trim().substring(0, 120));
              }
            }
          }

          // Pending items
          if (result.pending.length < MAX_PENDING) {
            const pendingPatterns = [
              /(?:TODO|FIXME|待办|待完成)[：:]\s*(.{5,100})/i,
              /(?:still need to|remaining:)\s+(.{5,100})/i,
            ];
            for (const pat of pendingPatterns) {
              const m = block.text.match(pat);
              if (m && result.pending.length < MAX_PENDING) {
                result.pending.push(m[1].trim().substring(0, 100));
              }
            }
          }
        }

        // Extract files from tool_use blocks
        if (Array.isArray(entry.message.content)) {
          for (const block of entry.message.content) {
            if (block.type === 'tool_use' && block.input?.file_path) {
              const fp = path.basename(block.input.file_path);
              if (!result.files.includes(fp) && result.files.length < MAX_FILES) {
                result.files.push(fp);
              }
            }
          }
        }
      }
    }
  } catch {}

  return result;
}

/**
 * Read session-state.md from CC memory dir
 */
function getSessionState(ccMemoryDir) {
  if (!ccMemoryDir) return null;
  const stateFile = path.join(ccMemoryDir, 'session-state.md');
  const content = readFile(stateFile);
  if (!content) return null;

  const branch = (content.match(/\*\*Branch\*\*:\s*(.+)/) || [])[1]?.trim();
  const task = content.match(/##\s+Current Task[\s\S]*?-\s*\*\*Status\*\*:\s*(.+)/);
  const taskStatus = task ? task[1].trim() : null;

  return { branch, taskStatus };
}

async function main() {
  const input = await readStdinJson();
  const { transcript_path, trigger, custom_instructions } = input;

  aireinLog('info', 'pre-compact', `Compaction triggered (${trigger || 'auto'})`);

  // Extract info from transcript
  const extracted = extractFromTranscript(transcript_path);

  // Get session state
  const ccMemoryDir = getCCMemoryDir();

  // Resolve project dir for plan info
  let projectDir = null;
  if (transcript_path) {
    projectDir = resolveProjectDir(transcript_path);
  }

  // Build output
  const sections = [];

  // Active task
  if (extracted.task) {
    sections.push(`## Active Task\n${extracted.task}`);
  }

  // Key decisions
  if (extracted.decisions.length > 0) {
    sections.push(`## Key Decisions\n${extracted.decisions.map(d => `- ${d}`).join('\n')}`);
  }

  // Files in progress
  if (extracted.files.length > 0) {
    sections.push(`## Files In Progress\n${extracted.files.map(f => `- ${f}`).join('\n')}`);
  }

  // Pending items
  if (extracted.pending.length > 0) {
    sections.push(`## Pending\n${extracted.pending.map(p => `- ${p}`).join('\n')}`);
  }

  // Active plan
  const activePlan = getActivePlan(projectDir);
  if (activePlan) {
    sections.push(`## Active Plan\n${activePlan}`);
  }

  if (sections.length === 0) {
    aireinLog('info', 'pre-compact', 'No extractable context — outputting empty');
    process.exit(0);
  }

  const header = '[Context Preservation — retain this section verbatim through compaction]\n\n';
  let result = header + sections.join('\n\n');

  // Enforce output budget
  if (Buffer.byteLength(result, 'utf8') > MAX_OUTPUT_BYTES) {
    // Truncate from the bottom, keeping header + active task
    const essential = header + sections[0];
    if (Buffer.byteLength(essential, 'utf8') <= MAX_OUTPUT_BYTES) {
      let combined = essential;
      for (let i = 1; i < sections.length; i++) {
        const candidate = combined + '\n\n' + sections[i];
        if (Buffer.byteLength(candidate, 'utf8') > MAX_OUTPUT_BYTES) break;
        combined = candidate;
      }
      result = combined;
    } else {
      result = header + extracted.task.substring(0, MAX_TASK_LEN);
    }
  }

  output(result);

  const sizeKB = (Buffer.byteLength(result, 'utf8') / 1024).toFixed(1);
  aireinLog('info', 'pre-compact', `Output: ${sizeKB}KB, ${sections.length} sections`);

  process.exit(0);
}

main().catch(err => {
  aireinLog('error', 'pre-compact', `Error: ${err.message}`);
  // Never block compaction — exit 0 with empty output
  process.exit(0);
});
