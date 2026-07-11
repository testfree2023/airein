/**
 * hook-register — K3 hook 注册配置翻译（P001-cross-platform · design §6.1-6.4 · deployment §3）
 *
 * 纯函数：读 airein `hooks/hooks.json`（CC 命令真相源，20 hook / 6 事件）→ 按宿主 hook 配置格式
 * 翻译为各宿主 settings 文件（描述，不落盘——install-host.js 据此写盘）。归一化入口
 * （`scripts/hooks/host/{cursor,codex,codebuddy}.js`）留在 airein 仓库（install 不复制——
 * host-runner.js 靠 __dirname 定位 ../run-with-flags.js），command 由 install 时注入仓库绝对
 * 路径引用（aireinRoot 正斜杠；仿 OC bridge.ts AIREIN_ROOT 占位符模式）。
 *
 * 事件映射（design §6.4 矩阵）：
 *   CUR .cursor/hooks.json — 事件名 camelCase，node "<aireinRoot>/scripts/hooks/host/cursor.js" <hookId>
 *   CDX .codex/config.toml  — PascalCase，["node","<aireinRoot>/scripts/hooks/host/codex.js","<hookId>"]；Windows 加 command_windows（design §8）
 *   CB  .codebuddy/settings.json — PascalCase，node "<aireinRoot>/scripts/hooks/host/codebuddy.js" <hookId>（exit 2 原生透传）
 *   OC  opencode.json — plugin 注册引用 bridge.ts（TS 插件独轨）；Stop/UserPromptSubmit 物理不可达 → errors 标 N/A（§6.3）
 *
 * Bug A/B（真机 smoke 发现，2026-07-10）：曾用 bash + $CURSOR_PROJECT_DIR/$PLUGIN_ROOT/
 * $CODEBUDDY_PLUGIN_ROOT 引用入口 → (A) 运行时变量指用户项目非仓库，入口不可达；
 * (B) bash 读 node-shebang 脚本 fail-open。改为 node + install 注入仓库绝对路径。
 *
 * 不变量：hookId 从 hooks.json command 的 `scripts/hooks/<name>.js` 提取；按 (event, hookId) 稳定排序 → 幂等。
 */

'use strict';

/** CUR 事件名映射（CC PascalCase → cursor camelCase，design §6.4）。 */
const EVENT_CAMEL = {
  PreToolUse: 'preToolUse',
  PostToolUse: 'postToolUse',
  SessionStart: 'sessionStart',
  Stop: 'stop',
  UserPromptSubmit: 'beforeSubmitPrompt',
  PreCompact: 'preCompact',
};

/** OC 物理不可达事件（design §6.3 N/A 清单）—— 跑到这俩要报错，不静默注册悬空 hook。 */
const OC_NA_EVENTS = ['Stop', 'UserPromptSubmit'];

const KNOWN_HOSTS = ['cursor', 'codex', 'codebuddy', 'opencode'];

/** 已知路由器 hookId——出现在真实 hook 目标之前，本身不是被调度的底层 hook（M1 回归源）。 */
const ROUTER_HOOK_IDS = new Set(['run-with-flags', 'run-hook']);

/**
 * Extract the底层 hook script name (hookId) from an airein hooks.json command string.
 * e.g. `bash ".../run-hook.sh" ".../test-guard.js"` → "test-guard"
 *      `bash ".../run-with-flags.js" "post:quality-gate" "scripts/hooks/quality-gate.js" ...` → "quality-gate"
 * @param {string} command
 * @returns {string|null}
 */
function extractHookId(command) {
  // 取所有 scripts/hooks/<id>.js 匹配，过滤已知路由器，返回最后一个真实目标。
  // 路由命令里真实 hook 总在 router 之后；run-hook 直连则仅一个 match。
  const matches = [...String(command).matchAll(/scripts\/hooks\/([a-z][a-z0-9-]*)\.js/g)];
  const real = matches.map((m) => m[1]).filter((id) => !ROUTER_HOOK_IDS.has(id));
  return real.length ? real[real.length - 1] : null;
}

/**
 * Collect (event, hookId) pairs from hooks.json, sorted by (event, hookId) for idempotency.
 * @param {{hooks?:Object<string,Array<{hooks:Array<{command:string}>}>}>}} hooksJson
 * @returns {Array<{event:string, hookId:string}>}
 */
function collectHooks(hooksJson) {
  const out = [];
  const events = Object.keys(hooksJson.hooks || {}).sort();
  for (const event of events) {
    for (const entry of hooksJson.hooks[event] || []) {
      for (const h of entry.hooks || []) {
        const hookId = extractHookId(h.command || '');
        if (hookId) out.push({ event, hookId });
      }
    }
  }
  return out;
}

/** Group hookIds by event, dedupe + sort within each event (idempotency). */
function groupByEvent(hooks) {
  const by = {};
  for (const h of hooks) {
    (by[h.event] = by[h.event] || []).push(h.hookId);
  }
  for (const e of Object.keys(by)) {
    by[e] = [...new Set(by[e])].sort();
  }
  return by;
}

function renderCursor(hooks, aireinRoot) {
  // Cursor hooks.json 扁平 schema（≠ CC 嵌套 · 真机 Cursor IDE smoke 发现 2026-07-10）：
  // Cursor 每个 definition 直接持有 {command, type, ...}，无 {matcher, hooks:[...]} 嵌套层
  // （官方 docs：「The hooks object maps hook names to arrays of hook definitions. Each
  // definition currently supports a command property」）。airein 曾照搬 CC 三层嵌套 → Cursor
  // 解析 definition 时顶层找不到 command → 整个 hook 注册失败 → IDE 完全不触发（「matches
  // Claude Code behavior」仅指 exit 2=deny 行为兼容，非配置 schema 兼容）。CLI 冒烟能过是
  // 因为直接 spawn cursor.js 绕过了 Cursor 自身的 hooks.json 解析。
  // 修：顶层 version:1 + definition 扁平 + 省略 matcher（type=object；省略=对所有工具触发，
  // docs: preToolUse「fires for all tool types」）。CodeBuddy 仍用 CC 嵌套（design §6.2 同 CC，
  // 待 CB 真机校准）—— 仅 Cursor 扁平化。
  const byEvent = groupByEvent(hooks);
  const cfg = { version: 1, hooks: {} };
  for (const event of Object.keys(byEvent).sort()) {
    const camel = EVENT_CAMEL[event] || event.charAt(0).toLowerCase() + event.slice(1);
    cfg.hooks[camel] = byEvent[event].map((hookId) => ({
      type: 'command',
      command: `node "${aireinRoot}/scripts/hooks/host/cursor.js" ${hookId}`,
    }));
  }
  return JSON.stringify(cfg, null, 2);
}

function renderCodex(hooks, platform, aireinRoot) {
  const isWin = platform === 'windows';
  const byEvent = groupByEvent(hooks);
  const entry = `${aireinRoot}/scripts/hooks/host/codex.js`;
  const lines = [
    '# codex config.toml（airein · 生成，勿手改 — uninstall 用 .airein-install-state.json）',
    '# command 引用仓库内归一化入口（install 注入 aireinRoot 绝对路径，Bug A 修复）',
    '',
  ];
  for (const event of Object.keys(byEvent).sort()) {
    for (const hookId of byEvent[event]) {
      lines.push('[[hooks]]');
      lines.push(`event = "${event}"`);
      lines.push(`command = ["node", "${entry}", "${hookId}"]`);
      if (isWin) {
        // design §8：CDX 原生 command_windows 字段——与 command 同值是有意（满足 CDX schema：
        // CDX on Windows 据此字段解析 node 可执行路径；airein 归一化入口已是 node 脚本，
        // 无需 Windows 特殊调用）。分发层照填，非 airein 特殊逻辑。
        lines.push(`command_windows = ["node", "${entry}", "${hookId}"]`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

function renderCodebuddy(hooks, aireinRoot) {
  const byEvent = groupByEvent(hooks);
  const cfg = { hooks: {} };
  for (const event of Object.keys(byEvent).sort()) {
    // CB schema 同 CC（design §6.2），exit 2 原生透传，零阻断映射 —— 直接用 PascalCase 事件名
    cfg.hooks[event] = byEvent[event].map((hookId) => ({
      matcher: '*',
      hooks: [{
        type: 'command',
        command: `node "${aireinRoot}/scripts/hooks/host/codebuddy.js" ${hookId}`,
      }],
    }));
  }
  return JSON.stringify(cfg, null, 2);
}

function renderOpenCode() {
  // OC：事件由 bridge.ts 内部处理（TS 插件独轨，design §6.3）；opencode.json 只注册 plugin + instructions。
  // bridge.ts 实体在 T08 落地（P001 tasks T08）；此处只生成引用配置，不写 bridge.ts 本体。
  return JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    instructions: ['AGENTS.md'],
    plugins: ['.opencode/plugin/airein-bridge.ts'],
  }, null, 2);
}

/**
 * Translate airein hooks.json into a host's hook-register config file(s).
 * @param {string} host - cursor/codex/codebuddy/opencode
 * @param {object} hooksJson - airein hooks/hooks.json parsed
 * @param {{platform?:string, aireinRoot?:string}} [opts] - aireinRoot = install 注入的仓库绝对路径
 *   （正斜杠）；非 OC 宿主必填（Bug A 修复：command 据此引用仓库入口）。OC 独轨豁免。
 * @returns {{files:Array<{path:string,content:string}>, errors:string[]}}
 *   OC: Stop/UserPromptSubmit → errors (N/A), not registered.
 * @throws {Error} unknown host / 非 OC 宿主缺 aireinRoot
 */
/** 检测当前平台（与 install-host.js 一致；内联此处避免循环 require）。 */
function detectPlatform() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  return 'linux';
}

function translateHooks(host, hooksJson, opts) {
  const platform = (opts && opts.platform) || detectPlatform();
  if (!KNOWN_HOSTS.includes(host)) {
    throw new Error(`translateHooks: unknown host "${host}" (known: ${KNOWN_HOSTS.join('/')})`);
  }
  // Bug A 修复（真机 smoke）：入口脚本留在仓库（install 不复制，host-runner.js 靠 __dirname
  // 定位 ../run-with-flags.js），command 必须 install 时注入仓库绝对路径（aireinRoot 正斜杠）。
  // $CURSOR_PROJECT_DIR 运行时 = 用户项目而非仓库 → 入口不可达；$PLUGIN_ROOT/$CODEBUDDY_PLUGIN_ROOT
  // 同理不可靠。仿 OC bridge.ts AIREIN_ROOT 模式。OC 独轨（bridge.ts 副本自带 AIREIN_ROOT），豁免。
  const aireinRoot = opts && opts.aireinRoot;
  if (host !== 'opencode' && !aireinRoot) {
    throw new Error(
      `translateHooks: opts.aireinRoot required for host "${host}" (install-time absolute path injection; Bug A fix). ` +
        'OC (opencode) is exempt — it uses bridge.ts with AIREIN_ROOT placeholder.',
    );
  }
  const errors = [];
  const files = [];
  const hooks = collectHooks(hooksJson);

  if (host === 'opencode') {
    const active = [];
    const naSet = new Set();
    for (const h of hooks) {
      if (OC_NA_EVENTS.includes(h.event)) naSet.add(h.event);
      else active.push(h);
    }
    for (const e of [...naSet].sort()) {
      errors.push(
        `opencode: ${e} 物理不可达（OC 事件集无此项）— 已标 N/A，不注册悬空 hook，详见 design §6.3`,
      );
    }
    files.push({ path: 'opencode.json', content: renderOpenCode() });
    return { files, errors };
  }

  let cfgPath;
  let content;
  if (host === 'cursor') {
    cfgPath = '.cursor/hooks.json';
    content = renderCursor(hooks, aireinRoot);
  } else if (host === 'codex') {
    cfgPath = '.codex/config.toml';
    content = renderCodex(hooks, platform, aireinRoot);
  } else {
    cfgPath = '.codebuddy/settings.json';
    content = renderCodebuddy(hooks, aireinRoot);
  }
  files.push({ path: cfgPath, content });
  return { files, errors };
}

module.exports = {
  translateHooks,
  extractHookId,
  collectHooks,
  EVENT_CAMEL,
  OC_NA_EVENTS,
  KNOWN_HOSTS,
};
