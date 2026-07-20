/**
 * roadmap-gate — evaluate docs/roadmap.md writes against roadmap-contract.
 */

'use strict';

const { validateRoadmap, isRoadmapPath } = require('./roadmap-contract');

/**
 * @param {object} opts
 * @param {boolean} opts.enabled
 * @param {'strict'|'advisory'} [opts.mode]
 * @param {string} opts.filePath
 * @param {string} opts.newContent
 * @returns {{ allow: boolean, advisory: boolean, violations: string[], message: string|null }}
 */
function evaluateRoadmapGate(opts) {
  const enabled = opts && opts.enabled === true;
  const mode = (opts && opts.mode) || 'advisory';
  const advisory = mode === 'advisory';
  const emptyOk = { allow: true, advisory: false, violations: [], message: null };

  if (!enabled) return emptyOk;
  if (!isRoadmapPath(opts.filePath)) return emptyOk;

  const result = validateRoadmap(opts.newContent == null ? '' : String(opts.newContent));
  if (result.ok) return emptyOk;

  const message =
    '[roadmap-gate] docs/roadmap.md 违反活跃区契约：\n- ' +
    result.violations.join('\n- ') +
    '\n见 templates/docs/roadmap.md；或设 quality.json roadmapGate.enabled=false。';

  return {
    allow: advisory,
    advisory: advisory,
    violations: result.violations,
    message: message,
  };
}

module.exports = {
  evaluateRoadmapGate,
};
