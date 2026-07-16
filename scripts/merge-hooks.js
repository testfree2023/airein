#!/usr/bin/env node
/**
 * merge-hooks.js — Resolve and merge hooks from hooks.json into settings.json
 *
 * Target: GLOBAL ~/.claude/settings.json (CC registration layer).
 * pluginRoot (arg 2): airein kernel root (~/.airein) — replaces ${CLAUDE_PLUGIN_ROOT}.
 *
 * Usage:
 *   node merge-hooks.js <hooks.json> <plugin-root> <settings.json> [more...]
 */

const fs = require('fs');
const path = require('path');
const { AIREIN_PROJECT_DIR } = require('./lib/project-paths');
const { rewriteResolvedHooks } = require('./lib/cc-hook-command');

/**
 * @param {{ hooksFile: string, pluginRoot: string, settingsFiles: string[], ensureProjectDirs?: boolean }} opts
 * @returns {{ totalCount: number, perFile: Array<{ file: string, count: number }> }}
 */
function mergeHooks(opts) {
  const hooksFile = opts.hooksFile;
  const pluginRoot = opts.pluginRoot.replace(/\\/g, '/');
  const settingsFiles = opts.settingsFiles || [];
  const ensureProjectDirs = opts.ensureProjectDirs !== false;

  let hooksDef;
  try {
    hooksDef = JSON.parse(fs.readFileSync(hooksFile, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse ${hooksFile}: ${err.message}`);
  }

  if (!hooksDef.hooks) {
    throw new Error(`hooks.json has no "hooks" key: ${hooksFile}`);
  }

  const resolvedHooksStr = JSON.stringify(hooksDef.hooks)
    .split('${CLAUDE_PLUGIN_ROOT:-}').join(pluginRoot)
    .split('${CLAUDE_PLUGIN_ROOT}').join(pluginRoot);

  const resolvedHooks = rewriteResolvedHooks(
    JSON.parse(resolvedHooksStr),
    opts.platform || process.platform,
  );

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
    return (group.hooks || []).some((hook) => {
      const command = (hook.command || '').replace(/\\/g, '/');
      return [...aireinHookNames].some((name) =>
        command.includes(`/scripts/hooks/${name}`) ||
        command.includes(`scripts/hooks/${name}`),
      );
    });
  }

  let totalCount = 0;
  const perFile = [];
  const normalizedPlugin = pluginRoot.replace(/\/+$/, '');

  for (const settingsFile of settingsFiles) {
    const dir = path.dirname(settingsFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let settings = {};
    if (fs.existsSync(settingsFile)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      } catch {
        settings = {};
      }
    }

    const mergedHooks = {};
    for (const [event, list] of Object.entries(settings.hooks || {})) {
      const customGroups = (list || []).filter((group) => !isAireinHookGroup(group));
      if (customGroups.length > 0) {
        mergedHooks[event] = customGroups;
      }
    }

    for (const [event, list] of Object.entries(resolvedHooks)) {
      mergedHooks[event] = [...(mergedHooks[event] || []), ...list];
    }

    settings.hooks = mergedHooks;

    let count = 0;
    for (const list of Object.values(settings.hooks)) {
      for (const group of list || []) {
        count += (group.hooks || []).length;
      }
    }

    fs.writeFileSync(settingsFile, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    perFile.push({ file: settingsFile, count });
    totalCount += count;
  }

  if (ensureProjectDirs) {
    for (const settingsFile of settingsFiles) {
      const normalizedSettings = settingsFile.replace(/\\/g, '/').replace(/\/+$/, '');
      const ccHome = path.join(process.env.HOME || process.env.USERPROFILE || '', '.claude').replace(/\\/g, '/');
      if (normalizedSettings === `${ccHome}/settings.json` || normalizedSettings === `${normalizedPlugin}/settings.json`) {
        continue;
      }
      const projectDir = path.dirname(path.dirname(settingsFile));
      const dirs = [
        path.join(AIREIN_PROJECT_DIR, 'config'),
        path.join(AIREIN_PROJECT_DIR, 'memory'),
        path.join(AIREIN_PROJECT_DIR, 'logs'),
      ];
      for (const d of dirs) {
        const fullDir = path.join(projectDir, d);
        if (!fs.existsSync(fullDir)) {
          fs.mkdirSync(fullDir, { recursive: true });
        }
      }
    }
  }

  return { totalCount, perFile };
}

function main(argv) {
  const args = argv.slice(2);
  if (args.length < 3) {
    process.stderr.write('Usage: node merge-hooks.js <hooks.json> <plugin-root> <settings.json> [more...]\n');
    process.exit(1);
  }

  const hooksFile = args[0];
  const pluginRoot = args[1];
  const settingsFiles = args.slice(2);

  try {
    const result = mergeHooks({ hooksFile, pluginRoot, settingsFiles });
    for (const { file, count } of result.perFile) {
      const shortPath = file.replace((process.env.HOME || '') + '/', '~/');
      process.stdout.write(`  ✅ Registered ${count} hooks → ${shortPath}\n`);
    }
    process.stdout.write(`${result.totalCount}\n`);
  } catch (err) {
    process.stderr.write(`  ⚠️  ${err.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main(process.argv);
}

module.exports = { mergeHooks };
