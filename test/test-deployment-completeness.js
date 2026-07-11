/**
 * Test: Deployment Completeness
 *
 * Verifies that every native skill in skills/ is included in both
 * deployment paths (setup-airein.sh initial install, sync-airein.sh
 * updates). Prevents the drift where a skill is committed to the repo
 * but never reaches ~/.claude on update.
 *
 * Note: setup-airein.sh line ~119 does a bulk `rsync --ignore-existing`
 * (first-install only, never overwrites). Only the explicitly-listed rsync
 * lines force-update a skill, so every native skill must appear in that
 * explicit list too.
 */

const { describe, assertOk, assertEqual, projectRoot, printSummary } = require('./helpers');
const fs = require('fs');
const path = require('path');

const root = projectRoot();
const skillsDir = path.join(root, 'skills');

const nativeSkills = fs.readdirSync(skillsDir)
  .filter(d => fs.statSync(path.join(skillsDir, d)).isDirectory())
  .filter(d => fs.existsSync(path.join(skillsDir, d, 'SKILL.md')))
  .sort();

describe('Deployment completeness: every native skill in both paths', suite => {
  suite.test('skills/ has the 12 expected native skills', () => {
    assertOk(nativeSkills.length === 12, `expected 12 native skills, got ${nativeSkills.length}: ${nativeSkills.join(', ')}`);
  });

  suite.test('sync-airein.sh SKILL_DIRS lists every native skill', () => {
    const content = fs.readFileSync(path.join(root, 'scripts/update/sync-airein.sh'), 'utf8');
    const block = content.match(/SKILL_DIRS=\(([\s\S]*?)\)/);
    assertOk(block, 'SKILL_DIRS array block found in sync-airein.sh');
    const listed = block[1].split(/\n/)
      .map(l => l.trim().replace(/["']/g, ''))
      .filter(s => s && !s.startsWith('#'));
    for (const skill of nativeSkills) {
      assertOk(listed.includes(skill), `sync SKILL_DIRS must include "${skill}"`);
    }
    assertEqual(listed.length, nativeSkills.length, 'sync SKILL_DIRS has no extra entries');
  });

  suite.test('setup-airein.sh explicitly rsyncs every native skill', () => {
    const content = fs.readFileSync(path.join(root, 'setup-airein.sh'), 'utf8');
    for (const skill of nativeSkills) {
      assertOk(
        content.includes(`skills/${skill}/`),
        `setup-airein.sh must have explicit rsync for "skills/${skill}/"`
      );
    }
  });
});

process.exit(printSummary());
