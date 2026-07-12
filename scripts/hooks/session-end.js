#!/usr/bin/env node
/**
 * Stop Hook (Session End) - Persist learnings during active sessions
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs on Stop events (after each response). Extracts a meaningful summary
 * from the session transcript (via stdin JSON transcript_path) and updates a
 * session file for cross-session continuity.
 */

const path = require('path');
const fs = require('fs');
const {
  getHomeDir,
  getClaudeDir,
  getSessionsDir,
  getDateString,
  getTimeString,
  getSessionIdShort,
  getProjectName,
  getProjectDir,
  setProjectDir,
  resolveProjectDir,
  ensureDir,
  readFile,
  writeFile,
  runCommand,
  log
} = require('../lib/utils');
const { aireinLog } = require('../lib/airein-logger');
const { archiveAndPromote } = require('../lib/self-learning');
const { loadQualityConfig } = require('../lib/quality-config');
const { projectDataSubpath, projectDataSubpathForRead } = require('../lib/project-paths');

const SUMMARY_START_MARKER = '<!-- ECC:SUMMARY:START -->';
const SUMMARY_END_MARKER = '<!-- ECC:SUMMARY:END -->';
const SESSION_SEPARATOR = '\n---\n';

/**
 * Extract a meaningful summary from the session transcript.
 * Reads the JSONL transcript and pulls out key information:
 * - User messages (tasks requested)
 * - Tools used
 * - Files modified
 */
function extractSessionSummary(transcriptPath) {
  const content = readFile(transcriptPath);
  if (!content) return null;

  const lines = content.split('\n').filter(Boolean);
  const userMessages = [];
  const toolsUsed = new Set();
  const filesModified = new Set();
  let parseErrors = 0;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      // Collect user messages (first 200 chars each)
      if (entry.type === 'user' || entry.role === 'user' || entry.message?.role === 'user') {
        // Support both direct content and nested message.content (Claude Code JSONL format)
        const rawContent = entry.message?.content ?? entry.content;
        const text = typeof rawContent === 'string'
          ? rawContent
          : Array.isArray(rawContent)
            ? rawContent.map(c => (c && c.text) || '').join(' ')
            : '';
        if (text.trim()) {
          // Skip command/system messages (not real user intent)
          const cleaned = text.trim();
          if (/^<(command-|local-command-|system-reminder|\/?system)/.test(cleaned)) continue;
          userMessages.push(cleaned.slice(0, 200));
        }
      }

      // Collect tool names and modified files (direct tool_use entries)
      if (entry.type === 'tool_use' || entry.tool_name) {
        const toolName = entry.tool_name || entry.name || '';
        if (toolName) toolsUsed.add(toolName);

        const filePath = entry.tool_input?.file_path || entry.input?.file_path || '';
        if (filePath && (toolName === 'Edit' || toolName === 'Write')) {
          filesModified.add(filePath);
        }
      }

      // Extract tool uses from assistant message content blocks (Claude Code JSONL format)
      if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
        for (const block of entry.message.content) {
          if (block.type === 'tool_use') {
            const toolName = block.name || '';
            if (toolName) toolsUsed.add(toolName);

            const filePath = block.input?.file_path || '';
            if (filePath && (toolName === 'Edit' || toolName === 'Write')) {
              filesModified.add(filePath);
            }
          }
        }
      }
    } catch {
      parseErrors++;
    }
  }

  if (parseErrors > 0) {
    log(`[SessionEnd] Skipped ${parseErrors}/${lines.length} unparseable transcript lines`);
  }

  if (userMessages.length === 0) return null;

  return {
    userMessages: userMessages.slice(-10), // Last 10 user messages
    toolsUsed: Array.from(toolsUsed).slice(0, 20),
    filesModified: Array.from(filesModified).slice(0, 30),
    totalMessages: userMessages.length
  };
}

// Read hook input from stdin (Claude Code provides transcript_path via stdin JSON)
const MAX_STDIN = 1024 * 1024;
let stdinData = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', chunk => {
  if (stdinData.length < MAX_STDIN) {
    const remaining = MAX_STDIN - stdinData.length;
    stdinData += chunk.substring(0, remaining);
  }
});

process.stdin.on('end', () => {
  runMain();
});

function runMain() {
  main().catch(err => {
    console.error('[SessionEnd] Error:', err.message);
    process.exit(0);
  });
}

function getSessionMetadata() {
  const branchResult = runCommand('git rev-parse --abbrev-ref HEAD');

  return {
    project: getProjectName() || 'unknown',
    branch: branchResult.success ? branchResult.output : 'unknown',
    worktree: getProjectDir()
  };
}

function extractHeaderField(header, label) {
  const match = header.match(new RegExp(`\\*\\*${escapeRegExp(label)}:\\*\\*\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

function buildSessionHeader(today, currentTime, metadata, existingContent = '') {
  const headingMatch = existingContent.match(/^#\s+.+$/m);
  const heading = headingMatch ? headingMatch[0] : `# Session: ${today}`;
  const date = extractHeaderField(existingContent, 'Date') || today;
  const started = extractHeaderField(existingContent, 'Started') || currentTime;

  return [
    heading,
    `**Date:** ${date}`,
    `**Started:** ${started}`,
    `**Last Updated:** ${currentTime}`,
    `**Project:** ${metadata.project}`,
    `**Branch:** ${metadata.branch}`,
    `**Worktree:** ${metadata.worktree}`,
    ''
  ].join('\n');
}

function mergeSessionHeader(content, today, currentTime, metadata) {
  const separatorIndex = content.indexOf(SESSION_SEPARATOR);
  if (separatorIndex === -1) {
    return null;
  }

  const existingHeader = content.slice(0, separatorIndex);
  const body = content.slice(separatorIndex + SESSION_SEPARATOR.length);
  const nextHeader = buildSessionHeader(today, currentTime, metadata, existingHeader);
  return `${nextHeader}${SESSION_SEPARATOR}${body}`;
}

async function main() {
  // Parse stdin JSON to get transcript_path
  let transcriptPath = null;
  try {
    const input = JSON.parse(stdinData);
    transcriptPath = input.transcript_path;
  } catch {
    // Fallback: try env var for backwards compatibility
    transcriptPath = process.env.CLAUDE_TRANSCRIPT_PATH;
  }

  aireinLog('info', 'session-end', `Stop event — transcript: ${transcriptPath || 'none'}`);

  // Resolve project directory from transcript (fixes cross-project false positives)
  if (transcriptPath) {
    const resolved = resolveProjectDir(transcriptPath);
    if (resolved) {
      setProjectDir(resolved);
      aireinLog('info', 'session-end', `Resolved project dir from transcript: ${resolved}`);
    }
  }

  const sessionsDir = getSessionsDir();
  const projectName = getProjectName() || 'default';
  const projectSessionsDir = path.join(sessionsDir, projectName);
  const today = getDateString();
  const shortId = getSessionIdShort();
  const sessionFile = path.join(projectSessionsDir, `${today}-${shortId}-session.tmp`);
  const sessionMetadata = getSessionMetadata();

  ensureDir(projectSessionsDir);

  const currentTime = getTimeString();

  // Try to extract summary from transcript
  let summary = null;

  if (transcriptPath) {
    if (fs.existsSync(transcriptPath)) {
      summary = extractSessionSummary(transcriptPath);
    } else {
      log(`[SessionEnd] Transcript not found: ${transcriptPath}`);
    }
  }

  if (fs.existsSync(sessionFile)) {
    const existing = readFile(sessionFile);
    let updatedContent = existing;

    if (existing) {
      const merged = mergeSessionHeader(existing, today, currentTime, sessionMetadata);
      if (merged) {
        updatedContent = merged;
      } else {
        log(`[SessionEnd] Failed to normalize header in ${sessionFile}`);
      }
    }

    // If we have a new summary, update only the generated summary block.
    // This keeps repeated Stop invocations idempotent and preserves
    // user-authored sections in the same session file.
    if (summary && updatedContent) {
      const summaryBlock = buildSummaryBlock(summary);

      if (updatedContent.includes(SUMMARY_START_MARKER) && updatedContent.includes(SUMMARY_END_MARKER)) {
        updatedContent = updatedContent.replace(
          new RegExp(`${escapeRegExp(SUMMARY_START_MARKER)}[\\s\\S]*?${escapeRegExp(SUMMARY_END_MARKER)}`),
          summaryBlock
        );
      } else {
        // Migration path for files created before summary markers existed.
        updatedContent = updatedContent.replace(
          /## (?:Session Summary|Current State)[\s\S]*?$/,
          `${summaryBlock}\n\n### Notes for Next Session\n-\n\n### Context to Load\n\`\`\`\n[relevant files]\n\`\`\`\n`
        );
      }
    }

    if (updatedContent) {
      writeFile(sessionFile, updatedContent);
    }

    log(`[SessionEnd] Updated session file: ${sessionFile}`);
  } else {
    // Create new session file
    const summarySection = summary
      ? `${buildSummaryBlock(summary)}\n\n### Notes for Next Session\n-\n\n### Context to Load\n\`\`\`\n[relevant files]\n\`\`\``
      : `## Current State\n\n[Session context goes here]\n\n### Completed\n- [ ]\n\n### In Progress\n- [ ]\n\n### Notes for Next Session\n-\n\n### Context to Load\n\`\`\`\n[relevant files]\n\`\`\``;

    const template = `${buildSessionHeader(today, currentTime, sessionMetadata)}${SESSION_SEPARATOR}${summarySection}
`;

    writeFile(sessionFile, template);
    log(`[SessionEnd] Created session file: ${sessionFile}`);
  }

  // Write session-state.md to project directory for JIT context recovery
  writeSessionState(summary, sessionMetadata, transcriptPath);

  // Write daily chat log
  if (summary) {
    writeChatLog(summary, sessionMetadata);
  }

  // Self-learning: archive pending instructions + promote ≥N to rules/30 (P019)
  runSelfLearning(transcriptPath);

  process.exit(0);
}

function buildSummarySection(summary) {
  let section = '## Session Summary\n\n';

  // Tasks (from user messages — collapse newlines and escape backticks to prevent markdown breaks)
  section += '### Tasks\n';
  for (const msg of summary.userMessages) {
    section += `- ${msg.replace(/\n/g, ' ').replace(/`/g, '\\`')}\n`;
  }
  section += '\n';

  // Files modified
  if (summary.filesModified.length > 0) {
    section += '### Files Modified\n';
    for (const f of summary.filesModified) {
      section += `- ${f}\n`;
    }
    section += '\n';
  }

  // Tools used
  if (summary.toolsUsed.length > 0) {
    section += `### Tools Used\n${summary.toolsUsed.join(', ')}\n\n`;
  }

  section += `### Stats\n- Total user messages: ${summary.totalMessages}\n`;

  return section;
}

function buildSummaryBlock(summary) {
  return `${SUMMARY_START_MARKER}\n${buildSummarySection(summary).trim()}\n${SUMMARY_END_MARKER}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Write a lean session-state.md to the project's .airein/ directory.
 * This file serves as the JIT context recovery point for new sessions.
 */
function writeSessionState(summary, metadata, transcriptPath) {
  const memoryDir = projectDataSubpath(getProjectDir(), 'memory');
  const stateFile = path.join(memoryDir, 'session-state.md');

  try {
    ensureDir(memoryDir);

    const lines = [
      `# Session State: ${metadata.project}`,
      '',
      `## Current Task`,
      `- **Status**: In Progress`,
      `- **Last Active**: ${getDateString()} ${getTimeString()}`,
      `- **Branch**: ${metadata.branch}`,
      '',
      `## Last Files Edited`,
    ];

    if (summary && summary.filesModified.length > 0) {
      for (const f of summary.filesModified.slice(0, 10)) {
        lines.push(`- ${f}`);
      }
    } else {
      lines.push('- (none detected)');
    }

    lines.push('');
    lines.push('## Recent User Messages');
    if (summary && summary.userMessages.length > 0) {
      for (const msg of summary.userMessages.slice(0, 5)) {
        lines.push(`- ${msg.replace(/\n/g, ' ').slice(0, 150)}`);
      }
    } else {
      lines.push('- (none)');
    }

    writeFile(stateFile, lines.join('\n') + '\n');
    aireinLog('info', 'session-end', `Wrote session state: ${stateFile}`);

    // Also write to CC's auto-loaded memory path so next session picks it up
    const ccMemoryDir = getCCMemoryDir(transcriptPath);
    if (ccMemoryDir) {
      const ccStateFile = path.join(ccMemoryDir, 'session-state.md');
      writeFile(ccStateFile, lines.join('\n') + '\n');
      // Update MEMORY.md index if this entry doesn't exist
      updateMemoryIndex(ccMemoryDir, 'session-state.md', 'Last session state and context');
      aireinLog('info', 'session-end', `Wrote CC memory: ${ccStateFile}`);
    }
  } catch (err) {
    aireinLog('error', 'session-end', `Failed to write session state: ${err.message}`);
  }
}

/**
 * Write a daily chat log entry to .airein/memory/chat-YYYY-MM-DD.md
 * Extracts richer content from transcript: user request, assistant summary, errors.
 */
function writeChatLog(summary, metadata) {
  const memoryDir = projectDataSubpath(getProjectDir(), 'memory');
  try {
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }
  } catch { return; }

  const today = getDateString();
  const chatFile = path.join(memoryDir, `chat-${today}.md`);
  const time = getTimeString();

  // Build entry from summary (which is already extracted from transcript)
  const lines = [];

  // User's request (keep more text for context)
  const userMsg = summary && summary.userMessages.length > 0
    ? summary.userMessages[0].replace(/\n/g, ' ').slice(0, 200)
    : null;

  if (userMsg) {
    lines.push(`## ${time} — ${userMsg}`);
  } else {
    lines.push(`## ${time}`);
  }

  // Files modified (show relative paths, up to 8)
  if (summary && summary.filesModified.length > 0) {
    const cwd = getProjectDir();
    const relFiles = summary.filesModified.slice(0, 8).map(f => {
      try { return path.relative(cwd, f).replace(/\\/g, '/'); } catch { return path.basename(f); }
    });
    lines.push(`- **Files**: ${relFiles.join(', ')}`);
  }

  // Errors from transcript (failed Bash commands)
  if (stdinData) {
    const errors = extractRecentErrors(stdinData);
    if (errors.length > 0) {
      lines.push(`- **Errors**: ${errors.join('; ')}`);
    }
  }

  lines.push('');

  const entry = '\n' + lines.join('\n');

  try {
    if (!fs.existsSync(chatFile)) {
      const header = `# Activity Log: ${today}\n\n> Auto-generated daily activity record. Retained for 7 days.\n`;
      fs.writeFileSync(chatFile, header + entry);
    } else {
      fs.appendFileSync(chatFile, entry);
    }
    aireinLog('debug', 'session-end', `Chat log entry written`);
  } catch (err) {
    aireinLog('error', 'session-end', `Failed to write chat log: ${err.message}`);
  }
}

/**
 * Extract recent error messages from transcript JSONL.
 * Returns array of short error descriptions.
 */
function extractRecentErrors(rawData) {
  const errors = [];
  const seen = new Set();
  try {
    const entries = rawData.split('\n').filter(Boolean);
    // Only look at the last ~50 entries (recent activity)
    const recent = entries.slice(-50);
    for (const line of recent) {
      try {
        const entry = JSON.parse(line);
        const toolName = entry.tool_name || entry.name || '';
        const command = entry.tool_input?.command || entry.input?.command || '';

        if (toolName === 'Bash' && command.match(/(?:build|test|compile|check|lint|verify)/i)) {
          const exitCode = entry.tool_result?.exit_code || entry.tool_result?.code;
          if (exitCode !== 0 && exitCode !== undefined) {
            const output = (entry.tool_result?.output || entry.tool_result?.stderr || '');
            const errorLine = output.split('\n').filter(l => l.trim()).find(l =>
              /error|fail|cannot|not found|unexpected|syntax|missing/i.test(l)
            );
            const key = `${command.slice(0, 40)}:${exitCode}`;
            if (!seen.has(key)) {
              seen.add(key);
              errors.push(`\`${command.slice(0, 60)}\` failed (${exitCode}): ${(errorLine || output.slice(0, 80)).trim().slice(0, 100)}`);
            }
          }
        }
      } catch {}
    }
  } catch {}
  return errors;
}

/**
 * Get CC's auto-loaded memory directory for the current project.
 * CC loads memory from ~/.claude/projects/{sanitized-path}/memory/
 * We find the right project by matching the session transcript file.
 */
function getCCMemoryDir(transcriptPath) {
  if (!transcriptPath) return null;

  // The transcript lives at ~/.claude/projects/{key}/{session-id}.jsonl
  // So the memory dir is at ~/.claude/projects/{key}/memory/
  const projectsDir = path.dirname(transcriptPath);
  return path.join(projectsDir, 'memory');
}

/**
 * Update the MEMORY.md index file in CC memory dir.
 * Adds an entry if it doesn't already exist.
 */
function updateMemoryIndex(ccMemoryDir, fileName, description) {
  try {
    ensureDir(ccMemoryDir);
    const indexPath = path.join(ccMemoryDir, 'MEMORY.md');

    let content = readFile(indexPath) || '# Project Memory Index\n';

    // Check if entry already exists
    if (content.includes(fileName)) return;

    // Add new entry
    const entry = `- [${fileName}](${fileName}) — ${description}\n`;
    content = content.trimEnd() + '\n' + entry;
    writeFile(indexPath, content);
  } catch {}
}

/**
 * Run self-learning archive + promote (P019).
 *
 * 缓冲 → 存档 → rules/30 晋升。挂在 Stop 链末尾（writeChatLog 后）。
 * 全程 fail-open：任何异常只 aireinLog，不影响 session-state/chat-log/exit。
 * 自学习不碰 memory——archive 落在 transcript 同目录（与 memory/ 同级），rules
 * 落在项目 rules/，pending 在项目 .airein/self-learning/。
 */
function runSelfLearning(transcriptPath) {
  try {
    const cfg = loadQualityConfig();
    if (cfg.selfLearning && cfg.selfLearning.enabled === false) return;

    const projectDir = getProjectDir();
    if (!projectDir || !transcriptPath) return;

    const projectsKeyDir = path.dirname(transcriptPath);
    const threshold = (cfg.selfLearning && cfg.selfLearning.promotionThreshold) || 3;

    const result = archiveAndPromote({
      pendingPath: projectDataSubpath(projectDir, 'self-learning', 'pending.md'),
      archivePath: path.join(projectsKeyDir, 'self-learning-archive.md'),
      rulesPath: path.join(projectDir, 'rules', '30-self-learned.md'),
      threshold
    });

    if (result.archived > 0 || result.promoted.length > 0) {
      aireinLog('info', 'session-end', `Self-learning: archived ${result.archived}, promoted ${result.promoted.length}`);
    }
  } catch (err) {
    aireinLog('error', 'session-end', `Self-learning failed (fail-open): ${err.message}`);
  }
}
