#!/usr/bin/env node
/**
 * Dashboard markdown renderer — mermaid fences must become .mermaid nodes
 * (not plain <pre><code>), so the browser can run mermaid.js on them.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  describe, assertOk, assertContains, assertNotContains, printSummary, projectRoot,
} = require('../../test/helpers');

const mdRender = require(path.join(projectRoot(), 'dashboard', 'public', 'md-render.js'));

describe('md-render: mermaid fences', (suite) => {
  suite.test('exports renderMd', () => {
    assertOk(typeof mdRender.renderMd === 'function', 'renderMd function');
  });

  suite.test('```mermaid becomes div.mermaid with diagram source', () => {
    const md = [
      '## Flow',
      '',
      '```mermaid',
      'flowchart TD',
      '  A[Start] --> B[End]',
      '```',
      '',
      'Done.',
    ].join('\n');
    const html = mdRender.renderMd(md);
    assertContains(html, 'class="mermaid"', 'mermaid container class');
    assertContains(html, 'flowchart TD', 'keeps diagram keyword');
    assertContains(html, 'A[Start]', 'keeps node text');
    assertNotContains(html, 'language-mermaid', 'not a plain code fence');
    assertNotContains(html, '<pre><code class="language-mermaid">', 'not pre/code wrapper');
  });

  suite.test('non-mermaid fences stay as pre/code', () => {
    const html = mdRender.renderMd('```js\nconst x = 1;\n```');
    assertContains(html, 'language-js', 'js fence');
    assertContains(html, '<pre><code', 'pre/code');
    assertNotContains(html, 'class="mermaid"', 'no mermaid class');
  });

  suite.test('arrow --> survives HTML escape for mermaid textContent', () => {
    const html = mdRender.renderMd('```mermaid\nflowchart LR\n  A --> B\n```');
    assertOk(
      html.includes('-->') || html.includes('--&gt;'),
      'arrow present as raw or entity',
    );
  });

  suite.test('blank lines inside mermaid fence must not become </p><p>', () => {
    const md = [
      '```mermaid',
      'flowchart TB',
      '  A[Start]',
      '',
      '  B[End]',
      '  A --> B',
      '```',
    ].join('\n');
    const html = mdRender.renderMd(md);
    assertContains(html, 'class="mermaid"', 'mermaid container');
    const m = html.match(/<div class="mermaid">([\s\S]*?)<\/div>/);
    assertOk(m, 'extract mermaid body');
    assertNotContains(m[1], '</p>', 'no paragraph close inside mermaid');
    assertNotContains(m[1], '<p>', 'no paragraph open inside mermaid');
    assertContains(m[1], 'flowchart TB', 'keeps diagram');
  });

  suite.test('br tags in mermaid nodes are neutralized for strict lexer', () => {
    const md = [
      '```mermaid',
      'flowchart TB',
      '  A[line1<br/>line2] --> B[ok]',
      '```',
    ].join('\n');
    const html = mdRender.renderMd(md);
    const m = html.match(/<div class="mermaid">([\s\S]*?)<\/div>/);
    assertOk(m, 'extract mermaid body');
    assertNotContains(m[1], '<br', 'no raw br tag in HTML source');
    assertNotContains(m[1], '&lt;br', 'no escaped br that decodes to tag');
    assertContains(m[1], 'line1', 'keeps label text');
    assertContains(m[1], 'line2', 'keeps second line text');
  });
});

describe('md-render: mermaid schedule gate', (suite) => {
  suite.test('scheduleMermaid gated on __aireinMermaidReady', () => {
    assertOk(typeof mdRender.scheduleMermaid === 'function', 'scheduleMermaid exported');
    assertOk(typeof mdRender.onMermaidReady === 'function', 'onMermaidReady exported');
    const src = fs.readFileSync(
      path.join(projectRoot(), 'dashboard', 'public', 'md-render.js'),
      'utf8',
    );
    assertOk(src.includes('__aireinMermaidReady'), 'ready flag gate');
    assertOk(src.includes('window.mermaid && window.__aireinMermaidReady'), 'gated run path');
  });
});

describe('md-render: HTML comment lines (template guidance)', (suite) => {
  suite.test('consecutive <!-- --> lines become separate blocks (do not collapse)', () => {
    const md = [
      '<!-- TEMPLATE: design/l.md -->',
      '<!-- Must: architecture -->',
      '<!-- Impact required -->',
      '',
      '# Design: Title',
    ].join('\n');
    const html = mdRender.renderMd(md);
    assertContains(html, 'md-tmpl-comment', 'comment block class');
    const blocks = html.match(/class="md-tmpl-comment"/g) || [];
    assertOk(blocks.length >= 3, 'one block per comment line, got ' + blocks.length);
    assertContains(html, '&lt;!-- TEMPLATE:', 'escaped comment visible');
    assertContains(html, '<h1>', 'heading still renders');
  });
});

describe('md-render: skip hidden preview mermaid hosts', (suite) => {
  suite.test('runMermaidIn ignores #doc-preview / #doc-edit-container', () => {
    const src = fs.readFileSync(
      path.join(projectRoot(), 'dashboard', 'public', 'md-render.js'),
      'utf8',
    );
    assertOk(src.includes('isHiddenMermaidHost'), 'helper present');
    assertOk(src.includes("id === 'doc-preview'"), 'skips doc-preview');
    assertOk(src.includes("id === 'doc-edit-container'"), 'skips edit container');
    assertOk(src.includes('if (isHiddenMermaidHost(node)) return'), 'gate before run');
  });

  suite.test('plan/doc view does not schedule mermaid on whole cont/$app at load', () => {
    const html = fs.readFileSync(
      path.join(projectRoot(), 'dashboard', 'public', 'index.html'),
      'utf8',
    );
    assertOk(!html.includes('scheduleMermaid($app)'), 'no scheduleMermaid($app)');
    assertOk(!html.includes('scheduleMermaid(cont)'), 'no scheduleMermaid(cont)');
    assertOk(
      html.includes('preview stays empty until Edit') || html.includes('avoids dual mermaid'),
      'documents dual-paint avoidance',
    );
  });

  suite.test('mermaid runs are sequential with sync pending claim', () => {
    const src = fs.readFileSync(
      path.join(projectRoot(), 'dashboard', 'public', 'md-render.js'),
      'utf8',
    );
    assertOk(src.includes('__aireinMermaidChain'), 'global promise chain');
    assertOk(src.includes('__aireinMermaidClaimed'), 'WeakSet claim');
    assertOk(src.includes('runMermaidInSerial'), 'serial runner');
    assertOk(src.includes('__aireinMermaidPending'), 'batch pending roots in one rAF');
    assertOk(
      !src.includes("setAttribute('data-processed', 'pending')"),
      'does not pre-set data-processed (mermaid would skip)',
    );
  });
});

process.exit(printSummary());
