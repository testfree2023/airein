/**
 * Test: Anti-Rationalization Table + Verification Gate (F2)
 *
 * Verifies:
 *   - tdd-workflow SKILL.md contains the anti-rationalization table with ≥8 entries
 *   - Red Flags section exists
 *   - Iron Law statement exists
 *   - verification-loop has 5-step gate with forbidden phrases
 *   - verification-loop has claim/evidence table
 */

const { describe, assertOk, assertContains, readSkill } = require('./helpers');

describe('F2: Anti-rationalization table (tdd-workflow)', suite => {
  const content = readSkill('tdd-workflow');
  if (!content) return;

  suite.test('has "Common Rationalizations" heading', () => {
    assertContains(content, 'Common Rationalizations', 'heading');
  });

  suite.test('has "Anti-Skip Enforcement" label', () => {
    assertContains(content, 'Anti-Skip Enforcement', 'enforcement label');
  });

  suite.test('table has ≥8 Chinese rationalization entries', () => {
    const section = content.split('## Common Rationalizations')[1] || '';
    const sectionUntilNext = section.split('## ')[0];
    const allRows = sectionUntilNext.match(/^\|.+\|.+\|$/gm) || [];
    // Exclude separator rows like |---|---|
    const dataRows = allRows.filter(r => !/^\|[\s\-:|]+\|$/.test(r));
    assertOk(dataRows.length >= 8, `found ${dataRows.length} table rows, need >= 8`);
  });

  suite.test('table mentions "测试" (test)', () => {
    assertContains(content, '测试', 'test mention');
  });

  suite.test('table mentions "重构" (refactor)', () => {
    assertContains(content, '重构', 'refactor mention');
  });

  suite.test('has Red Flags section', () => {
    assertContains(content, 'Red Flags', 'red flags heading');
  });

  suite.test('Red Flags mentions "just this once"', () => {
    assertContains(content, 'just this once', 'just this once pattern');
  });

  suite.test('has Iron Law statement', () => {
    assertContains(content, 'Iron Law', 'iron law');
  });
});

describe('F2: Verification Before Completion gate (verification-loop)', suite => {
  const content = readSkill('verification-loop');
  if (!content) return;

  suite.test('has 5-step gate procedure', () => {
    assertContains(content, '**IDENTIFY**', 'step 1');
    assertContains(content, '**RUN**', 'step 2');
    assertContains(content, '**READ**', 'step 3');
    assertContains(content, '**VERIFY**', 'step 4');
    assertContains(content, '**ONLY THEN**', 'step 5');
  });

  suite.test('has forbidden phrases section', () => {
    assertContains(content, '禁止使用的措辞', 'forbidden phrases heading');
    assertContains(content, 'should work now', 'forbidden phrase 1');
    assertContains(content, '看起来没问题', 'forbidden phrase 2');
    assertContains(content, '应该能跑通了', 'forbidden phrase 3');
  });

  suite.test('has claim/evidence table', () => {
    // Table should have rows mapping claims to required evidence
    assertContains(content, '声明', 'claim column');
    assertContains(content, '必须有', 'required evidence column');
    assertContains(content, '不够的', 'insufficient evidence column');
  });

  suite.test('claim table covers key scenarios', () => {
    assertContains(content, '测试通过', 'test pass claim');
    assertContains(content, '构建成功', 'build success claim');
    assertContains(content, 'Bug 已修复', 'bug fixed claim');
    assertContains(content, '需求已满足', 'requirement satisfied claim');
  });
});

// ── Run standalone ─────────────────────────────────────────────────
const { printSummary } = require('./helpers');
process.exit(printSummary());
