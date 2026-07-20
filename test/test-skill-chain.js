/**
 * Test: Skill Chain Enforcement (F1)
 *
 * Verifies the new-plan → tdd → code-reviewer chain
 * by checking each skill's SKILL.md for terminal state / handoff sections.
 * writing-plans / verification-loop / tdd-workflow are retired.
 */

const { describe, assert, assertOk, assertEqual, assertContains, assertMatch, readSkill } = require('./helpers');

describe('F1: Skill chain — new-plan', suite => {
  const content = readSkill('new-plan');

  suite.test('new-plan SKILL.md exists', () => {
    assertOk(content, 'new-plan/SKILL.md should exist');
  });

  if (!content) return;

  suite.test('new-plan has 终止状态 section', () => {
    assertContains(content, '## 终止状态', 'terminal state heading');
  });

  suite.test('new-plan links to tdd skill directly (no writing-plans step)', () => {
    assertContains(content, '`tdd` skill', 'tdd skill reference');
    assertOk(!content.includes('writing-plans'), 'writing-plans should not be referenced in new-plan termination');
    assertOk(!content.includes('tdd-workflow'), 'tdd-workflow renamed to tdd');
  });

  suite.test('new-plan forbids skipping to code', () => {
    assertContains(content, '禁止', 'forbidding language present');
  });

  suite.test('new-plan does not contain Shortcut bypass language', () => {
    assertOk(!content.includes('**Shortcut:**'), 'Shortcut clause removed');
  });

  suite.test('new-plan requires grilling state progression', () => {
    assertContains(content, 'grilling: in_progress', 'sets grilling in progress');
    assertContains(content, 'grilling: completed', 'requires grilling completion');
  });

  suite.test('new-plan uses configurable planWorkflow pipelines', () => {
    assertContains(content, 'planWorkflow.pipelines', 'references configurable pipelines');
    assertContains(content, 'quality.json', 'references quality config');
  });

  suite.test('new-plan allows continuing after grilling without mandatory pause', () => {
    assertOk(!content.includes('不要在同一轮回复中同时设 grilling: completed 和创建文档'), 'grilling pause rule removed');
    assertContains(content, 'no mandatory pause', 'allows continuation after grilling');
  });

  suite.test('new-plan treats requirements as PRD with resolveRequirementsTemplate', () => {
    assertContains(content, '产品需求说明书', 'PRD positioning');
    assertContains(content, 'resolveRequirementsTemplate', 'tier resolve API');
    assertContains(content, 'templates/docs/requirements/m.md', 'm-tier path');
  });

  suite.test('new-plan resolves design s/m/l via resolveDesignTemplate', () => {
    assertContains(content, 'resolveDesignTemplate', 'design tier resolve API');
    assertContains(content, 'templates/docs/design/m.md', 'design m-tier path');
    assertContains(content, 'Impact & Follow-up Checks', 'design Impact section');
  });
});

describe('F1: Skill chain — tdd', suite => {
  const content = readSkill('tdd');

  suite.test('tdd SKILL.md exists', () => {
    assertOk(content, 'tdd/SKILL.md should exist');
  });

  if (!content) return;

  suite.test('tdd has 终止状态 section', () => {
    assertContains(content, '## 终止状态', 'terminal state heading');
  });

  suite.test('tdd terminal state links to tech-lead review', () => {
    assertContains(content, 'tech-lead', 'tech-lead reference');
    assertContains(content, 'mode: review', 'review mode');
  });

  suite.test('tdd terminal state forbids skipping review', () => {
    assertContains(content, '禁止', 'forbidding language present');
  });

  suite.test('tdd maintains plan tests.md ledger', () => {
    assertContains(content, 'tests.md', 'tests ledger');
    assertContains(content, 'Trace', 'Trace step');
  });
});

// ── File consolidation: verify skills reference roadmap.md, not issues.md ──

describe('File consolidation: skill references', suite => {
  const CONSOLIDATED_SKILLS = [
    { name: 'new-plan', mustContain: 'roadmap.md', mustNotContain: 'issues.md' },
    { name: 'next', mustContain: 'roadmap.md', mustNotContain: 'issues.md' },
    { name: 'status', mustContain: 'roadmap.md', mustNotContain: 'issues.md' },
    { name: 'log-change', mustContain: 'roadmap.md', mustNotContain: 'changelog.md' },
    { name: 'archive-plan', mustContain: 'roadmap.md', mustNotContain: 'changelog.md' },
  ];

  for (const skill of CONSOLIDATED_SKILLS) {
    suite.test(`${skill.name} references roadmap.md (not ${skill.mustNotContain})`, () => {
      const content = readSkill(skill.name);
      assertOk(content, `${skill.name}/SKILL.md should exist`);
      if (!content) return;
      assertContains(content, skill.mustContain, `${skill.name} references ${skill.mustContain}`);
      assertOk(!content.includes(skill.mustNotContain), `${skill.name} should NOT reference ${skill.mustNotContain}`);
    });
  }

  suite.test('core files do not reference deleted skills', () => {
    const { projectRoot } = require('./helpers');
    const fs = require('fs');
    const path = require('path');
    const root = projectRoot();

    // Only check core config/script files (not individual skill content)
    // Note: clean-airein.sh intentionally references deleted skills in STALE_DIRS for cleanup
    const coreFiles = [
      'scripts/update/sync-airein.sh',
      'scripts/cleanup-airein.sh',
      'scripts/manage-profile.js',
      'airein',
      'CLAUDE.md',
      'README.md',
    ];

    let checked = 0;
    for (const relPath of coreFiles) {
      const fullPath = path.join(root, relPath);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf8');
      checked++;
      assertOk(!content.includes('skills/lookup'), `${relPath} should not reference skills/lookup`);
      assertOk(!content.includes('skills/update-knowledge'), `${relPath} should not reference skills/update-knowledge`);
    }
    assertOk(checked > 0, 'checked at least one core file');
  });

  suite.test('deleted skill directories do not exist', () => {
    const { projectRoot } = require('./helpers');
    const fs = require('fs');
    const path = require('path');
    const root = projectRoot();

    assertOk(!fs.existsSync(path.join(root, 'skills', 'lookup')), 'skills/lookup should not exist');
    assertOk(!fs.existsSync(path.join(root, 'skills', 'update-knowledge')), 'skills/update-knowledge should not exist');
    assertOk(!fs.existsSync(path.join(root, 'templates', 'knowledge')), 'templates/knowledge should not exist');
    assertOk(!fs.existsSync(path.join(root, 'skills', 'writing-plans')), 'skills/writing-plans retired');
    assertOk(!fs.existsSync(path.join(root, 'skills', 'verification-loop')), 'skills/verification-loop retired');
    assertOk(!fs.existsSync(path.join(root, 'skills', 'tdd-workflow')), 'skills/tdd-workflow retired → tdd');
  });
});

// ── rules retirement: python/typescript/common retired, 00/10/20 in place ──

describe('rules retirement: python/typescript/common gone, 00/10/20 in place', suite => {
  const { projectRoot } = require('./helpers');
  const fs = require('fs');
  const path = require('path');
  const root = projectRoot();

  suite.test('rules/python and rules/typescript directories removed', () => {
    assertOk(!fs.existsSync(path.join(root, 'rules', 'python')), 'rules/python should not exist');
    assertOk(!fs.existsSync(path.join(root, 'rules', 'typescript')), 'rules/typescript should not exist');
  });

  suite.test('rules/common/core-rules.md retired (P017: content split into 00/10/20)', () => {
    assertOk(!fs.existsSync(path.join(root, 'rules', 'common', 'core-rules.md')), 'core-rules.md should be removed');
    assertOk(fs.existsSync(path.join(root, 'rules', '00-iron-rules.md')), '00-iron-rules.md should exist as replacement');
    assertOk(fs.existsSync(path.join(root, 'rules', '20-workflow.md')), '20-workflow.md should exist as replacement');
  });

  suite.test('core files do not reference retired rules/python|typescript', () => {
    // clean-airein.sh is EXCLUDED — it legitimately lists retired dirs in
    // STALE_DIRS to clean up old installs (checked separately below).
    const coreFiles = [
      'CLAUDE.md',
      'README.md',
      'CONTEXT.md',
      'airein',
      'scripts/update/sync-airein.sh',
      'scripts/manage-profile.js',
    ];
    let checked = 0;
    for (const relPath of coreFiles) {
      const fullPath = path.join(root, relPath);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf8');
      checked++;
      assertOk(!/rules\/python/.test(content), `${relPath} should not reference rules/python`);
      assertOk(!/rules\/typescript/.test(content), `${relPath} should not reference rules/typescript`);
    }
    assertOk(checked > 0, 'checked at least one core file');
  });

  suite.test('clean-airein.sh lists retired rules dirs for stale cleanup', () => {
    const fullPath = path.join(root, 'scripts', 'update', 'clean-airein.sh');
    if (!fs.existsSync(fullPath)) {
      assertOk(true, 'clean-airein.sh not present (skipped)');
      return;
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    assertOk(/rules\/python/.test(content), 'clean-airein.sh lists rules/python in STALE_DIRS');
    assertOk(/rules\/typescript/.test(content), 'clean-airein.sh lists rules/typescript in STALE_DIRS');
  });
});

// ── P019: self-learning skill replaces self-improving ──

describe('P019: self-learning replaces self-improving', suite => {
  const { projectRoot } = require('./helpers');
  const fs = require('fs');
  const path = require('path');
  const root = projectRoot();

  suite.test('skills/self-learning/SKILL.md exists', () => {
    assertOk(
      fs.existsSync(path.join(root, 'skills', 'self-learning', 'SKILL.md')),
      'self-learning/SKILL.md should exist'
    );
  });

  suite.test('self-learning SKILL.md mandates buffer write (pending.md)', () => {
    const content = readSkill('self-learning');
    assertOk(content, 'self-learning/SKILL.md should exist');
    if (!content) return;
    assertContains(content, 'pending.md', 'references pending.md buffer');
  });

  suite.test('self-learning SKILL.md forbids touching memory', () => {
    const content = readSkill('self-learning');
    if (!content) return;
    assertOk(content.includes('不碰 memory') || content.includes('不写 memory'), 'must forbid touching memory');
  });

  suite.test('skills/self-improving directory removed', () => {
    assertOk(
      !fs.existsSync(path.join(root, 'skills', 'self-improving')),
      'skills/self-improving should not exist'
    );
  });

  suite.test('init-project no longer references self-improving', () => {
    const content = readSkill('init-project');
    assertOk(content, 'init-project/SKILL.md should exist');
    if (!content) return;
    assertOk(!content.includes('self-improving'), 'init-project should not reference self-improving');
  });

  suite.test('new-plan uses kernel template path not ~/.claude/templates', () => {
    const content = readSkill('new-plan');
    assertOk(content, 'new-plan/SKILL.md should exist');
    if (!content) return;
    assertOk(
      !content.includes('~/.claude/templates/docs'),
      'new-plan must not instruct reading ~/.claude/templates/docs',
    );
    assertOk(content.includes('~/.airein/templates/pipelines.json'), 'new-plan must reference kernel pipelines.json');
    assertOk(content.includes('~/.airein/scripts/lib/design-doc-resolver.js'), 'design-doc-resolver kernel path');
  });

  suite.test('init-project and archive-plan use kernel template paths', () => {
    const init = readSkill('init-project');
    const archive = readSkill('archive-plan');
    assertOk(init && archive, 'skills exist');
    if (!init || !archive) return;
    assertOk(init.includes('~/.airein/templates/docs/'), 'init-project kernel templates');
    assertOk(!init.includes('from `templates/docs'), 'init-project no bare templates/docs');
    assertOk(!init.includes('Read skeleton `templates/'), 'init-project no bare templates/rules');
    assertOk(archive.includes('~/.airein/templates/rules/conventions-scope.md'), 'archive-plan skeleton path');
    assertOk(archive.includes('.airein/rules/conventions-'), 'archive-plan writes canonical rules');
    assertOk(!archive.includes('Write to `.claude/rules/conventions-'), 'archive-plan no direct .claude/rules write');
  });

  suite.test('self-learning SKILL.md does not reference old ~/self-improving mechanism', () => {
    const content = readSkill('self-learning');
    if (!content) return;
    assertOk(!content.includes('~/self-improving'), 'should not reference ~/self-improving/');
  });
});


describe('F1: /tdd command aligns with skill tdd', suite => {
  const path = require('path');
  const fs = require('fs');
  const cmdPath = path.join(__dirname, '..', 'commands', 'tdd.md');
  const skillPath = path.join(__dirname, '..', 'skills', 'tdd', 'SKILL.md');
  const cmd = fs.existsSync(cmdPath) ? fs.readFileSync(cmdPath, 'utf8') : '';
  const skill = fs.existsSync(skillPath) ? fs.readFileSync(skillPath, 'utf8') : '';

  suite.test('commands/tdd.md exists', () => {
    assertOk(cmd, 'commands/tdd.md should exist');
  });

  suite.test('command description is Spec-bound (matches skill brand)', () => {
    const desc = (cmd.match(/^description:\s*(.+)$/m) || [])[1] || '';
    const skillDesc = (skill.match(/^description:\s*(.+)$/m) || [])[1] || '';
    assertOk(/Spec-bound/i.test(desc), 'command description must say Spec-bound, not legacy scaffold-first ECC text');
    assertOk(!/Scaffold interfaces/i.test(desc), 'must not use legacy Scaffold interfaces blurb as description');
    assertEqual(desc, skillDesc, 'commands/tdd.md description must mirror skills/tdd/SKILL.md');
  });

  suite.test('command defers to skills/tdd', () => {
    assertOk(cmd.includes('skills/tdd'), 'command body must point at skills/tdd');
  });

  suite.test('skill tdd still Spec-bound', () => {
    assertOk(/Spec-bound/i.test(skill), 'skills/tdd/SKILL.md remains Spec-bound');
  });
});
// ── Run standalone ─────────────────────────────────────────────────
const { printSummary } = require('./helpers');
process.exit(printSummary());
