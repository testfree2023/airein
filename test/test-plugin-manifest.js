/**
 * Spec: .claude-plugin/plugin.json — L1 thin surface (P009 spike: no full hooks)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  describe, assertEqual, assertOk, assertContains, assertNotContains, projectRoot, printSummary,
} = require('./helpers');

const ROOT = projectRoot();
const PLUGIN_JSON = path.join(ROOT, '.claude-plugin', 'plugin.json');
const MARKETPLACE_JSON = path.join(ROOT, '.claude-plugin', 'marketplace.json');
const BRIDGE_HOOKS = path.join(ROOT, 'hooks', 'plugin-bridge.json');

describe('plugin manifest (L1)', suite => {
  suite.test('plugin.json exists with name/version', () => {
    assertOk(fs.existsSync(PLUGIN_JSON), 'plugin.json present');
    const meta = JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf8'));
    assertEqual(typeof meta.name, 'string', 'name string');
    assertOk(meta.name.length > 0, 'name non-empty');
    assertEqual(typeof meta.version, 'string', 'version string');
    assertOk(/^\d+\.\d+/.test(meta.version), 'semver-ish version');
  });

  suite.test('declares skills and commands paths that exist', () => {
    const meta = JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf8'));
    assertOk(meta.skills, 'skills field');
    assertOk(meta.commands, 'commands field');
    const skillsRel = String(meta.skills).replace(/^\.\//, '');
    const commandsRel = String(meta.commands).replace(/^\.\//, '');
    assertOk(fs.existsSync(path.join(ROOT, skillsRel)), 'skills dir exists');
    assertOk(fs.existsSync(path.join(ROOT, commandsRel)), 'commands dir exists');
  });

  suite.test('hooks point at thin bridge only (not full iron-law suite)', () => {
    const meta = JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf8'));
    assertOk(meta.hooks, 'hooks field');
    const hooksRel = String(meta.hooks).replace(/^\.\//, '');
    assertContains(hooksRel, 'plugin-bridge', 'bridge hooks file');
    assertOk(fs.existsSync(path.join(ROOT, hooksRel)), 'bridge file exists');
    assertNotContains(hooksRel, 'hooks/hooks.json', 'not full hooks.json');

    const bridge = JSON.parse(fs.readFileSync(path.join(ROOT, hooksRel), 'utf8'));
    const events = Object.keys(bridge.hooks || {});
    assertEqual(events.length, 1, 'exactly one event');
    assertEqual(events[0], 'SessionStart', 'SessionStart only');
    const cmds = JSON.stringify(bridge);
    assertNotContains(cmds, 'test-guard', 'no test-guard in L1');
    assertNotContains(cmds, 'plan-gate', 'no plan-gate in L1');
    assertContains(cmds, 'plugin-kernel-bridge', 'bridge script referenced');
  });

  suite.test('description admits incomplete without setup', () => {
    const meta = JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf8'));
    const desc = String(meta.description || '');
    assertOk(/setup|kernel|incomplete|完整/i.test(desc), 'honest description');
  });

  suite.test('marketplace.json lists plugin', () => {
    assertOk(fs.existsSync(MARKETPLACE_JSON), 'marketplace.json');
    const m = JSON.parse(fs.readFileSync(MARKETPLACE_JSON, 'utf8'));
    assertOk(Array.isArray(m.plugins) || m.plugins, 'plugins list');
  });

  suite.test('bridge script file exists', () => {
    assertOk(
      fs.existsSync(path.join(ROOT, 'scripts', 'hooks', 'plugin-kernel-bridge.js')),
      'plugin-kernel-bridge.js'
    );
  });
});

process.exit(printSummary());
