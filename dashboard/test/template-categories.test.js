#!/usr/bin/env node
/**
 * Test: template-categories.js — classify kernel templates for dashboard tabs.
 *
 * Bug: flat-name matcher left docs/requirements/{s,m,l}.md and progress.md in
 * "项目文档", while design.md / design-* lived under "计划文档" — so users on
 * the Project Docs tab saw ~4 files and zero design templates.
 */

const path = require('path');
const {
  describe, assertEqual, assertOk, printSummary, projectRoot,
} = require('../../test/helpers');

const MOD = require(path.join(projectRoot(), 'dashboard', 'public', 'template-categories.js'));
const { classifyTemplateCategory, templateDisplayName } = MOD;

describe('classifyTemplateCategory: project (product/archived core)', (suite) => {
  suite.test('requirements stub + tier files → project-docs', () => {
    assertEqual(classifyTemplateCategory('docs/requirements.md'), 'project-docs', 'requirements.md');
    assertEqual(classifyTemplateCategory('docs/requirements/s.md'), 'project-docs', 'requirements/s.md');
    assertEqual(classifyTemplateCategory('docs/requirements/m.md'), 'project-docs', 'requirements/m.md');
    assertEqual(classifyTemplateCategory('docs/requirements/l.md'), 'project-docs', 'requirements/l.md');
  });

  suite.test('design.md and design-* nested → project-docs', () => {
    assertEqual(classifyTemplateCategory('docs/design.md'), 'project-docs', 'design.md');
    assertEqual(classifyTemplateCategory('docs/design/s.md'), 'project-docs', 'design/s.md');
    assertEqual(classifyTemplateCategory('docs/design/m.md'), 'project-docs', 'design/m.md');
    assertEqual(classifyTemplateCategory('docs/design/l.md'), 'project-docs', 'design/l.md');
    assertEqual(classifyTemplateCategory('docs/design-database.md'), 'project-docs', 'design-database.md');
    assertEqual(classifyTemplateCategory('docs/design-architecture/javascript.md'), 'project-docs', 'design-architecture/js');
    assertEqual(classifyTemplateCategory('docs/design-conventions/bash.md'), 'project-docs', 'design-conventions/bash');
  });

  suite.test('test-plan and deployment → project-docs', () => {
    assertEqual(classifyTemplateCategory('docs/test-plan.md'), 'project-docs', 'test-plan.md');
    assertEqual(classifyTemplateCategory('docs/test-plan/m.md'), 'project-docs', 'test-plan/m.md');
    assertEqual(classifyTemplateCategory('docs/test-plan/l.md'), 'project-docs', 'test-plan/l.md');
    assertEqual(classifyTemplateCategory('docs/deployment.md'), 'project-docs', 'deployment.md');
  });
});

describe('classifyTemplateCategory: plan runtime docs', (suite) => {
  suite.test('tasks and progress → plan-docs', () => {
    assertEqual(classifyTemplateCategory('docs/tasks.md'), 'plan-docs', 'tasks.md');
    assertEqual(classifyTemplateCategory('docs/progress.md'), 'plan-docs', 'progress.md');
  });
});

describe('classifyTemplateCategory: non-docs', (suite) => {
  suite.test('language-profiles / config / rules', () => {
    assertEqual(classifyTemplateCategory('language-profiles/go.json'), 'language-profiles', 'lang');
    assertEqual(classifyTemplateCategory('quality.json'), 'config', 'quality');
    assertEqual(classifyTemplateCategory('pipelines.json'), 'config', 'pipelines');
    assertEqual(classifyTemplateCategory('rules/conventions-scope.md'), 'rules', 'rules');
  });

  suite.test('unknown paths stay uncategorized (null)', () => {
    assertEqual(classifyTemplateCategory('weird/file.md'), null, 'unknown');
    assertEqual(classifyTemplateCategory(''), null, 'empty');
  });
});

describe('templateDisplayName', (suite) => {
  suite.test('shows path under docs/ for nested templates', () => {
    assertEqual(templateDisplayName('docs/design-architecture/javascript.md'), 'design-architecture/javascript.md', 'nested');
    assertEqual(templateDisplayName('docs/design.md'), 'design.md', 'flat');
    assertEqual(templateDisplayName('language-profiles/go.json'), 'go.json', 'basename for non-docs');
  });
});

process.exit(printSummary());
