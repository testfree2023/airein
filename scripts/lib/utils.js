/**
 * Cross-platform utility functions for Claude Code hooks and scripts
 * Works on Windows, macOS, and Linux
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

// Platform detection
const isWindows = process.platform === 'win32';
const isMacOS = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

/**
 * Get the user's home directory (cross-platform)
 */
function getHomeDir() {
  return os.homedir();
}

/**
 * Get the Claude config directory
 */
function getClaudeDir() {
  return path.join(getHomeDir(), '.claude');
}

/**
 * Resolve the real project directory.
 * Claude Code may call hooks with cwd = ~/.claude/ instead of the project dir.
 * Strategy: check cwd first, then extract from most recent session file.
 */
let _projectDir = null;
function getProjectDir() {
  if (_projectDir) return _projectDir;

  const cwd = process.cwd();

  // 1. cwd is a real project (has .claude/memory or .claude/config or .claude/quality.json)
  //    but NOT if cwd is the airein install dir (has hooks/hooks.json)
  const isAireinInstall = fs.existsSync(path.join(cwd, 'hooks', 'hooks.json'));
  if (!isAireinInstall && (
      fs.existsSync(path.join(cwd, '.claude', 'memory')) ||
      fs.existsSync(path.join(cwd, '.claude', 'config')) ||
      fs.existsSync(path.join(cwd, '.claude', 'quality.json')))) {
    _projectDir = cwd;
    return _projectDir;
  }

  // 2. Use CLAUDE_SESSION_ID to find project via .project-path cache
  //    Every hook receives this env var. Look for the transcript file matching
  //    our session in ~/.claude/projects/{key}/, then read the cached project path.
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (sessionId) {
    try {
      const projectsDir = path.join(getClaudeDir(), 'projects');
      if (fs.existsSync(projectsDir)) {
        for (const key of fs.readdirSync(projectsDir)) {
          const keyDir = path.join(projectsDir, key);
          try { if (!fs.statSync(keyDir).isDirectory()) continue; } catch { continue; }

          // Does this project have our session's transcript?
          if (!fs.existsSync(path.join(keyDir, `${sessionId}.jsonl`))) continue;

          // Found our project — read cached path
          const cacheFile = path.join(keyDir, '.project-path');
          if (fs.existsSync(cacheFile)) {
            const cached = fs.readFileSync(cacheFile, 'utf8').trim();
            if (cached && fs.existsSync(cached) && fs.existsSync(path.join(cached, '.claude'))) {
              _projectDir = cached;
              return _projectDir;
            }
          }
        }
      }
    } catch {}
  }

  // 3. Fallback: session file scan (find Worktree from most recent session)
  try {
    const sessionsDir = path.join(getClaudeDir(), 'sessions');
    if (fs.existsSync(sessionsDir)) {
      const files = fs.readdirSync(sessionsDir)
        .filter(f => f.endsWith('-session.tmp'))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(sessionsDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)
        .map(f => f.name);
      for (const f of files.slice(0, 5)) {
        const content = fs.readFileSync(path.join(sessionsDir, f), 'utf8');
        const m = content.match(/\*\*Worktree:\*\*\s*(.+)/);
        if (m && m[1]) {
          const wt = m[1].trim();
          if (fs.existsSync(path.join(wt, '.claude'))) {
            _projectDir = wt;
            return _projectDir;
          }
        }
      }
    }
  } catch {}

  _projectDir = cwd;
  return _projectDir;
}

/**
 * Set the project directory explicitly (e.g., from transcript analysis).
 * Overrides any cached value from getProjectDir().
 */
function setProjectDir(dir) {
  if (dir && fs.existsSync(dir)) {
    _projectDir = dir;
  }
}

/**
 * Resolve project directory from a transcript JSONL file.
 *
 * Strategy:
 * 1. Check cache file ~/.claude/projects/{key}/.project-path
 * 2. Read transcript, collect file_path values from tool_use entries
 * 3. Find common ancestor that contains .claude/
 * 4. Cache result for future sessions
 *
 * @param {string} transcriptPath - Path to the session's JSONL transcript
 * @returns {string|null} Project directory path, or null if unresolved
 */
function resolveProjectDir(transcriptPath) {
  if (!transcriptPath) return null;

  const projectKeyDir = path.dirname(transcriptPath);

  // 1. Check cached project path (written by a previous session)
  const cacheFile = path.join(projectKeyDir, '.project-path');
  try {
    if (fs.existsSync(cacheFile)) {
      const cached = fs.readFileSync(cacheFile, 'utf8').trim();
      if (cached && fs.existsSync(cached) && fs.existsSync(path.join(cached, '.claude'))) {
        return cached;
      }
    }
  } catch {}

  // 2. Extract from transcript file
  const result = extractProjectFromTranscript(transcriptPath);
  if (result) {
    try { fs.writeFileSync(cacheFile, result); } catch {}
    return result;
  }

  return null;
}

/**
 * Extract project directory from a JSONL transcript by finding the common
 * ancestor of all file paths in tool_use entries.
 * @private
 */
function extractProjectFromTranscript(transcriptPath) {
  try {
    if (!fs.existsSync(transcriptPath)) return null;

    // Read first 64KB (covers ~200 lines, plenty for project detection)
    const fd = fs.openSync(transcriptPath, 'r');
    const buf = Buffer.alloc(65536);
    const bytesRead = fs.readSync(fd, buf, 0, 65536, 0);
    fs.closeSync(fd);

    const content = buf.toString('utf8', 0, bytesRead);
    if (!content.trim()) return null;

    const filePaths = [];
    for (const line of content.split('\n').filter(Boolean).slice(0, 200)) {
      try {
        const entry = JSON.parse(line);

        // Direct tool_use entries
        const fp = entry.tool_input?.file_path || entry.input?.file_path || '';
        if (fp) filePaths.push(fp.replace(/\\/g, '/'));

        // Assistant content blocks (Claude Code JSONL format)
        if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
          for (const block of entry.message.content) {
            if (block.type === 'tool_use' && block.input?.file_path) {
              filePaths.push(block.input.file_path.replace(/\\/g, '/'));
            }
          }
        }
      } catch {}
    }

    if (filePaths.length === 0) return null;

    // Find longest common prefix
    let prefix = filePaths[0];
    for (const fp of filePaths.slice(1)) {
      let i = 0;
      const minLen = Math.min(prefix.length, fp.length);
      while (i < minLen && prefix[i] === fp[i]) i++;
      prefix = prefix.substring(0, i);
    }

    // Trim to last path separator
    const lastSep = prefix.lastIndexOf('/');
    if (lastSep > 0) prefix = prefix.substring(0, lastSep);

    // Walk up looking for .claude/ directory
    let dir = prefix;
    while (dir.length > 3) {
      const nativePath = dir.replace(/\//g, path.sep);
      if (fs.existsSync(path.join(nativePath, '.claude'))) {
        return nativePath;
      }
      const sep = dir.lastIndexOf('/');
      if (sep < 0) break;
      dir = dir.substring(0, sep);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get the sessions directory
 */
function getSessionsDir() {
  return path.join(getClaudeDir(), 'sessions');
}

/**
 * Get the learned skills directory
 */
function getLearnedSkillsDir() {
  return path.join(getClaudeDir(), 'skills', 'learned');
}

/**
 * Get the temp directory (cross-platform)
 */
function getTempDir() {
  return os.tmpdir();
}

/**
 * Ensure a directory exists (create if not)
 * @param {string} dirPath - Directory path to create
 * @returns {string} The directory path
 * @throws {Error} If directory cannot be created (e.g., permission denied)
 */
function ensureDir(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch (err) {
    // EEXIST is fine (race condition with another process creating it)
    if (err.code !== 'EEXIST') {
      throw new Error(`Failed to create directory '${dirPath}': ${err.message}`);
    }
  }
  return dirPath;
}

/**
 * Get current date in YYYY-MM-DD format
 */
function getDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get current time in HH:MM format
 */
function getTimeString() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Get the git repository name
 */
function getGitRepoName() {
  const result = runCommand('git rev-parse --show-toplevel');
  if (!result.success) return null;
  return path.basename(result.output);
}

/**
 * Get project name from git repo or current directory
 */
function getProjectName() {
  const repoName = getGitRepoName();
  if (repoName) return repoName;
  return path.basename(process.cwd()) || null;
}

/**
 * Get short session ID from CLAUDE_SESSION_ID environment variable
 * Returns last 8 characters, falls back to project name then 'default'
 */
function getSessionIdShort(fallback = 'default') {
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (sessionId && sessionId.length > 0) {
    return sessionId.slice(-8);
  }
  return getProjectName() || fallback;
}

/**
 * Get current datetime in YYYY-MM-DD HH:MM:SS format
 */
function getDateTimeString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Find files matching a pattern in a directory (cross-platform alternative to find)
 * @param {string} dir - Directory to search
 * @param {string} pattern - File pattern (e.g., "*.tmp", "*.md")
 * @param {object} options - Options { maxAge: days, recursive: boolean }
 */
function findFiles(dir, pattern, options = {}) {
  if (!dir || typeof dir !== 'string') return [];
  if (!pattern || typeof pattern !== 'string') return [];

  const { maxAge = null, recursive = false } = options;
  const results = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  // Escape all regex special characters, then convert glob wildcards.
  // Order matters: escape specials first, then convert * and ? to regex equivalents.
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp(`^${regexPattern}$`);

  function searchDir(currentDir) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isFile() && regex.test(entry.name)) {
          let stats;
          try {
            stats = fs.statSync(fullPath);
          } catch {
            continue; // File deleted between readdir and stat
          }

          if (maxAge !== null) {
            const ageInDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
            if (ageInDays <= maxAge) {
              results.push({ path: fullPath, mtime: stats.mtimeMs });
            }
          } else {
            results.push({ path: fullPath, mtime: stats.mtimeMs });
          }
        } else if (entry.isDirectory() && recursive) {
          searchDir(fullPath);
        }
      }
    } catch (_err) {
      // Ignore permission errors
    }
  }

  searchDir(dir);

  // Sort by modification time (newest first)
  results.sort((a, b) => b.mtime - a.mtime);

  return results;
}

/**
 * Read JSON from stdin (for hook input)
 * @param {object} options - Options
 * @param {number} options.timeoutMs - Timeout in milliseconds (default: 5000).
 *   Prevents hooks from hanging indefinitely if stdin never closes.
 * @returns {Promise<object>} Parsed JSON object, or empty object if stdin is empty
 */
async function readStdinJson(options = {}) {
  const { timeoutMs = 5000, maxSize = 1024 * 1024 } = options;

  return new Promise((resolve) => {
    let data = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        // Clean up stdin listeners so the event loop can exit
        process.stdin.removeAllListeners('data');
        process.stdin.removeAllListeners('end');
        process.stdin.removeAllListeners('error');
        if (process.stdin.unref) process.stdin.unref();
        // Resolve with whatever we have so far rather than hanging
        try {
          resolve(data.trim() ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      }
    }, timeoutMs);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      if (data.length < maxSize) {
        data += chunk;
      }
    });

    process.stdin.on('end', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        resolve(data.trim() ? JSON.parse(data) : {});
      } catch {
        // Consistent with timeout path: resolve with empty object
        // so hooks don't crash on malformed input
        resolve({});
      }
    });

    process.stdin.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Resolve with empty object so hooks don't crash on stdin errors
      resolve({});
    });
  });
}

/**
 * Log to stderr (visible to user in Claude Code)
 */
function log(message) {
  console.error(message);
}

/**
 * Output to stdout (returned to Claude)
 */
function output(data) {
  if (typeof data === 'object') {
    console.log(JSON.stringify(data));
  } else {
    console.log(data);
  }
}

/**
 * Read a text file safely
 */
function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Write a text file
 */
function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Append to a text file
 */
function appendFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, content, 'utf8');
}

/**
 * Check if a command exists in PATH
 * Uses execFileSync to prevent command injection
 */
function commandExists(cmd) {
  // Validate command name - only allow alphanumeric, dash, underscore, dot
  if (!/^[a-zA-Z0-9_.-]+$/.test(cmd)) {
    return false;
  }

  try {
    if (isWindows) {
      // Use spawnSync to avoid shell interpolation
      const result = spawnSync('where', [cmd], { stdio: 'pipe' });
      return result.status === 0;
    } else {
      const result = spawnSync('which', [cmd], { stdio: 'pipe' });
      return result.status === 0;
    }
  } catch {
    return false;
  }
}

/**
 * Run a command and return output
 *
 * SECURITY NOTE: This function executes shell commands. Only use with
 * trusted, hardcoded commands. Never pass user-controlled input directly.
 * For user input, use spawnSync with argument arrays instead.
 *
 * @param {string} cmd - Command to execute (should be trusted/hardcoded)
 * @param {object} options - execSync options
 */
function runCommand(cmd, options = {}) {
  // Allowlist: only permit known-safe command prefixes
  const allowedPrefixes = ['git ', 'node ', 'npx ', 'which ', 'where '];
  if (!allowedPrefixes.some(prefix => cmd.startsWith(prefix))) {
    return { success: false, output: 'runCommand blocked: unrecognized command prefix' };
  }

  // Reject shell metacharacters. $() and backticks are evaluated inside
  // double quotes, so block $ and ` anywhere in cmd. Other operators
  // (;|&) are literal inside quotes, so only check unquoted portions.
  const unquoted = cmd.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
  if (/[;|&\n]/.test(unquoted) || /[`$]/.test(cmd)) {
    return { success: false, output: 'runCommand blocked: shell metacharacters not allowed' };
  }

  try {
    const result = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options
    });
    return { success: true, output: result.trim() };
  } catch (err) {
    return { success: false, output: err.stderr || err.message };
  }
}

/**
 * Check if current directory is a git repository
 */
function isGitRepo() {
  return runCommand('git rev-parse --git-dir').success;
}

/**
 * Get git modified files, optionally filtered by regex patterns
 * @param {string[]} patterns - Array of regex pattern strings to filter files.
 *   Invalid patterns are silently skipped.
 * @returns {string[]} Array of modified file paths
 */
function getGitModifiedFiles(patterns = []) {
  if (!isGitRepo()) return [];

  const result = runCommand('git diff --name-only HEAD');
  if (!result.success) return [];

  let files = result.output.split('\n').filter(Boolean);

  if (patterns.length > 0) {
    // Pre-compile patterns, skipping invalid ones
    const compiled = [];
    for (const pattern of patterns) {
      if (typeof pattern !== 'string' || pattern.length === 0) continue;
      try {
        compiled.push(new RegExp(pattern));
      } catch {
        // Skip invalid regex patterns
      }
    }
    if (compiled.length > 0) {
      files = files.filter(file => compiled.some(regex => regex.test(file)));
    }
  }

  return files;
}

/**
 * Replace text in a file (cross-platform sed alternative)
 * @param {string} filePath - Path to the file
 * @param {string|RegExp} search - Pattern to search for. String patterns replace
 *   the FIRST occurrence only; use a RegExp with the `g` flag for global replacement.
 * @param {string} replace - Replacement string
 * @param {object} options - Options
 * @param {boolean} options.all - When true and search is a string, replaces ALL
 *   occurrences (uses String.replaceAll). Ignored for RegExp patterns.
 * @returns {boolean} true if file was written, false on error
 */
function replaceInFile(filePath, search, replace, options = {}) {
  const content = readFile(filePath);
  if (content === null) return false;

  try {
    let newContent;
    if (options.all && typeof search === 'string') {
      newContent = content.replaceAll(search, replace);
    } else {
      newContent = content.replace(search, replace);
    }
    writeFile(filePath, newContent);
    return true;
  } catch (err) {
    log(`[Utils] replaceInFile failed for ${filePath}: ${err.message}`);
    return false;
  }
}

/**
 * Count occurrences of a pattern in a file
 * @param {string} filePath - Path to the file
 * @param {string|RegExp} pattern - Pattern to count. Strings are treated as
 *   global regex patterns. RegExp instances are used as-is but the global
 *   flag is enforced to ensure correct counting.
 * @returns {number} Number of matches found
 */
function countInFile(filePath, pattern) {
  const content = readFile(filePath);
  if (content === null) return 0;

  let regex;
  try {
    if (pattern instanceof RegExp) {
      // Always create new RegExp to avoid shared lastIndex state; ensure global flag
      regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    } else if (typeof pattern === 'string') {
      regex = new RegExp(pattern, 'g');
    } else {
      return 0;
    }
  } catch {
    return 0; // Invalid regex pattern
  }
  const matches = content.match(regex);
  return matches ? matches.length : 0;
}

/**
 * Search for pattern in file and return matching lines with line numbers
 */
function grepFile(filePath, pattern) {
  const content = readFile(filePath);
  if (content === null) return [];

  let regex;
  try {
    if (pattern instanceof RegExp) {
      // Always create a new RegExp without the 'g' flag to prevent lastIndex
      // state issues when using .test() in a loop (g flag makes .test() stateful,
      // causing alternating match/miss on consecutive matching lines)
      const flags = pattern.flags.replace('g', '');
      regex = new RegExp(pattern.source, flags);
    } else {
      regex = new RegExp(pattern);
    }
  } catch {
    return []; // Invalid regex pattern
  }
  const lines = content.split('\n');
  const results = [];

  lines.forEach((line, index) => {
    if (regex.test(line)) {
      results.push({ lineNumber: index + 1, content: line });
    }
  });

  return results;
}

module.exports = {
  // Platform info
  isWindows,
  isMacOS,
  isLinux,

  // Directories
  getHomeDir,
  getClaudeDir,
  getProjectDir,
  setProjectDir,
  resolveProjectDir,
  getSessionsDir,
  getLearnedSkillsDir,
  getTempDir,
  ensureDir,

  // Date/Time
  getDateString,
  getTimeString,
  getDateTimeString,

  // Session/Project
  getSessionIdShort,
  getGitRepoName,
  getProjectName,

  // File operations
  findFiles,
  readFile,
  writeFile,
  appendFile,
  replaceInFile,
  countInFile,
  grepFile,

  // Hook I/O
  readStdinJson,
  log,
  output,

  // System
  commandExists,
  runCommand,
  isGitRepo,
  getGitModifiedFiles
};
