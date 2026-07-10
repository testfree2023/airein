/**
 * host-adapter — 宿主阻断语义映射纯函数（P001-cross-platform · design §6.2 · test-plan §3.4）
 *
 * 把 airein hook 的 CC 协议输出（exit 0/2 + stderr）映射成各 CC 兼容宿主期望的阻断格式。
 * 纯函数：无 IO，只做 {exitCode,stdout,stderr} → {exitCode,stdout,stderr} 变换；可单测。
 * entry（scripts/hooks/host/*.js → host-runner.js）负责 IO，调本函数决定最终输出。
 *
 * 映射策略（design §6.2 表）：
 *   exit 2（阻断）：
 *     CB  透传（stdout/stderr/exit 原样——CB exit 2 原生 CC 兼容）
 *     CDX stdout {permissionDecision:"deny", permissionDecisionReason}（CDX 推荐 stdout JSON）
 *     CUR stdout {permission:"deny", user_message}（CUR stdout JSON）
 *     三宿主均保留 exit 2 + stderr——认 exit 2 的宿主阻断，认 stdout JSON 的也阻断（双保险，
 *     同时满足 test-plan §3.4 「exit 2+stderr」与「stdout permissionDecision/permission」用例）。
 *   exit 0（允许）：三宿主透传 stdout（hook passthrough）+ exit 0。
 *   其他非 0 / null（hook 错误 / spawn 崩溃）：fail-open exit 0（不阻断，等同失败开放）。
 */

'use strict';

const KNOWN_HOSTS = ['codebuddy', 'codex', 'cursor'];

/**
 * Map an airein (CC-protocol) hook child result to a host-specific output.
 *
 * @param {string} host - codebuddy | codex | cursor
 * @param {{exitCode:number|null, stdout:string, stderr:string}} child
 *   `child.exitCode` null indicates spawn failure (process crashed/killed).
 * @returns {{exitCode:number, stdout:string, stderr:string}}
 */
function mapHookResult(host, child) {
  const stdout = child.stdout || '';
  const stderr = child.stderr || '';

  // exit 0（允许）：透传
  if (child.exitCode === 0) {
    return { exitCode: 0, stdout, stderr };
  }
  // 非 0 且非 2（含 null spawn 崩溃）：fail-open
  if (child.exitCode !== 2) {
    return { exitCode: 0, stdout, stderr };
  }

  // exit 2（阻断）：按宿主映射 stdout JSON（CB 透传），保留 exit 2 + stderr
  switch (host) {
    case 'codex':
      return {
        exitCode: 2,
        stdout: JSON.stringify({ permissionDecision: 'deny', permissionDecisionReason: stderr.trim() }),
        stderr,
      };
    case 'cursor':
      return {
        exitCode: 2,
        stdout: JSON.stringify({ permission: 'deny', user_message: stderr.trim() }),
        stderr,
      };
    case 'codebuddy':
      return { exitCode: 2, stdout, stderr };
    default:
      // 未知宿主保守透传（host-runner 入口已 fail-fast 校验，此处理论不达）
      return { exitCode: 2, stdout, stderr };
  }
}

module.exports = {
  mapHookResult,
  KNOWN_HOSTS,
};
