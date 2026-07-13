#!/usr/bin/env node
/**
 * Airein Logger — synchronous daily-rotated logging for hook diagnostics
 *
 * Features:
 *   - Daily-rotated log files: <project>/.airein/logs/airein-YYYY-MM-DD.log
 *   - Synchronous writes (appendFileSync) — guaranteed to flush before process.exit
 *   - Auto-cleanup of logs older than retentionDays (default 7)
 *   - Toggle via quality.json: aireinLog.enabled (default true)
 *   - Log level filtering: debug/info/warn/error (default info)
 *
 * Config (in .airein/config/quality.json):
 *   "aireinLog": { "enabled": true, "level": "info", "retentionDays": 7 }
 *
 * Usage in hook scripts:
 *   const { aireinLog } = require('../lib/airein-logger');
 *   aireinLog('info', 'my-hook', `Size: ${sizeKB}KB`);
 */

const fs = require('fs');
const path = require('path');
const { loadQualityConfig } = require('./quality-config');
const { getProjectDir } = require('./utils');
const { projectDataSubpath } = require('./project-paths');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function getLogsDir() {
  return projectDataSubpath(getProjectDir(), 'logs');
}

function getDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTimeString() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

let _config = null;
function getConfig() {
  if (!_config) {
    const cfg = loadQualityConfig().aireinLog || {};
    _config = {
      enabled: cfg.enabled !== false,
      level: cfg.level || 'info',
      retentionDays: cfg.retentionDays || 7
    };
  }
  return _config;
}

function cleanOldLogs() {
  const config = getConfig();
  const logsDir = getLogsDir();
  const maxAge = config.retentionDays * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAge;

  try {
    if (!fs.existsSync(logsDir)) return;
    const files = fs.readdirSync(logsDir);
    for (const f of files) {
      if (!/^airein-\d{4}-\d{2}-\d{2}\.log$/.test(f)) continue;
      try {
        const stat = fs.statSync(path.join(logsDir, f));
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(path.join(logsDir, f));
        }
      } catch {}
    }
  } catch {}
}

let _cleanupDone = false;

function aireinLog(level, hookName, message) {
  const config = getConfig();
  if (!config.enabled) return;

  const msgLevel = LEVELS[level] || 0;
  const cfgLevel = LEVELS[config.level] || 1;
  if (msgLevel < cfgLevel) return;

  if (!_cleanupDone) {
    cleanOldLogs();
    _cleanupDone = true;
  }

  const logsDir = getLogsDir();
  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  } catch { return; }

  const logFile = path.join(logsDir, `airein-${getDateString()}.log`);
  const line = `[${getTimeString()}] [${level.toUpperCase()}] [${hookName}] ${message}\n`;
  try {
    fs.appendFileSync(logFile, line);
  } catch {}
}

module.exports = { aireinLog };
