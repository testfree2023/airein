/**
 * test-project-migrate.js — P004 项目 .claude → .airein 迁移
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  describe,
  assertEqual,
  assertOk,
  printSummary,
} = require('./helpers');
const {
  planProjectMigrate,
  migrateProjectToAirein,
  decideFileMigration,
} = require('../scripts/lib/project-migrate');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-proj-mig-'));

function mk(name, files) {
  const root = path.join(TMP, name);
  fs.mkdirSync(root, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const fp = path.join(root, rel);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, content);
  }
  return root;
}

function rm(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

describe('project-migrate: decideFileMigration', (suite) => {
  suite.test('旧有、新无 → move', () => {
    const root = mk('decide-a', { '.claude/quality.json': '{}' });
    try {
      assertEqual(
        decideFileMigration(
          path.join(root, '.claude', 'quality.json'),
          path.join(root, '.airein', 'config', 'quality.json'),
        ),
        'move',
        'move',
      );
    } finally { rm(root); }
  });
});

describe('project-migrate: planProjectMigrate', (suite) => {
  suite.test('legacy quality.json → 计划迁到 .airein/config/', () => {
    const root = mk('plan-a', { '.claude/quality.json': '{"x":1}' });
    try {
      const plan = planProjectMigrate(root);
      assertOk(plan.needed, 'needed');
      assertOk(
        plan.actions.some((a) => a.to.replace(/\\/g, '/').includes('.airein/config/quality.json')),
        'targets canonical quality',
      );
    } finally { rm(root); }
  });

  suite.test('已是 .airein 结构 → noop', () => {
    const root = mk('plan-b', { '.airein/config/quality.json': '{}' });
    try {
      const plan = planProjectMigrate(root);
      assertEqual(plan.needed, false, 'noop');
    } finally { rm(root); }
  });
});

describe('project-migrate: migrateProjectToAirein', (suite) => {
  suite.test('执行迁移后 quality 在 .airein/config/', () => {
    const root = mk('run-a', {
      '.claude/quality.json': '{"testGuard":{"enabled":true}}',
      '.claude/memory/session-state.md': '# state\n',
    });
    try {
      const r = migrateProjectToAirein(root);
      assertOk(r.ok, `ok: ${r.error || ''}`);
      assertOk(
        fs.existsSync(path.join(root, '.airein', 'config', 'quality.json')),
        'canonical quality',
      );
      assertOk(
        fs.existsSync(path.join(root, '.airein', 'memory', 'session-state.md')),
        'canonical memory',
      );
      assertEqual(
        fs.readFileSync(path.join(root, '.airein', 'config', 'quality.json'), 'utf8'),
        '{"testGuard":{"enabled":true}}',
        'content preserved',
      );
    } finally { rm(root); }
  });

  suite.test('dry-run 不写盘', () => {
    const root = mk('run-dry', { '.claude/quality.json': '{}' });
    try {
      const r = migrateProjectToAirein(root, { dryRun: true, skipShim: true });
      assertOk(r.ok, 'dry ok');
      assertOk(!fs.existsSync(path.join(root, '.airein', 'config', 'quality.json')), 'no write');
    } finally { rm(root); }
  });
});

process.exit(printSummary());
