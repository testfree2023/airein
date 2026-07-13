/**
 * test-host-detect.js — P004 2.2: host-detect
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { describe, assertEqual, assert, assertOk, printSummary } = require('./helpers');
const { hostDetect, HOST_IDS } = require('../scripts/lib/host-detect');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-hostdet-'));

function mkHome(layout) {
  const home = path.join(TMP, `home-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  for (const [rel, content] of Object.entries(layout)) {
    const abs = path.join(home, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (content !== null) fs.writeFileSync(abs, content);
  }
  return home;
}

function byId(result, id) {
  return result.hosts.find((h) => h.id === id);
}

describe('host-detect: HOST_IDS', (suite) => {
  suite.test('含首版可安装与 hint-only 宿主', () => {
    assertOk(HOST_IDS.includes('claude-code'), 'cc');
    assertOk(HOST_IDS.includes('cursor'), 'cur');
    assertOk(HOST_IDS.includes('codex'), 'cdx');
  });
});

describe('host-detect: 探测信号', (suite) => {
  suite.test('~/.cursor 存在 → cursor detected + selectable', () => {
    const home = mkHome({ '.cursor/hooks.json': '{}' });
    const r = hostDetect({ homeDir: home, pathEnv: '' });
    const cur = byId(r, 'cursor');
    assertOk(cur.detected, 'detected');
    assertEqual(cur.selectable, true, 'selectable');
  });

  suite.test('~/.claude/settings.json → claude-code detected', () => {
    const home = mkHome({ '.claude/settings.json': '{}' });
    const r = hostDetect({ homeDir: home, pathEnv: '' });
    const cc = byId(r, 'claude-code');
    assertOk(cc.detected, 'cc detected');
    assertEqual(cc.selectable, true, 'cc selectable');
  });

  suite.test('~/.codex → codex detected 但不可选', () => {
    const home = mkHome({ '.codex/config.toml': '' });
    const r = hostDetect({ homeDir: home, pathEnv: '' });
    const cdx = byId(r, 'codex');
    assertOk(cdx.detected, 'detected');
    assertEqual(cdx.selectable, false, 'not selectable v1');
    assertOk(cdx.reason.includes('首版'), 'reason hint');
  });

  suite.test('空 home 全未检测', () => {
    const home = mkHome({ 'README': 'x' });
    const r = hostDetect({ homeDir: home, pathEnv: '' });
    assert(r.hosts.every((h) => !h.detected), 'none detected');
  });
});

const code = printSummary();
process.exit(code);
