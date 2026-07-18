/**
 * Spec: templates/docs/tasks.md panel-contract guidance (P006 / UC-S1-02).
 * Status vocabulary, Depends on = none|Task IDs, Accept has Status,
 * Dependency Graph is illustrative only.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  describe, assertOk, assertContains, projectRoot,
} = require('./helpers');

function readRepoFile(...parts) {
  const p = path.join(projectRoot(), ...parts);
  assertOk(fs.existsSync(p), `found ${parts.join('/')}`);
  return fs.readFileSync(p, 'utf8');
}

describe('tasks.md template — panel contract (P006)', suite => {
  const tpl = readRepoFile('templates', 'docs', 'tasks.md');

  suite.test('documents panel Status vocabulary pending|in_progress|completed', () => {
    assertContains(tpl, 'pending', 'pending status');
    assertContains(tpl, 'in_progress', 'in_progress status');
    assertContains(tpl, 'completed', 'completed status');
    assertContains(tpl, '面板契约', 'panel contract label');
  });

  suite.test('Depends on is none or Task ID list (not prose)', () => {
    assertContains(tpl, 'Depends on', 'Depends on field');
    assertContains(tpl, 'none', 'none sentinel');
    assertOk(
      /Task ID|task ID|任务\s*ID/i.test(tpl),
      'mentions Task ID for Depends on'
    );
  });

  suite.test('Accept example includes Status field', () => {
    const acceptIdx = tpl.indexOf('## 4.0 Accept');
    assertOk(acceptIdx >= 0, 'has Accept section');
    const acceptBlock = tpl.slice(acceptIdx, acceptIdx + 800);
    assertContains(acceptBlock, '**Status**:', 'Accept has Status');
  });

  suite.test('Dependency Graph marked non-authoritative', () => {
    assertContains(tpl, 'Dependency Graph', 'graph section');
    assertOk(
      /示意|非权威|illustrative|not authoritative/i.test(tpl),
      'graph is illustrative / non-authoritative'
    );
  });
});
