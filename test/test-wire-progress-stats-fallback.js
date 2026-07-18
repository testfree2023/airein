/**
 * Assert progress.md fallback returns counts without synthetic nodes (P006).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { describe, assertOk, assertNotContains, projectRoot } = require('./helpers');

describe('progress stats fallback (no fake nodes)', suite => {
  suite.test('parseProgressStats has no synthetic Tasks stage', () => {
    const body = fs.readFileSync(
      path.join(projectRoot(), 'dashboard', 'server.js'),
      'utf8'
    );
    assertNotContains(body, 'No per-task breakdown available', 'synthetic comment gone');
    assertOk(body.includes('out.panelCompatible = true'), 'panelCompatible on fallback');
  });
});
