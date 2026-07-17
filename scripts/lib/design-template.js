/**
 * design-template — resolve plan design template by pipeline (s/m/l)
 *
 * Maps s- / m- / l- pipeline prefixes (when docs include design)
 * to templates/docs/design/{s|m|l}.md
 *
 * Pure selection (definitions injectable for tests).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REL_PREFIX = 'templates/docs/design/';

function loadDefaultDefinitions() {
  const root = path.join(__dirname, '..', '..');
  const pipelinesPath = path.join(root, 'templates', 'pipelines.json');
  const raw = JSON.parse(fs.readFileSync(pipelinesPath, 'utf8'));
  return raw.definitions || {};
}

/**
 * @param {string} pipeline
 * @param {{ definitions?: Record<string, { docs?: string[] }> }} [opts]
 * @returns {{ applicable: boolean, tier: 's'|'m'|'l'|null, relativePath: string|null, fallback: boolean }}
 */
function resolveDesignTemplate(pipeline, opts = {}) {
  if (!pipeline || typeof pipeline !== 'string') {
    throw new Error('design-template: pipeline name required');
  }

  const definitions = opts.definitions || loadDefaultDefinitions();
  const def = definitions[pipeline];
  if (!def) {
    throw new Error('design-template: unknown pipeline: ' + pipeline);
  }

  const docs = Array.isArray(def.docs) ? def.docs : [];
  if (docs.indexOf('design') < 0) {
    return { applicable: false, tier: null, relativePath: null, fallback: false };
  }

  let tier;
  let fallback = false;
  if (pipeline.startsWith('s-')) {
    tier = 's';
  } else if (pipeline.startsWith('m-')) {
    tier = 'm';
  } else if (pipeline.startsWith('l-')) {
    tier = 'l';
  } else {
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
  resolveDesignTemplate,
  REL_PREFIX,
};
