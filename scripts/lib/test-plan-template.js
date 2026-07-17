/**
 * test-plan-template — resolve plan test-plan template by pipeline (m/l)
 *
 * Maps m- / l- pipeline prefixes (when docs include test-plan)
 * to templates/docs/test-plan/{m|l}.md
 *
 * Pure selection (definitions injectable for tests).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REL_PREFIX = 'templates/docs/test-plan/';

function loadDefaultDefinitions() {
  const root = path.join(__dirname, '..', '..');
  const pipelinesPath = path.join(root, 'templates', 'pipelines.json');
  const raw = JSON.parse(fs.readFileSync(pipelinesPath, 'utf8'));
  return raw.definitions || {};
}

/**
 * @param {string} pipeline
 * @param {{ definitions?: Record<string, { docs?: string[] }> }} [opts]
 * @returns {{ applicable: boolean, tier: 'm'|'l'|null, relativePath: string|null, fallback: boolean }}
 */
function resolveTestPlanTemplate(pipeline, opts = {}) {
  if (!pipeline || typeof pipeline !== 'string') {
    throw new Error('test-plan-template: pipeline name required');
  }

  const definitions = opts.definitions || loadDefaultDefinitions();
  const def = definitions[pipeline];
  if (!def) {
    throw new Error('test-plan-template: unknown pipeline: ' + pipeline);
  }

  const docs = Array.isArray(def.docs) ? def.docs : [];
  if (docs.indexOf('test-plan') < 0) {
    return { applicable: false, tier: null, relativePath: null, fallback: false };
  }

  let tier;
  let fallback = false;
  if (pipeline.startsWith('l-')) {
    tier = 'l';
  } else if (pipeline.startsWith('m-')) {
    tier = 'm';
  } else {
    // s-* custom or unnamed: lighter M template
    tier = 'm';
    fallback = true;
  }

  return {
    applicable: true,
    tier,
    relativePath: REL_PREFIX + tier + '.md',
    fallback,
  };
}

module.exports = {
  resolveTestPlanTemplate,
  REL_PREFIX,
};
