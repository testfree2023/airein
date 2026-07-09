#!/usr/bin/env node
/**
 * manage-plugins.js — Selective Plugin cleanup
 *
 * Cleans up enabledPlugins in ~/.claude/settings.json.
 * Only keeps the curated list of plugins, disables the rest.
 *
 * Usage:
 *   node scripts/manage-plugins.js [--dry-run]
 *
 * Flags:
 *   --dry-run   Show what would change without modifying settings.json
 *
 * IMPORTANT: This modifies ~/.claude/settings.json. The script
 * preserves all other settings (env, permissions, model, etc.)
 * and only changes the enabledPlugins section.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Configuration: Plugins to KEEP ───────────────────────────────

const KEEP_PLUGINS = {
  'context7@claude-plugins-official': true,
  'playwright@claude-plugins-official': true,
  'figma@claude-plugins-official': true,
  'github@claude-plugins-official': true,
  'pr-review-toolkit@claude-plugins-official': true,
  'feature-dev@claude-plugins-official': true,
  'superpowers@superpowers-dev': true,
  'document-skills@anthropic-agent-skills': true,
};

// ── Implementation ───────────────────────────────────────────────

function getSettingsPath() {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const settingsPath = getSettingsPath();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Plugin Manager — Selective Cleanup');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (dryRun) console.log('  Mode: DRY RUN (no changes)');
  console.log('');

  // Read current settings
  if (!fs.existsSync(settingsPath)) {
    console.error('  ❌ settings.json not found: ' + settingsPath);
    process.exit(1);
  }

  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (err) {
    console.error('  ❌ Failed to parse settings.json: ' + err.message);
    process.exit(1);
  }

  const currentPlugins = settings.enabledPlugins || {};
  const currentKeys = Object.keys(currentPlugins);
  const keepKeys = Object.keys(KEEP_PLUGINS);

  console.log(`  Current plugins: ${currentKeys.length}`);
  console.log(`  Target plugins:  ${keepKeys.length}`);
  console.log('');

  // Show what would be removed
  const toRemove = currentKeys.filter(k => !KEEP_PLUGINS.hasOwnProperty(k));
  const toAdd = keepKeys.filter(k => !currentPlugins.hasOwnProperty(k));
  const unchanged = currentKeys.filter(k => KEEP_PLUGINS.hasOwnProperty(k));

  if (toRemove.length > 0) {
    console.log('  Plugins to DISABLE:');
    for (const p of toRemove) {
      console.log(`    ❌ ${p}`);
    }
    console.log('');
  }

  if (toAdd.length > 0) {
    console.log('  Plugins to ENABLE (missing from current):');
    for (const p of toAdd) {
      console.log(`    ➕ ${p}`);
    }
    console.log('');
  }

  console.log(`  Plugins unchanged: ${unchanged.length}`);
  console.log('');

  if (dryRun) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Would disable: ${toRemove.length} plugins`);
    console.log(`  Would enable:  ${toAdd.length} plugins`);
    console.log(`  Would keep:    ${unchanged.length} plugins`);
    console.log('');
    console.log('  Run without --dry-run to apply changes.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return;
  }

  // Apply changes — only modify enabledPlugins, preserve everything else
  const newPlugins = {};
  for (const k of keepKeys) {
    newPlugins[k] = true;
  }
  settings.enabledPlugins = newPlugins;

  // Write back
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  ✅ Updated settings.json`);
    console.log(`  ✅ Disabled: ${toRemove.length} plugins`);
    console.log(`  ✅ Enabled:  ${keepKeys.length} plugins`);
    console.log('');
    console.log('  ⚠️  Restart Claude Code for changes to take effect.');
    console.log('  ⚠️  Run /mcp to verify MCP server status.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (err) {
    console.error('  ❌ Failed to write settings.json: ' + err.message);
    process.exit(1);
  }
}

main();
