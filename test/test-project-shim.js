/**
 * test-project-shim.js — P004 1.2: project-shim（CC rules symlink）
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { describe, assertEqual, assert, assertOk, printSummary } = require('./helpers');
const {
  planCcRulesShim,
  ensureCcRulesShim,
  CC_RULES_SHIM_REL,
} = require('../scripts/lib/project-shim');
const { AIREIN_PROJECT_DIR } = require('../scripts/lib/project-paths');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-shim-'));

function mk(name) {
  const root = path.join(TMP, name);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function isSymlinkOrJunction(p) {
  try {
    const st = fs.lstatSync(p);
    return st.isSymbolicLink() || st.isDirectory(); // junctions often look like dir on win32
  } catch {
    return false;
  }
}

function readShimTarget(projectRoot) {
  const shim = path.join(projectRoot, ...CC_RULES_SHIM_REL.split('/'));
  const canonical = path.join(projectRoot, AIREIN_PROJECT_DIR, 'rules');
  if (!fs.existsSync(shim)) return null;
  try {
    if (fs.lstatSync(shim).isSymbolicLink()) {
      return fs.readlinkSync(shim);
    }
  } catch { /* junction */ }
  // After ensure, canonical content should be visible through shim
  if (fs.existsSync(path.join(shim, 'conventions-test.md'))) {
    return canonical;
  }
  return fs.realpathSync(shim);
}

describe('project-shim: planCcRulesShim', (suite) => {
  suite.test('计划创建 .airein/rules 与 .claude/rules shim', () => {
    const root = mk('plan');
    const plan = planCcRulesShim(root);
    assertOk(plan.actions.length >= 2, 'has actions');
    assertContainsAction(plan, 'mkdir', path.join(root, '.airein', 'rules'));
    assertContainsAction(plan, 'link', path.join(root, '.claude', 'rules'));
  });

  suite.test('已存在非链接 .claude/rules 时报错', () => {
    const root = mk('plan-block');
    const rules = path.join(root, '.claude', 'rules');
    fs.mkdirSync(rules, { recursive: true });
    fs.writeFileSync(path.join(rules, 'x.md'), 'block');
    const plan = planCcRulesShim(root);
    assertOk(plan.errors.length > 0, 'errors when real dir blocks shim');
  });
});

describe('project-shim: ensureCcRulesShim', (suite) => {
  suite.test('默认 skip：未请求时不创建 .claude/rules', () => {
    const root = mk('skip-default');
    const result = ensureCcRulesShim(root);
    assertEqual(result.ok, true, 'ok');
    assertEqual(result.skipped, true, 'skipped');
    assert(!fs.existsSync(path.join(root, '.claude', 'rules')), 'no shim');
  });

  suite.test('ccShim:true 才创建 shim', () => {
    const root = mk('opt-in');
    const result = ensureCcRulesShim(root, { ccShim: true });
    assertEqual(result.ok, true, 'ok');
    assertOk(fs.existsSync(path.join(root, '.claude', 'rules')), 'shim created');
  });

  suite.test('创建后 shim 可读 canonical 内容', () => {
    const root = mk('ensure');
    const result = ensureCcRulesShim(root, { ccShim: true });
    assertEqual(result.ok, true, 'ok');
    const canonical = path.join(root, '.airein', 'rules');
    fs.writeFileSync(path.join(canonical, 'conventions-test.md'), 'paths: []\n---\n@test\n');
    const viaShim = path.join(root, '.claude', 'rules', 'conventions-test.md');
    assertOk(fs.existsSync(viaShim), 'readable through shim');
  });

  suite.test('dryRun 不写盘', () => {
    const root = mk('dry');
    const result = ensureCcRulesShim(root, { dryRun: true });
    assertEqual(result.ok, true, 'dry ok');
    assert(!fs.existsSync(path.join(root, '.claude', 'rules')), 'no shim on disk');
  });

  suite.test('幂等：重复 ensure 仍 ok', () => {
    const root = mk('idempotent');
    assertOk(ensureCcRulesShim(root, { ccShim: true }).ok, 'first');
    assertOk(ensureCcRulesShim(root, { ccShim: true }).ok, 'second');
  });

  suite.test('误指向内核的 legacy symlink 会重链到项目 .airein/rules', () => {
    if (process.platform === 'win32') return;
    const root = mk('legacy-kernel');
    const kernelRules = path.join(TMP, 'fake-kernel', 'rules');
    fs.mkdirSync(kernelRules, { recursive: true });
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    fs.symlinkSync(kernelRules, path.join(root, '.claude', 'rules'));
    const result = ensureCcRulesShim(root, { ccShim: true });
    assertEqual(result.ok, true, 'relink ok');
    const shim = path.join(root, '.claude', 'rules');
    const canonical = path.join(root, '.airein', 'rules');
    assertOk(fs.existsSync(canonical), 'canonical dir');
    assertEqual(fs.realpathSync(shim), fs.realpathSync(canonical), 'shim → project canonical');
  });
});

function assertContainsAction(plan, type, absPath) {
  const hit = plan.actions.some((a) => a.type === type && path.resolve(a.path) === path.resolve(absPath));
  assert(hit, `expected action ${type} at ${absPath}`);
}

const code = printSummary();
process.exit(code);
