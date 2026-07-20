/**
 * Project dashboard doc layout: AI + Roadmap cards, then 4 bilingual core specs.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  describe, assertContains, assertNotContains, printSummary, projectRoot,
} = require('../../test/helpers');

const html = fs.readFileSync(
  path.join(projectRoot(), 'dashboard', 'public', 'index.html'),
  'utf8'
);

describe('project dashboard doc cards layout', (suite) => {
  suite.test('no archived-docs collapse group', () => {
    assertNotContains(html, "'archived-docs'", 'no archived-docs group key');
    assertNotContains(html, '📁 归档文档', 'no archived-docs label');
  });

  suite.test('always renders AI + Roadmap cards with bilingual keys', () => {
    assertContains(html, 'projectDashboard.aiBaseDocs', 'ai card i18n');
    assertContains(html, 'projectDashboard.roadmap', 'roadmap card i18n');
    assertContains(html, "href=\"#/projects/' + esc(projectId) + '/ai-docs\"", 'ai href');
  });

  suite.test('four core project doc cards in order', () => {
    assertContains(html, 'docs/requirements.md', 'requirements path');
    assertContains(html, 'docs/design.md', 'design path');
    assertContains(html, 'docs/test-plan.md', 'test-plan path');
    assertContains(html, 'docs/deployment.md', 'deployment path');
    assertContains(html, 'projectDashboard.coreRequirements', 'requirements title');
    assertContains(html, 'projectDashboard.coreRequirementsEn', 'requirements en');
    assertContains(html, "'projectDashboard.coreDeployment': '发布运维说明书'", 'deployment zh title');
    assertContains(html, "'projectDashboard.coreDeploymentEn': 'Release & Operations Guide'", 'deployment en title');
    assertContains(html, 'projectDashboard.documentsZhEn', 'project docs section title');
    var req = html.indexOf("'docs/requirements.md'");
    var des = html.indexOf("'docs/design.md'");
    var tst = html.indexOf("'docs/test-plan.md'");
    var dep = html.indexOf("'docs/deployment.md'");
    assertContains(String(req < des && des < tst && tst < dep), 'true', 'core order');
  });

  suite.test('project home cards share width and equal height', () => {
    assertContains(html, 'max-width: 840px;', 'section max-width leave side space');
    assertContains(html, 'grid-template-columns: repeat(2, minmax(0, 1fr));', 'css two-col');
    assertContains(html, 'min-height: 6.5rem;', 'equal card height');
    assertContains(html, '.grid-2-fixed > .card', 'card stretch selector');
    assertContains(html, 'class="project-home-section"><div class="grid grid-2-fixed">', 'top AI+Roadmap same grid');
  });

  suite.test('top documents h3 removed from dashboard shell', () => {
    // renderProjectDashboard should not wrap docCards with documents heading alone
    assertNotContains(
      html,
      "t('projectDashboard.documents') + '</h3>' +\n        '</div>' +\n        docCards",
      'no top documents heading before docCards'
    );
  });
});

process.exit(printSummary());
