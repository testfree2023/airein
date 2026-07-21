/**
 * Spec: remote one-liner bootstrap installers (clone → airein setup --yes)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  describe, assertOk, assertContains, projectRoot, printSummary,
} = require('./helpers');

const ROOT = projectRoot();

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('install bootstrap scripts', suite => {
  suite.test('install.sh clones repo and runs setup --yes', () => {
    const p = path.join(ROOT, 'scripts/install.sh');
    assertOk(fs.existsSync(p), 'scripts/install.sh exists');
    const t = read('scripts/install.sh');
    assertContains(t, 'git clone', 'clones');
    assertContains(t, 'github.com/testfree2023/airein', 'official repo');
    assertContains(t, 'setup --yes', 'non-interactive setup');
    assertContains(t, 'AIREIN_REPO_URL', 'overridable repo');
    assertContains(t, '#!/usr/bin/env bash', 'bash shebang');
  });

  suite.test('install.ps1 clones repo and runs setup --yes', () => {
    const p = path.join(ROOT, 'scripts/install.ps1');
    assertOk(fs.existsSync(p), 'scripts/install.ps1 exists');
    const t = read('scripts/install.ps1');
    assertContains(t, 'git clone', 'clones');
    assertContains(t, 'github.com/testfree2023/airein', 'official repo');
    assertContains(t, 'setup', 'setup');
    assertContains(t, '--yes', 'non-interactive');
    assertContains(t, 'AIREIN_REPO_URL', 'overridable repo');
  });

  suite.test('SECURITY mentions remote bootstrap trust', () => {
    const t = read('docs/SECURITY.md');
    assertContains(t, 'install.sh', 'mentions bootstrap');
  });
});

process.exit(printSummary());
