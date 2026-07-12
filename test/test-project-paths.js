/**
 * test-project-paths.js — P004 1.1: project-paths 纯函数
 *
 * 契约：
 *   - 读写优先 <project>/.airein/
 *   - legacy <project>/.claude/ 只读 fallback
 *   - qualityConfigPath(forWrite) 始终指向 .airein
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { describe, assertEqual, assert, assertOk, printSummary } = require('./helpers');

const {
  AIREIN_PROJECT_DIR,
  LEGACY_PROJECT_DIR,
  findProjectRoot,
  getAireinProjectDir,
  resolveProjectSubpath,
  qualityConfigPath,
  projectDataSubpath,
  projectDataSubpathForRead,
  thinShellRulesDir,
} = require('../scripts/lib/project-paths');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-projpaths-'));

function mk(name, layout) {
  const root = path.join(TMP, name);
  for (const [rel, content] of Object.entries(layout)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (content !== null) fs.writeFileSync(abs, content);
  }
  return root;
}

describe('project-paths: constants', (suite) => {
  suite.test('AIREIN_PROJECT_DIR is .airein', () => {
    assertEqual(AIREIN_PROJECT_DIR, '.airein', 'canonical dir name');
  });
  suite.test('LEGACY_PROJECT_DIR is .claude', () => {
    assertEqual(LEGACY_PROJECT_DIR, '.claude', 'legacy dir name');
  });
});

describe('project-paths: findProjectRoot', (suite) => {
  suite.test('.airein/config 标记识别项目根', () => {
    const root = mk('airein-only', { '.airein/config/quality.json': '{}' });
    const sub = path.join(root, 'src', 'deep');
    fs.mkdirSync(sub, { recursive: true });
    assertEqual(findProjectRoot(sub), root, 'walk up to airein root');
  });

  suite.test('仅 legacy .claude/config 仍识别项目根', () => {
    const root = mk('legacy-only', { '.claude/config/quality.json': '{}' });
    const sub = path.join(root, 'pkg');
    fs.mkdirSync(sub, { recursive: true });
    assertEqual(findProjectRoot(sub), root, 'legacy marker');
  });

  suite.test('.airein 优先于 legacy（两者并存）', () => {
    const root = mk('both', {
      '.airein/config/quality.json': '{"marker":"airein"}',
      '.claude/config/quality.json': '{"marker":"claude"}',
    });
    assertEqual(findProjectRoot(root), root, 'root found');
    assertEqual(
      qualityConfigPath(root, { forRead: true }),
      path.join(root, '.airein', 'config', 'quality.json'),
      'read prefers airein',
    );
  });

  suite.test('无标记返回 null', () => {
    const bare = mk('bare', { 'README.md': '# x' });
    assertEqual(findProjectRoot(bare), null, 'no markers');
  });
});

describe('project-paths: getAireinProjectDir', (suite) => {
  suite.test('有项目根时返回 <root>/.airein', () => {
    const root = mk('get-dir', { '.airein/memory/session-state.md': '' });
    assertEqual(getAireinProjectDir(root), path.join(root, '.airein'), 'airein subdir');
  });

  suite.test('无标记时 fallback 到 cwd/.airein', () => {
    const bare = mk('get-fallback', { 'src/index.js': '' });
    assertEqual(getAireinProjectDir(bare), path.join(bare, '.airein'), 'cwd fallback');
  });
});

describe('project-paths: resolveProjectSubpath', (suite) => {
  suite.test('拼接 config/quality.json', () => {
    const root = mk('resolve', { '.airein/config/quality.json': '{}' });
    assertEqual(
      resolveProjectSubpath(root, 'config', 'quality.json'),
      path.join(root, '.airein', 'config', 'quality.json'),
      'subpath under airein',
    );
  });
});

describe('project-paths: qualityConfigPath', (suite) => {
  suite.test('读：.airein 存在则用 canonical', () => {
    const root = mk('read-airein', { '.airein/config/quality.json': '{}' });
    assertEqual(
      qualityConfigPath(root, { forRead: true }),
      path.join(root, '.airein', 'config', 'quality.json'),
      'read airein',
    );
  });

  suite.test('读：仅 legacy 则 fallback', () => {
    const root = mk('read-legacy', { '.claude/config/quality.json': '{}' });
    assertEqual(
      qualityConfigPath(root, { forRead: true }),
      path.join(root, '.claude', 'config', 'quality.json'),
      'read legacy config',
    );
  });

  suite.test('读：legacy 根级 quality.json', () => {
    const root = mk('read-legacy-root', { '.claude/quality.json': '{}' });
    assertEqual(
      qualityConfigPath(root, { forRead: true }),
      path.join(root, '.claude', 'quality.json'),
      'read legacy root quality',
    );
  });

  suite.test('读：无任何配置返回 null', () => {
    const root = mk('read-none', { 'package.json': '{}' });
    assertEqual(qualityConfigPath(root, { forRead: true }), null, 'no config');
  });

  suite.test('写：始终 .airein/config/quality.json', () => {
    const root = mk('write-only-legacy', { '.claude/config/quality.json': '{}' });
    assertEqual(
      qualityConfigPath(root, { forWrite: true }),
      path.join(root, '.airein', 'config', 'quality.json'),
      'write canonical only',
    );
  });

  suite.test('projectDataSubpath 写路径', () => {
    const root = mk('pds-write', {});
    assertEqual(
      projectDataSubpath(root, 'memory', 'session-state.md'),
      path.join(root, '.airein', 'memory', 'session-state.md'),
      'canonical subpath',
    );
  });

  suite.test('projectDataSubpathForRead 优先 .airein', () => {
    const root = mk('pds-read-airein', { '.airein/logs/a.log': 'x' });
    assertEqual(
      projectDataSubpathForRead(root, 'logs', 'a.log'),
      path.join(root, '.airein', 'logs', 'a.log'),
      'airein first',
    );
  });

  suite.test('thinShellRulesDir legacy fallback', () => {
    const root = mk('thin-legacy', { '.claude/rules/conventions-x.md': 'x' });
    assertEqual(
      thinShellRulesDir(root),
      path.join(root, '.claude', 'rules'),
      'legacy rules dir',
    );
  });
});

const code = printSummary();
process.exit(code);
