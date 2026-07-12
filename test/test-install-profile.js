/**
 * test-install-profile.js — P004 2.1: install-profile.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { describe, assertEqual, assert, assertOk, printSummary } = require('./helpers');
const {
  PROFILE_SCHEMA,
  readProfile,
  writeProfile,
  upsertHost,
  defaultProfile,
} = require('../scripts/lib/install-profile');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-profile-'));
const KERNEL = path.join(TMP, 'kernel');

describe('install-profile: defaultProfile', (suite) => {
  suite.test('schema v1 + kernelRoot + delivery', () => {
    const p = defaultProfile(KERNEL);
    assertEqual(p.schema, PROFILE_SCHEMA, 'schema');
    assertEqual(p.kernelRoot, path.resolve(KERNEL), 'kernelRoot resolved');
    assertEqual(p.delivery, 'unified', 'default delivery');
    assertEqual(p.hosts.length, 0, 'empty hosts');
  });
});

describe('install-profile: write/read round-trip', (suite) => {
  suite.test('写入后读回 delivery', () => {
    const data = defaultProfile(KERNEL, { delivery: 'copy' });
    data.installedVersion = '2.02';
    writeProfile(KERNEL, data);
    const read = readProfile(KERNEL);
    assertEqual(read.delivery, 'copy', 'delivery');
    assertEqual(read.installedVersion, '2.02', 'version');
    assertEqual(read.kernelRoot, path.resolve(KERNEL), 'kernelRoot');
  });

  suite.test('缺文件返回 null', () => {
    const empty = path.join(TMP, 'no-profile');
    fs.mkdirSync(empty, { recursive: true });
    assertEqual(readProfile(empty), null, 'missing');
  });

  suite.test('非法 JSON 抛错', () => {
    const bad = path.join(TMP, 'bad-json');
    fs.mkdirSync(bad, { recursive: true });
    fs.writeFileSync(path.join(bad, 'install-profile.json'), '{not json');
    let threw = false;
    try {
      readProfile(bad);
    } catch (e) {
      threw = true;
      assertOk(e.message.includes('install-profile'), 'message');
    }
    assert(threw, 'throws on bad json');
  });
});

describe('install-profile: upsertHost', (suite) => {
  suite.test('新增 host', () => {
    const p = defaultProfile(KERNEL);
    upsertHost(p, { id: 'cursor', platform: 'linux' });
    assertEqual(p.hosts.length, 1, 'one host');
    assertEqual(p.hosts[0].id, 'cursor', 'id');
  });

  suite.test('同 id 更新不重复', () => {
    const p = defaultProfile(KERNEL);
    upsertHost(p, { id: 'cursor', platform: 'linux' });
    upsertHost(p, { id: 'cursor', platform: 'windows' });
    assertEqual(p.hosts.length, 1, 'still one');
    assertEqual(p.hosts[0].platform, 'windows', 'updated platform');
  });
});

const code = printSummary();
process.exit(code);
