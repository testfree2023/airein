/**
 * progress-panel — Progress page board helpers (P006).
 * Browser global + Node module.exports for tests.
 * Wrapped in IIFE so top-level names (api/esc) do not clash with index.html.
 */
(function (root) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Flatten stages into document-order task list.
   * @param {object} taskData
   * @returns {object[]}
   */
  function flattenTasks(taskData) {
    const out = [];
    const stages = (taskData && taskData.tasks) || [];
    for (let i = 0; i < stages.length; i++) {
      const tasks = stages[i].tasks || [];
      for (let j = 0; j < tasks.length; j++) out.push(tasks[j]);
    }
    return out;
  }


  /**
   * Mermaid-safe node id from task id (e.g. 1.1 → T1_1).
   * @param {string} taskId
   * @returns {string}
   */
  function mermaidNodeId(taskId) {
    return 'T' + String(taskId == null ? '' : taskId).replace(/[^A-Za-z0-9_]/g, '_');
  }

  /**
   * Sanitize label for mermaid node text.
   * @param {string} id
   * @param {string} name
   * @returns {string}
   */
  function mermaidLabel(id, name) {
    return (String(id || '') + ' ' + String(name || ''))
      .replace(/[\[\]"#*`]/g, '')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Build Mermaid flowchart source from Depends on edges (DAG).
   * @param {object} taskData
   * @returns {string|null} null when no edges
   */
  function buildDependencyMermaid(taskData) {
    const flat = flattenTasks(taskData);
    if (!flat.length) return null;

    const edgeLines = [];
    const seenEdge = Object.create(null);
    const involved = Object.create(null);

    const knownIds = Object.create(null);
    for (let i = 0; i < flat.length; i++) knownIds[flat[i].id] = true;

    for (let i = 0; i < flat.length; i++) {
      const task = flat[i];
      const deps = task.dependsOn || [];
      for (let d = 0; d < deps.length; d++) {
        const depId = deps[d];
        if (!knownIds[depId]) continue;
        const from = mermaidNodeId(depId);
        const to = mermaidNodeId(task.id);
        const key = from + '->' + to;
        if (seenEdge[key]) continue;
        seenEdge[key] = true;
        involved[depId] = true;
        involved[task.id] = true;
        edgeLines.push('  ' + from + ' --> ' + to);
      }
    }
    if (!edgeLines.length) return null;

    const lines = ['flowchart LR'];
    const declared = Object.create(null);
    for (let i = 0; i < flat.length; i++) {
      const task = flat[i];
      if (!involved[task.id]) continue;
      const nid = mermaidNodeId(task.id);
      if (declared[nid]) continue;
      declared[nid] = true;
      lines.push('  ' + nid + '["' + mermaidLabel(task.id, task.name) + '"]');
    }
    lines.push('  classDef completed fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20');
    lines.push('  classDef in_progress fill:#e3f2fd,stroke:#1565c0,color:#0d47a1');
    lines.push('  classDef pending fill:#fff8e1,stroke:#f9a825,color:#f57f17');

    for (let i = 0; i < flat.length; i++) {
      const task = flat[i];
      if (!involved[task.id]) continue;
      const st = task.status || 'pending';
      const cls = (st === 'completed' || st === 'in_progress' || st === 'pending') ? st : 'pending';
      lines.push('  class ' + mermaidNodeId(task.id) + ' ' + cls);
    }

    return lines.concat(edgeLines).join('\n');
  }

  /**
   * Render panel board HTML (read-only).
   * @param {object} taskData — API shape from parseTasksMarkdown
   * @param {function} t — i18n (key) => string
   * @returns {string}
   */
  function renderPanelBoard(taskData, t) {
    const translate = typeof t === 'function' ? t : function (k) { return k; };
    if (taskData && taskData.unsupported) {
      const msg = taskData.unsupportedMessage || translate('progress.legacyUnsupported');
      return (
        '<div class="progress-panel-unsupported empty">' +
        '<p>' + esc(msg) + '</p></div>'
      );
    }

    const flat = flattenTasks(taskData);
    if (!flat.length) {
      return '<div class="empty"><p>' + esc(translate('progress.noTasks')) + '</p></div>';
    }

    const nodes = flat.map(function (task) {
      const status = task.status || 'pending';
      const current = status === 'in_progress' ? ' is-current' : '';
      return (
        '<div class="progress-panel-node status-' + esc(status) + current + '" data-task-id="' + esc(task.id) + '">' +
        '<span class="progress-panel-id">' + esc(task.id) + '</span>' +
        '<span class="progress-panel-name">' + esc(task.name) + '</span>' +
        '<span class="badge badge-' + esc(status) + '">' + esc(status) + '</span>' +
        '</div>'
      );
    }).join('');

    const edges = [];
    for (let i = 0; i < flat.length; i++) {
      const deps = flat[i].dependsOn || [];
      for (let d = 0; d < deps.length; d++) {
        edges.push(
          '<div class="progress-panel-edge" data-edge="' +
          esc(deps[d]) + '->' + esc(flat[i].id) + '">' +
          esc(deps[d]) + ' \u2192 ' + esc(flat[i].id) + '</div>'
        );
      }
    }

    const mermaidSrc = buildDependencyMermaid(taskData);
    const depsHtml = edges.length
      ? (
        '<div class="progress-panel-deps">' +
        '<div class="progress-panel-edges-label">' +
        esc(translate('progress.dependencies')) + '</div>' +
        (mermaidSrc
          ? '<div class="mermaid progress-panel-mermaid">' + esc(mermaidSrc) + '</div>'
          : '') +
        '<div class="progress-panel-edges" aria-hidden="true">' + edges.join('') + '</div>' +
        '</div>'
      )
      : '';

    return (
      '<div class="progress-panel-board">' +
      '<div class="progress-panel-nodes">' + nodes + '</div>' +
      depsHtml +
      '</div>'
    );
  }

  /**
   * Render text/list tab (existing stage list markup).
   * @param {object} taskData
   * @param {function} t
   * @param {function} escFn
   * @returns {string}
   */
  function renderTextList(taskData, t, escFn) {
    const translate = typeof t === 'function' ? t : function (k) { return k; };
    const escape = typeof escFn === 'function' ? escFn : esc;
    const stages = (taskData && taskData.tasks) || [];
    if (!stages.length) {
      return '<div class="empty"><p>' + escape(translate('progress.noTasks')) + '</p></div>';
    }
    return stages.map(function (stage) {
      const stageCompleted = (stage.tasks || []).filter(function (x) {
        return x.status === 'completed';
      }).length;
      const stageTotal = (stage.tasks || []).length;
      const stagePct = stageTotal ? Math.round(stageCompleted / stageTotal * 100) : 0;
      const stageLabel = typeof stage.num === 'number'
        ? (stage.num + '.0 ' + stage.name)
        : stage.name;

      return '<div class="card" style="margin-bottom:1rem">' +
        '<h3 style="margin-bottom:.5rem">' + escape(stageLabel) + '</h3>' +
        '<div style="font-size:.85rem;color:var(--text-muted);margin-bottom:.5rem">' +
        stageCompleted + '/' + stageTotal + ' (' + stagePct + '%)</div>' +
        '<div style="display:grid;gap:.5rem">' +
        (stage.tasks || []).map(function (task) {
          const statusBadge = 'badge-' + task.status;
          const statusKey = task.status === 'in_progress'
            ? 'progress.inProgress'
            : ('progress.' + task.status);
          return '<div style="display:flex;align-items:flex-start;gap:.5rem;padding:.3rem 0;border-bottom:1px solid var(--border)">' +
            '<div style="flex:1">' +
            '<div style="font-weight:500">' + escape(task.id) + ' — ' + escape(task.name) + '</div>' +
            (task.details && task.details['Depends on']
              ? '<div style="font-size:.85rem;color:var(--text-muted)">' +
                escape(translate('progress.dependsOn')) + escape(task.details['Depends on']) + '</div>'
              : '') +
            '</div>' +
            '<span class="badge ' + statusBadge + '">' + escape(translate(statusKey)) + '</span>' +
            '</div>';
        }).join('') +
        '</div></div>';
    }).join('');
  }

  const progressPanelApi = {
    esc: esc,
    flattenTasks: flattenTasks,
    mermaidNodeId: mermaidNodeId,
    buildDependencyMermaid: buildDependencyMermaid,
    renderPanelBoard: renderPanelBoard,
    renderTextList: renderTextList,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = progressPanelApi;
  }
  root.ProgressPanel = progressPanelApi;
})(typeof window !== 'undefined' ? window : globalThis);
