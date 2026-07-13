/**
 * cursor-hook-merge — 将 airein hooks 合并进 ~/.cursor/hooks.json（保留用户 hook）
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { translateHooks } = require('./hook-register');

function isAireinCursorHook(def) {
  const cmd = String(def.command || '').replace(/\\/g, '/');
  return cmd.includes('/scripts/hooks/host/cursor.js');
}

/**
 * @param {{ hooksFile: string, aireinRoot: string, destFile: string, platform?: string, dryRun?: boolean }} opts
 * @returns {{ ok: boolean, count: number, errors: string[] }}
 */
function mergeCursorHooks(opts) {
  const hooksFile = opts.hooksFile;
  const aireinRoot = String(opts.aireinRoot).replace(/\\/g, '/');
  const destFile = path.resolve(opts.destFile);
  const dryRun = opts.dryRun === true;
  const platform = opts.platform || 'linux';

  let hooksJson;
  try {
    hooksJson = JSON.parse(fs.readFileSync(hooksFile, 'utf8'));
  } catch (err) {
    throw new Error(`cursor-hook-merge: failed to parse ${hooksFile}: ${err.message}`);
  }

  const translated = translateHooks('cursor', hooksJson, { aireinRoot, platform });
  if (translated.errors.length) {
    return { ok: false, count: 0, errors: translated.errors };
  }

  const newFile = translated.files.find((f) => f.path === '.cursor/hooks.json');
  if (!newFile) {
    return { ok: false, count: 0, errors: ['cursor-hook-merge: translateHooks returned no .cursor/hooks.json'] };
  }

  const newCfg = JSON.parse(newFile.content);
  let existing = { version: 1, hooks: {} };
  if (fs.existsSync(destFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(destFile, 'utf8'));
    } catch {
      existing = { version: 1, hooks: {} };
    }
  }

  const merged = { version: 1, hooks: {} };
  for (const [event, defs] of Object.entries(existing.hooks || {})) {
    const custom = (defs || []).filter((d) => !isAireinCursorHook(d));
    if (custom.length > 0) merged.hooks[event] = custom;
  }
  for (const [event, defs] of Object.entries(newCfg.hooks || {})) {
    merged.hooks[event] = [...(merged.hooks[event] || []), ...(defs || [])];
  }

  let count = 0;
  for (const defs of Object.values(merged.hooks)) count += defs.length;

  if (!dryRun) {
    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    fs.writeFileSync(destFile, `${JSON.stringify(merged, null, 2)}\n`);
  }

  return { ok: true, count, errors: [] };
}

module.exports = {
  isAireinCursorHook,
  mergeCursorHooks,
};
