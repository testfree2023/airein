#!/usr/bin/env node
/**
 * git-worktree-context — detect linked worktree for /new-plan preflight.
 *
 * Planning docs belong in the primary checkout. Linked worktrees are for
 * coding isolation (flowControl.worktreeIsolation) after tasks are approved.
 *
 * Dual interface: require()-able (unit-tested) + CLI (skill-invoked).
 */

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

function canonicalizePath(p) {
  return path.resolve(p).replace(/\\/g, '/').toLowerCase();
}

function defaultRunGit(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  return {
    status: result.status === null ? 1 : result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function parseMainWorktree(porcelain) {
  if (!porcelain || typeof porcelain !== 'string') return null;
  const lines = porcelain.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      return line.slice('worktree '.length).trim();
    }
  }
  return null;
}

function buildWarning(cwdTop, mainWorktree) {
  return (
    `当前处于 git linked worktree（${cwdTop}），` +
    `/new-plan 规划文档应写在工程主工作区（${mainWorktree}）。` +
    `请切换到主目录后再继续；仅在开始编码且启用 worktreeIsolation 时再创建 worktree。`
  );
}

/**
 * @param {string} [cwd]
 * @param {{ runGit?: (args: string[], cwd: string) => { status: number, stdout: string, stderr: string } }} [opts]
 */
function inspectWorktreeContext(cwd, opts = {}) {
  const runGit = opts.runGit || defaultRunGit;
  const absCwd = path.resolve(cwd || process.cwd());

  const inside = runGit(['rev-parse', '--is-inside-work-tree'], absCwd);
  if (inside.status !== 0 || inside.stdout !== 'true') {
    return {
      ok: false,
      isLinkedWorktree: false,
      cwd: absCwd,
      toplevel: null,
      mainWorktree: null,
      warning: null,
    };
  }

  const top = runGit(['rev-parse', '--show-toplevel'], absCwd);
  const gitDir = runGit(['rev-parse', '--git-dir'], absCwd);
  const commonDir = runGit(['rev-parse', '--git-common-dir'], absCwd);

  if (top.status !== 0 || gitDir.status !== 0 || commonDir.status !== 0) {
    return {
      ok: false,
      isLinkedWorktree: false,
      cwd: absCwd,
      toplevel: null,
      mainWorktree: null,
      warning: null,
    };
  }

  const toplevel = path.resolve(absCwd, top.stdout);
  const resolvedGitDir = path.resolve(toplevel, gitDir.stdout);
  const resolvedCommon = path.resolve(toplevel, commonDir.stdout);
  const isLinked = canonicalizePath(resolvedGitDir) !== canonicalizePath(resolvedCommon);

  let mainWorktree = null;
  const list = runGit(['worktree', 'list', '--porcelain'], absCwd);
  if (list.status === 0) {
    const parsed = parseMainWorktree(list.stdout);
    if (parsed) mainWorktree = path.resolve(parsed);
  }
  if (!mainWorktree && !isLinked) {
    mainWorktree = toplevel;
  }

  let warning = null;
  if (isLinked) {
    warning = buildWarning(toplevel, mainWorktree || '(unknown main worktree)');
  }

  return {
    ok: true,
    isLinkedWorktree: isLinked,
    cwd: absCwd,
    toplevel,
    mainWorktree,
    warning,
  };
}

module.exports = {
  inspectWorktreeContext,
  canonicalizePath,
  parseMainWorktree,
  buildWarning,
};

if (require.main === module) {
  const target = process.argv[2] || process.cwd();
  const result = inspectWorktreeContext(target);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}
