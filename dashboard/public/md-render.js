/**
 * Dashboard lightweight markdown → HTML.
 * Mermaid fences become <div class="mermaid"> so mermaid.js can render them.
 * Works in browser (global) and Node (module.exports) for tests.
 */
(function (root) {
  'use strict';

  function esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function mdInline(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }

  function rewriteDocHref(url, opts) {
    opts = opts || {};
    var projectId = opts.projectId;
    if (!projectId) return url;
    var u = String(url || '').trim();
    if (!u || /^https?:\/\//i.test(u) || u.charAt(0) === '#' || /^mailto:/i.test(u)) return u;

    // plans/... or docs/plans/...
    var m = u.match(/^(?:\.\.?\/)*(?:docs\/)?plans\/(.+)$/i);
    if (m) {
      var rest = m[1].replace(/\/+$/, '');
      var segments = rest.split('/').filter(Boolean).map(function (s) {
        return encodeURIComponent(s);
      });
      return '#/projects/' + encodeURIComponent(projectId) + '/docs/docs/plans/' + segments.join('/');
    }

    // docs/foo (project docs tree, not under plans/)
    var dm = u.match(/^(?:\.\.?\/)*docs\/(.+)$/i);
    if (dm) {
      var drest = dm[1].replace(/\/+$/, '');
      var dseg = drest.split('/').filter(Boolean).map(function (s) {
        return encodeURIComponent(s);
      });
      return '#/projects/' + encodeURIComponent(projectId) + '/docs/docs/' + dseg.join('/');
    }

    // Same-directory relative file inside a plan: design-architecture.md, ./foo.md
    if (opts.planId && /^(?:\.\/)?[^/]+\.md$/i.test(u)) {
      var file = u.replace(/^\.\//, '');
      return '#/projects/' + encodeURIComponent(projectId) +
        '/docs/docs/plans/' + encodeURIComponent(opts.planId) + '/' + encodeURIComponent(file);
    }
    return u;
  }

  function renderMd(md, opts) {
    if (!md) return '';
    opts = opts || {};

    // Normalize newlines first: Windows CRLF breaks table regexes that
    // anchor on ^...\n — docs like roadmap.md then show raw pipe rows.
    var text = String(md).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Pull fenced blocks out BEFORE esc / paragraph splitting.
    // Otherwise blank lines inside ```mermaid become </p><p> and break the lexer
    // (TAGSTART on "<p>"), and <br/> becomes a tag token under strict mode.
    var fences = [];
    text = text.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
      var i = fences.length;
      fences.push({ lang: lang || '', code: code });
      return '\0FENCE' + i + '\0';
    });

    var html = esc(text);

    // Template HTML comments (escaped): each line is a block so browsers do not
    // collapse consecutive <!-- --> lines into one wrapped paragraph.
    html = html.replace(/^(&lt;!--[\s\S]*?--&gt;)\s*$/gm, '<div class="md-tmpl-comment">$1</div>');

    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Allow optional leading indent (CommonMark list continuation / nested docs)
    // and optional final newline (join('\n') / EOF without trailing \n).
    // Without this, tables under list items (`  | a | b |`) stay as raw pipes.
    html = html.replace(/((?:^[ \t]*\|.+\|[ \t]*\n?)+)/gm, function (tableBlock) {
      var rows = tableBlock.replace(/\s+$/, '').split('\n');
      if (rows.length < 2) return tableBlock;
      var isSep = /^\|[\s\-:|]+\|$/;
      var headerDone = false;
      var out = '<table>';
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r].trim();
        if (!row) continue;
        if (isSep.test(row)) continue;
        var cells = row.split('|').filter(function (c, i, arr) {
          return i > 0 && i < arr.length - 1;
        }).map(function (c) { return c.trim(); });
        if (!cells.length) continue;
        if (!headerDone) {
          out += '<tr>' + cells.map(function (c) {
            // Escape leftover * so later global \*(.+?)\* cannot match across <td> boundaries
            // (truth-table wildcards like "| * |" would become empty <em>).
            return '<th>' + mdInline(c).replace(/\*/g, '&#42;') + '</th>';
          }).join('') + '</tr>';
          headerDone = true;
        } else {
          out += '<tr>' + cells.map(function (c) {
            return '<td>' + mdInline(c).replace(/\*/g, '&#42;') + '</td>';
          }).join('') + '</tr>';
        }
      }
      if (!headerDone) return tableBlock;
      return out + '</table>';
    });

    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/^---+$/gm, '<hr>');

    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    html = html.replace(/\[([^\]]+)\]\(([^)]+)(?:\s+"([^"]+)")?\)/g, function (_, text, url, title) {
      var href = rewriteDocHref(url, opts);
      var blank = href.charAt(0) === '#' ? '' : ' target="_blank"';
      return '<a href="' + esc(href) + '"' + (title ? ' title="' + esc(title) + '"' : '') + blank + '>' + text + '</a>';
    });

    html = html.replace(/^- \[x\] (.+)$/gm, '<li><input type="checkbox" checked disabled> $1</li>');
    html = html.replace(/^- \[ \] (.+)$/gm, '<li><input type="checkbox" disabled> $1</li>');
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    html = html.replace(/\n\n+/g, '</p><p>');
    html = '<p>' + html + '</p>';

    html = html.replace(/<p>\s*(<h[1-6]>)/g, '$1');
    html = html.replace(/(<\/h[1-6]>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<table>)/g, '$1');
    html = html.replace(/(<\/table>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<pre>)/g, '$1');
    html = html.replace(/(<\/pre>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*((?:<div class="md-tmpl-comment">[\s\S]*?<\/div>\s*)+)<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<hr>)/g, '$1');
    html = html.replace(/(<hr>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<blockquote>)/g, '$1');
    html = html.replace(/(<\/blockquote>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*<\/p>/g, '');

    // Restore fenced blocks after paragraph logic so their internals stay intact.
    html = html.replace(/\0FENCE(\d+)\0/g, function (_, idx) {
      var f = fences[Number(idx)];
      if (!f) return '';
      if (String(f.lang).toLowerCase() === 'mermaid') {
        var code = String(f.code).replace(/\r\n/g, '\n');
        // securityLevel:strict treats "<br/>" as TAGSTART — use a readable separator.
        code = code.replace(/<br\s*\/?>/gi, ' · ');
        return '<div class="mermaid">' + esc(code) + '</div>';
      }
      return '<pre><code class="language-' + esc(f.lang) + '">' + esc(f.code) + '</code></pre>';
    });

    html = html.replace(/<p>\s*(<div class="mermaid">[\s\S]*?<\/div>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<pre>[\s\S]*?<\/pre>)\s*<\/p>/g, '$1');

    return html;
  }

  function isHiddenMermaidHost(node) {
    var el = node;
    while (el && el.nodeType === 1) {
      if (el.style && el.style.display === 'none') return true;
      // Hidden edit preview must not share mermaid runs with the view pane
      // (duplicate SVG ids → diagrams collapse / “squeeze”).
      if (el.id === 'doc-preview' || el.id === 'doc-edit-container') return true;
      el = el.parentElement;
    }
    return false;
  }

  /**
   * Run mermaid on .mermaid nodes under root (idempotent via data-processed).
   * MUST be sequential globally: parallel mermaid.run() reuses SVG ids and paints
   * overlapping ghosts (flowchart under sequence, double-offset boxes).
   *
   * Do NOT set data-processed before mermaid.run — mermaid skips those nodes
   * and leaves raw source text. Claim in-flight nodes via WeakSet instead.
   */
  var __aireinMermaidChain = Promise.resolve();
  var __aireinMermaidClaimed =
    typeof WeakSet !== 'undefined' ? new WeakSet() : null;

  function runMermaidIn(root) {
    if (typeof window === 'undefined' || !window.mermaid) return;
    __aireinMermaidChain = __aireinMermaidChain.then(function () {
      return runMermaidInSerial(root);
    }).catch(function () {
      /* keep chain alive */
    });
  }

  function runMermaidInSerial(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var raw = scope.querySelectorAll('.mermaid:not([data-processed])');
    if (!raw.length) return Promise.resolve();
    var list = [];
    Array.prototype.forEach.call(raw, function (node) {
      if (isHiddenMermaidHost(node)) return;
      if (__aireinMermaidClaimed) {
        if (__aireinMermaidClaimed.has(node)) return;
        __aireinMermaidClaimed.add(node);
      }
      list.push(node);
    });
    if (!list.length) return Promise.resolve();

    function markError(node, err) {
      node.setAttribute('data-processed', 'error');
      node.setAttribute('title', 'Mermaid render failed — check diagram syntax');
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[airein-dashboard] mermaid node failed', err);
      }
    }

    return new Promise(function (resolve) {
      function next(i) {
        if (i >= list.length) {
          resolve();
          return;
        }
        var node = list[i];
        try {
          var p = window.mermaid.run({ nodes: [node] });
          if (p && typeof p.then === 'function') {
            p.then(function () {
              next(i + 1);
            }).catch(function (err) {
              markError(node, err);
              next(i + 1);
            });
          } else {
            next(i + 1);
          }
        } catch (err) {
          markError(node, err);
          next(i + 1);
        }
      }
      next(0);
    });
  }

  function scheduleMermaid(root) {
    if (typeof window === 'undefined') return;
    var run = function () { runMermaidIn(root); };
    // Only run after onMermaidReady() has called mermaid.initialize.
    // Otherwise `window.mermaid` may exist while initialize has not run yet
    // (CDN script parsed, onload pending) → silent no-op / failed paint.
    if (window.mermaid && window.__aireinMermaidReady) {
      // Coalesce bursts into one frame, but flush ALL pending roots.
      // (Previously cancelAnimationFrame dropped earlier roots — progress
      // panel DAG stayed as raw text until a later tab re-schedule.)
      window.__aireinMermaidPending = window.__aireinMermaidPending || [];
      window.__aireinMermaidPending.push(run);
      if (window.__aireinMermaidRaf) return;
      var flush = function () {
        window.__aireinMermaidRaf = 0;
        var batch = window.__aireinMermaidPending || [];
        window.__aireinMermaidPending = [];
        for (var i = 0; i < batch.length; i++) {
          try { batch[i](); } catch (_) { /* keep going */ }
        }
      };
      if (typeof requestAnimationFrame === 'function') {
        window.__aireinMermaidRaf = requestAnimationFrame(flush);
      } else {
        window.__aireinMermaidRaf = 1;
        setTimeout(flush, 0);
      }
      return;
    }
    window.__aireinMermaidQueue = window.__aireinMermaidQueue || [];
    window.__aireinMermaidQueue.push(run);
  }

  /** Set markdown HTML and schedule mermaid paint. */
  function paintMd(el, md, opts) {
    if (!el) return;
    el.innerHTML = renderMd(md, opts);
    scheduleMermaid(el);
  }

  function onMermaidReady() {
    if (typeof window === 'undefined' || !window.mermaid) return;
    if (window.__aireinMermaidReady) {
      // Already initialized — still drain any new queue entries.
      var q0 = window.__aireinMermaidQueue || [];
      window.__aireinMermaidQueue = [];
      q0.forEach(function (fn) { try { fn(); } catch (_) { /* ignore */ } });
      return;
    }
    var dark = false;
    try {
      dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (_) { /* ignore */ }
    window.mermaid.initialize({
      startOnLoad: false,
      theme: dark ? 'dark' : 'default',
      securityLevel: 'strict',
    });
    window.__aireinMermaidReady = true;
    var q = window.__aireinMermaidQueue || [];
    window.__aireinMermaidQueue = [];
    q.forEach(function (fn) { try { fn(); } catch (_) { /* ignore */ } });
  }

  var api = {
    renderMd: renderMd,
    paintMd: paintMd,
    rewriteDocHref: rewriteDocHref,
    scheduleMermaid: scheduleMermaid,
    runMermaidIn: runMermaidIn,
    onMermaidReady: onMermaidReady,
    esc: esc,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.aireinMd = api;
  // Back-compat: global renderMd used throughout index.html
  root.renderMd = renderMd;
  root.paintMd = paintMd;
  root.scheduleMermaid = scheduleMermaid;

  // CDN may finish before onload, or onload may have fired with a stale page —
  // if mermaid is already present, initialize + drain queue.
  if (typeof window !== 'undefined' && window.mermaid && !window.__aireinMermaidReady) {
    setTimeout(function () { onMermaidReady(); }, 0);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
