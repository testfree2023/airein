/**
 * hook-timing — pure helpers for hook duration observability (roadmap v0.2 hook perf).
 */

'use strict';

/**
 * Pick log level for a hook execution duration.
 * @param {number} durationMs
 * @param {number} slowHookMs
 * @returns {'debug'|'warn'}
 */
function durationLogLevel(durationMs, slowHookMs) {
  const ms = Number(durationMs);
  const threshold = Number(slowHookMs);
  if (!Number.isFinite(ms) || ms < 0) return 'debug';
  if (!Number.isFinite(threshold) || threshold <= 0) return 'debug';
  return ms >= threshold ? 'warn' : 'debug';
}

/**
 * @param {string} hookId
 * @param {number} durationMs
 * @returns {string}
 */
function formatDurationMessage(hookId, durationMs) {
  const id = String(hookId || 'unknown');
  const ms = Number.isFinite(Number(durationMs)) ? Math.round(Number(durationMs)) : 0;
  return `${id} durationMs=${ms}`;
}

module.exports = {
  durationLogLevel,
  formatDurationMessage,
};
