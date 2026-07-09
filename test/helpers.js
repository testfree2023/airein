/**
 * Minimal test airein — zero dependencies, runs on plain Node.js.
 *
 * Usage:
 *   node test/helpers.js          # does nothing (import only)
 *   node test/run-all.js          # runs every test-*.js
 *   node test/test-quality-config.js  # run single suite
 */

const path = require('path');
const fs = require('fs');

// ── Pretty output ──────────────────────────────────────────────────

let _totalPassed = 0;
let _totalFailed = 0;
const _failures = [];

function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function red(s)   { return `\x1b[31m${s}\x1b[0m`; }
function dim(s)   { return `\x1b[2m${s}\x1b[0m`; }
function bold(s)  { return `\x1b[1m${s}\x1b[0m`; }

/**
 * Run a single assertion.  Returns true if passed.
 */
function assert(condition, message) {
  if (condition) {
    _totalPassed++;
    console.log(`  ${green('✓')} ${message}`);
    return true;
  }
  _totalFailed++;
  _failures.push(message);
  console.log(`  ${red('✗')} ${message}`);
  return false;
}

/**
 * Assert strict equality.
 */
function assertEqual(actual, expected, message) {
  const pass = actual === expected;
  if (!pass) {
    message += ` (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`;
  }
  return assert(pass, message);
}

/**
 * Assert that value is truthy.
 */
function assertOk(value, message) {
  return assert(!!value, message);
}

/**
 * Assert that a string contains a substring.
 */
function assertContains(haystack, needle, message) {
  return assert(haystack.includes(needle), `${message} — missing "${needle}"`);
}

/**
 * Assert that a string does NOT contain a substring.
 */
function assertNotContains(haystack, needle, message) {
  return assert(!haystack.includes(needle), `${message} — unexpected "${needle}"`);
}

/**
 * Assert that a string matches a regex.
 */
function assertMatch(str, regex, message) {
  return assert(regex.test(str), `${message} — pattern /${regex.source}/ not found`);
}

/**
 * Assert that a regex has at least N matches in a string.
 */
function assertMinMatches(str, regex, min, message) {
  const matches = str.match(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g'));
  const count = matches ? matches.length : 0;
  return assert(count >= min, `${message} — found ${count}, need >= ${min}`);
}

// ── Suite runner ───────────────────────────────────────────────────

/**
 * Define a test suite.  Calls `fn(suite)` where suite has:
 *   suite.test(name, fn)   — register a test case
 *
 * After fn returns, runs all registered tests and prints summary.
 *
 * Returns { passed, failed }.
 */
function describe(title, fn) {
  console.log(`\n${bold(title)}`);

  // Counters accumulate globally across suites
  const tests = [];

  const suite = {
    test(name, testFn) {
      tests.push({ name, fn: testFn });
    }
  };

  try {
    fn(suite);
  } catch (err) {
    _totalFailed++;
    _failures.push(`suite setup: ${err.message}`);
    console.log(`  ${red('✗')} suite setup failed: ${red(err.message)}`);
    return; // no tests to run
  }

  for (const t of tests) {
    try {
      t.fn();
    } catch (err) {
      _totalFailed++;
      _failures.push(`${t.name}: ${err.message}`);
      console.log(`  ${red('✗')} ${t.name}: ${red(err.message)}`);
    }
  }
}

// ── Summary & Discovery ────────────────────────────────────────────

function printSummary() {
  const total = _totalPassed + _totalFailed;
  console.log(`\n${'─'.repeat(50)}`);
  if (_totalFailed === 0) {
    console.log(green(bold(`All ${total} tests passed ✓`)));
  } else {
    console.log(red(bold(`${_totalFailed}/${total} tests failed ✗`)));
    console.log('\nFailed:');
    for (const f of _failures) {
      console.log(`  ${red('•')} ${f}`);
    }
  }
  console.log('─'.repeat(50));
  return _totalFailed;
}

function getResults() {
  return { passed: _totalPassed, failed: _totalFailed, failures: [..._failures] };
}

/**
 * Find all test-*.js files in the test/ directory.
 */
function discoverTests() {
  const testDir = __dirname;
  return fs.readdirSync(testDir)
    .filter(f => f.startsWith('test-') && f.endsWith('.js'))
    .sort()
    .map(f => path.join(testDir, f));
}

/**
 * Resolve project root (parent of test/).
 */
function projectRoot() {
  return path.resolve(__dirname, '..');
}

/**
 * Resolve project's skills/ directory (source of truth, version controlled).
 * NOT ~/.claude/skills/ (installed location, may be stale).
 */
function skillsDir() {
  return path.join(projectRoot(), 'skills');
}

/**
 * Read a skill's SKILL.md content. Returns null if not found.
 */
function readSkill(name) {
  const p = path.join(skillsDir(), name, 'SKILL.md');
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

module.exports = {
  assert, assertEqual, assertOk, assertContains, assertNotContains,
  assertMatch, assertMinMatches,
  describe, printSummary, getResults, discoverTests,
  projectRoot, skillsDir, readSkill,
  green, red, dim, bold
};
