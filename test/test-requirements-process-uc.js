/**
 * Spec: PRD Story→UC model + Business Process Overview before Stories.
 * Use Case is the落地 of Story (main success + extensions); tasks/verify cite UC-id.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  describe, assertOk, assertContains, printSummary, projectRoot, readSkill,
} = require('./helpers');

function readTpl(tier) {
  return fs.readFileSync(
    path.join(projectRoot(), 'templates', 'docs', 'requirements', `${tier}.md`),
    'utf8',
  );
}

function sectionIndex(text, heading) {
  const i = text.indexOf(heading);
  assertOk(i >= 0, `found heading ${heading}`);
  return i;
}

describe('PRD templates — Story→UC + process overview', (suite) => {
  suite.test('m/l: Business Process Overview before User Story section', () => {
    for (const tier of ['m', 'l']) {
      const t = readTpl(tier);
      const bp = sectionIndex(t, 'Business Process Overview');
      const story = sectionIndex(t, 'User Story');
      assertOk(bp < story, `${tier}: overview before Story`);
      assertContains(t, 'mermaid', `${tier} mermaid`);
      assertContains(t, '活动图', `${tier} 活动图`);
    }
    assertContains(readTpl('l'), '时序图', 'l 时序图');
  });

  suite.test('m/l: User Story is 源头; Use Case nests under Story with 主成功/扩展', () => {
    for (const tier of ['m', 'l']) {
      const t = readTpl(tier);
      assertContains(t, '源头', `${tier} 源头`);
      assertContains(t, 'Use Case', `${tier} Use Case`);
      assertContains(t, '主成功场景', `${tier} 主成功场景`);
      assertContains(t, '扩展', `${tier} 扩展`);
      assertContains(t, 'UC-', `${tier} UC- id`);
    }
  });

  suite.test('s: slim overview + Story + at least one Use Case', () => {
    const s = readTpl('s');
    assertContains(s, 'Business Process Overview', 's overview');
    assertContains(s, 'mermaid', 's mermaid');
    assertContains(s, 'User Story', 's User Story');
    assertContains(s, 'Use Case', 's Use Case');
    assertContains(s, '主成功场景', 's 主成功');
  });

  suite.test('templates point downstream tasks/verify to UC-id', () => {
    const m = readTpl('m');
    const l = readTpl('l');
    assertContains(m, 'UC-', 'm UC-');
    assertContains(l, 'tasks', 'l tasks');
    assertContains(l, 'UC-', 'l UC-');
  });
});

describe('new-plan + tasks — derive from Story→UC', (suite) => {
  const skill = readSkill('new-plan');
  assertOk(skill, 'new-plan exists');

  suite.test('Requirements mandate overview + Story→UC (not UC→Story)', () => {
    assertContains(skill, 'Business Process Overview', 'overview');
    assertContains(skill, '源头', 'Story is 源头');
    assertContains(skill, 'Use Case', 'Use Case');
    assertContains(skill, 'mermaid', 'mermaid');
    assertContains(skill, '主成功场景', '主成功场景');
  });

  suite.test('forbids Story-only PRD without Use Case / process overview', () => {
    assertContains(skill, '禁止', 'forbid');
    assertContains(skill, 'User Story', 'User Story');
    assertContains(skill, 'Use Case', 'must mention UC in forbid context');
  });

  suite.test('Tasks Entry Coverage / Verify cite UC-id from PRD', () => {
    assertContains(skill, 'UC-', 'UC-id in skill');
    assertContains(skill, '业务流程', '业务流程');
    const tasks = fs.readFileSync(
      path.join(projectRoot(), 'templates', 'docs', 'tasks.md'),
      'utf8',
    );
    assertContains(tasks, 'UC-', 'tasks template UC- column');
  });
});

process.exit(printSummary());
