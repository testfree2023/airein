#!/usr/bin/env node
/**
 * plugin-kernel-bridge — L1 SessionStart thin hook (P009).
 * Detects missing ~/.airein and injects a short warning via stdout.
 * Does NOT run airein setup (no silent B2).
 */

'use strict';

const path = require('path');

let detectKernelReady;
let formatKernelReadyWarning;
try {
  ({ detectKernelReady, formatKernelReadyWarning } = require('../lib/kernel-ready'));
} catch {
  // Plugin cache may not include lib yet — soft fail
  process.exit(0);
}

function main() {
  const result = detectKernelReady();
  const warning = formatKernelReadyWarning(result);
  if (warning) {
    // SessionStart: stdout is injected as context (avoid stderr red noise)
    process.stdout.write(warning + '\n');
  }
  process.exit(0);
}

main();
