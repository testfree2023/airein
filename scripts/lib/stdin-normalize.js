/**
 * stdin-normalize — 宿主 stdin → CC schema 归一化（P001-cross-platform · K3 核心 · design §6.1 ADR-2）
 *
 * 把任意宿主 hook 的原生输入归一化为 CC schema（tool_name/tool_input/cwd/session_id/
 * hook_event_name），让 airein 既有 20 个 hook 脚本零改动——所有字段差异吸收在这一边界。
 *
 * 纯函数（无 IO），可单测；既有 hook 经 `run-with-flags.js` 拿到归一化后的对象，不感知宿主。
 *
 * 防御性：畸形/非对象输入不抛错，返回带 `_normalizeErrors` 的对象（对应 CDX Windows Stop
 * hook stdin 畸形 #23784——宁可放行也不让 hook 崩溃）。未知 host 抛错（fail-fast，不静默）。
 *
 * 注：CUR 工具字段映射（tool:{name,input} → 扁平）基于 Cursor Agent hook schema 推断，
 *     design §3「字段名异」未列精确字段；真实样本待 T05 集成校准，扁平字段作 fallback。
 */

'use strict';

/** airein 首版支持的宿主（未知 host 抛错，防静默漂移）。 */
const KNOWN_HOSTS = ['codebuddy', 'codex', 'cursor', 'opencode'];

/**
 * Cursor 事件名 camelCase → CC PascalCase 映射（design §6.4）。
 * 未列出的（已是 PascalCase 或未知事件）原值直传，保证幂等。
 */
const CUR_EVENT_MAP = {
  preToolUse: 'PreToolUse',
  postToolUse: 'PostToolUse',
  sessionStart: 'SessionStart',
  stop: 'Stop',
  beforeSubmitPrompt: 'UserPromptSubmit',
  preCompact: 'PreCompact',
};

/**
 * 判定 plain object（排除 null/数组/原始值）。
 * @param {*} v
 * @returns {boolean}
 */
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * 把任意输入强转为 plain object；非对象时记错误并返回 {}（防御性，不抛）。
 * @param {*} raw
 * @param {string[]} errors - 累积错误（mutate）。
 * @returns {Record<string,*>}
 */
function coerceObject(raw, errors) {
  if (isPlainObject(raw)) return raw;
  const got = raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw;
  errors.push(`stdin is not a plain object (got ${got}); CC schema fields unavailable`);
  return {};
}

/**
 * Map a Cursor event name to CC PascalCase; unknown/already-Pascal names pass through.
 * @param {*} name
 * @returns {*}
 */
function mapCursorEvent(name) {
  if (typeof name !== 'string') return name;
  return CUR_EVENT_MAP[name] ?? name;
}

/**
 * CodeBuddy / Codex 归一化 = 恒等映射（stdin 已是 CC schema）。
 * 扩展字段（CDX model/turn_id/permission_mode）随 spread 自然透传。
 * @param {Record<string,*>} raw
 * @returns {Record<string,*>}
 */
function normalizeIdentity(raw) {
  return { ...raw };
}

/**
 * Cursor 归一化：conversation_id→session_id、camelCase event→PascalCase、
 * 嵌套 tool:{name,input}→扁平 tool_name/tool_input（扁平字段作 fallback）。
 * @param {Record<string,*>} raw
 * @returns {Record<string,*>}
 */
function normalizeCursor(raw) {
  const { conversation_id, tool, hook_event_name, ...rest } = raw;
  const nestedTool = isPlainObject(tool);
  return {
    ...rest,
    session_id: conversation_id ?? raw.session_id,
    hook_event_name: mapCursorEvent(hook_event_name),
    tool_name: nestedTool ? tool.name : raw.tool_name,
    tool_input: nestedTool ? tool.input : raw.tool_input,
  };
}

/**
 * OpenCode 归一化：函数参数 (input,output) → CC schema。
 * input.tool→tool_name、output.args→tool_input；session/cwd/event 由 bridge 另注入。
 * @param {Record<string,*>} raw
 * @returns {Record<string,*>}
 */
function normalizeOpencode(raw) {
  const input = isPlainObject(raw.input) ? raw.input : {};
  const output = isPlainObject(raw.output) ? raw.output : {};
  return {
    tool_name: input.tool,
    tool_input: output.args,
    cwd: raw.cwd,
    session_id: raw.session_id,
    hook_event_name: raw.hook_event_name,
  };
}

/**
 * Normalize a host's raw hook input into CC schema.
 *
 * @param {string} host - One of KNOWN_HOSTS (codebuddy/codex/cursor/opencode).
 * @param {*} rawInputObj - Parsed host stdin (or OC function-arg object).
 * @returns {Record<string,*>} CC-schema-ish object; gains `_normalizeErrors` (non-empty
 *   string[]) when the input was malformed (non-object). Never throws on bad input —
 *   only an unknown `host` throws (fail-fast).
 * @throws {Error} if `host` is not in KNOWN_HOSTS.
 */
function stdinNormalize(host, rawInputObj) {
  if (!KNOWN_HOSTS.includes(host)) {
    throw new Error(
      `stdinNormalize: unknown host "${host}" (known: ${KNOWN_HOSTS.join(', ')})`,
    );
  }
  const errors = [];
  const raw = coerceObject(rawInputObj, errors);

  let result;
  switch (host) {
    case 'codebuddy':
    case 'codex':
      result = normalizeIdentity(raw);
      break;
    case 'cursor':
      result = normalizeCursor(raw);
      break;
    case 'opencode':
      result = normalizeOpencode(raw);
      break;
    default:
      // Unreachable: guarded by KNOWN_HOSTS check above.
      result = normalizeIdentity(raw);
  }

  if (errors.length > 0) result._normalizeErrors = errors;
  return result;
}

module.exports = {
  stdinNormalize,
  KNOWN_HOSTS,
  CUR_EVENT_MAP,
};
