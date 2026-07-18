/**
 * Assert Plan Progress doc-tab embeds 面板/文本 (P006).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { describe, assertOk, projectRoot } = require('./helpers');

describe('plan Progress tab embeds panel/text', suite => {
  suite.test('index.html wires renderPlanProgressEmbedded for progress doc', () => {
    const body = fs.readFileSync(
      path.join(projectRoot(), 'dashboard', 'public', 'index.html'),
      'utf8'
    );
    assertOk(body.includes('renderPlanProgressEmbedded'), 'has embed function');
    assertOk(body.includes("if (docName === 'progress')"), 'branches on progress');
    assertOk(body.includes('plan-progress-tab-panel'), 'panel container id');
    assertOk(body.includes('plan-progress-tab-text'), 'text container id');
  });
});
