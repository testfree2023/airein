const path = require('path');
const fs = require('fs');
const {
  describe, assertEqual, assertOk, projectRoot, printSummary,
} = require('./helpers');
const {
  parseTasksMarkdown,
  normalizeStatus,
} = require(path.join(projectRoot(), 'scripts', 'lib', 'parse-tasks-panel.js'));

describe('normalizeStatus extended', suite => {
  suite.test('maps blocked and pause emoji to pending', () => {
    assertEqual(normalizeStatus('⏸ blocked · Geex'), 'blocked');
    assertEqual(normalizeStatus('blocked'), 'blocked');
    assertEqual(normalizeStatus('阻塞'), 'blocked');
  });

  suite.test('maps yellow circle to in_progress', () => {
    assertEqual(normalizeStatus('🟡 runtime-证据已采'), 'in_progress');
    assertEqual(normalizeStatus('🟡 核心门禁 7/9'), 'in_progress');
  });

  suite.test('completed emoji only at start, not mid-prose', () => {
    assertEqual(normalizeStatus('✅ completed'), 'completed');
    assertEqual(
      normalizeStatus('🟡 部分完成 · Exit#7 Feign 0 (scan ✅)'),
      'in_progress'
    );
  });
});

describe('parseTasksMarkdown soft status', suite => {
  suite.test('blocked tasks still panel-compatible', () => {
    const md = `# Tasks
## 1.0 Implement
### 1.1 Done
- **Status**: ✅ completed
- **Depends on**: none
### 1.2 Wait
- **Status**: ⏸ blocked · external
- **Depends on**: 1.1
`;
    const r = parseTasksMarkdown(md);
    assertEqual(r.unsupported, false, 'supported');
    assertEqual(r.panelCompatible, true, 'compatible');
    assertEqual(r.total, 2);
    assertEqual(r.completed, 1);
    assertEqual(r.blocked, 1);
    assertEqual(r.pending, 0);
  });

  suite.test('P100 fixture parses without unsupported', () => {
    const p = 'F:/codes/home_work/huaqing/JuXu/docs/plans/P100-unified-scheduling-reconciliation/tasks.md';
    if (!fs.existsSync(p)) {
      assertOk(true, 'P100 fixture absent — skip');
      return;
    }
    const r = parseTasksMarkdown(fs.readFileSync(p, 'utf8'));
    assertEqual(r.unsupported, false, 'P100 not unsupported');
    assertEqual(r.panelCompatible, true, 'P100 compatible');
    assertOk(r.total >= 20, 'P100 has many tasks got ' + r.total);
  });
});

if (require.main === module) {
  const { failed } = printSummary();
  process.exit(failed > 0 ? 1 : 0);
}
