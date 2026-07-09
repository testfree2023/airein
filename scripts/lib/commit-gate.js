/**
 * commit-gate.js — decide whether the pre-commit build/test gate applies.
 *
 * The pre-commit gate runs build + tests on every `git commit`. That is
 * expensive and only meaningful for commits that touch compilable/tested
 * source. Doc-only, config-only, or other non-source commits are exempt —
 * see 20-workflow.md "流程豁免" table ("文档/注释修改 → 全部流程可跳过",
 * "≤3 个源文件且不涉及架构变更 → 简化流程"). Running a full build+test on a
 * doc commit also blocks unrelated documentation work on pre-existing
 * failures, which is the bug this module exists to fix.
 *
 * `classifyStagedFiles` is a PURE function: given the staged file list and the
 * project's source-extension set, it buckets the files and decides whether the
 * gate should run. pre-commit-gate.js calls it so the decision is unit-testable
 * without spawning the hook or invoking git.
 *
 * @module commit-gate
 */

const path = require('path');

/**
 * Bucket staged file paths and decide whether the build/test gate runs.
 *
 * `runGate` is true when the commit stages any source OR test file; false for
 * doc/config/non-source-only commits. Test-only commits still run the gate
 * (tests are code and may exercise build output).
 *
 * @param {string[] | null | undefined} stagedFiles - Paths from
 *   `git diff --cached --name-only`. Blank/null entries are ignored.
 * @param {object} opts
 * @param {Set<string>} opts.sourceExtensions - Lowercased extensions incl. the
 *   leading dot, e.g. `.js` (the value of language-config.getSourceExtensions()).
 * @param {(f: string) => boolean} [opts.isTestFile] - Classifier returning true
 *   for test paths. Defaults to a no-op (test files then fall through to the
 *   source bucket by extension, which still yields runGate=true).
 * @returns {{ sourceFiles: string[], testFiles: string[], otherFiles: string[], runGate: boolean }}
 *   Buckets preserve original casing; entries are trimmed of surrounding
 *   whitespace and a trailing CR (CRLF from git on Windows).
 */
function classifyStagedFiles(stagedFiles, opts) {
  const exts = opts && opts.sourceExtensions ? opts.sourceExtensions : new Set();
  const isTest = typeof (opts && opts.isTestFile) === 'function' ? opts.isTestFile : () => false;

  const sourceFiles = [];
  const testFiles = [];
  const otherFiles = [];

  const list = Array.isArray(stagedFiles) ? stagedFiles : [];
  for (const raw of list) {
    const f = String(raw == null ? '' : raw).replace(/\r$/, '').trim();
    if (!f) continue;
    if (isTest(f)) { testFiles.push(f); continue; }
    if (exts.has(path.extname(f).toLowerCase())) { sourceFiles.push(f); continue; }
    otherFiles.push(f);
  }

  const runGate = sourceFiles.length > 0 || testFiles.length > 0;
  return { sourceFiles, testFiles, otherFiles, runGate };
}

module.exports = { classifyStagedFiles };
