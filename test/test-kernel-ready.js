/**
 * Spec: scripts/lib/kernel-ready.js — detect ~/.airein kernel for B→C bridge (P009)
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  describe, assertEqual, assertOk, assertContains, projectRoot, printSummary,
} = require('./helpers');

const {
  detectKernelReady,
  REASON_KERNEL_MISSING,
  REASON_KERNEL_INCOMPLETE,
  DEFAULT_NEXT_CMD,
} = require(path.join(projectRoot(), 'scripts', 'lib', 'kernel-ready'));

function makeFakeFs(files) {
  const set = new Set(files.map((p) => path.resolve(p).replace(/\\/g, '/').toLowerCase()));
  return {
    existsSync(p) {
      const key = path.resolve(p).replace(/\\/g, '/').toLowerCase();
      return set.has(key);
    },
    readFileSync(p, enc) {
      const key = path.resolve(p).replace(/\\/g, '/').toLowerCase();
      if (!set.has(key)) {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      }
      if (String(p).endsWith('VERSION') || key.endsWith('/version')) return '2.06\n';
      return '{}';
    },
  };
}

describe('detectKernelReady', suite => {
  suite.test('missing kernel dir → KERNEL_MISSING + nextCmd', () => {
    const home = path.join(os.tmpdir(), 'airein-kr-missing-' + process.pid);
    const result = detectKernelReady({
      homeDir: home,
      fs: makeFakeFs([]),
    });
    assertEqual(result.ok, false, 'not ok');
    assertEqual(result.reason, REASON_KERNEL_MISSING, 'missing reason');
    assertContains(result.nextCmd, 'setup', 'points at setup');
    assertOk(result.kernelRoot, 'reports kernelRoot');
  });

  suite.test('dir without VERSION/hooks → KERNEL_INCOMPLETE', () => {
    const home = path.join(os.tmpdir(), 'kr-home');
    const kernel = path.join(home, '.airein');
    const result = detectKernelReady({
      homeDir: home,
      fs: makeFakeFs([kernel]),
    });
    assertEqual(result.ok, false, 'not ok');
    assertEqual(result.reason, REASON_KERNEL_INCOMPLETE, 'incomplete');
    assertContains(result.nextCmd, 'setup', 'setup next');
  });

  suite.test('VERSION + hooks.json + scripts/lib → ok', () => {
    const home = path.join(os.tmpdir(), 'kr-ready-home');
    const kernel = path.join(home, '.airein');
    const files = [
      kernel,
      path.join(kernel, 'VERSION'),
      path.join(kernel, 'hooks', 'hooks.json'),
      path.join(kernel, 'scripts', 'lib'),
    ];
    const result = detectKernelReady({
      homeDir: home,
      fs: makeFakeFs(files),
    });
    assertEqual(result.ok, true, 'ok');
    assertEqual(result.reason, null, 'no reason');
    assertEqual(result.nextCmd, null, 'no nextCmd when ready');
    assertEqual(result.version, '2.06', 'reads VERSION');
  });

  suite.test('twice with same fs → identical (read-only / idempotent)', () => {
    const home = path.join(os.tmpdir(), 'kr-idemp');
    const kernel = path.join(home, '.airein');
    const fake = makeFakeFs([
      kernel,
      path.join(kernel, 'VERSION'),
      path.join(kernel, 'hooks', 'hooks.json'),
      path.join(kernel, 'scripts', 'lib'),
    ]);
    const a = detectKernelReady({ homeDir: home, fs: fake });
    const b = detectKernelReady({ homeDir: home, fs: fake });
    assertEqual(JSON.stringify(a), JSON.stringify(b), 'idempotent');
  });

  suite.test('DEFAULT_NEXT_CMD is documented setup invocation', () => {
    assertContains(DEFAULT_NEXT_CMD, 'airein setup', 'default cmd');
  });
});

process.exit(printSummary());
