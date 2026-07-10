/**
 * T02 — stdin-normalize 单元+契约测试（P001-cross-platform · K3 核心 · test-plan §3.3）
 *
 * 被测：`stdinNormalize(host, rawInputObj) → ccSchemaObj`（`lib/stdin-normalize.js` 纯函数）。
 *
 * 契约：各宿主 hook 的原生 stdin 差异在「宿主 → airein hook」边界统一归一化为 CC schema
 * （tool_name/tool_input/cwd/session_id/hook_event_name），airein 既有 20 hook 零改动（design §6.1 ADR-2）。
 *
 * 注：CUR 工具字段映射基于 Cursor Agent hook schema 推断（design §3「字段名异」未列精确字段），
 *     采用嵌套 tool:{name,input} → 扁平 tool_name/tool_input；真实样本待 T05 集成校准，
 *     缺字段归 _normalizeErrors 容错（test-plan §8 风险应对）。
 */

const { describe, assertEqual, assertOk, printSummary } = require('./helpers');
const { stdinNormalize } = require('../scripts/lib/stdin-normalize');

describe('stdinNormalize: CB（codebuddy）恒等映射', (suite) => {
  suite.test('CB schema 同 CC → 核心 5 字段 1:1 透传', () => {
    const cb = {
      session_id: 'cb-s1', tool_name: 'Write',
      tool_input: { file_path: '/a.js', content: 'x' },
      cwd: '/proj', hook_event_name: 'PreToolUse',
    };
    const r = stdinNormalize('codebuddy', cb);
    assertEqual(r.session_id, 'cb-s1', 'session_id 透传');
    assertEqual(r.tool_name, 'Write', 'tool_name 透传');
    assertEqual(r.tool_input.file_path, '/a.js', 'tool_input 透传');
    assertEqual(r.cwd, '/proj', 'cwd 透传');
    assertEqual(r.hook_event_name, 'PreToolUse', 'hook_event_name 透传');
  });
});

describe('stdinNormalize: CDX（codex）同 schema + 扩展透传', (suite) => {
  suite.test('CDX 同 CC schema，扩展字段 model/turn_id/permission_mode 透传', () => {
    const cdx = {
      session_id: 'cdx-s1', tool_name: 'apply_patch',
      tool_input: { input: '*** patch ***' },
      cwd: '/proj', hook_event_name: 'PreToolUse',
      model: 'gpt-5', turn_id: 7, permission_mode: 'default',
    };
    const r = stdinNormalize('codex', cdx);
    assertEqual(r.session_id, 'cdx-s1', 'session_id');
    assertEqual(r.tool_name, 'apply_patch', 'apply_patch(file-write) 透传');
    assertEqual(r.tool_input.input, '*** patch ***', 'tool_input 透传');
    assertEqual(r.cwd, '/proj', 'cwd（项目根来自 stdin，无 env）');
    assertEqual(r.hook_event_name, 'PreToolUse', 'event');
    assertEqual(r.model, 'gpt-5', '扩展字段 model 透传');
    assertEqual(r.turn_id, 7, '扩展字段 turn_id 透传');
    assertEqual(r.permission_mode, 'default', '扩展字段 permission_mode 透传');
  });
});

describe('stdinNormalize: CUR（cursor）字段重映射', (suite) => {
  suite.test('conversation_id→session_id；tool.name/tool.input→扁平；event→PascalCase', () => {
    const cur = {
      conversation_id: 'cur-s1', generation_id: 'cur-g1',
      hook_event_name: 'preToolUse',
      tool: { name: 'Bash', input: { command: 'ls -la' } },
      cwd: '/proj',
    };
    const r = stdinNormalize('cursor', cur);
    assertEqual(r.session_id, 'cur-s1', 'conversation_id→session_id');
    assertEqual(r.hook_event_name, 'PreToolUse', 'preToolUse→PreToolUse');
    assertEqual(r.tool_name, 'Bash', 'tool.name→tool_name');
    assertEqual(r.tool_input.command, 'ls -la', 'tool.input→tool_input');
    assertEqual(r.cwd, '/proj', 'cwd 透传');
  });

  suite.test('beforeSubmitPrompt→UserPromptSubmit', () => {
    const cur = { conversation_id: 'cur-s2', hook_event_name: 'beforeSubmitPrompt', cwd: '/proj' };
    const r = stdinNormalize('cursor', cur);
    assertEqual(r.hook_event_name, 'UserPromptSubmit', 'beforeSubmitPrompt→UserPromptSubmit');
    assertEqual(r.session_id, 'cur-s2', 'session_id');
  });

  suite.test('6 事件 camelCase→PascalCase 全映射（design §6.4）', () => {
    const cases = [
      ['preToolUse', 'PreToolUse'],
      ['postToolUse', 'PostToolUse'],
      ['sessionStart', 'SessionStart'],
      ['stop', 'Stop'],
      ['beforeSubmitPrompt', 'UserPromptSubmit'],
      ['preCompact', 'PreCompact'],
    ];
    for (const [camel, pascal] of cases) {
      const r = stdinNormalize('cursor', { conversation_id: 'x', hook_event_name: camel });
      assertEqual(r.hook_event_name, pascal, `${camel}→${pascal}`);
    }
  });

  suite.test('已是 PascalCase 的 event 直传（幂等，不二次映射）', () => {
    const r = stdinNormalize('cursor', { conversation_id: 'x', hook_event_name: 'PreToolUse' });
    assertEqual(r.hook_event_name, 'PreToolUse', 'PascalCase 直传不变');
  });
});

describe('stdinNormalize: OC（opencode）函数参数→schema', (suite) => {
  suite.test('input.tool→tool_name；output.args→tool_input', () => {
    const oc = { input: { tool: 'bash' }, output: { args: { command: 'ls' } } };
    const r = stdinNormalize('opencode', oc);
    assertEqual(r.tool_name, 'bash', 'input.tool→tool_name');
    assertEqual(r.tool_input.command, 'ls', 'output.args→tool_input');
  });
});

describe('stdinNormalize: 防御性解析（畸形不抛，记 _normalizeErrors）', (suite) => {
  suite.test('null 输入不抛，返回带 _normalizeErrors（CDX Windows Stop #23784 类）', () => {
    let r;
    let threw = false;
    try { r = stdinNormalize('codex', null); } catch { threw = true; }
    assertOk(!threw, 'null 不抛');
    assertOk(Array.isArray(r._normalizeErrors) && r._normalizeErrors.length > 0, 'null 记 _normalizeErrors');
  });

  suite.test('字符串输入不抛，返回带 _normalizeErrors', () => {
    let threw = false;
    let r;
    try { r = stdinNormalize('codex', 'not an object'); } catch { threw = true; }
    assertOk(!threw, '字符串不抛');
    assertOk(Array.isArray(r._normalizeErrors) && r._normalizeErrors.length > 0, '字符串记 _normalizeErrors');
  });

  suite.test('数组输入不抛，返回带 _normalizeErrors', () => {
    let threw = false;
    let r;
    try { r = stdinNormalize('codex', [1, 2, 3]); } catch { threw = true; }
    assertOk(!threw, '数组不抛');
    assertOk(Array.isArray(r._normalizeErrors) && r._normalizeErrors.length > 0, '数组记 _normalizeErrors');
  });

  suite.test('空对象 {} 不抛（readStdinJson 容错后的常见形态）', () => {
    let threw = false;
    try { stdinNormalize('codex', {}); } catch { threw = true; }
    assertOk(!threw, '空对象不抛');
  });

  suite.test('合法输入无 _normalizeErrors（干净 CC schema）', () => {
    const r = stdinNormalize('codebuddy', {
      session_id: 's1', tool_name: 'Write', tool_input: {},
      cwd: '/p', hook_event_name: 'PreToolUse',
    });
    assertOk(!r._normalizeErrors || r._normalizeErrors.length === 0, '合法输入无错误');
  });
});

describe('stdinNormalize: 未知 host fail-fast', (suite) => {
  suite.test('未知 host 抛错（不静默）', () => {
    let threw = false;
    try { stdinNormalize('gemini', { tool_name: 'X' }); } catch { threw = true; }
    assertOk(threw, '未知 host 抛错');
  });
});

process.exit(printSummary());
