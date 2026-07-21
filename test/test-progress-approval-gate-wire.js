/**
 * progress-approval-gate must be registered (approval-time only).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { describe, assertOk, projectRoot } = require('./helpers');

describe('progress-approval-gate registration', suite => {
  suite.test('registered in hooks.json PreToolUse', () => {
    const hooks = JSON.parse(fs.readFileSync(path.join(projectRoot(), 'hooks', 'hooks.json'), 'utf8'));
    const entries = (hooks.hooks && hooks.hooks.PreToolUse) || hooks.PreToolUse || [];
    const found = entries.some(e =>
      (e.hooks || []).some(h => String(h.command || '').includes('progress-approval-gate.js'))
    );
    assertOk(found, 'progress-approval-gate.js in PreToolUse');
  });

  suite.test('dashboard handleApprove uses progressApprovalGate', () => {
    const src = fs.readFileSync(path.join(projectRoot(), 'dashboard', 'server.js'), 'utf8');
    assertOk(src.includes('progressApprovalGate'), 'requires gate');
    assertOk(src.includes('evaluateProgressApprovalGate'), 'calls evaluate');
  });

  suite.test('tasks template has ## Status footer', () => {
    const md = fs.readFileSync(path.join(projectRoot(), 'templates', 'docs', 'tasks.md'), 'utf8');
    assertOk(/##\s*Status:\s*draft/i.test(md), 'Status draft footer');
  });
});
