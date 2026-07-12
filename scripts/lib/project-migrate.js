/**
 * project-migrate — P004 项目数据层迁移（legacy .claude/ → canonical .airein/）
 *
 * 纯函数：生成迁移计划 + 执行（可被 CLI 与测试直调）。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  AIREIN_PROJECT_DIR,
  LEGACY_PROJECT_DIR,
  hasAireinMarkers,
  hasLegacyMarkers,
} = require('./project-paths');
const { planCcRulesShim, ensureCcRulesShim } = require('./project-shim');

/** @typedef {{ kind: 'file'|'dir', from: string, to: string, label: string }} MigrateAction */

function pathExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function isEmptyDir(dir) {
  if (!pathExists(dir)) return true;
  try {
    return fs.readdirSync(dir).length === 0;
  } catch {
    return false;
  }
}

function fileLineCount(fp) {
  try {
    return fs.readFileSync(fp, 'utf8').split('\n').length;
  } catch {
    return 999;
  }
}

/**
 * 单文件迁移决策（与 migrate-paths.sh 语义对齐）。
 * @returns {'move'|'skip'|'replace-template'|'drop-old'|null}
 */
function decideFileMigration(oldPath, newPath) {
  if (!pathExists(oldPath)) return null;
  if (!pathExists(newPath)) return 'move';
  if (fileLineCount(newPath) <= 3) return 'replace-template';
  return 'drop-old';
}

/**
 * @param {string} projectRoot
 * @returns {{ needed: boolean, actions: MigrateAction[], warnings: string[], errors: string[] }}
 */
function planProjectMigrate(projectRoot) {
  const root = path.resolve(projectRoot);
  const legacy = path.join(root, LEGACY_PROJECT_DIR);
  const canonical = path.join(root, AIREIN_PROJECT_DIR);
  const actions = [];
  const warnings = [];
  const errors = [];

  if (!hasLegacyMarkers(root) && hasAireinMarkers(root)) {
    return { needed: false, actions, warnings: ['已是 .airein 结构，无需迁移'], errors };
  }

  if (!hasLegacyMarkers(root)) {
    return {
      needed: false,
      actions,
      warnings: ['未检测到 legacy .claude 项目标记，跳过'],
      errors,
    };
  }

  const filePairs = [
    [path.join(legacy, 'quality.json'), path.join(canonical, 'config', 'quality.json'), 'quality.json → .airein/config/'],
    [path.join(legacy, 'config', 'quality.json'), path.join(canonical, 'config', 'quality.json'), 'config/quality.json → .airein/config/'],
    [path.join(legacy, 'memory', 'session-state.md'), path.join(canonical, 'memory', 'session-state.md'), 'session-state.md → .airein/memory/'],
    [path.join(legacy, 'memory', 'memory.md'), path.join(canonical, 'memory', 'memory.md'), 'memory.md → .airein/memory/'],
    [path.join(legacy, 'memory', 'project-knowledge.md'), path.join(canonical, 'memory', 'project-knowledge.md'), 'project-knowledge.md → .airein/memory/'],
    [path.join(legacy, 'memory', 'error-patterns.md'), path.join(canonical, 'memory', 'error-patterns.md'), 'error-patterns.md → .airein/memory/'],
  ];

  for (const [from, to, label] of filePairs) {
    const decision = decideFileMigration(from, to);
    if (decision === 'move' || decision === 'replace-template') {
      actions.push({ kind: 'file', from, to, label });
    } else if (decision === 'drop-old') {
      warnings.push(`保留新路径已有内容，将删除旧文件: ${label}`);
      actions.push({ kind: 'file', from, to: from, label: `删除旧文件: ${label}` });
    }
  }

  const dirPairs = [
    [path.join(legacy, 'memory'), path.join(canonical, 'memory'), 'memory/ 目录合并'],
    [path.join(legacy, 'logs'), path.join(canonical, 'logs'), 'logs/ 目录合并'],
    [path.join(legacy, 'self-learning'), path.join(canonical, 'self-learning'), 'self-learning/ 目录合并'],
    [path.join(legacy, 'rules'), path.join(canonical, 'rules'), 'rules/ → .airein/rules/'],
  ];

  for (const [from, to, label] of dirPairs) {
    if (!pathExists(from)) continue;
    try {
      if (!fs.statSync(from).isDirectory()) continue;
    } catch {
      continue;
    }
    if (isEmptyDir(from)) continue;
    actions.push({ kind: 'dir', from, to, label });
  }

  const shimPlan = planCcRulesShim(root);
  if (shimPlan.errors.length > 0) {
    for (const e of shimPlan.errors) warnings.push(`CC rules shim: ${e}`);
  }

  return { needed: actions.length > 0 || shimPlan.actions.some((a) => a.type !== 'noop'), actions, warnings, errors };
}

function ensureParentDir(fp) {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
}

function moveFile(from, to) {
  ensureParentDir(to);
  fs.renameSync(from, to);
}

function mergeDir(from, to) {
  if (!pathExists(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    const dest = path.join(to, name);
    const st = fs.statSync(src);
    if (st.isDirectory()) {
      mergeDir(src, dest);
      if (isEmptyDir(src)) fs.rmdirSync(src);
    } else if (!pathExists(dest)) {
      fs.renameSync(src, dest);
    }
  }
  if (isEmptyDir(from)) {
    try { fs.rmdirSync(from); } catch { /* noop */ }
  }
}

/**
 * @param {string} projectRoot
 * @param {{ dryRun?: boolean, skipShim?: boolean }} [opts]
 */
function migrateProjectToAirein(projectRoot, opts = {}) {
  const dryRun = opts.dryRun === true;
  const root = path.resolve(projectRoot);
  const plan = planProjectMigrate(root);
  const log = [];
  let moved = 0;

  if (plan.errors.length > 0) {
    return { ok: false, moved, log, plan, error: plan.errors.join('; ') };
  }

  if (!plan.needed) {
    return { ok: true, moved: 0, log: plan.warnings, plan, noop: true };
  }

  for (const action of plan.actions) {
    if (action.kind === 'file') {
      const decision = decideFileMigration(action.from, action.to);
      if (decision === 'drop-old') {
        if (!dryRun && pathExists(action.from)) fs.unlinkSync(action.from);
        log.push(`🗑️  ${action.label}`);
        moved += 1;
        continue;
      }
      if (!pathExists(action.from)) continue;
      if (dryRun) {
        log.push(`[dry-run] ${action.label}`);
      } else {
        moveFile(action.from, action.to);
        log.push(`✅ ${action.label}`);
      }
      moved += 1;
    } else if (action.kind === 'dir') {
      if (dryRun) {
        log.push(`[dry-run] ${action.label}`);
      } else {
        mergeDir(action.from, action.to);
        log.push(`✅ ${action.label}`);
      }
      moved += 1;
    }
  }

  let shim = { ok: true };
  if (opts.skipShim !== true) {
    shim = dryRun ? { ok: true, dryRun: true } : ensureCcRulesShim(root);
    if (shim.ok) log.push('✅ .claude/rules → .airein/rules shim');
    else log.push(`⚠️  CC rules shim: ${shim.error || 'failed'}`);
  }

  return {
    ok: shim.ok !== false,
    moved,
    log,
    plan,
    shim,
    warnings: plan.warnings,
  };
}

module.exports = {
  planProjectMigrate,
  migrateProjectToAirein,
  decideFileMigration,
};
