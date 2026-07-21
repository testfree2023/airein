#!/usr/bin/env node
/**
 * Plan Parser — Shared library for plan system v3.0
 *
 * Provides structured parsing of progress.md files for consumption by:
 *   - session-start.js (context injection)
 *   - pre-compact.js (context preservation)
 *   - plan-gate.js (enforcement)
 *   - approval-sequence.js (enforcement)
 *   - progress-sync.js (auto-sync)
 *
 * All functions are pure (no side effects) and synchronous.
 */

const fs = require('fs');
const path = require('path');

/**
 * Normalize progress.md format to canonical (no leading whitespace on key-value lines).
 *
 * The canonical format has key-value pairs and section headers at column 0.
 * Some editors or templates may produce indented content; this function
 * strips leading whitespace so all downstream parsers work reliably.
 *
 * @param {string} content - Raw progress.md content
 * @returns {string} Normalized content
 */
function normalizeProgressFormat(content) {
  if (!content) return content;
  return content
    .split('\n')
    .map(line => {
      // Preserve blank lines as-is
      if (line.trim() === '') return '';
      // Strip all leading whitespace — progress.md has no intentional indentation
      return line.trimStart();
    })
    .join('\n');
}

/**
 * Find the first active (incomplete) plan directory with a progress.md.
 * Automatically normalizes progress.md format if needed.
 * @param {string} projectDir - Project root directory
 * @returns {{ dir: string, progress: string } | null} Plan directory name + progress.md content
 */
function findActivePlan(projectDir) {
  if (!projectDir) return null;
  const plansDir = path.join(projectDir, 'docs', 'plans');
  try {
    if (!fs.existsSync(plansDir)) return null;
    const entries = fs.readdirSync(plansDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const progressPath = path.join(plansDir, entry.name, 'progress.md');
      if (!fs.existsSync(progressPath)) continue;
      const rawContent = fs.readFileSync(progressPath, 'utf8');
      const content = normalizeProgressFormat(rawContent);
      // Auto-fix: write normalized content back if it was indented
      if (content !== rawContent) {
        try { fs.writeFileSync(progressPath, content, 'utf8'); } catch {}
      }
      const status = getStatus(content);
      if (status === 'archived') continue;
      // Task stats alone do not retire a plan: status=in_progress stays active
      // until explicit archive (dogfood plan-gate blind spot, 2026-07-11).
      if (isPlanCompleted(content) && status !== 'in_progress') continue;
      return { dir: entry.name, progress: content };
    }
  } catch {}
  return null;
}

/**
 * Parse a progress.md content string into structured data.
 * @param {string} content - progress.md file content
 * @returns {{ total: number, completed: number, inProgress: number, pending: number, activeTask: string|null, blockers: string[] }}
 */
function parseProgress(content) {
  if (!content) {
    return { total: 0, completed: 0, inProgress: 0, pending: 0, activeTask: null, blockers: [] };
  }

  const intMatch = (key) => {
    const m = content.match(new RegExp(`^\\s*${key}:\\s*(\\d+)`, 'm'));
    return m ? parseInt(m[1], 10) : 0;
  };

  const total = intMatch('total');
  const completed = intMatch('completed');
  const inProgress = intMatch('in_progress');
  const pending = intMatch('pending');

  // Active Task: first non-empty line after "## Active Task"
  let activeTask = null;
  const activeMatch = content.match(/^\s*## Active Task\n\s*(.+)/m);
  if (activeMatch) {
    const taskLine = activeMatch[1].trim();
    if (taskLine && taskLine !== 'none') {
      activeTask = taskLine;
    }
  }

  // Blockers: lines after "## Blockers" until next ## or EOF
  const blockers = [];
  const blockersMatch = content.match(/^\s*## Blockers\n([\s\S]*?)(?=\n\s*## |\n*$)/m);
  if (blockersMatch) {
    for (const line of blockersMatch[1].split('\n')) {
      const trimmed = line.replace(/^-\s*/, '').trim();
      if (trimmed) blockers.push(trimmed);
    }
  }

  return { total, completed, inProgress, pending, activeTask, blockers };
}

/**
 * Extract approval state from progress.md content.
 * @param {string} content - progress.md file content
 * @returns {{ requirements: string, design: string, tasks: string }}
 */
function getApprovalState(content) {
  const state = { requirements: 'none', design: 'none', tasks: 'none' };
  if (!content) return state;

  const sectionMatch = content.match(/(?:^|\n)\s*## Approval State\n([\s\S]*?)(?=\n\s*## |\s*$)/);
  if (sectionMatch) {
    for (const line of sectionMatch[1].split('\n')) {
      // 兼容 markdown 列表前缀 "- key: value"（允许可选的 "- " 前缀）
      const m = line.match(/^\s*-?\s*([A-Za-z0-9_-]+):\s*(\S+)/);
      if (m) state[m[1].toLowerCase()] = m[2];
    }
    return state;
  }

  const strMatch = (key) => {
    const m = content.match(new RegExp(`^\\s*-?\\s*${key}:\\s*(\\S+)`, 'm'));
    return m ? m[1] : 'none';
  };

  state.requirements = strMatch('requirements');
  state.design = strMatch('design');
  state.tasks = strMatch('tasks');
  return state;
}

/**
 * Get grilling/brainstorming state from progress.md content.
 *
 * Missing field defaults to 'completed' for backward compatibility with
 * existing plans created before the grilling gate existed.
 *
 * @param {string} content - progress.md file content
 * @returns {'none' | 'in_progress' | 'completed'}
 */
function getGrillingState(content) {
  if (!content) return 'completed';
  const m = content.match(/^\s*grilling:\s*(\S+)/m);
  const val = m ? m[1].toLowerCase() : 'completed';
  if (val === 'none' || val === 'in_progress' || val === 'completed') return val;
  return 'completed';
}

/**
 * Check if a plan is fully completed.
 * @param {string} content - progress.md file content
 * @returns {boolean}
 */
function isPlanCompleted(content) {
  if (!content) return false;
  const stats = parseProgress(content);
  return stats.total > 0 && stats.completed >= stats.total;
}

/**
 * Set a single approval phase to 'approved' in progress.md content.
 *
 * 兼容两种写法：
 *   - 纯文本：`requirements: draft`
 *   - markdown 列表：`- requirements: draft`
 * 写入时保留原前缀（`- ` 或无），其余行不动。幂等：对已 approved 的行再设一次不变。
 *
 * @param {string} content - Raw progress.md content.
 * @param {string} phase - Doc/phase name to approve (e.g. 'requirements').
 * @returns {string} Updated content with phase: approved (prefix preserved).
 *   Returns content unchanged if the phase line is not found.
 */
function setApprovalState(content, phase) {
  if (!content || !phase) return content;
  // 捕获前缀（行首空白 + 可选 "- " 列表标记 + 空白），替换时用 $1 保留原格式。
  const re = new RegExp('^([ \\t]*-?[ \\t]*)' + phase + ':\\s+\\S+', 'm');
  return content.replace(re, '$1' + phase + ': approved');
}

/**
 * Get the status field from progress.md content.
 * Defaults to 'in_progress' for backward compatibility with plans
 * created before the status field existed.
 * @param {string} content - progress.md file content
 * @returns {'in_progress' | 'completed' | 'archived'}
 */
function getStatus(content) {
  if (!content) return 'in_progress';
  const m = content.match(/^\s*status:\s*(\S+)/m);
  const val = m ? m[1].replace(/\r$/, '').toLowerCase() : 'in_progress';
  if (val === 'in_progress' || val === 'completed' || val === 'archived') return val;
  return 'in_progress';
}

/**
 * Get complexity/pipeline level from progress.md content.
 * Defaults to 'm-feature' if not specified.
 * @param {string} content - progress.md file content
 * @returns {string} pipeline name (e.g. 'm-feature', 'l-bugfix', 'hotfix')
 */
function getComplexity(content) {
  if (!content) return 'm-feature';
  const m = content.match(/^\s*complexity:\s*([a-z][a-z0-9_-]*)/m);
  return m ? m[1].toLowerCase() : 'm-feature';
}

/**
 * Read plan sub-document footer ## Status.
 * @param {string} content - Phase doc markdown
 * @returns {'draft'|'approved'|'none'|string}
 */
function getDocStatus(content) {
  if (content == null || content === '') return 'none';
  const m = String(content).match(/^##\s*Status:\s*(\S+)\s*$/im);
  if (!m) return 'none';
  return String(m[1]).replace(/\r$/, '').toLowerCase();
}

/**
 * Flip plan sub-document footer Status heading to approved.
 * Templates end with Status draft; approval must sync this with
 * progress.md Approval State (Dashboard approve / new-plan skill).
 * Idempotent when already approved; unchanged when no Status heading.
 *
 * @param {string} content - Phase doc markdown (requirements.md, etc.)
 * @returns {string} Updated content
 */
function setDocStatusApproved(content) {
  if (content == null || content === '') return content;
  const re = /^(##\s*Status:\s*)(\S+)\s*$/im;
  const m = String(content).match(re);
  if (!m) return content;
  if (String(m[2]).replace(/\r$/, '').toLowerCase() === 'approved') return content;
  return String(content).replace(re, '$1approved');
}

module.exports = {
  findActivePlan,
  parseProgress,
  getApprovalState,
  setApprovalState,
  getDocStatus,
  setDocStatusApproved,
  getGrillingState,
  isPlanCompleted,
  getComplexity,
  getStatus,
  normalizeProgressFormat,
};
