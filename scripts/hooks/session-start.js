#!/usr/bin/env node
/**
 * SessionStart Hook — Minimal Context Injection
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs when a new Claude session starts. Outputs ONLY the most critical
 * info (~200 tokens) to preserve context window for actual work.
 *
 * Detailed project state lives in CC memory system (auto-loaded)
 * and docs/plans/* + docs/adr/ (subagent on-demand).
 */

const path = require('path');
const fs = require('fs');

const {
  getClaudeDir,
  getSessionsDir,
  getLearnedSkillsDir,
  getProjectDir,
  getProjectName,
  setProjectDir,
  resolveProjectDir,
  readStdinJson,
  findFiles,
  ensureDir,
  readFile,
  log,
  output
} = require('../lib/utils');
const { listAliases } = require('../lib/session-aliases');
const { aireinLog } = require('../lib/airein-logger');
const { qualityConfigPath, projectDataSubpath, projectDataSubpathForRead } = require('../lib/project-paths');
const { purgeStaleCcBashHooks } = require('../lib/cc-hook-command');

function resolveHookCommands(hooks) {
  return JSON.stringify(hooks)
    .split('${CLAUDE_PLUGIN_ROOT:-}').join(getClaudeDir().replace(/\\/g, '/'))
    .split('${CLAUDE_PLUGIN_ROOT}').join(getClaudeDir().replace(/\\/g, '/'));
}

function hasExpectedAireinHooks(settingsPath) {
  if (!fs.existsSync(settingsPath)) return false;

  const hooksPath = path.join(getClaudeDir(), 'hooks', 'hooks.json');
  if (!fs.existsSync(hooksPath)) return false;

  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const hooksDef = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  const expectedHooks = JSON.parse(resolveHookCommands(hooksDef.hooks));
  const actualCommands = [];

  for (const list of Object.values(settings.hooks || {})) {
    for (const group of list || []) {
      for (const hook of group.hooks || []) {
        actualCommands.push((hook.command || '').replace(/\\/g, '/'));
      }
    }
  }

  for (const list of Object.values(expectedHooks)) {
    for (const group of list || []) {
      for (const hook of group.hooks || []) {
        const expectedCommand = (hook.command || '').replace(/\\/g, '/');
        if (!actualCommands.includes(expectedCommand)) {
          return false;
        }
      }
    }
  }

  return true;
}

async function main() {
  // Resolve project directory FIRST so aireinLog writes to correct project dir.
  // This must happen before any aireinLog() calls.
  try {
    const input = await readStdinJson({ timeoutMs: 2000 });
    if (input.transcript_path) {
      const resolved = resolveProjectDir(input.transcript_path);
      if (resolved) {
        setProjectDir(resolved);
      }
    }
  } catch {}

  aireinLog('info', 'session-start', 'Session starting — loading context');

  // Self-heal: verify all expected airein hooks are registered in GLOBAL settings.json.
  // Uses hasExpectedAireinHooks() which reads hooks.json and checks each expected
  // command string is present in the resolved settings, instead of a magic number.
  try {
    const globalSettingsPath = path.join(getClaudeDir(), 'settings.json');
    if (!hasExpectedAireinHooks(globalSettingsPath)) {
      const { execSync } = require('child_process');
      const kernelRoot = (() => {
        const airein = path.join(require('os').homedir(), '.airein');
        if (fs.existsSync(path.join(airein, 'scripts', 'merge-hooks.js'))) return airein;
        return getClaudeDir();
      })();
      const mergeJs = path.join(kernelRoot, 'scripts', 'merge-hooks.js');
      execSync(`${JSON.stringify(process.execPath)} ${JSON.stringify(mergeJs)} ${JSON.stringify(path.join(kernelRoot, 'hooks', 'hooks.json'))} ${JSON.stringify(kernelRoot)} ${JSON.stringify(path.join(getClaudeDir(), 'settings.json'))}`, { stdio: 'pipe', timeout: 10000 });
      aireinLog('info', 'session-start', 'Self-healed hooks into global settings.json');
    }
  } catch (err) {
    aireinLog('error', 'session-start', `Hook self-heal failed: ${err.message}`);
  }

  // Win32: purge leftover bash run-hook landmines (projects/*/hooks/hooks.json etc.).
  // Stale --resume sessions may still spawn bash until Claude Code is restarted.
  try {
    const purged = purgeStaleCcBashHooks(getClaudeDir(), { platform: process.platform });
    if (purged.fixed.length > 0) {
      aireinLog(
        'warn',
        'session-start',
        `Purged ${purged.fixed.length} stale bash/WSL hook landmine(s). Restart Claude Code if hooks still spawn bash.exe.`,
      );
    }
  } catch (err) {
    aireinLog('error', 'session-start', `Stale hook purge failed: ${err.message}`);
  }

  // Diagnostic: verify critical config files are parseable JSON
  const criticalFiles = [
    { label: 'quality.json', path: qualityConfigPath(getProjectDir(), { forRead: true }) },
    { label: 'hooks.json', path: path.join(getClaudeDir(), 'hooks', 'hooks.json') },
  ];
  for (const cf of criticalFiles) {
    if (!fs.existsSync(cf.path)) continue;
    try {
      JSON.parse(fs.readFileSync(cf.path, 'utf8'));
    } catch (err) {
      aireinLog('error', 'session-start', `DIAGNOSTIC: ${cf.label} has invalid JSON — ${err.message}. Some hooks may not work correctly.`);
    }
  }

  // Ensure project directories exist (permanent initialization)
  const memoryDir = projectDataSubpath(getProjectDir(), 'memory');
  const configDir = projectDataSubpath(getProjectDir(), 'config');
  const logsDir = projectDataSubpath(getProjectDir(), 'logs');
  ensureDir(memoryDir);
  ensureDir(configDir);
  ensureDir(logsDir);

  const sessionsDir = getSessionsDir();
  const projectName = getProjectName() || 'default';
  const projectSessionsDir = path.join(sessionsDir, projectName);
  const learnedDir = getLearnedSkillsDir();

  // Ensure directories exist
  ensureDir(projectSessionsDir);
  ensureDir(learnedDir);

  // Check for learned skills
  const learnedSkills = findFiles(learnedDir, '*.md');
  if (learnedSkills.length > 0) {
    log(`[SessionStart] ${learnedSkills.length} learned skill(s) available in ${learnedDir}`);
  }

  // Check for available session aliases
  const aliases = listAliases({ limit: 5 });
  if (aliases.length > 0) {
    const aliasNames = aliases.map(a => a.name).join(', ');
    log(`[SessionStart] ${aliases.length} session alias(es) available: ${aliasNames}`);
    log(`[SessionStart] Use /sessions load <alias> to continue a previous session`);
  }

  // --- MINIMAL OUTPUT (~200 tokens) ---
  // Only inject the most critical info for session continuity.
  // Detailed state lives in CC memory (auto-loaded) and docs/ (subagent).

  const parts = [];

  // 1. Branch from most recent session
  let recentSessions = findFiles(projectSessionsDir, '*-session.tmp', { maxAge: 7 });
  if (recentSessions.length === 0 && fs.existsSync(sessionsDir)) {
    recentSessions = findFiles(sessionsDir, '*-session.tmp', { maxAge: 7 })
      .filter(s => {
        const content = readFile(s.path);
        return content && content.includes(`**Project:** ${projectName}`);
      });
  }

  if (recentSessions.length > 0) {
    const content = readFile(recentSessions[0].path);
    if (content) {
      const branchMatch = content.match(/\*\*Branch:\*\*\s*(.+)/);
      if (branchMatch) parts.push(`branch=${branchMatch[1].trim()}`);
    }
  }

  // 2. Last task from session-state (1 line)
  const newStateFile = projectDataSubpathForRead(getProjectDir(), 'memory', 'session-state.md');
  const oldStateFile = projectDataSubpathForRead(getProjectDir(), 'session-state.md');
  const stateFile = fs.existsSync(newStateFile) ? newStateFile : (fs.existsSync(oldStateFile) ? oldStateFile : null);
  if (stateFile) {
    const stateContent = readFile(stateFile);
    if (stateContent) {
      const taskMatch = stateContent.match(/##\s+Current Task[\s\S]*?-\s*\*\*Last Active\*\*:\s*(.+)/);
      if (taskMatch) parts.push(`last_active=${taskMatch[1].trim()}`);
    }
  }

  // 3. Last files edited (from session-state)
  if (stateFile) {
    const stateContent = readFile(stateFile);
    if (stateContent) {
      const filesMatch = stateContent.match(/##\s+Last Files Edited\n([\s\S]*?)(?=\n##|\n$|$)/);
      if (filesMatch) {
        const files = filesMatch[1].split('\n')
          .map(l => l.replace(/^-\s*/, '').trim())
          .filter(l => l && !l.startsWith('C:') && !l.startsWith('/'))
          .map(l => path.basename(l))
          .slice(0, 3);
        if (files.length > 0) parts.push(`last_files=${files.join(', ')}`);
      }
    }
  }

  // 4. Active plan (if any) — directory format with progress.md
  const plansDir = path.join(getProjectDir(), 'docs', 'plans');
  if (fs.existsSync(plansDir)) {
    try {
      const { findActivePlan, parseProgress } = require('../lib/plan-parser');
      const active = findActivePlan(getProjectDir());
      if (active) {
        const stats = parseProgress(active.progress);
        const planName = active.dir;
        const progressInfo = stats.completed < stats.total
          ? `${stats.completed}/${stats.total}`
          : `${stats.completed}/${stats.total}`;
        const taskInfo = stats.activeTask ? `, ${stats.activeTask}` : '';
        parts.push(`plan=${planName} [${progressInfo}${taskInfo}]`);
      }
    } catch {
      // Fallback: scan for old-format .md files
      const planFiles = fs.readdirSync(plansDir).filter(f => f.endsWith('.md')).sort();
      if (planFiles.length > 0) {
        parts.push(`plan=${planFiles[0].replace('.md', '')}`);
      }
    }
  }

  if (parts.length > 0) {
    output(`Previous: ${parts.join(', ')}`);
    aireinLog('info', 'session-start', `Minimal context injected: ${parts.length} fields`);
  } else {
    aireinLog('info', 'session-start', 'No previous context to inject');
  }

  // Consolidate and clean up old chat logs (>7 days)
  consolidateOldChatLogs();

  process.exit(0);
}

/**
 * Clean up chat logs older than 7 days.
 * Before deleting, extract learnings into memory.md and session-state.md.
 */
function consolidateOldChatLogs() {
  const memoryDir = projectDataSubpathForRead(getProjectDir(), 'memory');
  if (!fs.existsSync(memoryDir)) return;

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const chatFiles = fs.readdirSync(memoryDir)
    .filter(f => /^chat-\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map(f => ({ name: f, path: path.join(memoryDir, f) }))
    .filter(f => {
      try { return fs.statSync(f.path).mtimeMs < sevenDaysAgo; } catch { return false; }
    });

  if (chatFiles.length === 0) return;

  aireinLog('info', 'session-start', `Consolidating ${chatFiles.length} old chat log(s)`);

  const memoryFile = path.join(memoryDir, 'memory.md');

  for (const chat of chatFiles) {
    try {
      const content = readFile(chat.path);
      if (!content) { fs.unlinkSync(chat.path); continue; }

      // Extract decisions and repeated patterns → memory.md
      const decisions = [];
      for (const line of content.split('\n')) {
        if (line.includes('**Decision**') || line.includes('decision:')) {
          decisions.push(line.replace(/^[-*]\s*/, '').trim());
        }
      }

      if (decisions.length > 0 && fs.existsSync(memoryFile)) {
        const dateTag = chat.name.replace('chat-', '').replace('.md', '');
        const appendix = `\n## Decisions from ${dateTag}\n${decisions.map(d => `- ${d}`).join('\n')}\n`;
        fs.appendFileSync(memoryFile, appendix);
        aireinLog('info', 'session-start', `Consolidated ${decisions.length} decision(s) from ${chat.name}`);
      }

      fs.unlinkSync(chat.path);
      aireinLog('info', 'session-start', `Cleaned up old chat log: ${chat.name}`);
    } catch (err) {
      aireinLog('error', 'session-start', `Failed to consolidate ${chat.name}: ${err.message}`);
    }
  }
}

main().catch(err => {
  console.error('[SessionStart] Error:', err.message);
  process.exit(0); // Don't block on errors
});
