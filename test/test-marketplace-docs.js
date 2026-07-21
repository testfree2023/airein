/**
 * Spec: marketplace / three-lane docs honesty (P009 C4–C7)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  describe, assertOk, assertContains, assertNotContains, projectRoot, printSummary,
} = require('./helpers');

const ROOT = projectRoot();

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('marketplace docs (three lanes + trust)', suite => {
  suite.test('README CN: three lanes + skills incomplete + setup full', () => {
    const t = read('README.md');
    assertContains(t, '安装三车道', 'three-lane heading');
    assertContains(t, 'airein setup', 'setup');
    assertContains(t, 'npx skills add', 'skills-only warn');
    assertContains(t, '不完整', 'incomplete wording');
    assertContains(t, 'plugin install', 'CC plugin lane');
    assertContains(t, 'airein uninstall', 'uninstall');
    assertContains(t, '不上传', 'no upload');
    assertContains(t, '勿以为', 'denies myth');
    assertContains(t, '全宿主开箱', 'all-host myth called out');
    assertContains(t, 'AI', 'name mentions AI');
    assertContains(t, 'rein', 'name mentions rein');
    assertContains(t, '缰绳', 'name metaphor');
    assertContains(t, 'scripts/install.sh', 'one-liner bootstrap');
    assertContains(t, 'curl -fsSL', 'unix one-liner');
    assertContains(t, 'install.ps1', 'windows bootstrap');
    assertContains(t, 'irm https://', 'powershell one-liner');
  });

  suite.test('README EN: three lanes + honesty', () => {
    const t = read('README.en.md');
    assertContains(t, 'Three install lanes', 'heading');
    assertContains(t, 'airein setup', 'setup');
    assertContains(t, 'npx skills add', 'skills');
    assertContains(t, 'Incomplete', 'incomplete');
    assertContains(t, 'plugin install', 'plugin');
    assertContains(t, 'airein uninstall', 'uninstall');
    assertContains(t, 'no telemetry upload', 'privacy');
    assertContains(t, 'every host', 'denies one-plugin-all-hosts');
    assertContains(t, 'AI', 'name AI');
    assertContains(t, 'rein', 'name rein');
    assertContains(t, 'scripts/install.sh', 'bootstrap path');
    assertContains(t, 'curl -fsSL', 'unix one-liner');
    assertContains(t, 'install.ps1', 'ps1');
    assertContains(t, 'irm https://', 'powershell one-liner');
  });

  suite.test('SUPPORT: uninstall + skills-only + SLA link + local', () => {
    const t = read('SUPPORT.md');
    assertContains(t, 'airein uninstall', 'uninstall');
    assertContains(t, 'npx skills add', 'skills-only');
    assertContains(t, 'sla-ledger', 'SLA ledger link');
    assertContains(t, 'no telemetry upload', 'local/privacy');
  });

  suite.test('SECURITY mentions local / no npm tree', () => {
    const t = read('docs/SECURITY.md');
    assertContains(t, 'local-only', 'local-only');
  });

  suite.test('SLA ledger template has E3 three rows', () => {
    const t = read('docs/plans/P009-marketplace-readiness/sla-ledger.md');
    assertContains(t, 'Windows + Claude Code', 'win cc');
    assertContains(t, 'Windows + Cursor', 'win cursor');
    assertContains(t, 'macOS + Claude Code', 'mac cc');
  });

  suite.test('plugin.json L0-facing description is honest', () => {
    const meta = JSON.parse(read('.claude-plugin/plugin.json'));
    assertContains(meta.description, 'setup', 'mentions setup');
    assertContains(meta.description.toLowerCase(), 'incomplete', 'incomplete');
  });
});

process.exit(printSummary());
