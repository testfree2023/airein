/**
 * progress-approval-gate — progress.md may mark a pipeline phase approved
 * only after that phase doc's ## Status is already approved.
 * For tasks, also require panel-contract-parseable tasks.md.
 * Pure functions; enforcement at approval time only (not every tasks edit).
 */

'use strict';

const { getApprovalState, getDocStatus } = require('./plan-parser');
const { parseTasksMarkdown } = require('./parse-tasks-panel');

function classifyProgressDoc(filePath) {
  if (!filePath) return false;
  const n = String(filePath).replace(/\\/g, '/').replace(/\/+/g, '/');
  return /\/docs\/plans\/[^/]+\/progress\.md$/i.test(n);
}

function newlyApprovedPhases(oldContent, newContent) {
  const oldState = getApprovalState(oldContent || '');
  const newState = getApprovalState(newContent || '');
  const keys = Object.keys(newState);
  const out = [];
  for (let i = 0; i < keys.length; i++) {
    const phase = keys[i];
    if (newState[phase] === 'approved' && oldState[phase] !== 'approved') {
      out.push(phase);
    }
  }
  return out;
}

/**
 * @param {object} opts
 * @param {boolean} [opts.enabled]
 * @param {'strict'|'advisory'} [opts.mode]
 * @param {string} opts.filePath
 * @param {string} opts.newContent
 * @param {string|null} [opts.oldContent]
 * @param {Object.<string, string>} [opts.phaseDocs] — phase → markdown content
 * @returns {{ allow: boolean, advisory: boolean, violations: object[], message: string|null }}
 */
function evaluateProgressApprovalGate(opts) {
  const enabled = !opts || opts.enabled !== false;
  const mode = (opts && opts.mode) || 'strict';
  const advisory = mode === 'advisory';
  const emptyOk = { allow: true, advisory: false, violations: [], message: null };

  if (!enabled) return emptyOk;
  if (!classifyProgressDoc(opts.filePath)) return emptyOk;

  const phases = newlyApprovedPhases(opts.oldContent, opts.newContent);
  if (!phases.length) return emptyOk;

  const phaseDocs = (opts && opts.phaseDocs) || {};
  const violations = [];

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const docContent = phaseDocs[phase];
    if (docContent == null) {
      violations.push({
        phase: phase,
        reason: 'phase_doc_missing',
        docStatus: 'none',
      });
      continue;
    }

    const docStatus = getDocStatus(docContent);
    if (docStatus !== 'approved') {
      violations.push({
        phase: phase,
        reason: 'doc_status_not_approved',
        docStatus: docStatus,
      });
    }

    if (phase === 'tasks') {
      const parsed = parseTasksMarkdown(docContent);
      if (!parsed || parsed.unsupported || !parsed.total) {
        violations.push({
          phase: 'tasks',
          reason: 'tasks_format_invalid',
          unsupported: !!(parsed && parsed.unsupported),
          total: parsed ? parsed.total : 0,
        });
      }
    }
  }

  if (!violations.length) return emptyOk;

  const lines = violations.map(function (v) {
    if (v.reason === 'doc_status_not_approved') {
      return (
        '- ' + v.phase + '.md：请先把文末 ## Status 改为 approved（当前: ' +
        v.docStatus + '），再写 progress Approval State'
      );
    }
    if (v.reason === 'tasks_format_invalid') {
      return (
        '- tasks.md：面板契约格式不正确（需 ## 阶段 + ### 任务 ID + Status/Kind/Depends on；' +
        '旧 checklist 模板不支持）'
      );
    }
    if (v.reason === 'phase_doc_missing') {
      return '- ' + v.phase + '.md：文件不存在，无法审批';
    }
    return '- ' + v.phase + ': ' + v.reason;
  });

  const message =
    '[progress-approval-gate] 审批 progress 前须满足文档前提：\n' +
    lines.join('\n') +
    '\n（不在每次改 tasks.md 时检查——只卡审批。或设 quality.json progressApprovalGate.enabled=false）';

  return {
    allow: advisory,
    advisory: advisory,
    violations: violations,
    message: message,
  };
}

module.exports = {
  classifyProgressDoc: classifyProgressDoc,
  newlyApprovedPhases: newlyApprovedPhases,
  evaluateProgressApprovalGate: evaluateProgressApprovalGate,
};
