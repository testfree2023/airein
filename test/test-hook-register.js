/**
 * hook-register 单元测试（P001-cross-platform · design §6.1-6.4 · deployment §3）
 *
 * 被测：`scripts/lib/hook-register.js`（K3 hook 配置翻译纯函数）。T06 code-reviewer 发现
 * extractHookId 正则贪婪匹配首个 `scripts/hooks/<x>.js`，对含 `run-with-flags.js` 路由器
 * 的 4 条命令（session-start / quality-gate / post-edit-format / post-edit-typecheck）
 * 错标为 `run-with-flags`（M1）——集成测试因只断言「引用归一化入口」未抓到（M2）。本文件
 * 补独立单元测试，直接钉住 hookId 解析正确性。
 *
 * 真机 smoke 补丁（Bug A/B）：command 必须用 install 注入的仓库绝对路径 + node 解释器，
 * 不再用 bash + $CURSOR_PROJECT_DIR/$PLUGIN_ROOT/$CODEBUDDY_PLUGIN_ROOT（前者运行时指
 * 用户项目而非仓库 → 入口不可达；后者让 bash 读 node 脚本 → fail-open）。
 */

const fs = require('fs');
const path = require('path');

const { describe, assertEqual, assertOk, assertContains, assertNotContains, printSummary, projectRoot } = require('./helpers');
const { extractHookId, collectHooks, translateHooks, KNOWN_HOSTS } = require('../scripts/lib/hook-register');

const ROOT = projectRoot();
const hooksJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks', 'hooks.json'), 'utf8'));

describe('extractHookId: run-hook 直连命令', (suite) => {
  suite.test('单脚本直连 → 该脚本名', () => {
    const cmd = 'bash "x/run-hook.sh" "x/scripts/hooks/test-guard.js"';
    assertEqual(extractHookId(cmd), 'test-guard', '直连 test-guard');
  });

  suite.test('approval-sequence 直连', () => {
    const cmd = 'bash "x/run-hook.sh" "x/scripts/hooks/approval-sequence.js"';
    assertEqual(extractHookId(cmd), 'approval-sequence', '直连 approval-sequence');
  });
});

describe('extractHookId: run-with-flags 路由命令（M1 回归 · 必须解析真实 hookId）', (suite) => {
  // 真实 hooks.json 里 4 条路由命令：run-with-flags.js 出现在真实 hook 之前
  const cases = [
    ['session-start', 'node "x/scripts/hooks/run-with-flags.js" "session:start" "scripts/hooks/session-start.js" "minimal,standard,strict"'],
    ['quality-gate', 'bash "x/run-hook.sh" "x/scripts/hooks/run-with-flags.js" "post:quality-gate" "scripts/hooks/quality-gate.js" "standard,strict"'],
    ['post-edit-format', 'bash "x/run-hook.sh" "x/scripts/hooks/run-with-flags.js" "post:edit:format" "scripts/hooks/post-edit-format.js" "standard,strict"'],
    ['post-edit-typecheck', 'bash "x/run-hook.sh" "x/scripts/hooks/run-with-flags.js" "post:edit:typecheck" "scripts/hooks/post-edit-typecheck.js" "standard,strict"'],
  ];
  for (const [expected, cmd] of cases) {
    suite.test(`路由命令 → ${expected}（非 run-with-flags）`, () => {
      const got = extractHookId(cmd);
      assertEqual(got, expected, `应解析为 ${expected}，实际 ${got}（M1：被错标为 run-with-flags）`);
      assertOk(got !== 'run-with-flags', '绝不返回 router 名 run-with-flags');
    });
  }
});

describe('extractHookId: 边界', (suite) => {
  suite.test('纯 router 命令（无真实 hook 目标）→ null', () => {
    assertEqual(extractHookId('node "x/scripts/hooks/run-with-flags.js"'), null, '纯 router → null');
  });

  suite.test('无任何 scripts/hooks/x.js match → null', () => {
    assertEqual(extractHookId('echo hello'), null, '无 match → null');
    assertEqual(extractHookId(''), null, '空串 → null');
  });
});

describe('collectHooks: 真实 hooks.json 解析正确', (suite) => {
  const hooks = collectHooks(hooksJson);
  const ids = [...new Set(hooks.map((h) => h.hookId))];

  suite.test('run-with-flags 绝不作 hookId 出现', () => {
    assertOk(!ids.includes('run-with-flags'), 'run-with-flags 是路由器，不应作为 hookId');
    assertOk(!ids.includes('run-hook'), 'run-hook 是路由器，不应作为 hookId');
  });

  suite.test('含 4 条 run-with-flags 路由 hook 的真实 id', () => {
    for (const expected of ['session-start', 'quality-gate', 'post-edit-format', 'post-edit-typecheck']) {
      assertOk(ids.includes(expected), `含路由目标 ${expected}`);
    }
  });

  suite.test('含典型直连 hook', () => {
    for (const expected of ['test-guard', 'approval-guard', 'doc-file-warning', 'plan-gate']) {
      assertOk(ids.includes(expected), `含直连 ${expected}`);
    }
  });

  suite.test('总数非零（hooks.json 已解析）', () => {
    assertOk(hooks.length >= 15, `hook 数 ≥ 15（实际 ${hooks.length}）`);
  });
});

describe('translateHooks: 默认 platform 走 process.platform（m4 · 不静默 linux）', (suite) => {
  suite.test('省略 opts.platform → 按 process.platform 决定 CDX command_windows', () => {
    const isWin = process.platform === 'win32';
    const { files } = translateHooks('codex', hooksJson, { aireinRoot: '/t/airein' });
    const toml = (files.find((f) => f.path === '.codex/config.toml') || {}).content || '';
    if (isWin) {
      assertContains(toml, 'command_windows', 'win32 默认应含 command_windows');
    } else {
      assertOk(!toml.includes('command_windows'), '非 win32 默认不含 command_windows');
    }
  });
});

describe('translateHooks: OC N/A 事件标错（design §6.3）', (suite) => {
  suite.test('OC errors 含 Stop / UserPromptSubmit N/A 提示', () => {
    const { errors, files } = translateHooks('opencode', hooksJson, { platform: 'linux' });
    const all = errors.join('\n');
    assertOk(all.includes('Stop') || all.includes('UserPromptSubmit'), 'errors 含 N/A 事件');
    const oc = (files.find((f) => f.path === 'opencode.json') || {}).content || '';
    assertOk(!oc.includes('session.idle'), 'opencode.json 不注册 session.idle（Stop 映射）悬空 hook');
  });
});

describe('translateHooks: 未知 host fail-fast', (suite) => {
  suite.test('未知 host 抛错', () => {
    let threw = false;
    try { translateHooks('gemini', hooksJson, { aireinRoot: '/t/airein' }); } catch { threw = true; }
    assertOk(threw, '未知 host 抛错');
  });
});

describe('translateHooks: CUR/CB/CDX 产物含真实 hookId（非 run-with-flags）', (suite) => {
  for (const host of ['cursor', 'codex', 'codebuddy']) {
    suite.test(`${host} hook 配置含 session-start + quality-gate，不含 run-with-flags 作 hookId 参数`, () => {
      const { files } = translateHooks(host, hooksJson, { aireinRoot: '/t/airein', platform: 'linux' });
      const cfg = files[0].content;
      // 真实路由 hook 的 id 必须出现（证明解析正确，非被错标 run-with-flags）
      assertContains(cfg, 'session-start', `${host} 含 session-start hookId`);
      assertContains(cfg, 'quality-gate', `${host} 含 quality-gate hookId`);
      // command 模板是 `... host/<host>.js" <hookId>`，run-with-flags 不应作为该位置参数出现
      assertOk(!/host\/(cursor|codex|codebuddy)\.js["\s]+run-with-flags/.test(cfg), `${host} 不以 run-with-flags 作 hookId 参数`);
    });
  }
});

describe('translateHooks: command 用 install 注入绝对路径（Bug A/B 修复 · 真机 smoke 发现）', (suite) => {
  const AIREIN = '/t/airein';
  for (const host of ['cursor', 'codex', 'codebuddy']) {
    suite.test(`${host}: command = node "<aireinRoot>/scripts/hooks/host/<host>.js" <hookId>（无 bash · 无 $VAR）`, () => {
      const { files } = translateHooks(host, hooksJson, { aireinRoot: AIREIN, platform: 'linux' });
      const cfg = files[0].content;
      // Bug B 修复：用 node 不用 bash（bash 读 node-shebang 脚本 → shell 语法错 + exit 0 fail-open）
      assertNotContains(cfg, 'bash ', `${host} command 不用 bash（Bug B）`);
      // Bug A 修复：入口路径 = install 注入的仓库绝对路径，不再用宿主 env 变量
      // （$CURSOR_PROJECT_DIR 运行时 = 用户打开的项目，非 airein 仓库 → scripts/hooks/host/ 不可达）
      assertNotContains(cfg, '$CURSOR_PROJECT_DIR', `${host} 不用 $CURSOR_PROJECT_DIR 定位入口（Bug A）`);
      assertNotContains(cfg, '$PLUGIN_ROOT', `${host} 不用 $PLUGIN_ROOT 定位入口（Bug A）`);
      assertNotContains(cfg, '$CODEBUDDY_PLUGIN_ROOT', `${host} 不用 $CODEBUDDY_PLUGIN_ROOT 定位入口（Bug A）`);
      // 入口路径含注入 aireinRoot（正斜杠绝对路径）+ 正确入口名
      // （codex 是 TOML 数组 ["node","<path>",...]，cursor/cb 是 shell `node "<path>" ...`；
      //  格式不同但都含注入路径；Bug B「不用 bash」由上面断言覆盖，不查 `node ` 字面避免格式敏感）
      assertContains(cfg, `${AIREIN}/scripts/hooks/host/${host}.js`, `${host} command 含注入入口绝对路径`);
    });
  }

  suite.test('非 opencode 宿主缺 aireinRoot → 抛错（强制 install 注入绝对路径）', () => {
    let threw = false;
    try { translateHooks('cursor', hooksJson, { platform: 'linux' }); } catch { threw = true; }
    assertOk(threw, '缺 aireinRoot 抛错（install 必须传仓库根）');
  });

  suite.test('opencode 不需要 aireinRoot（OC 走 bridge.ts，AIREIN_ROOT 由 install-host 注入 bridge 副本）', () => {
    let threw = false;
    try { translateHooks('opencode', hooksJson, { platform: 'linux' }); } catch { threw = true; }
    assertOk(!threw, 'opencode 缺 aireinRoot 不抛错（OC 独轨，入口是 bridge.ts 副本）');
  });
});

// Cursor 官方 hooks schema ≠ Claude Code（真机 Cursor IDE smoke 发现 · 2026-07-10）。
// CC 是三层嵌套 {matcher, hooks:[{type,command}]}；Cursor 是扁平两层 —— 每个 definition
// 直接持有 {command, type, ...}（官方 docs：「The hooks object maps hook names to arrays
// of hook definitions. Each definition currently supports a command property」）。airein 曾
// 照搬 CC 嵌套 → Cursor 解析 definition 时顶层找不到 command → 整个 hook 注册失败 → IDE
// 完全不触发（「matches Claude Code behavior」仅指 exit 2=deny 的行为兼容，非配置 schema
// 兼容）。CLI 冒烟能过是因为直接 spawn cursor.js 绕过了 Cursor 自身的 hooks.json 解析。
// 修：definition 扁平化 + 顶层 version:1 + 省略 matcher（type=object；省略=对所有工具触发，
// docs: preToolUse「fires for all tool types」）。
describe('translateHooks: CUR hooks.json 扁平 schema（≠ CC 嵌套 · 真机 IDE smoke 发现）', (suite) => {
  const { files } = translateHooks('cursor', hooksJson, { aireinRoot: '/t/airein', platform: 'linux' });
  const cfgContent = (files.find((f) => f.path === '.cursor/hooks.json') || {}).content || '{}';
  const cfg = JSON.parse(cfgContent);

  suite.test('顶层 version: 1（Cursor global config option）', () => {
    assertEqual(cfg.version, 1, 'Cursor hooks.json 需顶层 version:1');
  });

  suite.test('definition 扁平：直接持有 command，无 hooks 嵌套层', () => {
    const def = cfg.hooks.preToolUse[0];
    assertOk(typeof def.command === 'string' && def.command.length > 0, 'definition 顶层直接有 command');
    assertOk(def.hooks === undefined, 'definition 无 hooks 嵌套数组（Cursor 扁平 ≠ CC 嵌套）');
  });

  suite.test('type 在 definition 顶层（非埋在 hooks[] 内）', () => {
    assertEqual(cfg.hooks.preToolUse[0].type, 'command', 'type 直接在 definition 上');
  });

  suite.test('matcher 省略（非字符串 "*"；省略=对所有工具触发）', () => {
    const def = cfg.hooks.preToolUse[0];
    assertOk(def.matcher === undefined, '省略 matcher（Cursor matcher type=object；省略=全工具触发）');
  });

  suite.test('事件名 camelCase（preToolUse/postToolUse/sessionStart/...）', () => {
    const events = Object.keys(cfg.hooks);
    assertOk(events.includes('preToolUse'), 'preToolUse camelCase');
    assertOk(events.includes('sessionStart'), 'sessionStart camelCase');
    assertOk(!events.includes('PreToolUse'), '不用 PascalCase');
  });
});

process.exit(printSummary());
