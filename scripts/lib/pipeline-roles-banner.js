#!/usr/bin/env node
/**
 * pipeline-roles-banner — Agent Teams v0 项目入口声明（P008）
 *
 * Pure helpers + CLI for init-project:
 *   node pipeline-roles-banner.js apply [project-path]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BANNER_ANCHOR = '## Agent Teams v0';
const BANNER_MARKER = '<!-- airein:pipeline-roles-banner -->';

/**
 * @returns {string}
 */
function buildBanner() {
  return [
    BANNER_ANCHOR,
    '',
    '> **Pipeline Roles**（Agent Teams v0 · 规划/质量最小团队协议）。主会话 = **PM**（编排，不包办专长产出）。',
    '',
    '| 节点 | 角色 |',
    '|------|------|',
    '| 编排 / progress | `agents/pm.md` |',
    '| `requirements` | `agents/product-expert.md` |',
    '| `design` | `agents/tech-lead.md` · **mode: design** |',
    '| review / `/code-review` / security STOP | `agents/tech-lead.md` · **mode: review** / **security** |',
    '',
    '- 角色产出须对齐 `templates/docs/` 对应文档模板。',
    '- 实现期仍可由 `skills/tdd` 与 main 执行（完整实现期 Teams 另案）。',
    '- 强制节点未派角须在 progress Notes 显式豁免。',
    '',
    BANNER_MARKER,
    '',
  ].join('\n');
}

/**
 * @param {string|null|undefined} content
 * @param {{ enabled?: boolean }} [opts]
 * @returns {{ content: string, action: string }}
 */
function appendBannerToContent(content, opts) {
  const options = opts || {};
  if (options.enabled === false) {
    return { content: content == null ? '' : String(content), action: 'skipped-disabled' };
  }
  const text = content == null ? '' : String(content);
  if (text.indexOf(BANNER_ANCHOR) >= 0 || text.indexOf(BANNER_MARKER) >= 0) {
    return { content: text, action: 'already-present' };
  }
  const banner = buildBanner();
  const trimmed = text.replace(/\s*$/, '');
  const next = trimmed ? (trimmed + '\n\n' + banner) : banner;
  return { content: next, action: 'appended' };
}

/**
 * Read pipelineRoles.enabled from project quality.json, merged with DEFAULTS (default true).
 * @param {string} projectRoot
 * @returns {boolean}
 */
function readPipelineRolesEnabled(projectRoot) {
  const { DEFAULTS, deepMerge } = require('./quality-config');
  const candidates = [
    path.join(projectRoot, '.airein', 'config', 'quality.json'),
    path.join(projectRoot, '.claude', 'config', 'quality.json'),
  ];
  for (let i = 0; i < candidates.length; i++) {
    const cfgPath = candidates[i];
    if (!fs.existsSync(cfgPath)) continue;
    try {
      const user = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      const merged = deepMerge(DEFAULTS, user || {});
      return !(merged.pipelineRoles && merged.pipelineRoles.enabled === false);
    } catch (_) {
      /* ignore malformed */
    }
  }
  return !(DEFAULTS.pipelineRoles && DEFAULTS.pipelineRoles.enabled === false);
}

/**
 * Append banner to one file (create if missing).
 * @param {string} filePath
 * @param {{ enabled?: boolean }} [opts]
 * @returns {{ action: string, path: string }}
 */
function applyBannerToFile(filePath, opts) {
  const options = opts || {};
  if (options.enabled === false) {
    return { action: 'skipped-disabled', path: filePath };
  }
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const result = appendBannerToContent(existing, options);
  if (result.action === 'appended') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, result.content, 'utf8');
  }
  return { action: result.action, path: filePath };
}

/**
 * Apply banner to CLAUDE.md and AGENTS.md under project root.
 * @param {string} projectRoot
 * @param {{ enabled?: boolean }} [opts]
 * @returns {{ enabled: boolean, claude: object, agents: object }}
 */
function applyBannerToProject(projectRoot, opts) {
  if (!projectRoot || typeof projectRoot !== 'string') {
    throw new Error('pipeline-roles-banner: project root required');
  }
  const root = path.resolve(projectRoot);
  const options = Object.assign({}, opts);
  if (options.enabled === undefined) {
    options.enabled = readPipelineRolesEnabled(root);
  }
  if (options.enabled === false) {
    return {
      enabled: false,
      claude: { action: 'skipped-disabled', path: path.join(root, 'CLAUDE.md') },
      agents: { action: 'skipped-disabled', path: path.join(root, 'AGENTS.md') },
    };
  }
  return {
    enabled: true,
    claude: applyBannerToFile(path.join(root, 'CLAUDE.md'), options),
    agents: applyBannerToFile(path.join(root, 'AGENTS.md'), options),
  };
}

function runCli(argv) {
  const args = argv.slice(2);
  const cmd = args[0];
  if (cmd === 'apply') {
    const target = path.resolve(args[1] || process.cwd());
    const result = applyBannerToProject(target);
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }
  console.error('Usage: node pipeline-roles-banner.js apply [project-path]');
  return 1;
}

module.exports = {
  BANNER_ANCHOR,
  BANNER_MARKER,
  buildBanner,
  appendBannerToContent,
  readPipelineRolesEnabled,
  applyBannerToFile,
  applyBannerToProject,
};

if (require.main === module) {
  process.exit(runCli(process.argv));
}
