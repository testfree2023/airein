#!/usr/bin/env node
/**
 * Test: dashboard kernel path resolution (standalone ~/dashboard → ~/.airein)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  describe, assertEqual, assertOk, printSummary,
} = require('../../test/helpers');

const { resolveKernelRoot, isKernelRoot } = require('../lib/kernel-resolve');

function mkTmp(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), name));
}

describe('kernel-resolve: isKernelRoot', (suite) => {
  suite.test('true when scripts/lib/utils.js exists', () => {
    const dir = mkTmp('kr-');
    fs.mkdirSync(path.join(dir, 'scripts', 'lib'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'scripts', 'lib', 'utils.js'), 'module.exports = {};\n');
    try {
      assertOk(isKernelRoot(dir), 'detects kernel');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('kernel-resolve: resolveKernelRoot', (suite) => {
  suite.test('prefers config.json kernelRoot over legacy .claude', () => {
    const home = mkTmp('kr-home-');
    const dash = path.join(home, 'dashboard');
    const kernel = path.join(home, '.airein');
    const legacy = path.join(home, '.claude');
    fs.mkdirSync(dash, { recursive: true });
    for (const root of [kernel, legacy]) {
      fs.mkdirSync(path.join(root, 'scripts', 'lib'), { recursive: true });
      fs.writeFileSync(path.join(root, 'scripts', 'lib', 'utils.js'), 'module.exports = {};\n');
    }
    fs.writeFileSync(path.join(dash, 'config.json'), JSON.stringify({ kernelRoot: kernel }) + '\n');
    try {
      assertEqual(resolveKernelRoot(dash), kernel, 'uses config kernelRoot');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  suite.test('falls back to ~/.airein when no config', () => {
    const home = mkTmp('kr-home2-');
    const dash = path.join(home, 'dashboard');
    const kernel = path.join(home, '.airein');
    fs.mkdirSync(dash, { recursive: true });
    fs.mkdirSync(path.join(kernel, 'scripts', 'lib'), { recursive: true });
    fs.writeFileSync(path.join(kernel, 'scripts', 'lib', 'utils.js'), 'module.exports = {};\n');
    const oldHome = process.env.HOME;
    process.env.HOME = home;
    if (process.platform === 'win32') process.env.USERPROFILE = home;
    try {
      assertEqual(resolveKernelRoot(dash), kernel, 'finds ~/.airein');
    } finally {
      process.env.HOME = oldHome;
      if (process.platform === 'win32') process.env.USERPROFILE = oldHome;
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  suite.test('throws with helpful message when kernel missing', () => {
    const dash = mkTmp('kr-dash-');
    let threw = false;
    try {
      resolveKernelRoot(dash);
    } catch (err) {
      threw = true;
      assertOk(String(err.message).includes('cannot find airein kernel'), err.message);
    } finally {
      fs.rmSync(dash, { recursive: true, force: true });
    }
    assertOk(threw, 'throws when no kernel');
  });
});

process.exit(printSummary());
