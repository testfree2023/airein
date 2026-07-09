'use strict';

/**
 * Split a shell command into segments by operators (&&, ||, ;, &)
 * while respecting quoting (single/double) and escaped characters.
 * Redirection operators (&>, >&, 2>&1) are NOT treated as separators.
 */
function splitShellSegments(command) {
  const segments = [];
  let current = '';
  let quote = null;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    // Inside quotes: handle escapes and closing quote
    if (quote) {
      if (ch === '\\' && i + 1 < command.length) {
        current += ch + command[i + 1];
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }

    // Backslash escape outside quotes
    if (ch === '\\' && i + 1 < command.length) {
      current += ch + command[i + 1];
      i++;
      continue;
    }

    // Opening quote
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }

    const next = command[i + 1] || '';
    const prev = i > 0 ? command[i - 1] : '';

    // && operator
    if (ch === '&' && next === '&') {
      if (current.trim()) segments.push(current.trim());
      current = '';
      i++;
      continue;
    }

    // || operator
    if (ch === '|' && next === '|') {
      if (current.trim()) segments.push(current.trim());
      current = '';
      i++;
      continue;
    }

    // ; separator
    if (ch === ';') {
      if (current.trim()) segments.push(current.trim());
      current = '';
      continue;
    }

    // Single & — but skip redirection patterns (&>, >&, digit>&)
    if (ch === '&' && next !== '&') {
      if (next === '>' || prev === '>') {
        current += ch;
        continue;
      }
      if (current.trim()) segments.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim()) segments.push(current.trim());
  return segments;
}

module.exports = { splitShellSegments, extractRedirectPaths };

/**
 * Extract file paths being written to by a shell command.
 *
 * Detects common file-writing patterns in Bash commands:
 *   - Redirect: echo "x" > file.ts, echo "x" >> file.ts
 *   - Heredoc:  cat > file.ts <<'EOF'
 *   - tee:      echo "x" | tee file.ts
 *   - dd:       dd of=file.ts
 *   - sed -i:   sed -i 's/x/y/' file.ts
 *
 * @param {string} command - Raw shell command string
 * @returns {string[]} Array of file paths being written to (deduplicated)
 */
function extractRedirectPaths(command) {
  if (!command || typeof command !== 'string') return [];

  const paths = new Set();
  const segments = splitShellSegments(command);

  for (const seg of segments) {
    // Redirect: > path or >> path (handles quoted and unquoted paths)
    // Matches: > "my file.ts", > 'my file.ts', > path.ts
    const redirectMatch = seg.match(/>{1,2}\s*(?:"([^"]+)"|'([^']+)'|([^\s;&|>]+))/);
    if (redirectMatch) {
      const target = redirectMatch[1] || redirectMatch[2] || redirectMatch[3];
      if (target && !/^&/.test(target)) {  // skip >& (fd redirect)
        paths.add(target);
      }
    }

    // tee <path> (handles quoted and unquoted)
    const teeMatch = seg.match(/\btee\s+(?:-[aAp]+\s+)*(?:"([^"]+)"|'([^']+)'|([^\s;&|>]+))/);
    if (teeMatch) {
      const target = teeMatch[1] || teeMatch[2] || teeMatch[3];
      if (target) paths.add(target);
    }

    // dd of=<path>
    const ddMatch = seg.match(/\bdd\s+.*\bof=([^\s;&|>]+)/);
    if (ddMatch) {
      paths.add(ddMatch[1]);
    }

    // sed -i ... <path> (in-place edit = writing)
    const sedMatch = seg.match(/\bsed\s+(?:-[a-zA-Z]*i[a-zA-Z]*\s+|--in-place\b.*?)(?:-[a-zA-Z]+\s+)?.*?(\S+\.\w+)\s*$/);
    if (sedMatch) {
      paths.add(sedMatch[1]);
    }
  }

  return [...paths];
}
