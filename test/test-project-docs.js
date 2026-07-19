/**
 * Tests for project-level document library.
 *
 * Covers:
 * - Server handlers: handleListProjectDocs, handleGetProjectDoc, handleSaveProjectDoc
 * - Server routes for /api/projects/{id}/docs/*
 * - UI: project dashboard Documents section, doc editor, new doc creator
 */

const fs = require('fs');
const path = require('path');
const {
  describe, assertContains, assertNotContains, assertMatch, assertOk, assertEqual, projectRoot, printSummary
} = require('./helpers');

const SERVER_PATH = path.join(projectRoot(), 'dashboard', 'server.js');
const INDEX_PATH = path.join(projectRoot(), 'dashboard', 'public', 'index.html');
const server = fs.readFileSync(SERVER_PATH, 'utf8');
const index = fs.readFileSync(INDEX_PATH, 'utf8');

// ── Server handler tests ────────────────────────────────────

describe('project docs: server handlers', suite => {

  suite.test('server exports handleListProjectDocs', () => {
    assertContains(server, 'handleListProjectDocs', 'server has handleListProjectDocs handler');
  });

  suite.test('server exports handleGetProjectDoc', () => {
    assertContains(server, 'handleGetProjectDoc', 'server has handleGetProjectDoc handler');
  });

  suite.test('server exports handleSaveProjectDoc', () => {
    assertContains(server, 'handleSaveProjectDoc', 'server has handleSaveProjectDoc handler');
  });

  suite.test('handleListProjectDocs walks docs/ subdirectories (incl. plans/)', () => {
    // P028: 不再跳过 plans/——前端按归档/计划文档分类需要完整列表。
    // walkDirs 递归遍历所有子目录。
    assertContains(server, 'withFileTypes: true', 'handler reads directory entries');
    assertContains(server, 'isDirectory()', 'handler recurses into subdirectories');
  });

  suite.test('handleListProjectDocs returns empty array when docs dir missing', () => {
    assertContains(server, 'return json(res, 200, [])', 'returns empty array on missing docs dir');
  });

  suite.test('handleGetProjectDoc uses safePath for traversal protection', () => {
    assertMatch(server, /handleGetProjectDoc[\s\S]*?safePath/, 'handleGetProjectDoc uses safePath');
  });

  suite.test('handleSaveProjectDoc uses safePath for traversal protection', () => {
    assertMatch(server, /handleSaveProjectDoc[\s\S]*?safePath/, 'handleSaveProjectDoc uses safePath');
  });
});

// ── Server route tests ──────────────────────────────────────

describe('project docs: server routes', suite => {

  suite.test('server has docs list route', () => {
    assertContains(server, '/docs$', 'server has project docs list route');
  });

  suite.test('server docs route accepts .md and .txt files', () => {
    assertContains(server, '.md|', 'docs route regex includes .md');
    assertContains(server, '.txt)', 'docs route regex includes .txt');
  });

  suite.test('doc route decodes URL-encoded filenames (Chinese)', () => {
    assertMatch(server, /decodeURIComponent\(projDocMatch\[2\]\)/, 'route decodes URL-encoded doc path');
  });

  suite.test('docs routes are wired to handlers', () => {
    assertContains(server, 'handleListProjectDocs', 'list docs handler referenced in routes');
    assertContains(server, 'handleGetProjectDoc', 'get doc handler referenced in routes');
    assertContains(server, 'handleSaveProjectDoc', 'save doc handler referenced in routes');
  });
});

// ── UI tests ────────────────────────────────────────────────

describe('project docs: dashboard UI', suite => {

  suite.test('project dashboard has Documents section heading', () => {
    assertContains(index, 'Documents', 'UI has Documents section');
  });

  suite.test('project dashboard fetches project docs', () => {
    assertContains(index, '/docs', 'UI fetches docs API endpoint');
  });

  suite.test('UI has renderProjectDocEdit function', () => {
    assertContains(index, 'renderProjectDocEdit', 'UI has doc editor renderer');
  });

  suite.test('UI has renderNewProjectDoc function', () => {
    assertContains(index, 'renderNewProjectDoc', 'UI has new doc creator renderer');
  });

  suite.test('UI has docs-new route for creating documents', () => {
    assertContains(index, 'docs-new', 'UI has docs-new route');
  });

  suite.test('UI has doc card rendering', () => {
    assertContains(index, 'renderDocCards', 'UI has renderDocCards function');
  });

  suite.test('renderDocCards shows Roadmap card beside AI docs when docs/roadmap.md exists', () => {
    assertContains(index, "groups['roadmap']", 'groups tracks roadmap docs');
    assertContains(index, 'docs/roadmap.md', 'recognizes docs/roadmap.md path');
    assertContains(index, '/docs/docs/roadmap.md', 'Roadmap card links to docs/roadmap.md editor');
    assertMatch(index, /grid grid-2[\s\S]*?AI 基础文档[\s\S]*?Roadmap|AI 基础文档[\s\S]*?grid grid-2[\s\S]*?Roadmap/,
      'AI docs and Roadmap share a side-by-side grid');
  });

  suite.test('new doc page has template selector', () => {
    assertMatch(index, /doc-template|template.*select/i, 'new doc page has template dropdown');
  });

  suite.test('doc editor has View/Edit/Save pattern', () => {
    assertContains(index, 'btn-view', 'doc editor has View button');
    assertContains(index, 'btn-edit', 'doc editor has Edit button');
    assertContains(index, 'btn-save', 'doc editor has Save button');
  });
});

process.exit(printSummary());
