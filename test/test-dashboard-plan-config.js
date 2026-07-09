const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const {
  describe, assertContains, assertNotContains, assertMatch, assertOk, assertEqual, projectRoot, printSummary
} = require('./helpers');

const SERVER_PATH = path.join(projectRoot(), 'dashboard', 'server.js');
const INDEX_PATH = path.join(projectRoot(), 'dashboard', 'public', 'index.html');
const QUALITY_CONFIG_PATH = path.join(projectRoot(), 'scripts', 'lib', 'quality-config.js');
const TEMPLATES_PIPELINE_PATH = path.join(projectRoot(), 'templates', 'pipelines.json');

describe('dashboard: project config page has only project-level settings', suite => {
  const server = fs.readFileSync(SERVER_PATH, 'utf8');
  const index = fs.readFileSync(INDEX_PATH, 'utf8');

  suite.test('server exposes grilling state and configured plan pipeline', () => {
    assertContains(server, 'getGrillingState(content)', 'server parses grilling state');
    assertContains(server, 'getPlanPipeline(projectPath, complexity)', 'server resolves plan pipeline from project config');
    assertContains(server, 'pipeline: pipeline', 'plan responses include pipeline');
  });

  suite.test('server exposes language profile import/export endpoint', () => {
    assertContains(server, 'handleGetLanguageProfiles', 'server has language profile GET handler');
    assertContains(server, 'handleSaveLanguageProfiles', 'server has language profile PUT handler');
    assertMatch(server, /\/language-profiles\$/, 'router includes language-profiles path');
  });

  suite.test('dashboard UI renders grilling step and configured pipeline', () => {
    assertContains(index, "grillingState", 'UI reads grilling state');
    assertContains(index, "var phases = plan.pipeline", 'UI uses server-provided pipeline');
    assertContains(index, "Communication", 'UI labels grilling/communication step');
  });

  suite.test('project config page has language profile activation (no global editing)', () => {
    assertContains(index, 'Language Profiles', 'UI has language profile section');
    assertContains(index, 'lang-active-cb', 'UI has language activation checkboxes');
    assertContains(index, 'btn-save-lang-active', 'UI has save active languages button');
  });

  suite.test('project config page has pipeline selector and enforce-grilling toggle', () => {
    assertContains(index, 'Plan Workflow', 'UI has plan workflow section');
    assertContains(index, 'enforce-grilling', 'UI has enforce grilling toggle');
    assertContains(index, 'planWorkflow.pipeline', 'UI has pipeline selector with data-path');
    assertContains(index, 'pipeline-select', 'UI has pipeline select element');
    assertContains(index, 'data-saved', 'UI preserves saved pipeline value for async restore');
    assertContains(index, 'wirePipelineSelector', 'UI wires pipeline selector dynamically');
  });

  suite.test('Language Profiles section links to add new global profile', () => {
    assertContains(index, '#/templates/new?dir=language-profiles', 'Language Profiles links to add new profile page');
  });
});

describe('dashboard: templates page hosts global configuration', suite => {
  const index = fs.readFileSync(INDEX_PATH, 'utf8');

  suite.test('templates page renders list and supports edit/save', () => {
    assertContains(index, 'renderTemplateList', 'templates list renderer exists');
    assertContains(index, 'renderTemplateEdit', 'templates edit renderer exists');
    assertContains(index, 'renderNewTemplate', 'templates new template renderer exists');
    assertContains(index, 'btn-save', 'templates page has save button');
    assertContains(index, 'btn-edit', 'templates page has edit button');
    assertContains(index, 'btn-create', 'new template page has create button');
  });

  suite.test('templates page has add button for addable directories', () => {
    assertContains(index, 'ADDABLE_DIRS', 'defines addable directories');
    assertContains(index, 'language-profiles', 'language-profiles is addable');
    assertContains(index, "'docs': true", 'docs is addable');
    assertContains(index, 'Add New', 'add new button text exists');
  });

  suite.test('nav has Templates link', () => {
    assertContains(index, 'href="#/templates"', 'nav includes templates link');
  });
});

describe('pipelines: global template architecture', suite => {
  suite.test('templates/pipelines.json exists and is valid', () => {
    assertOk(fs.existsSync(TEMPLATES_PIPELINE_PATH), 'pipelines.json exists');
    var data = JSON.parse(fs.readFileSync(TEMPLATES_PIPELINE_PATH, 'utf8'));
    assertOk(data.definitions, 'has definitions');
    // New 8-pipeline structure
    assertOk(data.definitions['s-feature'], 'has s-feature pipeline');
    assertOk(data.definitions['m-feature'], 'has m-feature pipeline');
    assertOk(data.definitions['l-feature'], 'has l-feature pipeline');
    assertOk(data.definitions['hotfix'], 'has hotfix pipeline');
    // s-bugfix and hotfix are tasks-only
    assertEqual(data.definitions['s-bugfix'].docs[0], 'tasks', 's-bugfix pipeline is tasks-only');
    assertEqual(data.definitions['s-bugfix'].docs.length, 1, 's-bugfix has only tasks');
    // m-feature has requirements, design, tasks
    assertOk(data.definitions['m-feature'].docs.indexOf('requirements') >= 0, 'm-feature has requirements');
    assertOk(data.definitions['m-feature'].docs.indexOf('design') >= 0, 'm-feature has design');
    assertOk(data.definitions['m-feature'].docs.indexOf('tasks') >= 0, 'm-feature has tasks');
    // l-feature has unified doc types (no prd/hld/lld)
    assertOk(data.definitions['l-feature'].docs.indexOf('requirements') >= 0, 'l-feature uses requirements (not prd)');
    assertOk(data.definitions['l-feature'].docs.indexOf('design') >= 0, 'l-feature uses design (not hld/lld)');
    assertOk(data.definitions['l-feature'].docs.indexOf('test-plan') >= 0, 'l-feature has test-plan');
    assertOk(data.definitions['l-feature'].docs.indexOf('deployment') >= 0, 'l-feature has deployment');
    assertOk(data.definitions['l-feature'].docs.indexOf('tasks') >= 0, 'l-feature has tasks');
    // defaultComplexity is m-feature
    assertEqual(data.defaultComplexity, 'm-feature', 'default complexity is m-feature');
  });

  suite.test('project quality.json has pipeline selector, not definitions', () => {
    var defaults = require(QUALITY_CONFIG_PATH).DEFAULTS;
    assertOk(defaults.planWorkflow, 'DEFAULTS has planWorkflow');
    assertEqual(defaults.planWorkflow.pipeline, 'auto', 'pipeline defaults to auto');
    assertOk(!defaults.planWorkflow.pipelines,
      'DEFAULTS should not have pipelines array (moved to global templates)');
  });

  suite.test('server reads pipeline from global templates, not project config', () => {
    var serverSrc = fs.readFileSync(SERVER_PATH, 'utf8');
    assertContains(serverSrc, 'loadGlobalPipelines', 'server has global pipeline loader');
    assertContains(serverSrc, '/api/pipelines', 'server has global pipelines API route');
  });

  suite.test('approval-sequence reads pipeline from global templates', () => {
    var seq = fs.readFileSync(path.join(projectRoot(), 'scripts', 'hooks', 'approval-sequence.js'), 'utf8');
    assertContains(seq, 'loadGlobalPipelines', 'approval-sequence uses global pipeline loader');
  });

  suite.test('server getPlanPipeline respects project pipeline preference', () => {
    var serverSrc = fs.readFileSync(SERVER_PATH, 'utf8');
    assertContains(serverSrc, 'planWorkflow.pipeline', 'server reads planWorkflow.pipeline from config');
    assertContains(serverSrc, "!== 'auto'", 'server checks auto vs specific pipeline');
  });

  suite.test('update sync preserves custom pipelines instead of overwriting pipelines.json', () => {
    var syncSrc = fs.readFileSync(path.join(projectRoot(), 'scripts', 'update', 'sync-airein.sh'), 'utf8');
    assertContains(syncSrc, 'merge_pipelines_json', 'sync script merges pipelines.json');
    assertOk(syncSrc.indexOf('  "templates/pipelines.json"\n  "templates/language-profiles') < 0,
      'pipelines.json should not be copied as a normal CORE file');
  });

  suite.test('update sync merges pipelines.json behaviorally', () => {
    var tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'airein-pipeline-sync-'));
    var sourceDir = path.join(tempRoot, 'source');
    var targetDir = path.join(tempRoot, 'target');
    var projectDir = path.join(tempRoot, 'project');

    fs.mkdirSync(path.join(sourceDir, 'templates'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'templates'), { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });

    // Source has updated built-in pipelines
    fs.writeFileSync(path.join(sourceDir, 'templates', 'pipelines.json'), JSON.stringify({
      defaultComplexity: 'm-feature',
      definitions: {
        's-feature': { label: 'S-Feature Source', description: 'source s-feature', docs: ['requirements', 'tasks'] },
        's-bugfix': { label: 'S-Bugfix Source', description: 'source s-bugfix', docs: ['tasks'] },
        'm-feature': { label: 'M-Feature Source', description: 'source m-feature', docs: ['requirements', 'design', 'tasks'] },
        'm-bugfix': { label: 'M-Bugfix Source', description: 'source m-bugfix', docs: ['requirements', 'tasks'] },
        'm-urgent': { label: 'M-Urgent Source', description: 'source m-urgent', docs: ['tasks'] },
        'l-feature': { label: 'L-Feature Source', description: 'source l-feature', docs: ['requirements', 'design', 'test-plan', 'deployment', 'tasks'] },
        'l-bugfix': { label: 'L-Bugfix Source', description: 'source l-bugfix', docs: ['requirements', 'design', 'test-plan', 'tasks'] },
        'hotfix': { label: 'Hotfix Source', description: 'source hotfix', docs: ['tasks'] }
      }
    }, null, 2));

    // Target has stale built-in + custom pipeline
    fs.writeFileSync(path.join(targetDir, 'templates', 'pipelines.json'), JSON.stringify({
      defaultComplexity: 'm-bugfix',
      definitions: {
        'm-feature': { label: 'Old M-Feature', description: 'stale m-feature', docs: ['old'] },
        'test': { label: 'Test', description: 'custom pipeline', docs: ['prd', 'hld', 'lld', 'test', 'deployment', 'tasks'] }
      }
    }, null, 2));

    try {
      childProcess.execFileSync('bash', [
        path.join(projectRoot(), 'scripts', 'update', 'sync-airein.sh'),
        sourceDir,
        targetDir,
        projectDir
      ], { stdio: 'pipe' });

      var merged = JSON.parse(fs.readFileSync(path.join(targetDir, 'templates', 'pipelines.json'), 'utf8'));
      assertEqual(merged.definitions['m-feature'].label, 'M-Feature Source', 'built-in m-feature is refreshed from source');
      assertEqual(merged.definitions['s-feature'].label, 'S-Feature Source', 'built-in s-feature is refreshed from source');
      assertEqual(merged.definitions['l-feature'].label, 'L-Feature Source', 'built-in l-feature is refreshed from source');
      assertEqual(merged.definitions['hotfix'].label, 'Hotfix Source', 'built-in hotfix is refreshed from source');
      assertEqual(merged.definitions.test.label, 'Test', 'custom test pipeline is preserved');
      assertEqual(merged.definitions.test.docs.join(','), 'prd,hld,lld,test,deployment,tasks', 'custom test docs are preserved');
      assertEqual(merged.defaultComplexity, 'm-bugfix', 'target top-level preference is preserved');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  suite.test('approval-sequence respects project pipeline preference', () => {
    var seq = fs.readFileSync(path.join(projectRoot(), 'scripts', 'hooks', 'approval-sequence.js'), 'utf8');
    assertContains(seq, 'planWorkflow?.pipeline', 'approval-sequence reads planWorkflow.pipeline');
    assertContains(seq, "!== 'auto'", 'approval-sequence checks auto vs specific');
  });
});

describe('language profiles: global API architecture', suite => {
  const server = fs.readFileSync(SERVER_PATH, 'utf8');

  suite.test('server has global language profiles CRUD handlers', () => {
    assertContains(server, 'handleGetGlobalLanguageProfiles', 'GET handler exists');
    assertContains(server, 'handleSaveGlobalLanguageProfile', 'PUT handler exists');
    assertContains(server, 'handleDeleteGlobalLanguageProfile', 'DELETE handler exists');
  });

  suite.test('server routes global language profile endpoints', () => {
    assertContains(server, '/api/language-profiles/', 'route includes /api/language-profiles/');
    assertContains(server, "handleGetGlobalLanguageProfiles(res,", 'GET route wired');
    assertContains(server, "handleSaveGlobalLanguageProfile(req, res", 'PUT route wired');
    assertContains(server, "handleDeleteGlobalLanguageProfile(res", 'DELETE route wired');
  });

  suite.test('server exports new global language profile handlers', () => {
    assertContains(server, 'handleGetGlobalLanguageProfiles', 'GET exported');
    assertContains(server, 'handleSaveGlobalLanguageProfile', 'PUT exported');
    assertContains(server, 'handleDeleteGlobalLanguageProfile', 'DELETE exported');
  });

  suite.test('project-level language-profiles endpoint supports active field', () => {
    assertContains(server, 'active', 'handler references active field');
    assertContains(server, 'available', 'response includes available profiles');
    assertContains(server, 'loadGlobalLanguageProfiles', 'uses global loader');
  });
});

describe('archive: server API and dashboard UI', suite => {
  const server = fs.readFileSync(SERVER_PATH, 'utf8');
  const index = fs.readFileSync(INDEX_PATH, 'utf8');

  suite.test('server has handleArchivePlan handler', () => {
    assertContains(server, 'handleArchivePlan', 'server defines handleArchivePlan');
  });

  suite.test('server routes POST archive endpoint', () => {
    assertContains(server, '/archive', 'server includes archive path segment');
    assertMatch(server, /archiveMatch/, 'server has archiveMatch route variable');
  });

  suite.test('server validates plan completion before archiving', () => {
    assertContains(server, 'Plan is already archived', 'rejects already-archived plans');
    assertContains(server, 'Plan is not completed', 'rejects incomplete plans');
  });

  suite.test('server validates all pipeline docs are approved', () => {
    assertContains(server, 'Unapproved docs', 'rejects plans with unapproved docs');
  });

  suite.test('server handles legacy plans without status field', () => {
    assertContains(server, '# Progress:', 'detects title line for legacy insert');
    assertContains(server, "status: archived", 'inserts status for legacy plans');
  });

  suite.test('server uses utils.writeFile for archive', () => {
    assertContains(server, 'utils.writeFile(progressPath, updated)', 'uses utils.writeFile');
  });

  suite.test('server updates status to archived', () => {
    assertContains(server, "'$1archived'", 'replace writes archived status');
    assertContains(server, "status: 'archived'", 'returns archived status');
  });

  suite.test('handleGetPlan returns status field', () => {
    assertContains(server, 'planParser.getStatus', 'server calls getStatus');
    assertContains(server, 'docs.status', 'server assigns status to response');
  });

  suite.test('handleGetPlans returns status in list view', () => {
    assertMatch(server, /status:\s*planStatus/, 'list view includes status');
  });

  suite.test('dashboard shows archive button for completed plans', () => {
    assertContains(index, 'btn-archive', 'archive button element exists');
    assertContains(index, 'plan.completed', 'shows button when plan.completed is true');
  });

  suite.test('dashboard shows archived badge', () => {
    assertContains(index, "status === 'archived'", 'shows archived badge');
  });

  suite.test('dashboard wires archive button click', () => {
    assertContains(index, '/archive', 'archive API call in frontend');
    assertContains(index, 'Archive this plan', 'confirm dialog for archive');
  });
});

describe('dashboard: configForm aligned with quality-config DEFAULTS (P020)', suite => {
  const index = fs.readFileSync(INDEX_PATH, 'utf8');

  suite.test('selfLearning section present (DEFAULTS added it in P019)', () => {
    assertContains(index, "key: 'selfLearning'", 'configForm has selfLearning section');
    assertContains(index, "name: 'selfLearning.enabled'", 'selfLearning.enabled toggle');
    assertContains(index, "name: 'selfLearning.promotionThreshold'", 'promotionThreshold field');
    assertContains(index, "'config.selfLearning'", 'selfLearning section label i18n key');
    assertContains(index, "'config.promotionThreshold'", 'promotionThreshold i18n key');
  });

  suite.test('blocking uses untestedSource (real DEFAULTS field), not lintFailure ghost', () => {
    assertContains(index, "name: 'blocking.untestedSource'", 'has blocking.untestedSource');
    assertNotContains(index, 'blocking.lintFailure', 'lintFailure ghost removed from configForm');
    assertNotContains(index, 'config.blockOnLintFailure', 'lintFailure i18n key removed');
    assertContains(index, "'config.blockOnUntestedSource'", 'untestedSource i18n key present');
  });

  suite.test('aireinLog retentionDays default matches DEFAULTS (7), not stale 30', () => {
    // DEFAULTS.aireinLog.retentionDays = 7 — see test-quality-config.js
    assertContains(index, "aireinLog.retentionDays', label: t('config.retentionDays'), type: 'number', min: 1, max: 365, 'default': 7",
      'retentionDays default = 7 (matches DEFAULTS)');
    assertNotContains(index, "max: 365, 'default': 30", 'stale retentionDays=30 gone');
  });

  suite.test('README config field list matches DEFAULTS (no lintFailure ghost, has selfLearning)', () => {
    const readme = fs.readFileSync(path.join(projectRoot(), 'dashboard', 'README.md'), 'utf8');
    assertContains(readme, 'untestedSource', 'README lists untestedSource');
    assertNotContains(readme, 'lintFailure', 'README no longer lists lintFailure ghost');
    assertContains(readme, 'Self-Learning', 'README lists selfLearning section');
  });
});

process.exit(printSummary());
