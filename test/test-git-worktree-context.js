/**
 * Test: scripts/lib/git-worktree-context.js — linked worktree detect for /new-plan
 */

'use strict';

const path = require('path');
const {
  describe, assertEqual, assertOk, assertContains, assertNotContains, projectRoot
} = require('./helpers');

const {
  inspectWorktreeContext,
  canonicalizePath,
  parseMainWorktree,
  buildWarning,
} = require(path.join(projectRoot(), 'scripts', 'lib', 'git-worktree-context'));

function mockRunGit(map) {
  return (args, cwd) => {
    const key = args.join(' ');
    if (typeof map === 'function') return map(args, cwd);
    const entry = map[key];
    if (!entry) {
      return { status: 128, stdout: '', stderr: `unexpected git ${key}` };
    }
    return { status: entry.status ?? 0, stdout: entry.stdout ?? '', stderr: entry.stderr ?? '' };
  };
}

describe('git-worktree-context helpers', suite => {
  suite.test('canonicalizePath collapses separators and case', () => {
    const a = canonicalizePath('F:\\Codes\\Repo');
    const b = canonicalizePath('f:/codes/repo');
    assertEqual(a, b, 'Windows-style paths canonicalize equal');
  });

  suite.test('parseMainWorktree takes first porcelain worktree line', () => {
    const porcelain = [
      'worktree /repos/main',
      'HEAD abc',
      'branch refs/heads/main',
      '',
      'worktree /repos/feature-wt',
      'HEAD def',
      'branch refs/heads/feature',
    ].join('\n');
    assertEqual(parseMainWorktree(porcelain), '/repos/main', 'first worktree is main');
  });

  suite.test('buildWarning names cwd and main', () => {
    const msg = buildWarning('/wt', '/main');
    assertContains(msg, '/wt', 'mentions linked path');
    assertContains(msg, '/main', 'mentions main path');
    assertContains(msg, '/new-plan', 'mentions new-plan');
  });
});

describe('inspectWorktreeContext', suite => {
  suite.test('non-git cwd → not linked, no warning', () => {
    const result = inspectWorktreeContext('/tmp/not-a-repo', {
      runGit: mockRunGit({
        'rev-parse --is-inside-work-tree': { status: 128, stdout: '' },
      }),
    });
    assertEqual(result.ok, false, 'ok false outside git');
    assertEqual(result.isLinkedWorktree, false, 'not linked');
    assertEqual(result.warning, null, 'no warning');
  });

  suite.test('main worktree → not linked, no warning', () => {
    const main = path.resolve('/repos/app');
    const result = inspectWorktreeContext(main, {
      runGit: mockRunGit({
        'rev-parse --is-inside-work-tree': { stdout: 'true' },
        'rev-parse --show-toplevel': { stdout: main },
        'rev-parse --git-dir': { stdout: '.git' },
        'rev-parse --git-common-dir': { stdout: '.git' },
        'worktree list --porcelain': {
          stdout: `worktree ${main}\nHEAD abc\nbranch refs/heads/main\n`,
        },
      }),
    });
    assertEqual(result.ok, true, 'ok');
    assertEqual(result.isLinkedWorktree, false, 'main is not linked');
    assertEqual(result.mainWorktree, main, 'mainWorktree is toplevel');
    assertEqual(result.warning, null, 'no warning on main');
  });

  suite.test('linked worktree → warning points at main', () => {
    const main = path.resolve('/repos/app');
    const wt = path.resolve('/repos/app-feature');
    const result = inspectWorktreeContext(wt, {
      runGit: mockRunGit({
        'rev-parse --is-inside-work-tree': { stdout: 'true' },
        'rev-parse --show-toplevel': { stdout: wt },
        'rev-parse --git-dir': { stdout: path.join(main, '.git', 'worktrees', 'feature') },
        'rev-parse --git-common-dir': { stdout: path.join(main, '.git') },
        'worktree list --porcelain': {
          stdout: [
            `worktree ${main}`,
            'HEAD abc',
            'branch refs/heads/main',
            '',
            `worktree ${wt}`,
            'HEAD def',
            'branch refs/heads/feature',
          ].join('\n'),
        },
      }),
    });
    assertEqual(result.ok, true, 'ok');
    assertEqual(result.isLinkedWorktree, true, 'detected linked');
    assertEqual(result.toplevel, wt, 'toplevel is linked checkout');
    assertEqual(result.mainWorktree, main, 'resolves main worktree');
    assertOk(result.warning, 'warning present');
    assertContains(result.warning, main, 'warning includes main path');
    assertContains(result.warning, wt, 'warning includes linked path');
  });
});

describe('new-plan + workflow docs: planning stays on main', suite => {
  suite.test('20-workflow.md says planning stays on main worktree', () => {
    const rules = require('fs').readFileSync(
      path.join(projectRoot(), 'rules', '20-workflow.md'),
      'utf8'
    );
    assertContains(rules, '/new-plan', 'mentions new-plan in branch strategy');
    assertContains(rules, '主工作区', 'planning on main checkout');
    assertContains(rules, '开始编码', 'worktree after coding starts');
  });

  suite.test('new-plan skill runs worktree context preflight', () => {
    const skill = require('fs').readFileSync(
      path.join(projectRoot(), 'skills', 'new-plan', 'SKILL.md'),
      'utf8'
    );
    assertContains(skill, 'git-worktree-context.js', 'invokes worktree context CLI');
    assertContains(skill, 'isLinkedWorktree', 'checks linked flag');
    assertNotContains(skill, 'Dashboard 聚合', 'no dashboard worktree-plan aggregation');
  });
});

const { printSummary } = require('./helpers');
process.exit(printSummary());
