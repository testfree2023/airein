/**
 * Contract: Agent Teams v0 role agents + thin commands (P008).
 *
 * Agents: pm | product-expert | tech-lead
 * Commands: tdd / code-review / verify
 */

const fs = require('fs');
const path = require('path');
const {
  describe, assertOk, assertEqual, assertContains, assertNotContains,
  projectRoot, printSummary,
} = require('./helpers');

const root = projectRoot();
const LEGACY_AGENTS = ['architect', 'code-reviewer', 'security-reviewer', 'tdd-guide'];
const ROLE_AGENTS = ['pm', 'product-expert', 'tech-lead'];
const FOUR_BLOCKS = ['## Scope', '## Inputs', '## Output contract', '## Failure modes'];

function readRepo(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z0-9_-]+):\s*(.+)$/);
    if (!kv) continue;
    out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

describe('airein agents: Agent Teams v0 roles', (suite) => {
  for (const name of LEGACY_AGENTS) {
    suite.test(`legacy agent ${name} must not exist`, () => {
      assertOk(!fs.existsSync(path.join(root, 'agents', `${name}.md`)), `agents/${name}.md removed`);
    });
  }

  suite.test('agents whitelist is pm + product-expert + tech-lead', () => {
    const files = fs.readdirSync(path.join(root, 'agents')).filter((f) => f.endsWith('.md')).sort();
    assertEqual(files.join(','), 'pm.md,product-expert.md,tech-lead.md', 'agent whitelist');
  });

  for (const name of ROLE_AGENTS) {
    suite.test(`${name}: frontmatter + four blocks + short card`, () => {
      const content = readRepo(`agents/${name}.md`);
      assertOk(content, `agents/${name}.md exists`);
      const fm = parseFrontmatter(content);
      assertEqual(fm.name, name, 'frontmatter name');
      for (const block of FOUR_BLOCKS) {
        assertContains(content, block, block);
      }
      assertContains(content, '## Learned preferences', 'self-learning appendix anchor');
      const lines = content.split(/\r?\n/).length;
      assertOk(lines <= 160, `${name} ≤ 160 lines (got ${lines})`);
    });
  }

  suite.test('product-expert binds requirements template path', () => {
    const content = readRepo('agents/product-expert.md');
    assertContains(content, 'templates/docs/requirements', 'requirements template path');
  });

  suite.test('tech-lead modes + design template path', () => {
    const content = readRepo('agents/tech-lead.md');
    assertContains(content, 'mode: design', 'design mode');
    assertContains(content, 'mode: review', 'review mode');
    assertContains(content, 'mode: security', 'security mode');
    assertContains(content, 'templates/docs/design', 'design template path');
    assertContains(content, 'docs/plans', 'plan docs path');
    assertContains(content, 'new-plan', 'defers planning to new-plan');
  });

  suite.test('tech-lead review: git diff + confidence + airein hooks', () => {
    const content = readRepo('agents/tech-lead.md');
    assertContains(content, 'git diff', 'gathers diff');
    assertContains(content, '80%', 'confidence filter');
    assertContains(content, 'scripts/lib', 'airein lib tests');
    assertNotContains(content, 'npm audit', 'no npm-centric default');
  });

  suite.test('tech-lead security: STOP + secrets', () => {
    const content = readRepo('agents/tech-lead.md');
    assertContains(content, 'STOP', 'iron-rule STOP');
    assertContains(content, 'secret', 'secrets focus');
  });

  suite.test('pm: orchestrates and does not solo PRD', () => {
    const content = readRepo('agents/pm.md');
    assertContains(content, 'product-expert', 'dispatches product-expert');
    assertContains(content, 'tech-lead', 'dispatches tech-lead');
    assertContains(content, '不包办', 'no solo ownership');
  });

  suite.test('manage-profile KEEP_AGENTS includes three roles', () => {
    const content = readRepo('scripts/manage-profile.js');
    assertContains(content, "'pm'", 'keeps pm');
    assertContains(content, "'product-expert'", 'keeps product-expert');
    assertContains(content, "'tech-lead'", 'keeps tech-lead');
    assertNotContains(content, "'code-reviewer'", 'no code-reviewer keep');
    assertNotContains(content, "'architect'", 'no architect keep');
    assertNotContains(content, "'security-reviewer'", 'no security-reviewer keep');
  });

  
  suite.test('rules/20 forces product-expert at requirements', () => {
    const content = readRepo('rules/20-workflow.md');
    assertContains(content, 'Agent Teams v0', 'v0 section');
    assertContains(content, 'product-expert', 'product-expert');
    assertContains(content, 'requirements', 'requirements node');
  });

  suite.test('new-plan skill dispatches product-expert for PRD', () => {
    const content = readRepo('skills/new-plan/SKILL.md');
    assertContains(content, 'product-expert', 'product-expert');
    assertContains(content, 'agents/product-expert.md', 'path');
  });

  suite.test('iron rules dispatch tech-lead modes', () => {
    const content = readRepo('rules/00-iron-rules.md');
    assertContains(content, 'tech-lead', 'mentions tech-lead');
    assertNotContains(content, 'code-reviewer', 'no legacy code-reviewer');
    assertNotContains(content, 'security-reviewer', 'no legacy security-reviewer');
  });
});

describe('airein commands: thin shells', (suite) => {
  suite.test('/tdd points at skills/tdd only', () => {
    const content = readRepo('commands/tdd.md');
    assertOk(content, 'commands/tdd.md exists');
    assertContains(content, 'skills/tdd', 'skill pointer');
    assertNotContains(content, 'tdd-guide', 'no tdd-guide');
  });

  suite.test('/code-review dispatches tech-lead mode:review', () => {
    const content = readRepo('commands/code-review.md');
    assertOk(content, 'commands/code-review.md exists');
    assertContains(content, 'tech-lead', 'dispatches tech-lead');
    assertContains(content, 'review', 'review mode');
    const lines = content.split(/\r?\n/).length;
    assertOk(lines <= 40, `/code-review thin shell ≤40 lines (got ${lines})`);
    assertNotContains(content, 'Functions > 50 lines', 'no duplicated checklist');
  });

  suite.test('/verify aligns with Verification Before Completion', () => {
    const content = readRepo('commands/verify.md');
    assertOk(content, 'commands/verify.md exists');
    assertContains(content, 'IDENTIFY', 'gate step');
    assertContains(content, '20-workflow', 'points at workflow gate');
    assertNotContains(content, 'npm test', 'does not assume npm test');
    assertNotContains(content, 'TypeScript/type checker', 'does not assume tsc');
  });
});

if (require.main === module) {
  const { failed } = printSummary();
  process.exit(failed > 0 ? 1 : 0);
}
