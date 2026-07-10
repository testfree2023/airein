/**
 * airein-bridge — OpenCode TS 插件桥接（P001-cross-platform · design §6.3 · OC 独轨）
 *
 * OpenCode 无 shell hook 机制，airein .js hook 不能直接跑。本插件在 OC 进程内 spawn
 * airein 既有 .js hook（复用全部 lib/ 纯函数），把 OC 事件映射为 airein (CC) 事件：
 *
 *   tool.execute.before  → PreToolUse（exit 2 → throw Error 阻断，design §6.3）
 *   tool.execute.after   → PostToolUse（仅注入，不可阻断）
 *   session.created      → SessionStart（注入 context，fire-and-forget）
 *   experimental.session.compacting → PreCompact（output.context.push）
 *   session.idle (Stop) / UserPromptSubmit → 🚫 N/A（物理不可达，§6.3 诚实标注）
 *
 * 归一化：OC (input,output) → CC schema（input.tool→tool_name, output.args→tool_input），
 * 与 lib/stdin-normalize.js opencode 分支等价（design §6.1 ADR-2）。bridge 不 require
 * airein CommonJS（隔离 TS/JS 边界），inline 归一化 + spawn .js 让 OC 完全复用既有 hook 逻辑。
 *
 * AIREIN_ROOT：airein 仓库根（install 时 install-host.js 注入正斜杠绝对路径，替换占位符）。
 *
 * 验收（tasks T08）：tsc 静态语法合法（无运行时依赖，不 import @opencode-ai/plugin）+
 * OpenCode 实跑冒烟（人工/CI：触发 tool.execute.before 验证 spawn + throw 阻断）。**不进
 * JS 测试骨架**（守零依赖 + CommonJS）；归一化逻辑由 test-stdin-normalize.js opencode 分支覆盖。
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// install 时 install-host.js 注入（airein 仓库根，正斜杠绝对路径）；占位符保证源文件语法合法。
const AIREIN_ROOT = '__AIREIN_ROOT__';

const SPAWN_TIMEOUT = 25000;
const DEFAULT_PROFILES = 'standard,strict';

/** airein 路由器 hookId（出现在真实 hook 之前，本身不是被调度的底层 hook）。 */
const ROUTER_HOOK_IDS = new Set(['run-with-flags', 'run-hook']);

/** OC 事件 → airein (CC) 事件名 + 是否可阻断（design §6.3 桥接映射表）。 */
const OC_EVENT_MAP: Record<string, { ccEvent: string; blockable: boolean }> = {
  'tool.execute.before': { ccEvent: 'PreToolUse', blockable: true },
  'tool.execute.after': { ccEvent: 'PostToolUse', blockable: false },
  'session.created': { ccEvent: 'SessionStart', blockable: false },
  'experimental.session.compacting': { ccEvent: 'PreCompact', blockable: false },
};

/**
 * 从 airein hooks.json command 提取底层 hookId（与 lib/hook-register.js 等价）。
 * 取所有 scripts/hooks/<id>.js 匹配，过滤路由器，返回最后真实目标。
 */
function extractHookId(command: string): string | null {
  const matches = [...String(command).matchAll(/scripts\/hooks\/([a-z][a-z0-9-]*)\.js/g)];
  const real = matches.map((m) => m[1]).filter((id) => !ROUTER_HOOK_IDS.has(id));
  return real.length ? real[real.length - 1] : null;
}

/**
 * 读 airein hooks.json，建 CC 事件 → hookId[] 映射（去重保序）。
 * 模块加载时执行一次（失败时返回空映射，bridge 退化为不拦截——fail-open，不阻断宿主）。
 */
function loadHooksByEvent(): Record<string, string[]> {
  const byEvent: Record<string, string[]> = {};
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(AIREIN_ROOT, 'hooks', 'hooks.json'), 'utf8'));
    for (const [event, entries] of Object.entries<any>(raw.hooks || {})) {
      const seen = new Set<string>();
      for (const entry of entries || []) {
        for (const h of entry?.hooks || []) {
          const hookId = extractHookId(h?.command || '');
          if (hookId && !seen.has(hookId)) {
            seen.add(hookId);
            (byEvent[event] = byEvent[event] || []).push(hookId);
          }
        }
      }
    }
  } catch {
    // hooks.json 缺失/损坏 → fail-open（不阻断 OC），实跑冒烟会暴露
  }
  return byEvent;
}

const HOOKS_BY_EVENT = loadHooksByEvent();

/** OC (input,output) → CC schema（与 lib/stdin-normalize.js normalizeOpencode 等价）。 */
function normalizeCc(input: any, output: any, ccEvent: string, cwd: string | undefined): Record<string, unknown> {
  const tool = input && typeof input.tool === 'string' ? input.tool : undefined;
  const args = output && typeof output.args === 'object' ? output.args : undefined;
  return {
    tool_name: tool,
    tool_input: args,
    cwd,
    session_id: undefined,
    hook_event_name: ccEvent,
  };
}

interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Spawn 单个 airein hook（run-with-flags.js 路由 → 真实 hook）。 */
function spawnAireinHook(ccEvent: string, hookId: string, stdin: string): SpawnResult {
  const runWithFlags = path.join(AIREIN_ROOT, 'scripts', 'hooks', 'run-with-flags.js');
  const scriptRel = `scripts/hooks/${hookId}.js`;
  const result = spawnSync(process.execPath, [runWithFlags, hookId, scriptRel, DEFAULT_PROFILES], {
    input: stdin,
    encoding: 'utf8',
    timeout: SPAWN_TIMEOUT,
  });
  return {
    exitCode: typeof result.status === 'number' ? result.status : 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * 跑某 CC 事件下的全部 airein hook。blockable 事件（PreToolUse）任一 exit 2 → throw Error(stderr)
 * 阻断 OC 工具执行；不可阻断事件（PostToolUse/SessionStart/PreCompact）仅 collect 输出。
 */
function runAireinEvent(ccEvent: string, input: any, output: any, cwd: string | undefined, blockable: boolean): void {
  const hookIds = HOOKS_BY_EVENT[ccEvent] || [];
  for (const hookId of hookIds) {
    const stdin = JSON.stringify(normalizeCc(input, output, ccEvent, cwd));
    const res = spawnAireinHook(ccEvent, hookId, stdin);
    if (blockable && res.exitCode === 2 && res.stderr.trim()) {
      // design §6.3：PreToolUse exit 2 → throw Error(stderr) 阻断 OC 工具
      throw new Error(res.stderr.trim());
    }
    // 不可阻断事件 / 通过的 hook：stderr 诊断信息可转发 output（PostToolUse 仅注入）
    if (!blockable && res.stdout.trim() && output && typeof output === 'object') {
      try {
        const msg = JSON.parse(res.stdout);
        if (output.context && Array.isArray(output.context)) {
          output.context.push(typeof msg === 'string' ? msg : JSON.stringify(msg));
        }
      } catch {
        /* stdout 非 JSON（仅诊断），忽略 */
      }
    }
  }
}

/** OC 插件入口：注册 4 个可达事件 hook（Stop/UserPromptSubmit N/A 不注册）。 */
export const aireinBridge = async (ctx: any) => {
  const cwd = (ctx && typeof ctx.directory === 'string' && ctx.directory) || (typeof process.cwd === 'function' ? process.cwd() : undefined);
  return {
    'tool.execute.before': async (input: any, output: any) => {
      runAireinEvent(OC_EVENT_MAP['tool.execute.before'].ccEvent, input, output, cwd, true);
    },
    'tool.execute.after': async (input: any, output: any) => {
      runAireinEvent(OC_EVENT_MAP['tool.execute.after'].ccEvent, input, output, cwd, false);
    },
    'session.created': async (_input: any, output: any) => {
      runAireinEvent(OC_EVENT_MAP['session.created'].ccEvent, {}, output, cwd, false);
    },
    'experimental.session.compacting': async (_input: any, output: any) => {
      runAireinEvent(OC_EVENT_MAP['experimental.session.compacting'].ccEvent, {}, output, cwd, false);
    },
  };
};

export default aireinBridge;
