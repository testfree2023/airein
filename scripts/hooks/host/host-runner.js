#!/usr/bin/env node
/**
 * host-runner — 宿主归一化入口共享运行器（P001-cross-platform · design §6.1 · test-plan §3.4）
 *
 * 三宿主 entry（cursor.js/codex.js/codebuddy.js）的共享 IO 逻辑。entry 只传 host 字符串，
 * 其余归一化 + spawn + 映射全部在此。属 hooks/host/ 适配层（含 IO，非纯 lib）；阻断语义映射
 * 委托纯函数 lib/host-adapter.js mapHookResult。
 *
 * 链路（design §6.1）：
 *   宿主 raw stdin → readStdin（剥 BOM via parseStdinData）→ stdinNormalize(host) → CC schema
 *   → spawnSync run-with-flags.js <hookId> scripts/hooks/<hookId>.js（既有，零改）
 *   → exit 0/2 + stderr → mapHookResult(host) → 宿主阻断格式输出
 *
 * argv: <hookId> [profilesCsv]
 *   hookId       既有 airein hook id（如 test-guard / doc-file-warning）
 *   profilesCsv  可选 ECC profile（透传 run-with-flags isHookEnabled；省略则默认 standard=true）
 *
 * 项目根定位（design §6.1 第3步）：spawn 子进程 cwd = stdin 归一化 cwd（CDX 从 stdin）
 *   → CURSOR_PROJECT_DIR env（CUR）→ entry process.cwd()（兜底）。
 */

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const { parseStdinData } = require('../../lib/utils');
const { stdinNormalize } = require('../../lib/stdin-normalize');
const { mapHookResult, KNOWN_HOSTS } = require('../../lib/host-adapter');

const MAX_STDIN = 1024 * 1024;
const SPAWN_TIMEOUT = 25000;

/** 同步读全部 stdin（utf8），上限 MAX_STDIN 防爆。 */
function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

/**
 * Resolve the project root for spawning the child airein hook.
 * CDX: stdin cwd；CUR: CURSOR_PROJECT_DIR env；兜底 entry process.cwd()。
 */
function resolveCwd(host, ccSchema) {
  if (ccSchema && typeof ccSchema.cwd === 'string' && ccSchema.cwd.trim()) {
    return ccSchema.cwd;
  }
  if (host === 'cursor' && process.env.CURSOR_PROJECT_DIR) {
    return process.env.CURSOR_PROJECT_DIR;
  }
  return process.cwd();
}

/**
 * Run the host entry for `host`: normalize stdin → spawn airein hook → map output → exit.
 * Fail-open: any unexpected error → stderr + exit 0（不阻断）.
 * @param {string} host - One of KNOWN_HOSTS (codebuddy/codex/cursor).
 */
function runHostEntry(host) {
  return Promise.resolve().then(() => {
    if (!KNOWN_HOSTS.includes(host)) {
      throw new Error(`host-runner: unknown host "${host}" (known: ${KNOWN_HOSTS.join('/')})`);
    }
    const hookId = process.argv[2];
    if (!hookId) {
      throw new Error('host-runner: missing <hookId> argv[2]');
    }
    return readStdin().then((rawStr) => {
      // 归一化：剥 BOM + JSON.parse（畸形 → {}），再 stdinNormalize 到 CC schema
      let rawObj;
      try {
        rawObj = parseStdinData(rawStr);
      } catch {
        rawObj = {};
      }
      const ccSchema = stdinNormalize(host, rawObj);
      const ccStdin = JSON.stringify(ccSchema);

      const runWithFlags = path.resolve(__dirname, '..', 'run-with-flags.js');
      const scriptRel = `scripts/hooks/${hookId}.js`;
      const args = [runWithFlags, hookId, scriptRel];
      const profilesCsv = process.argv[3];
      if (profilesCsv) args.push(profilesCsv);

      const result = spawnSync(process.execPath, args, {
        input: ccStdin,
        encoding: 'utf8',
        env: { ...process.env, AIREIN_HOST: host },
        cwd: resolveCwd(host, ccSchema),
        timeout: SPAWN_TIMEOUT,
      });

      const mapped = mapHookResult(host, {
        exitCode: Number.isInteger(result.status) ? result.status : null,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
      });

      if (result.error) {
        // spawn 本身失败（node 缺失/超时）：stderr 记录，仍走 mapHookResult（null → fail-open）
        process.stderr.write(`[host:${host}] spawn error: ${result.error.message}\n`);
      }
      if (mapped.stdout) process.stdout.write(mapped.stdout);
      if (mapped.stderr) process.stderr.write(mapped.stderr);
      process.exit(mapped.exitCode);
    });
  }).catch((err) => {
    // fail-open：归一化/spawn 前任何异常不阻断宿主
    process.stderr.write(`[host:${host}] ${err.message}\n`);
    process.exit(0);
  });
}

module.exports = { runHostEntry, resolveCwd };
