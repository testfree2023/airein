/**
 * Test: Deployment Completeness
 *
 * Verifies that every native skill in skills/ is included in deployment
 * paths (airein setup full-kernel copy, sync-airein.sh incremental updates).
 * Prevents drift where a skill is committed but never reaches installs.
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
  suite.test('skills/ has the 10 expected native skills', () => {
    assertOk(nativeSkills.length === 10, `expected 10 native skills, got ${nativeSkills.length}: ${nativeSkills.join(', ')}`);
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

  suite.test('airein CLI is the unified install entry (legacy scripts removed)', () => {
    const aireinPath = path.join(root, 'airein');
    assertOk(fs.existsSync(aireinPath), 'airein CLI must exist at repo root');
    const content = fs.readFileSync(aireinPath, 'utf8');
    assertOk(content.includes('install-orchestrator'), 'airein must delegate to install-orchestrator');
    assertOk(!fs.existsSync(path.join(root, 'setup-airein.sh')), 'setup-airein.sh must be removed');
    assertOk(!fs.existsSync(path.join(root, 'update-airein.sh')), 'update-airein.sh must be removed');
  });
});

process.exit(printSummary());
