/**
 * T01 — BOM 修复回归测试（P001-cross-platform · design §10 / test-plan §3.6）
 *
 * 被测：`parseStdinData(data)` — `lib/utils.js` `readStdinJson` 抽出的纯解析核心。
 *
 * 背景：Cursor 的 `$OutputEncoding=[System.Text.Encoding]::UTF8` 往 hook stdin 注入 UTF-8 BOM
 * （EF BB BF / U+FEFF）。原 `readStdinJson` 做 `JSON.parse(data)` 解析含 BOM 原文 → 抛错 →
 * catch 静默 resolve({}) → **fail-open**（无强制力，比报错更危险）。
 *
 * 修复：抽出纯函数 `parseStdinData`，parse 前 `replace(/^﻿/, '')` 剥 BOM。本测试
 * 直接测纯函数（readStdinJson 读真实 process.stdin，async，不适合同步骨架单测；其 catch
 * 容错行为不变=既有契约）。
 */

const { describe, assertEqual, assertOk, printSummary } = require('./helpers');
const { parseStdinData } = require('../scripts/lib/utils');

describe('parseStdinData: BOM 剥离（T01 BOM 修复）', (suite) => {
  suite.test('剥前导 UTF-8 BOM 并正确解析 JSON', () => {
    const bom = '﻿';
    const input = `${bom}{"tool_name":"Bash","tool_input":{"command":"ls"}}`;
    const result = parseStdinData(input);
    assertEqual(result.tool_name, 'Bash', 'BOM 前置 JSON 解析出 tool_name');
    assertEqual(result.tool_input.command, 'ls', 'BOM 前置 JSON 解析出嵌套 tool_input');
  });

  suite.test('无 BOM 的正常 JSON 行为不变（回归）', () => {
    const result = parseStdinData('{"tool_name":"Write"}');
    assertEqual(result.tool_name, 'Write', '无 BOM JSON 解析不变');
  });

  suite.test('空 stdin 返回 {}（既有行为不变）', () => {
    const result = parseStdinData('');
    assertOk(typeof result === 'object' && !Array.isArray(result), '空输入返回对象');
    assertEqual(Object.keys(result).length, 0, '空输入返回 {}');
  });

  suite.test('仅空白 stdin 返回 {}（既有行为不变）', () => {
    const result = parseStdinData('   \n\t  ');
    assertEqual(Object.keys(result).length, 0, '仅空白返回 {}');
  });

  suite.test('非法 JSON 抛 SyntaxError（纯函数契约；readStdinJson 层 catch→{} 不变）', () => {
    let threw = false;
    try {
      parseStdinData('not json');
    } catch (err) {
      threw = err instanceof SyntaxError;
    }
    assertOk(threw, '非法 JSON 抛 SyntaxError（纯函数不吞错）');
  });

  suite.test('BOM + 非法 JSON：剥 BOM 后仍抛（BOM 不掩盖语法错误）', () => {
    let threw = false;
    try {
      parseStdinData('﻿not json');
    } catch (err) {
      threw = err instanceof SyntaxError;
    }
    assertOk(threw, 'BOM + 非法 JSON 仍抛 SyntaxError');
  });

  suite.test('BOM 前置的真实 CC-schema stdin 样本完整解析', () => {
    // 模拟 Cursor 注入 BOM 后的 PreToolUse stdin
    const sample = `﻿{"session_id":"s1","tool_name":"Edit","tool_input":{"file_path":"/a.js"},"cwd":"/proj","hook_event_name":"PreToolUse"}`;
    const result = parseStdinData(sample);
    assertEqual(result.session_id, 's1', 'session_id 解析');
    assertEqual(result.tool_name, 'Edit', 'tool_name 解析');
    assertEqual(result.hook_event_name, 'PreToolUse', 'hook_event_name 解析');
  });
});

process.exit(printSummary());
