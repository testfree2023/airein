/**
 * template-categories.js — classify ~/.airein/templates paths for dashboard tabs.
 *
 * Pure functions — no DOM. Shared by the browser (<script src>) and node tests.
 *
 * Tabs:
 *   project-docs — product / archived core (requirements, design, test, deploy)
 *   plan-docs    — plan runtime (tasks, progress)
 *   language-profiles | config | rules
 */

/**
 * @param {string} relPath - Path relative to templates/ (e.g. docs/design.md)
 * @returns {'project-docs'|'plan-docs'|'language-profiles'|'config'|'rules'|null}
 */
function classifyTemplateCategory(relPath) {
  if (!relPath || typeof relPath !== 'string') return null;
  const p = relPath.replace(/\\/g, '/');

  if (p.indexOf('language-profiles/') === 0) return 'language-profiles';
  if (p === 'quality.json' || p === 'pipelines.json') return 'config';
  if (p.indexOf('rules/') === 0) return 'rules';

  if (p.indexOf('docs/') !== 0) return null;

  const under = p.slice(5); // after docs/
  const base = under.split('/').pop();
  const top = under.split('/')[0];

  // Plan runtime shells
  if (base === 'tasks.md' || base === 'progress.md') return 'plan-docs';

  // Product / archival core (aligned with project isCoreDoc)
  if (base === 'requirements.md' || top === 'requirements') return 'project-docs';
  // design.md stub, design/{s,m,l}.md, or design-* subdoc templates
  if (base === 'design.md' || top === 'design' || top.indexOf('design-') === 0) {
    return 'project-docs';
  }
  if (base === 'test-plan.md' || p.indexOf('docs/test-plan/') === 0 || base === 'deployment.md') return 'project-docs';

  // Other docs/* → project-docs (avoid the old "leftover" trap)
  return 'project-docs';
}

/**
 * Card title: keep docs/ nesting visible (design-architecture/javascript.md).
 * @param {string} relPath
 * @returns {string}
 */
function templateDisplayName(relPath) {
  if (!relPath || typeof relPath !== 'string') return '';
  const p = relPath.replace(/\\/g, '/');
  if (p.indexOf('docs/') === 0) return p.slice(5);
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(i + 1) : p;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { classifyTemplateCategory, templateDisplayName };
}
if (typeof window !== 'undefined') {
  window.classifyTemplateCategory = classifyTemplateCategory;
  window.templateDisplayName = templateDisplayName;
}
