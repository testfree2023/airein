# TDD Reference — airein / Node 内建风格

> SKILL.md 管流程；本文件给测试写法示例。优先匹配目标项目的既有 harness。
> airein 自身：零 npm，`node test/test-*.js` + `test/helpers.js`。

## 单元测试骨架（airein helpers）

```js
'use strict';

const { describe, assertEqual, assertOk, printSummary } = require('./helpers');
const { myFn } = require('../scripts/lib/my-module');

describe('myFn', suite => {
  suite.test('returns expected for normal input', () => {
    assertEqual(myFn(2), 4, 'double');
  });

  suite.test('rejects invalid input', () => {
    let threw = false;
    try { myFn(null); } catch { threw = true; }
    assertOk(threw, 'must throw on null');
  });
});

process.exit(printSummary());
```

运行：`node test/test-my-module.js`

## Bind 时写什么

- **一个行为点一个断言焦点**（可多 case，但每个 case 只钉一个行为）
- 测可观察行为，不测私有实现细节
- 错误路径与边界单独成 case

## Prove 时读什么

- exit code 非 0 → 未完成
- 输出里的 failure 数 / 失败用例名
- 禁止用「上次绿过」代替本轮命令

## 与台账的对应

`tests.md` 的 **Test** 列写相对仓库根的路径；**Command** 列写本机可复制粘贴的完整命令。
