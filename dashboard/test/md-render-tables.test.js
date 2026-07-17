'use strict';

const fs = require('fs');
const path = require('path');
const {
  describe, assertOk, assertContains, assertNotContains, printSummary, projectRoot,
} = require('../../test/helpers');

const mdRender = require(path.join(projectRoot(), 'dashboard', 'public', 'md-render.js'));

describe('md-render: indented tables under list items', (suite) => {
  suite.test('table indented with 2 spaces still becomes <table>', () => {
    const md = [
      '- **8 组合真值表（闸门①×③×②）**：',
      '',
      '  | payStatus | 激活设备 | 期望 |',
      '  |-----------|----------|------|',
      '  | T | T | 生成三档明细 |',
      '  | T | F | 跳过 |',
      '',
      '- next item',
    ].join('\n');
    const html = mdRender.renderMd(md);
    assertContains(html, '<table>', 'renders table');
    assertContains(html, '<th>', 'has header cells');
    assertContains(html, 'payStatus', 'keeps header text');
    assertContains(html, '生成三档明细', 'keeps body cell');
    assertNotContains(html, '| payStatus |', 'raw pipe row should not remain');
  });

  suite.test('flush-left tables still work', () => {
    const md = [
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
    ].join('\n'); // no trailing newline — last row must still parse
    const html = mdRender.renderMd(md);
    assertContains(html, '<table>', 'table');
    assertContains(html, '<td>1</td>', 'cell');
    assertContains(html, '<th>A</th>', 'header cell');
  });

  suite.test('table with trailing newline still works', () => {
    const html = mdRender.renderMd('| A | B |\n|---|---|\n| 1 | 2 |\n');
    assertContains(html, '<td>2</td>', 'last cell with trailing nl');
  });

  suite.test('P100-style truth table under bold list label renders', () => {
    const md = [
      '- **8 组合真值表（闸门①×③×②）**：',
      '',
      '  | payStatus | 激活设备 | 合同 sign_status | 期望 |',
      '  |-----------|----------|------------------|------|',
      '  | T | T | 正常(SIGNED=2) | 生成三档明细 |',
      '  | T | F | * | 跳过（待激活） |',
      '  | F | * | * | 跳过（待付款） |',
    ].join('\n');
    const html = mdRender.renderMd(md);
    assertContains(html, '<table>', 'truth table');
    assertContains(html, '<th>payStatus</th>', 'payStatus header');
    assertContains(html, '生成三档明细', 'success row');
    assertNotContains(html, '| payStatus |', 'no raw header pipe row');
    assertContains(html, '<td>&#42;</td>', 'wildcard star preserved as entity');
    assertNotContains(html, '<em></em>', 'no empty em from cross-cell * match');
  });
});

process.exit(printSummary());
