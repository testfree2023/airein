/**
 * Spec: dashboard/server.js uses scripts/lib/parse-tasks-panel for tasks parse.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { describe, assertOk, projectRoot } = require('./helpers');

describe('server.js wires parse-tasks-panel', suite => {
  suite.test('requires and delegates parseTasksMarkdown', () => {
    const body = fs.readFileSync(path.join(projectRoot(), 'dashboard', 'server.js'), 'utf8');
    assertOk(body.includes('parse-tasks-panel'), 'require parse-tasks-panel');
    assertOk(body.includes('parseTasksPanel.parseTasksMarkdown'), 'delegates to panel parser');
  });
});
