#!/usr/bin/env node
/**
 * Shared config loader for quality hooks.
 *
 * Reads project-level config from: <project>/.airein/config/quality.json
 * (falls back to legacy <project>/.claude/config/quality.json)
 *
 * Config file format (all fields optional, defaults shown):
 * {
 *   "testGuard": {
 *     "enabled": true,              // false = completely disabled
 *     "mode": "strict"              // "strict" (block) | "advisory" (warn only)
 *   },
 *   "testsLedger": {
 *     "enabled": false,
 *     "mode": "strict"
 *   },
 *   "roadmapGate": {
 *     "enabled": true,
 *     "mode": "advisory"
 *   },
 *   "progressCompletionGate": {
 *     "enabled": true,
 *     "mode": "strict"
 *   },
 *   "approvalGuard": {
 *     "mode": "console-confirm"     // "advisory" | "console-confirm" | "manual-only"
 *   },
 *   "planGate": {
 *     "mode": "advisory",           // "strict" | "advisory" | "disabled"
 *     "exemptPaths": ["docs/", ".airein/", ".claude/", "scripts/hooks/", "test/"],
 *     "requireActiveTask": true
 *   },
 *   "testCoverage": {
 *     "minRatio": 0.3,              // min test-to-source ratio to pass coverage gate (0.0-1.0)
 *     "minSourceFiles": 2,          // only enforce coverage gate when >= N source files edited
 *     "functionThreshold": 3        // warn "write tests" when file has >= N functions
 *   },
 *   "blocking": {
 *     "testFailure": true,          // hard block (exit 2) on test failures
 *     "lowCoverage": true,          // hard block (exit 2) on low coverage
 *     "buildFailure": true,         // hard block (exit 2) on build failures
 *     "untestedSource": true        // hard block (exit 2) on untested source (legacy, prefer testGuard)
 *   },
 *   "pipelineRoles": {
 *     "enabled": true               // false = Solo PM (no forced specialist dispatch)
 *   },
 *   "flowControl": {
 *     "perTaskReview": false,       // dispatch tech-lead (mode: review) after each task
 *     "worktreeIsolation": false    // use worktree isolation for features/refactors
 *   },
 *   "selfLearning": {
 *     "enabled": true,              // false = disable LLM-hitchhiking self-learning entirely
 *     "promotionThreshold": 3       // promote instruction to rules/30 after N archive occurrences
 *   },
 *   "aireinLog": {
 *     "enabled": true,              // enable airein logging
 *     "level": "info",              // debug | info | warn | error
 *     "retentionDays": 7,           // log retention period
 *     "slowHookMs": 2000            // warn when hook execution exceeds this (ms)
 *   }
 * }
 *
 * Usage:
 *   const { loadQualityConfig } = require('../lib/quality-config');
 *   const config = loadQualityConfig();
 *   // config.testCoverage.minRatio -> 0.3
 */

const path = require('path');
const fs = require('fs');
const { getProjectDir } = require('./utils');

const DEFAULTS = {
  testCoverage: {
    minRatio: 0.3,
    minSourceFiles: 2,
    functionThreshold: 3
  },
  blocking: {
    testFailure: true,
    lowCoverage: true,
    buildFailure: true,
    untestedSource: true
  },
  aireinLog: {
    enabled: true,
    level: 'info',
    retentionDays: 7,
    slowHookMs: 2000
  },
  pipelineRoles: {
    enabled: true               // true = Agent Teams; false = Solo PM (no forced specialists)
  },
  flowControl: {
    perTaskReview: false,       // dispatch tech-lead (mode: review) after each task
    worktreeIsolation: false    // suggest worktree isolation for features/refactors
  },
  testGuard: {
    enabled: true,              // false = completely disabled (no check at all)
    mode: 'strict'              // 'strict' = block (exit 2) | 'advisory' = warn only (exit 0)
  },
  testsLedger: {
    enabled: false,             // opt-in: implement task completion requires tests.md pass row
    mode: 'strict'              // 'strict' = exit 2 | 'advisory' = warn + allow
  },
  roadmapGate: {
    enabled: true,              // validate docs/roadmap.md active-section contract
    mode: 'advisory'            // 'advisory' = warn + allow | 'strict' = exit 2
  },
  progressCompletionGate: {
    enabled: true,              // progress.md completion claims require tasks.md Status=completed
    mode: 'strict'              // 'strict' = exit 2 | 'advisory' = warn + allow
  },
  approvalGuard: {
    mode: 'console-confirm'
    // 'advisory'       — 仅提醒，不拦截（stderr 警告，exit 0 放行）
    // 'console-confirm' — 拦截 + 允许通过 .claude/approval-confirmed.json 绕过（默认）
    // 'manual-only'    — 严格拦截，必须在外部编辑器中修改 progress.md
  },
  planGate: {
    mode: 'advisory',           // 'strict' (hard block) | 'advisory' (soft block — same exit 2, softer message) | 'disabled'
                                  // NOTE: Both strict and advisory use exit 2 because exit 0 warnings
                                  // are invisible to the model (additionalContext broken for plugin hooks).
    exemptPaths: ['docs/', '.airein/', '.claude/', 'scripts/hooks/', 'test/'],
    requireActiveTask: true
  },
  taskPickup: {
    onBlocked: 'wait_user'      // 'wait_user' | 'model_recommend' — P007; invalid → wait_user
  },
  planWorkflow: {
    enforceGrilling: true,
    pipeline: 'auto'            // 'auto' (resolves to m-feature by default) | any pipeline name from templates/pipelines.json
  },
  languageProfiles: {
    active: [],
    overrides: {}
  },
  selfLearning: {
    enabled: true,              // false = 完全禁用自学习（UserPromptSubmit 不注入提示 + Stop 不归档晋升）
    promotionThreshold: 3       // 指令在 archive 累计达 N 次后晋升到 rules/30-self-learned.md（L0 自动加载）
  }
};

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
      target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Load quality config from project's .airein/config/quality.json
 * Falls back to legacy .claude/config/quality.json, then defaults.
 */
function loadQualityConfig() {
  const cwd = getProjectDir();
  const { qualityConfigPath } = require('./project-paths');
  const configPath = qualityConfigPath(cwd, { forRead: true });

  if (!configPath) {
    return DEFAULTS;
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const userConfig = JSON.parse(raw);
    return deepMerge(DEFAULTS, userConfig);
  } catch (err) {
    if (err instanceof SyntaxError) {
      // Log warning about malformed JSON (lazy-require to avoid circular dep)
      try {
        const { aireinLog } = require('./airein-logger');
        aireinLog('warn', 'quality-config', `Invalid JSON in ${configPath}: ${err.message}. Using defaults.`);
      } catch {
        // airein-logger unavailable — write to stderr as last resort
        process.stderr.write(`[quality-config] WARNING: Invalid JSON in ${configPath}: ${err.message}\n`);
      }
    }
    return DEFAULTS;
  }
}


/**
 * Load pipeline definitions from global airein templates/pipelines.json.
 * Pipeline templates are defined once at the airein level and shared across
 * all projects — never duplicated into per-project quality.json.
 *
 * Fallback: hardcoded defaults when file is missing (backward compat).
 */
function loadGlobalPipelines() {
  const templatesPath = path.join(__dirname, '..', '..', 'templates', 'pipelines.json');
  const HARDCODED = {
    's-feature': ['requirements', 'tasks'],
    's-bugfix': ['tasks'],
    'm-feature': ['requirements', 'design', 'test-plan', 'tasks'],
    'm-bugfix': ['requirements', 'tasks'],
    'm-urgent': ['tasks'],
    'l-feature': ['requirements', 'design', 'test-plan', 'deployment', 'tasks'],
    'l-bugfix': ['requirements', 'design', 'test-plan', 'tasks'],
    'hotfix': ['tasks']
  };
  try {
    if (fs.existsSync(templatesPath)) {
      const raw = JSON.parse(fs.readFileSync(templatesPath, 'utf8'));
      if (raw && raw.definitions) {
        const result = {};
        for (const [name, def] of Object.entries(raw.definitions)) {
          if (Array.isArray(def.docs) && def.docs.length > 0 && def.docs.every(d => typeof d === 'string' && d)) {
            result[name] = def.docs.map(String);
          } else {
            // Invalid entry — use hardcoded fallback
            return HARDCODED;
          }
        }
        return Object.keys(result).length > 0 ? result : HARDCODED;
      }
    }
  } catch {}

  return HARDCODED;
}

/**
 * Load all language profile definitions from global templates/language-profiles/.
 * Returns a map keyed by profile name: { default: {...}, java: {...}, ... }
 *
 * Each profile has: extensions, testPatterns, testNameTemplates, buildCommands, etc.
 * The "_default" profile contains cross-language rules (secretPatterns, exemptPatterns).
 *
 * Fallback: hardcoded values matching current DEFAULT_PROFILE when files are missing.
 */
function loadGlobalLanguageProfiles() {
  const profilesDir = path.join(__dirname, '..', '..', 'templates', 'language-profiles');
  const result = {};

  try {
    if (fs.existsSync(profilesDir)) {
      const files = fs.readdirSync(profilesDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(profilesDir, file), 'utf8'));
          if (raw && raw.name) {
            result[raw.name] = raw;
          }
        } catch { /* skip invalid files */ }
      }
    }
  } catch {}

  if (Object.keys(result).length > 0) {
    return result;
  }

  // Hardcoded fallback — matches DEFAULT_PROFILE from language-config.js
  return {
    default: {
      name: 'default',
      exemptPatterns: ['\\.d\\.ts$', '\\.config\\.', '\\.setup\\.', '/migrations/', '/fixtures/', '/__fixtures__/'],
      secretPatterns: ['sk-[A-Za-z0-9]{20,}', 'AKIA[0-9A-Z]{16}', 'AIza[0-9A-Za-z_-]{35}', '(password|secret|token|api[_-]?key)\\s*[=:]\\s*[\\"\\\'][^\\"\\\']{8,}[\\"\\\']'],
      testDirectories: ['test', 'tests', '__tests__'],
      impactThresholds: { medium: 3, high: 9 }
    },
    javascript: { name: 'javascript', extensions: ['.js', '.jsx'], testPatterns: ['^test-', '\\.test\\.', '\\.spec\\.'], testNameTemplates: ['{base}.test{ext}', '{base}.spec{ext}', 'test-{base}{ext}', 'test_{base}{ext}'], debugPatterns: ['console\\.log', 'console\\.debug'] },
    typescript: { name: 'typescript', extensions: ['.ts', '.tsx'], testPatterns: ['\\.test\\.', '\\.spec\\.', '^test-'], testNameTemplates: ['{base}.test{ext}', '{base}.spec{ext}', 'test-{base}{ext}', 'test_{base}{ext}'], debugPatterns: ['console\\.log', 'console\\.debug'] },
    python: { name: 'python', extensions: ['.py'], testPatterns: ['^test_', '_test\\.', '^test-'], testNameTemplates: ['test_{base}{ext}', '{base}_test{ext}'], debugPatterns: ['print\\s*\\('] },
    java: { name: 'java', extensions: ['.java'], testPatterns: ['Test\\.java$', 'IT\\.java$'], testNameTemplates: ['{base}Test{ext}', '{base}IT{ext}'], debugPatterns: ['System\\.out\\.print', 'System\\.err\\.print'] },
    go: { name: 'go', extensions: ['.go'], testPatterns: ['_test\\.go$'], testNameTemplates: ['{base}_test{ext}'], debugPatterns: ['println!'] },
    rust: { name: 'rust', extensions: ['.rs'], testPatterns: [], testNameTemplates: [], debugPatterns: ['println!'] },
    kotlin: { name: 'kotlin', extensions: ['.kt'], testPatterns: ['Test\\.kt$', 'IT\\.kt$'], testNameTemplates: ['{base}Test{ext}', '{base}IT{ext}'], debugPatterns: ['println\\('] }
  };
}

module.exports = { loadQualityConfig, deepMerge, DEFAULTS, loadGlobalPipelines, loadGlobalLanguageProfiles };
