/**
 * Spec: scripts/lib/pipeline-roles-banner.js — Agent Teams v0 入口声明（P008 · 1.4 / C3 / C4）
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  describe, assertOk, assertEqual, assertContains, assertNotContains,
  projectRoot, printSummary,
} = require('./helpers');

const {
  BANNER_ANCHOR,
  buildBanner,
  appendBannerToContent,
  applyBannerToProject,
} = require(path.join(projectRoot(), 'scripts', 'lib', 'pipeline-roles-banner.js'));

describe('pipeline-roles-banner: build', (suite) => {
  suite.test('anchor and dispatch table', () => {
    assertEqual(BANNER_ANCHOR, '## Agent Teams v0', 'anchor');
    const b = buildBanner();
    assertContains(b, BANNER_ANCHOR, 'heading');
    assertContains(b, 'agents/pm.md', 'pm path');
    assertContains(b, 'agents/product-expert.md', 'product-expert');
    assertContains(b, 'agents/tech-lead.md', 'tech-lead');
    assertContains(b, 'requirements', 'requirements node');
    assertContains(b, '<!-- airein:pipeline-roles-banner -->', 'marker');
  });
});

describe('pipeline-roles-banner: append', (suite) => {
  suite.test('appends to empty and preserves existing body', () => {
    const a = appendBannerToContent('');
    assertEqual(a.action, 'appended', 'empty action');
    assertContains(a.content, BANNER_ANCHOR, 'empty has anchor');

    const body = '# My Project\n\nHello.\n';
    const b = appendBannerToContent(body);
    assertEqual(b.action, 'appended', 'body action');
    assertOk(b.content.indexOf('Hello.') < b.content.indexOf(BANNER_ANCHOR), 'body before banner');
    assertContains(b.content, 'Hello.', 'preserves body');
  });

  suite.test('idempotent — second append is no-op', () => {
    const once = appendBannerToContent('# X\n');
    const twice = appendBannerToContent(once.content);
    assertEqual(twice.action, 'already-present', 'second action');
    assertEqual(twice.content, once.content, 'unchanged');
    const count = (twice.content.split(BANNER_ANCHOR).length - 1);
    assertEqual(count, 1, 'single anchor');
  });

  suite.test('enabled=false skips', () => {
    const r = appendBannerToContent('# Y\n', { enabled: false });
    assertEqual(r.action, 'skipped-disabled', 'skipped');
    assertNotContains(r.content, BANNER_ANCHOR, 'no anchor');
  });
});

describe('pipeline-roles-banner: apply project', (suite) => {
  suite.test('writes CLAUDE.md and AGENTS.md without clobber', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-banner-'));
    try {
      fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Existing Claude\n\nKeep me.\n', 'utf8');
      const r = applyBannerToProject(dir);
      assertEqual(r.claude.action, 'appended', 'claude appended');
      assertEqual(r.agents.action, 'appended', 'agents created/appended');
      const claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
      const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
      assertContains(claude, 'Keep me.', 'claude preserved');
      assertContains(claude, BANNER_ANCHOR, 'claude banner');
      assertContains(agents, BANNER_ANCHOR, 'agents banner');

      const r2 = applyBannerToProject(dir);
      assertEqual(r2.claude.action, 'already-present', 'claude idempotent');
      assertEqual(r2.agents.action, 'already-present', 'agents idempotent');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  suite.test('quality.json pipelineRoles.enabled=false skips writes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-banner-off-'));
    try {
      fs.mkdirSync(path.join(dir, '.airein', 'config'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, '.airein', 'config', 'quality.json'),
        JSON.stringify({ pipelineRoles: { enabled: false } }),
        'utf8'
      );
      const r = applyBannerToProject(dir);
      assertEqual(r.enabled, false, 'disabled');
      assertOk(!fs.existsSync(path.join(dir, 'CLAUDE.md')), 'no claude');
      assertOk(!fs.existsSync(path.join(dir, 'AGENTS.md')), 'no agents');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

if (require.main === module) {
  const { failed } = printSummary();
  process.exit(failed > 0 ? 1 : 0);
}
