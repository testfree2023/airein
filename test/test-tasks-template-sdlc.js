/**
 * Spec: tasks.md template + new-plan Tasks step cover full SDLC
 * (implement / verify / deploy), role×entry Must coverage, and
 * executable+acceptible task shape — not backend-only horizontal slices.
 *
 * Anti-example motivation: JuXu P099 collapsed 销售/门店 UI entries into
 * a late "E 前端收口" Should bucket; testers had no persona-bound entry.
 */

const fs = require('fs');
const path = require('path');
const {
  describe, assertOk, assertContains, assertNotContains, projectRoot, readSkill,
} = require('./helpers');

function readRepoFile(...parts) {
  const p = path.join(projectRoot(), ...parts);
  assertOk(fs.existsSync(p), `found ${parts.join('/')}`);
  return fs.readFileSync(p, 'utf8');
}

describe('tasks.md template — SDLC + entry acceptance', suite => {
  const tpl = readRepoFile('templates', 'docs', 'tasks.md');

  suite.test('declares SDLC scope (not code-only)', () => {
    assertContains(tpl, '软件开发生命周期', 'SDLC positioning');
    assertContains(tpl, '部署', 'deploy phase');
    assertContains(tpl, '测试', 'test/verify phase');
  });

  suite.test('requires Lifecycle Phases major sections', () => {
    assertContains(tpl, 'Lifecycle Phases', 'phases heading or guidance');
    assertContains(tpl, 'Implement', 'Implement phase');
    assertContains(tpl, 'Verify', 'Verify phase');
    assertContains(tpl, 'Deploy', 'Deploy phase');
  });

  suite.test('requires Entry Coverage matrix before task list', () => {
    assertContains(tpl, 'Entry Coverage', 'entry coverage section');
    assertContains(tpl, 'Persona', 'persona column/field');
    assertContains(tpl, 'UI Entry', 'UI entry field');
  });

  suite.test('per-task fields support role-bound UI acceptance', () => {
    assertContains(tpl, '**Kind**:', 'task kind field');
    assertContains(tpl, '**Persona**:', 'persona field');
    assertContains(tpl, '**UI Entry**:', 'ui entry field');
    assertContains(tpl, '**Priority**:', 'Must/Should priority');
  });

  suite.test('Acceptance is executable + observable (not only shell)', () => {
    assertContains(tpl, 'Acceptance', 'acceptance field');
    assertContains(tpl, '可执行', 'executable acceptance guidance');
    assertContains(tpl, '可验收', 'acceptible guidance');
  });

  suite.test('forbids demoting role UI entries to Should-only', () => {
    assertContains(tpl, '禁止', 'forbid language');
    assertContains(tpl, 'Should', 'Should demotion called out');
  });
});


describe('tasks.md template — UC/Design/VS traceability', suite => {
  const tpl = readRepoFile('templates', 'docs', 'tasks.md');

  suite.test('separates Implement (dev) vs Verify (test) as first-class phases', () => {
    assertContains(tpl, '开发任务', 'implement = 开发任务');
    assertContains(tpl, '测试任务', 'verify = 测试任务');
  });

  suite.test('requires Traceability Index mapping UC / Critical / VS → tasks', () => {
    assertContains(tpl, 'Traceability Index', 'traceability index');
    assertContains(tpl, 'UC-id', 'UC column');
    assertContains(tpl, 'Critical', 'Critical mapping');
    assertContains(tpl, 'VS-', 'VS mapping');
  });

  suite.test('Implement tasks bind Design refs (API / INV / DD)', () => {
    assertContains(tpl, 'Design refs', 'design refs field');
    assertContains(tpl, 'INV-', 'invariant ref hint');
  });

  suite.test('Verify tasks require Source from test-plan (Critical / VS / Exit)', () => {
    assertContains(tpl, '**Source**:', 'source field');
    assertContains(tpl, 'Critical-', 'critical id shape');
    assertContains(tpl, 'VS-', 'VS id shape');
    assertContains(tpl, 'Exit', 'exit criteria source');
  });

  suite.test('forbids orphan verify without test-plan/PRD source', () => {
    assertContains(tpl, '禁止', 'forbid');
    assertContains(tpl, '无源', 'orphan verify forbidden');
  });

  suite.test('points Verify work to plan tests.md ledger', () => {
    assertContains(tpl, 'tests.md', 'ledger path');
  });

  suite.test('coverage gate: every UC and Critical must map to a Must task', () => {
    assertContains(tpl, 'Coverage Gate', 'coverage gate section');
    assertContains(tpl, '每个 UC', 'every UC');
  });
});

describe('test-plan.md template — role-split critical index', suite => {
  const tpl = readRepoFile('templates', 'docs', 'test-plan', 'l.md');
  const tplM = readRepoFile('templates', 'docs', 'test-plan', 'm.md');

  suite.test('critical index requires Persona / entry-first steps', () => {
    assertContains(tpl, 'Persona', 'persona in critical index');
    assertContains(tpl, '入口', 'entry-first guidance');
  });

  suite.test('forbids collapsing multiple roles into one Critical row', () => {
    assertContains(tpl, '禁止', 'forbid language');
    assertContains(tpl, '多角色', 'multi-role collapse');
  });

  suite.test('treats Critical Index as gate entry, not the whole accept spec', () => {
    assertContains(tpl, 'Critical Acceptance Index', 'critical index heading');
    assertContains(tpl, 'Verification Specs by UC', 'VS-by-UC is the body');
    assertContains(tpl, '精炼 ≠ 稀疏', 'anti-thin guidance');
    assertContains(tpl, '索引是入口，规格是本体', 'index vs body');
  });

  suite.test('VS block requires scenario enumeration dimensions + invariant specs', () => {
    assertContains(tpl, 'VS-{UC-id}', 'VS per UC heading shape');
    assertContains(tpl, '主成功', 'main success dimension');
    assertContains(tpl, '幂等', 'idempotent dimension');
    assertContains(tpl, 'Invariant Verification Specs', 'invariant specs section');
    assertContains(tpl, 'Test Data Strategy', 'test data strategy');
    assertContains(tpl, '命脉级', 'vital-class coverage hint');
  });

  suite.test('Exit Criteria require executable command + observable pass', () => {
    assertContains(tpl, 'Exit Criteria', 'exit criteria');
    assertContains(tpl, '可执行命令', 'executable command gate');
  });

  suite.test('m tier is lighter but still has Critical + VS', () => {
    assertContains(tplM, 'Critical Acceptance Index', 'm critical');
    assertContains(tplM, 'Verification Specs', 'm VS');
    assertContains(tplM, '关键 UC', 'm key-UC guidance');
  });
});

describe('new-plan skill — Tasks step SDLC rules', suite => {
  const skill = readSkill('new-plan');
  assertOk(skill, 'new-plan SKILL.md exists');

  suite.test('Tasks step covers full SDLC kinds', () => {
    assertContains(skill, '## Tasks Step', 'Tasks Step heading');
    assertContains(skill, '软件开发生命周期', 'SDLC wording');
    assertContains(skill, '`implement`', 'implement kind enum');
    assertContains(skill, '`verify`', 'verify kind enum');
    assertContains(skill, '`deploy`', 'deploy kind enum');
    assertContains(skill, '`accept`', 'accept kind enum');
  });

  suite.test('requires Entry Coverage from PRD role×entry matrix', () => {
    assertContains(skill, 'Entry Coverage', 'Entry Coverage');
    assertContains(skill, '角色', 'roles from PRD');
    assertContains(skill, '入口', 'entry points');
  });

  suite.test('forbids horizontal backend-then-UI-only slicing for Must entries', () => {
    assertContains(skill, 'vertical', 'vertical slice');
    assertContains(skill, '禁止', 'forbid');
    assertContains(skill, '前端收口', 'anti-pattern bucket name');
  });

  suite.test('role UI entries and deploy/verify tasks cannot be Should-only Must demotion', () => {
    assertContains(skill, 'Must', 'Must priority');
    assertNotContains(
      skill,
      'generate `tasks.md` without\nverification tasks — backward compatible',
      'old fallback that drops verify tasks entirely should be tightened',
    );
  });


  suite.test('Tasks step maps UC→Implement and Critical/VS→Verify', () => {
    assertContains(skill, 'UC', 'UC');
    assertContains(skill, 'VS-', 'VS from test-plan');
    assertContains(skill, 'Critical', 'Critical');
    assertContains(skill, 'Design refs', 'design refs in skill');
    assertContains(skill, 'Source', 'verify Source');
  });

  suite.test('deployment.md produces executable Deploy tasks when present', () => {
    assertContains(skill, 'deployment.md', 'deployment source');
    assertContains(skill, 'Deploy', 'Deploy tasks');
  });
});

const { printSummary } = require('./helpers');
process.exit(printSummary());
