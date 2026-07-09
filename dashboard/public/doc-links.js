/**
 * doc-links.js — link resolver for dashboard project doc views.
 *
 * Markdown rendered inside a project doc view (e.g. docs/design.md) contains
 * relative links like `[LLD_00](./lld/LLD_00_公共架构与规范.md)`. Rendered as
 * plain `<a href="./lld/...">`, the browser resolves them against the page's
 * base URL (http://localhost:3456/, hash excluded) and navigates to a
 * non-existent /lld/... path → the server's catch-all returns 404.
 *
 * `resolveDocLink` classifies a raw href so the SPA click handler can rewrite
 * internal doc links into hash routes (#/projects/<id>/docs/<resolved>) and
 * stay inside the dashboard.
 *
 * Pure functions — no DOM, no side effects. Shared by the browser (loaded via
 * `<script src="doc-links.js">`) and by node tests (require).
 */

/**
 * Join a relative href against the current doc's directory.
 *
 *   joinRelative('docs', './lld/x.md')   -> 'docs/lld/x.md'
 *   joinRelative('docs/lld', '../x.md')  -> 'docs/x.md'
 *   joinRelative('', './x.md')           -> 'x.md'
 *
 * @param {string} baseDir - Directory of the current doc (e.g. 'docs' for 'docs/design.md'); '' for top level.
 * @param {string} rel - Relative href as written in markdown.
 * @returns {string} Project-relative doc path.
 */
function joinRelative(baseDir, rel) {
  rel = String(rel || '').replace(/^\.\//, '');
  const parts = baseDir ? String(baseDir).split('/') : [];
  const segs = rel.split('/');
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s === '.' || s === '') continue;
    if (s === '..') { if (!parts.length) return null; parts.pop(); continue; }
    parts.push(s);
  }
  return parts.join('/');
}

// Hrefs that must be left to the browser — external, or protocol-relative.
const EXTERNAL_RE = /^(https?:|mailto:|tel:|ftp:|data:|javascript:|\/\/)/i;

/**
 * Classify a markdown link href. If it is an internal project-doc link,
 * produce the project-relative doc path the SPA should route to.
 *
 * @param {string} rawHref - Raw href as written in markdown `[text](href)`.
 * @param {string} currentDocPath - Doc path under the project root that the
 *   link lives in, e.g. 'docs/design.md' (the value handleGetProjectDoc
 *   receives). Empty/missing means "not in a doc view".
 * @returns {{ internal: boolean, docPath: string|null, anchor: string|null }}
 *   internal:true + docPath for relative .md/.txt links. internal:false for
 *   external URLs, same-page anchors (anchor still returned for scroll), and
 *   non-doc extensions. docPath always excludes any trailing #anchor.
 */
function resolveDocLink(rawHref, currentDocPath) {
  const raw = String(rawHref || '').trim();
  if (!raw) return { internal: false, docPath: null, anchor: null };

  // External / protocol-relative → leave to browser
  if (EXTERNAL_RE.test(raw)) return { internal: false, docPath: null, anchor: null };

  // Same-page anchor only ('#section') → internal scroll, not a doc nav
  if (raw.charAt(0) === '#') {
    return { internal: false, docPath: null, anchor: raw.slice(1) };
  }

  // Not inside a doc view → cannot resolve relatively
  if (!currentDocPath) return { internal: false, docPath: null, anchor: null };

  // Split trailing #anchor (but not a leading #, already handled above)
  let anchor = null;
  let main = raw;
  const hashIdx = raw.indexOf('#');
  if (hashIdx > -1) {
    anchor = raw.slice(hashIdx + 1);
    main = raw.slice(0, hashIdx);
  }

  // Only route extensions the dashboard can render/serve as docs
  if (!/\.(md|txt)$/i.test(main)) {
    return { internal: false, docPath: null, anchor: null };
  }

  const docPath = String(currentDocPath);
  const slash = docPath.lastIndexOf('/');
  const baseDir = slash > -1 ? docPath.slice(0, slash) : '';
  const resolved = joinRelative(baseDir, main);
  // joinRelative returns null when '..' escapes above the project root; such a
  // link would be rejected server-side anyway (safePath), so bail here too.
  if (resolved === null) return { internal: false, docPath: null, anchor: null };
  return { internal: true, docPath: resolved, anchor };
}

// UMD: CommonJS for node tests, global for the browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { resolveDocLink, joinRelative };
}
if (typeof window !== 'undefined') {
  window.resolveDocLink = resolveDocLink;
  window.joinRelative = joinRelative;
}
