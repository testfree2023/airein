#!/usr/bin/env node
/**
 * conventions-shell — validate P018 thin-shell conventions rules.
 *
 * A thin shell is a project-level `.airein/rules/conventions-{scope}.md`
 * (CC projects may shim via `.claude/rules` → `.airein/rules`).
 * with a `paths:` frontmatter (globs matching the scope's source files)
 * and a single @include directive pulling content from `docs/conventions-{scope}.md`.
 *
 * CC silently ignores a missing @include target (claudemd.ts:25 "Non-existent
 * files are silently ignored"), so this validator fail-fast catches that at
 * generation/deploy time — otherwise a shell with a broken include would ship
 * and conventions would silently never reach context.
 *
 * Dual interface: require()-able module (unit-tested) + CLI (verify/deploy).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Match a @include directive in the body: @<path>.md (optionally with #fragment).
// Path may start with ~/, ./, /, a bare relative token (incl. ../), as CC's own
// extractIncludePathsFromTokens accepts (claudemd.ts:477-488).
const INCLUDE_RE = /(?:^|\s)@((?:~\/|\.\/|\/|[^\s@#])[^\s#]*\.md)(?:#[^\s]*)?(?=\s|$)/m;

/**
 * Parse a thin-shell file's content into frontmatter + body.
 * Frontmatter is a leading `---`-delimited block; only `paths` is extracted
 * (YAML subset — a single inline array of quoted strings).
 */
function parseShell(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== '---') {
    return { frontmatter: null, body: content };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { end = i; break; }
  }
  if (end === -1) {
    return { frontmatter: null, body: content };
  }
  const fmText = lines.slice(1, end).join('\n');
  const body = lines.slice(end + 1).join('\n');

  let paths = null;
  const pathsMatch = fmText.match(/^paths:\s*\[(.*)\]\s*$/m);
  if (pathsMatch) {
    paths = pathsMatch[1]
      .split(',')
      .map(s => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  return { frontmatter: { paths }, body };
}

/**
 * Resolve an @include path to absolute, mirroring CC's expandPath semantics:
 * ~/ → home, /x → absolute, otherwise relative to baseDir with `..` normalized.
 */
function resolveIncludeTarget(includePath, baseDir) {
  if (includePath.startsWith('~/')) {
    return path.join(os.homedir(), includePath.slice(2));
  }
  if (path.isAbsolute(includePath)) {
    return includePath;
  }
  return path.resolve(baseDir, includePath);
}

/**
 * Validate a thin-shell conventions rule file.
 * @param {string} shellPath - absolute path to the .md shell file
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateConventionsShell(shellPath) {
  const errors = [];

  if (!fs.existsSync(shellPath)) {
    return { valid: false, errors: ['shell file not found: ' + shellPath] };
  }

  const content = fs.readFileSync(shellPath, 'utf8');
  const { frontmatter, body } = parseShell(content);

  if (!frontmatter) {
    errors.push('missing frontmatter (expected leading --- paths: [...] --- block)');
  } else if (!Array.isArray(frontmatter.paths) || frontmatter.paths.length === 0) {
    errors.push('frontmatter missing non-empty paths array');
  }

  const includeMatch = body.match(INCLUDE_RE);
  if (!includeMatch) {
    errors.push('missing @include directive in body (expected @../../docs/conventions-{scope}.md)');
  } else {
    const target = resolveIncludeTarget(includeMatch[1], path.dirname(shellPath));
    if (!fs.existsSync(target)) {
      errors.push('@include target not found: ' + includeMatch[1] + ' (resolved: ' + target + ')');
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateConventionsShell, parseShell, resolveIncludeTarget };

// ── CLI ────────────────────────────────────────────────────────────
if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    process.stderr.write('usage: conventions-shell.js <shell-path>\n');
    process.exit(2);
  }
  const result = validateConventionsShell(target);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.valid ? 0 : 1);
}
