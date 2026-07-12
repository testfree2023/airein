/**
 * test-asset-delivery.js — delivery 策略（skills/commands unified|copy；rules deploy）
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { describe, assertEqual, assert, assertOk, printSummary } = require('./helpers');
const {
  normalizeDelivery,
  DEFAULT_DELIVERY,
  deployCcRules,
  deliverAssetDir,
  listAireinCcRuleFiles,
} = require('../scripts/lib/asset-delivery');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-asset-'));

function seedKernel(kernel) {
  fs.mkdirSync(path.join(kernel, 'rules'), { recursive: true });
  fs.mkdirSync(path.join(kernel, '.claude', 'rules'), { recursive: true });
  fs.mkdirSync(path.join(kernel, 'skills', 'x'), { recursive: true });
  fs.mkdirSync(path.join(kernel, 'commands'), { recursive: true });
  fs.writeFileSync(path.join(kernel, 'rules', '00-iron-rules.md'), '# iron\n');
  fs.writeFileSync(path.join(kernel, 'rules', '10-architecture.md'), '# arch\n');
  fs.writeFileSync(path.join(kernel, '.claude', 'rules', 'conventions-javascript.md'), '---\npaths: []\n---\n@include docs/x\n');
  fs.writeFileSync(path.join(kernel, 'skills', 'x', 'SKILL.md'), '---\nname: x\n---\n');
  fs.writeFileSync(path.join(kernel, 'commands', 'tdd.md'), '# tdd\n');
}

describe('asset-delivery: normalizeDelivery', (suite) => {
  suite.test('默认 unified', () => {
    assertEqual(normalizeDelivery(), DEFAULT_DELIVERY, 'default');
    assertEqual(normalizeDelivery('unified'), 'unified', 'explicit unified');
  });

  suite.test('copy 合法', () => {
    assertEqual(normalizeDelivery('copy'), 'copy', 'copy');
  });

  suite.test('非法值抛错', () => {
    let threw = false;
    try {
      normalizeDelivery('symlink');
    } catch (e) {
      threw = true;
      assertOk(e.message.includes('delivery'), 'message');
    }
    assert(threw, 'throws');
  });
});

describe('asset-delivery: deployCcRules', (suite) => {
  suite.test('部署 L0 + L1 薄壳；保留用户自有规则', () => {
    const kernel = path.join(TMP, 'k-deploy');
    const dest = path.join(TMP, 'cc-rules');
    seedKernel(kernel);
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'my-custom.md'), '# custom\n');
    const r = deployCcRules({ kernelRoot: kernel, destRulesDir: dest });
    assertEqual(r.ok, true, 'ok');
    assertOk(fs.existsSync(path.join(dest, '00-iron-rules.md')), 'L0');
    assertOk(fs.existsSync(path.join(dest, 'conventions-javascript.md')), 'L1 shell');
    assertEqual(fs.readFileSync(path.join(dest, 'my-custom.md'), 'utf8'), '# custom\n', 'user rule kept');
    assertEqual(r.deployed.sort().join(','), listAireinCcRuleFiles(kernel).sort().join(','), 'deployed list');
  });

  suite.test('upgrade 覆盖 airein 规则不碰用户文件', () => {
    const kernel = path.join(TMP, 'k-up');
    const dest = path.join(TMP, 'cc-rules-up');
    seedKernel(kernel);
    deployCcRules({ kernelRoot: kernel, destRulesDir: dest });
    fs.writeFileSync(path.join(kernel, 'rules', '00-iron-rules.md'), '# iron v2\n');
    fs.writeFileSync(path.join(dest, 'my-own.md'), '# own\n');
    deployCcRules({ kernelRoot: kernel, destRulesDir: dest });
    assertEqual(fs.readFileSync(path.join(dest, '00-iron-rules.md'), 'utf8'), '# iron v2\n', 'overwritten');
    assertEqual(fs.readFileSync(path.join(dest, 'my-own.md'), 'utf8'), '# own\n', 'user kept');
  });
});

describe('asset-delivery: deliverAssetDir', (suite) => {
  suite.test('unified 创建目录软链', () => {
    const kernel = path.join(TMP, 'k-link');
    const dest = path.join(TMP, 'dest-link');
    seedKernel(kernel);
    const r = deliverAssetDir({
      srcDir: path.join(kernel, 'skills'),
      destDir: dest,
      mode: 'unified',
    });
    assertEqual(r.ok, true, 'ok');
    assertEqual(r.method, 'link', 'link');
    const st = fs.lstatSync(dest);
    assertOk(st.isSymbolicLink() || (process.platform === 'win32' && fs.existsSync(path.join(dest, 'x', 'SKILL.md'))), 'link or junction');
    assertOk(fs.existsSync(path.join(dest, 'x', 'SKILL.md')), 'skill visible');
  });

  suite.test('copy 同步内核条目并保留目标目录额外文件', () => {
    const kernel = path.join(TMP, 'k-copy');
    const dest = path.join(TMP, 'dest-copy');
    seedKernel(kernel);
    fs.mkdirSync(path.join(dest, 'foreign'), { recursive: true });
    fs.writeFileSync(path.join(dest, 'foreign', 'SKILL.md'), '---\nname: foreign\n---\n');
    const r = deliverAssetDir({
      srcDir: path.join(kernel, 'skills'),
      destDir: dest,
      mode: 'copy',
    });
    assertEqual(r.ok, true, 'ok');
    assertEqual(r.method, 'copy', 'copy');
    assertOk(fs.existsSync(path.join(dest, 'x', 'SKILL.md')), 'kernel skill');
    assertOk(fs.existsSync(path.join(dest, 'foreign', 'SKILL.md')), 'foreign kept');
    assert(!fs.lstatSync(dest).isSymbolicLink(), 'not symlink');
  });
});

const code = printSummary();
process.exit(code);
