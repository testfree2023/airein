/**
 * Assert Progress dual tabs remain wired (P006). Side-effect free.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { describe, assertOk, projectRoot } = require('./helpers');

describe('progress dual tabs wired', suite => {
  suite.test('index.html has panel/text tabs and ProgressPanel usage', () => {
    const body = fs.readFileSync(
      path.join(projectRoot(), 'dashboard', 'public', 'index.html'),
      'utf8'
    );
    assertOk(body.includes('progress-tab-panel'), 'panel tab container');
    assertOk(body.includes('progress-tab-text'), 'text tab container');
    assertOk(body.includes('ProgressPanel.renderPanelBoard'), 'uses panel board');
    assertOk(body.includes('scheduleMermaid(panelEl)') || body.includes("scheduleMermaid(document.getElementById('plan-progress-tab-panel'))"), 'schedules mermaid on progress panel');
    assertOk(
      /plan-progress-tab-md-btn[\s\S]{0,400}scheduleMermaid\(document\.getElementById\('plan-progress-tab-panel'\)\)/.test(body),
      'initial schedule after embedded progress render'
    );
    assertOk(body.includes('progress-panel.js'), 'script included');
  });
});
