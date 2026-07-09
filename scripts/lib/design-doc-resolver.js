#!/usr/bin/env node
/**
 * design-doc-resolver — establishing vs referencing judgment for new-plan.
 *
 * Determines whether a project already has PROJECT-LEVEL design docs
 * (engineering conventions + architecture). Checked in two places:
 *
 *   1. Archived (project-level, stable): docs/conventions.md, docs/architecture.md
 *   2. In-flight plans (not yet archived): docs/plans/{plan}/design-conventions.md,
 *      docs/plans/{plan}/design-architecture.md
 *
 * Result drives new-plan's Phase 3 design step:
 *   - establishing (no docs anywhere) → generate BOTH design-conventions.md +
 *     design-architecture.md in the new plan, regardless of project size /
 *     complexity tier / frontend-or-backend. The unified design.md indexes them.
 *   - referencing (docs exist) → generate a unified design.md that LINKS to the
 *     existing conventions/architecture instead of regenerating them.
 *
 * Dual interface: require()-able module (unit-tested) + CLI (skill-invoked).
 */

const fs = require('fs');
const path = require('path');

/**
 * Detect existing project-level design docs for a project.
 *
 * @param {string} projectDir - absolute project root
 * @returns {{
 *   establishing: boolean,
 *   conventions: { exists: boolean, path: string|null, source: 'archived'|'plan'|null },
 *   architecture: { exists: boolean, path: string|null, source: 'archived'|'plan'|null },
 *   deployment: { exists: boolean, path: string|null, source: 'archived'|'plan'|null },
 * }}
 */
// Match legacy docs/conventions.md OR multi-scope docs/conventions-{scope}.md (P018).
// Scope token is lowercase alphanumeric (e.g. nodejs, bash, python, typescript).
const CONVENTIONS_FILE_RE = /^conventions(-[a-z0-9]+)?\.md$/i;

function findArchivedConventions(docsDir) {
  if (!fs.existsSync(docsDir) || !fs.statSync(docsDir).isDirectory()) return null;
  for (const entry of fs.readdirSync(docsDir)) {
    if (CONVENTIONS_FILE_RE.test(entry)) {
      return path.join(docsDir, entry);
    }
  }
  return null;
}

function resolveProjectDesignDocs(projectDir) {
  const result = {
    establishing: false,
    conventions: { exists: false, path: null, source: null },
    architecture: { exists: false, path: null, source: null },
    deployment: { exists: false, path: null, source: null },
  };

  // 1. Archived (project-level) — highest priority source.
  //    Conventions: legacy single file (docs/conventions.md) OR multi-scope
  //    (docs/conventions-{scope}.md, P018). Either counts as established.
  const archivedConventions = findArchivedConventions(path.join(projectDir, 'docs'));
  if (archivedConventions) {
    result.conventions = { exists: true, path: archivedConventions, source: 'archived' };
  }
  const archivedArchitecture = path.join(projectDir, 'docs', 'architecture.md');
  if (fs.existsSync(archivedArchitecture)) {
    result.architecture = { exists: true, path: archivedArchitecture, source: 'archived' };
  }
  const archivedDeployment = path.join(projectDir, 'docs', 'deployment.md');
  if (fs.existsSync(archivedDeployment)) {
    result.deployment = { exists: true, path: archivedDeployment, source: 'archived' };
  }

  // 2. In-flight plans — fill only what archived didn't already provide.
  const plansDir = path.join(projectDir, 'docs', 'plans');
  if (fs.existsSync(plansDir) && fs.statSync(plansDir).isDirectory()) {
    for (const entry of fs.readdirSync(plansDir)) {
      const planDir = path.join(plansDir, entry);
      if (!fs.statSync(planDir).isDirectory()) continue;
      if (!result.conventions.exists) {
        const p = path.join(planDir, 'design-conventions.md');
        if (fs.existsSync(p)) {
          result.conventions = { exists: true, path: p, source: 'plan' };
        }
      }
      if (!result.architecture.exists) {
        const p = path.join(planDir, 'design-architecture.md');
        if (fs.existsSync(p)) {
          result.architecture = { exists: true, path: p, source: 'plan' };
        }
      }
      // Pipeline-stage doc 'deployment.md' only — NOT design sub-doc 'design-deployment.md'
      // (per P020 decision 1: pipelines.json l-feature.docs names 'deployment' as top-level).
      if (!result.deployment.exists) {
        const p = path.join(planDir, 'deployment.md');
        if (fs.existsSync(p)) {
          result.deployment = { exists: true, path: p, source: 'plan' };
        }
      }
      if (result.conventions.exists && result.architecture.exists && result.deployment.exists) break;
    }
  }

  // establishing = neither project-level doc exists anywhere. First design-bearing
  // plan must establish both.
  result.establishing = !result.conventions.exists && !result.architecture.exists;
  return result;
}

module.exports = { resolveProjectDesignDocs };

// ── CLI ────────────────────────────────────────────────────────────
if (require.main === module) {
  const projectDir = process.argv[2] || process.cwd();
  const result = resolveProjectDesignDocs(projectDir);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}
