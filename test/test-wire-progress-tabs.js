/**
 * Assert Progress tabs remain wired: panel / text / tests ledger.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { describe, assertOk, projectRoot } = require('./helpers');

describe('progress tabs wired', suite => {
  suite.test('index.html has panel/text/ledger tabs and ProgressPanel usage', () => {
    const body = fs.readFileSync(
      path.join(projectRoot(), 'dashboard', 'public', 'index.html'),
      'utf8'
    );
    assertOk(body.includes('progress-tab-panel'), 'panel tab container');
    assertOk(body.includes('progress-tab-text'), 'text tab container');
    assertOk(body.includes('progress-tab-ledger'), 'ledger tab container');
    assertOk(body.includes('ProgressPanel.renderPanelBoard'), 'uses panel board');
    assertOk(body.includes('ProgressPanel.renderTestsLedger'), 'uses tests ledger');
    assertOk(body.includes('/tests-ledger'), 'fetches tests-ledger API');
    assertOk(body.includes('progress.tabTestsLedger'), 'ledger tab i18n');
    assertOk(body.includes('shouldShowTaskProgress'), 'gates task tabs on tasks.md');
    assertOk(body.includes('progress.tasksNotReady'), 'empty-state i18n key');
    assertOk(body.includes('scheduleMermaid(panelEl)') || body.includes("scheduleMermaid(document.getElementById('plan-progress-tab-panel'))"), 'schedules mermaid on progress panel');
    assertOk(
      /plan-progress-tab-md-btn[\s\S]{0,400}scheduleMermaid\(document\.getElementById\('plan-progress-tab-panel'\)\)/.test(body),
      'initial schedule after embedded progress render'
    );
    assertOk(body.includes('progress-panel.js'), 'script included');
  });

  suite.test('server.js exposes GET tests-ledger', () => {
    const body = fs.readFileSync(
      path.join(projectRoot(), 'dashboard', 'server.js'),
      'utf8'
    );
    assertOk(body.includes('parse-tests-ledger'), 'requires parse-tests-ledger');
    assertOk(body.includes('handleGetPlanTestsLedger'), 'handler present');
    assertOk(body.includes('tests-ledger'), 'route string present');
    assertOk(/tests-ledger\$/.test(body), 'route regex anchored');
  });
});
