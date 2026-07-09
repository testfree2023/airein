#!/usr/bin/env node
/**
 * merge-hooks.js — Resolve and merge hooks from hooks.json into settings.json
 *
 * This is the cross-platform implementation called by merge-hooks.sh.
 * Extracted as a separate file to avoid shell quoting issues (bash single-quote
 * nesting breaks on macOS, double-quote nesting breaks everywhere).
 *
 * Target: GLOBAL ~/.claude/settings.json
 * Reason: Claude Code only reads hooks from global settings.json, not from
 * project-level settings.local.json. Self-heal in session-start.js re-runs
 * this script when CC overwrites settings.json (e.g. /model switch).
 *
 * Usage:
 *   node merge-hooks.js <hooks.json> <claude-dir> <settings.json> [more...]
 *
 * Exit codes:
 *   0  success
 *   1  invalid arguments or parse error
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length < 3) {
  console.error('Usage: node merge-hooks.js <hooks.json> <claude-dir> <settings.json> [more...]');
  process.exit(1);
}

const hooksFile = args[0];
const claudeDir = args[1].replace(/\\/g, '/');
const settingsFiles = args.slice(2);

// ── 1. Parse hooks.json ──────────────────────────────────────────
let hooksDef;
try {
  hooksDef = JSON.parse(fs.readFileSync(hooksFile, 'utf8'));
} catch (err) {
  console.error(`  ⚠️  Failed to parse ${hooksFile}: ${err.message}`);
  process.exit(1);
}

if (!hooksDef.hooks) {
  console.error('  ⚠️  hooks.json has no "hooks" key');
  process.exit(1);
}

// ── 2. Resolve ${CLAUDE_PLUGIN_ROOT} placeholders ────────────────
const resolvedHooksStr = JSON.stringify(hooksDef.hooks)
  .split('${CLAUDE_PLUGIN_ROOT:-}').join(claudeDir)
  .split('${CLAUDE_PLUGIN_ROOT}').join(claudeDir);

const resolvedHooks = JSON.parse(resolvedHooksStr);

// ── 3. Merge into each settings file ─────────────────────────────
const aireinHookNames = new Set();
for (const list of Object.values(resolvedHooks)) {
  for (const group of list) {
    for (const hook of group.hooks || []) {
      const command = (hook.command || '').replace(/\\/g, '/');
      const matches = command.matchAll(/(?:^|["\s])(?:.*\/)?scripts\/hooks\/([\w.-]+\.js)/g);
      for (const match of matches) {
        aireinHookNames.add(match[1]);
      }
    }
  }
}

function isAireinHookGroup(group) {
  return (group.hooks || []).some(hook => {
    const command = (hook.command || '').replace(/\\/g, '/');
    return [...aireinHookNames].some(name =>
      command.includes(`/scripts/hooks/${name}`) ||
      command.includes(`scripts/hooks/${name}`)
    );
  });
}

let totalCount = 0;

for (const settingsFile of settingsFiles) {
  // Ensure parent directory exists
  const dir = path.dirname(settingsFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Load or create settings
  let settings = {};
  if (fs.existsSync(settingsFile)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    } catch {
      settings = {};
    }
  }

  // Replace airein-owned hooks only. Preserve custom/third-party hooks, while
  // removing stale airein hooks that still point at an old install location.
  const mergedHooks = {};
  for (const [event, list] of Object.entries(settings.hooks || {})) {
    const customGroups = (list || []).filter(group => !isAireinHookGroup(group));
    if (customGroups.length > 0) {
      mergedHooks[event] = customGroups;
    }
  }

  for (const [event, list] of Object.entries(resolvedHooks)) {
    mergedHooks[event] = [...(mergedHooks[event] || []), ...list];
  }

  settings.hooks = mergedHooks;

  // Count hooks
  let count = 0;
  for (const list of Object.values(settings.hooks)) {
    for (const group of list || []) {
      count += (group.hooks || []).length;
    }
  }

  // Write
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  const shortPath = settingsFile.replace(process.env.HOME + '/', '~/');
  console.log(`  ✅ Registered ${count} hooks → ${shortPath}`);
  totalCount += count;
}

// ── 4. Create project directories only for project-level settings files ──
// Skip when targeting global ~/.claude/settings.json — session-start.js handles
// project directory creation for the active project.
const normalizedClaudeDir = claudeDir.replace(/\/+$/, '');
for (const settingsFile of settingsFiles) {
  const normalizedSettings = settingsFile.replace(/\\/g, '/').replace(/\/+$/, '');
  // Skip if settings file is directly inside ~/.claude/ (global settings)
  if (normalizedSettings === `${normalizedClaudeDir}/settings.json`) {
    continue;
  }
  const projectDir = path.dirname(path.dirname(settingsFile)); // .claude/.. → project root
  const dirs = ['.claude/config', '.claude/memory', '.claude/logs'];
  for (const d of dirs) {
    const fullDir = path.join(projectDir, d);
    if (!fs.existsSync(fullDir)) {
      fs.mkdirSync(fullDir, { recursive: true });
    }
  }
}

console.log(totalCount);
