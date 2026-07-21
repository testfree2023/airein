#!/usr/bin/env node
/**
 * Plan Dashboard — HTTP server
 *
 * Lightweight management console for airein plans, templates, and config.
 * Zero npm dependencies — uses Node.js built-in http module.
 *
 * Usage: node dashboard/server.js [--port 3456]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { resolveKernelRoot } = require('./lib/kernel-resolve');

const DASHBOARD_DIR = __dirname;
const AIREIN_ROOT = resolveKernelRoot(DASHBOARD_DIR);
const KERNEL_HOME = path.join(os.homedir(), '.airein');
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SCRIPTS_LIB = path.join(AIREIN_ROOT, 'scripts', 'lib');

const planParser = require(path.join(SCRIPTS_LIB, 'plan-parser'));
const qualityConfig = require(path.join(SCRIPTS_LIB, 'quality-config'));
const utils = require(path.join(SCRIPTS_LIB, 'utils'));
const runtimeMetrics = require(path.join(SCRIPTS_LIB, 'runtime-metrics'));
const projectPaths = require(path.join(SCRIPTS_LIB, 'project-paths'));
const dashboardProjects = require(path.join(SCRIPTS_LIB, 'dashboard-projects'));
const parseTasksPanel = require(path.join(SCRIPTS_LIB, 'parse-tasks-panel'));
const parseTestsLedger = require(path.join(SCRIPTS_LIB, 'parse-tests-ledger'));
const progressApprovalGate = require(path.join(SCRIPTS_LIB, 'progress-approval-gate'));

const loadGlobalPipelines = qualityConfig.loadGlobalPipelines;
const loadGlobalLanguageProfiles = qualityConfig.loadGlobalLanguageProfiles;

// ── CLI args ──────────────────────────────────────
const args = process.argv.slice(2);
let PORT = 3456;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) { PORT = parseInt(args[i + 1]); i++; }
  if (args[i] === '--help') {
    console.log('Usage: node dashboard/server.js [--port 3456]');
    process.exit(0);
  }
}

// ── Project discovery ────────────────────────────────────

// Normalize a resolved project path to a canonical key for deduping.
// Different CC project dirs (e.g. a worktree dir vs its parent) can resolve to
// the same on-disk path but with mixed separators (F:/ vs F:\); collapse those
// so the seen-set dedupes them as one project.
function dedupeKey(p) {
  return path.resolve(p).replace(/\\/g, '/').toLowerCase();
}

// Module-level TTL cache for project discovery (P015 Task 5). Without it, every
// request re-discovers + forks `git rev-parse` per project; a request flood means
// hundreds of git processes/sec (DoS + perf). TTL ~3s keeps it fresh enough for
// interactive dashboard use while collapsing repeated filesystem + git work.
const PROJECTS_CACHE_TTL_MS = 3000;
let _projectsCache = null;
let _projectsCacheAt = 0;

function invalidateProjectsCache() {
  _projectsCache = null;
  _projectsCacheAt = 0;
}

function isDiscoverableProject(projectPath) {
  if (!projectPath || !fs.existsSync(projectPath)) return false;
  if (fs.existsSync(path.join(projectPath, 'docs', 'plans'))) return true;
  return projectPaths.hasAireinMarkers(projectPath) || projectPaths.hasLegacyMarkers(projectPath);
}

function loadScanDirs() {
  const dirs = [];
  const addDir = (raw) => {
    if (!raw || typeof raw !== 'string') return;
    const trimmed = raw.trim();
    let expanded = trimmed;
    if (trimmed === '~') {
      expanded = os.homedir();
    } else if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
      expanded = path.join(os.homedir(), trimmed.slice(2));
    }
    if (!expanded) return;
    dirs.push(path.resolve(expanded));
  };

  const env = process.env.DASHBOARD_SCAN_DIRS;
  if (env) {
    for (const part of env.split(/[;,]/)) addDir(part);
  }

  const configCandidates = [
    path.join(__dirname, 'config.json'),
    path.join(KERNEL_HOME, 'dashboard.json'),
    path.join(CLAUDE_DIR, 'settings.json'),
  ];
  for (const configFile of configCandidates) {
    if (!fs.existsSync(configFile)) continue;
    try {
      const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      const scanDirs = config.dashboard && Array.isArray(config.dashboard.scanDirs)
        ? config.dashboard.scanDirs
        : null;
      if (scanDirs) {
        for (const part of scanDirs) addDir(part);
      }
    } catch {}
  }

  return [...new Set(dirs)];
}

function scanProjectId(projectPath) {
  const key = dedupeKey(projectPath);
  return 'scan-' + crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function registryProjectId(projectPath) {
  return scanProjectId(projectPath);
}

function discoverProjectsFromRegistry() {
  const entries = dashboardProjects.listRegisteredProjects();
  return entries.map((entry) => ({
    id: registryProjectId(entry.path),
    name: entry.name || extractProjectName(entry.path, path.basename(entry.path)),
    path: entry.path,
    ...loadProjectMeta(entry.path),
  }));
}

function collectProjectsFromScanDirs() {
  const results = [];
  for (const scanRoot of loadScanDirs()) {
    if (!fs.existsSync(scanRoot)) continue;

    const candidates = [scanRoot];
    try {
      for (const name of fs.readdirSync(scanRoot)) {
        const full = path.join(scanRoot, name);
        try {
          if (fs.statSync(full).isDirectory()) candidates.push(full);
        } catch {}
      }
    } catch {}

    for (const candidate of candidates) {
      if (!isDiscoverableProject(candidate)) continue;
      results.push({
        id: scanProjectId(candidate),
        name: extractProjectName(candidate, path.basename(candidate)),
        path: candidate,
        ...loadProjectMeta(candidate),
      });
    }
  }
  return results;
}

function discoverProjectsFromClaudeRegistry() {
  const claudeProjects = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(claudeProjects)) return [];

  const dirs = fs.readdirSync(claudeProjects).filter(d => {
    const full = path.join(claudeProjects, d);
    return fs.statSync(full).isDirectory();
  });

  const projects = [];
  for (const dir of dirs) {
    const projectDir = path.join(claudeProjects, dir);
    const projectPath = resolveProjectPath(projectDir);
    if (!projectPath || !isDiscoverableProject(projectPath)) continue;

    projects.push({
      id: dir,
      name: extractProjectName(projectPath, dir),
      path: projectPath,
      ...loadProjectMeta(projectPath),
    });
  }
  return projects;
}

function discoverProjects() {
  const now = Date.now();
  if (_projectsCache && (now - _projectsCacheAt) < PROJECTS_CACHE_TTL_MS) {
    return _projectsCache;
  }

  const seen = new Set();
  const projects = [];

  const addProject = (project) => {
    const key = dedupeKey(project.path);
    if (seen.has(key)) return;
    seen.add(key);
    projects.push(project);
  };

  for (const project of discoverProjectsFromRegistry()) addProject(project);
  for (const project of discoverProjectsFromClaudeRegistry()) addProject(project);
  for (const project of collectProjectsFromScanDirs()) addProject(project);

  _projectsCache = projects;
  _projectsCacheAt = now;
  return projects;
}

function resolveProjectPath(projectDir) {
  // First, try the .project-path file that CC maintains
  const projectPathFile = path.join(projectDir, '.project-path');
  if (fs.existsSync(projectPathFile)) {
    try {
      let actualPath = fs.readFileSync(projectPathFile, 'utf-8').trim();
      // Normalize Windows backslashes to forward slashes
      if (actualPath.includes('\\')) actualPath = actualPath.replace(/\\/g, '/');
      if (fs.existsSync(actualPath)) return actualPath;
    } catch {}
  }

  const decoded = decodeProjectDir(path.basename(projectDir));
  if (decoded && fs.existsSync(decoded)) return decoded;

  const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(projectDir, file), 'utf-8');
      const lines = content.split('\n').filter(Boolean).slice(0, 50);
      for (const line of lines) {
        const filePath = extractFilePathFromJsonl(line);
        if (filePath) {
          const root = findProjectRootFromPath(filePath);
          if (root) return root;
        }
      }
    } catch {}
  }
  return null;
}

function decodeProjectDir(dirName) {
  const candidates = [];
  if (/^[A-Za-z]--/.test(dirName)) {
    const drive = dirName[0];
    const rest = dirName.slice(3);
    candidates.push(drive + ':\\' + rest.replace(/-/g, '\\'));
    candidates.push(drive + ':/' + rest.replace(/-/g, '/'));
  }
  if (dirName.startsWith('-')) {
    candidates.push('/' + dirName.slice(1).replace(/-/g, '/'));
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function extractFilePathFromJsonl(line) {
  try {
    const obj = JSON.parse(line);
    if (obj.type === 'assistant' && obj.message && obj.message.content) {
      for (const block of obj.message.content) {
        if (block.type === 'tool_use' && block.input && block.input.file_path) {
          return block.input.file_path;
        }
      }
    }
  } catch {}
  return null;
}

function findProjectRootFromPath(filePath) {
  const fromMarkers = projectPaths.findProjectRoot(path.dirname(path.resolve(filePath)));
  if (fromMarkers) return fromMarkers;

  let dir = path.dirname(path.resolve(filePath));
  let fallback = null;
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    if (fs.existsSync(path.join(dir, '.airein'))) return dir;
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    if (!fallback && fs.existsSync(path.join(dir, 'package.json'))) fallback = dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return fallback || dir;
}

function hasAireinMarker(projectPath) {
  return isDiscoverableProject(projectPath);
}

function extractProjectName(projectPath, fallback) {
  try {
    // spawnSync (no shell) — cwd is influenceable via .project-path, so never let
    // it reach a shell. git rev-parse runs no hooks, leaving minimal residual
    // risk; this is defense-in-depth.
    const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: projectPath, encoding: 'utf8' });
    if (result.status === 0 && result.stdout) return path.basename(result.stdout.trim());
  } catch {}
  return fallback.replace(/-/g, '/').split('/').pop() || fallback;
}

// Get CC memory directory for a project by matching projectPath.
// Returns null if not found (e.g., project hasn't been used in CC yet).
function getCCMemoryDir(projectPath) {
  const claudeProjects = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(claudeProjects)) return null;

  const targetKey = dedupeKey(projectPath);
  const dirs = fs.readdirSync(claudeProjects).filter(d => {
    const full = path.join(claudeProjects, d);
    return fs.statSync(full).isDirectory();
  });

  for (const dir of dirs) {
    const projectDir = path.join(claudeProjects, dir);
    const resolvedPath = resolveProjectPath(projectDir);
    if (!resolvedPath) continue;
    const key = dedupeKey(resolvedPath);
    if (key === targetKey) {
      const memoryDir = path.join(projectDir, 'memory');
      if (fs.existsSync(memoryDir)) return memoryDir;
    }
  }
  return null;
}

// Get CC project directory for a project by matching projectPath.
// Returns null if not found (e.g., project hasn't been used in CC yet).
function getCCProjectDir(projectPath) {
  const claudeProjects = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(claudeProjects)) return null;

  const targetKey = dedupeKey(projectPath);
  const dirs = fs.readdirSync(claudeProjects).filter(d => {
    const full = path.join(claudeProjects, d);
    return fs.statSync(full).isDirectory();
  });

  for (const dir of dirs) {
    const projectDir = path.join(claudeProjects, dir);
    const resolvedPath = resolveProjectPath(projectDir);
    if (!resolvedPath) continue;
    const key = dedupeKey(resolvedPath);
    if (key === targetKey) {
      return projectDir;
    }
  }
  return null;
}

function loadProjectMeta(projectPath) {
  const plansDir = path.join(projectPath, 'docs', 'plans');
  let planCount = 0;
  if (fs.existsSync(plansDir)) {
    planCount = fs.readdirSync(plansDir).filter(d => {
      return fs.statSync(path.join(plansDir, d)).isDirectory() && /^P\d{3}-/.test(d);
    }).length;
  }

  let techStack = [];
  const configPath = projectPaths.qualityConfigPath(projectPath, { forRead: true });
  if (configPath) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (cfg.framework) techStack.push(cfg.framework);
      if (cfg.language) techStack.push(cfg.language);
    } catch {}
  }

  return { planCount, techStack };
}

// ── Request origin safety (P015 Task 1) ────────────────
// DNS rebinding defense: a malicious site can repoint a domain at 127.0.0.1 and
// drive the victim's browser to this loopback server. Require Host to be a
// loopback hostname. CSRF defense: on state-changing methods, require the Origin
// (when present) to also be loopback.
//
// Extension: Load allowed hosts from config.json for LAN access.
// When DASHBOARD_BIND=0.0.0.0 (--lan), hostname + local IPv4 addresses are added automatically.
// Config file path: <dashboard>/config.json, ~/.airein/dashboard.json, or ~/.claude/settings.json
// Format: { "dashboard": { "allowedHosts": ["localhost", "127.0.0.1", "192.168.1.100"] } }

function lanBindHosts() {
  if ((process.env.DASHBOARD_BIND || '127.0.0.1') !== '0.0.0.0') return [];
  const hosts = [];
  try {
    const hn = os.hostname();
    if (hn) hosts.push(hn.toLowerCase());
    for (const entries of Object.values(os.networkInterfaces())) {
      for (const iface of entries || []) {
        if (iface && iface.family === 'IPv4' && !iface.internal && iface.address) {
          hosts.push(String(iface.address).toLowerCase());
        }
      }
    }
  } catch {}
  return hosts;
}

function loadAllowedHosts() {
  const hosts = new Set(['localhost', '127.0.0.1', '::1']);
  for (const host of lanBindHosts()) hosts.add(host);

  try {
    const configCandidates = [
      path.join(__dirname, 'config.json'),
      path.join(KERNEL_HOME, 'dashboard.json'),
      path.join(CLAUDE_DIR, 'settings.json'),
    ];
    for (const configFile of configCandidates) {
      if (!fs.existsSync(configFile)) continue;
      const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      if (config.dashboard && Array.isArray(config.dashboard.allowedHosts)) {
        for (const host of config.dashboard.allowedHosts) {
          if (host) hosts.add(String(host).toLowerCase());
        }
      }
    }
  } catch {}
  return [...hosts];
}

function resolveAllowedHosts() {
  return loadAllowedHosts();
}

function isHostAllowed(hostHeader) {
  if (!hostHeader) return false;
  const hostname = hostHeader.split(':')[0].toLowerCase();
  return new Set(resolveAllowedHosts()).has(hostname);
}

function isOriginAllowed(originHeader) {
  // Absent Origin = same-origin GET or non-browser client (curl). Browsers send
  // Origin on cross-origin requests and same-origin POST/PUT; we accept its
  // absence so the SPA's own fetches and curl both keep working.
  if (!originHeader) return true;
  try {
    return new Set(resolveAllowedHosts()).has(new URL(originHeader).hostname.toLowerCase());
  } catch {
    return false;
  }
}

// ── Path safety ────────────────────────────────────

function safePath(base, relative) {
  const resolved = path.resolve(base, relative);
  const normalizedBase = path.normalize(base);
  const normalizedResolved = path.normalize(resolved);
  // Check if resolved is within base directory (allowing for path separator differences)
  if (!normalizedResolved.startsWith(normalizedBase) && normalizedResolved !== normalizedBase) return null;
  // Additional check: ensure we don't escape base directory
  const relativePath = path.relative(normalizedBase, normalizedResolved);
  if (relativePath.startsWith('..')) return null;
  return resolved;
}

function validatePlanId(planId) {
  return /^P\d{3}-[a-z0-9-]+$/.test(planId);
}

// ── API helpers ─────────────────────────────────────

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function html(res, content) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(content);
}

function readBody(req, maxBytes) {
  maxBytes = maxBytes || (1024 * 1024); // 1 MB default
  return new Promise(resolve => {
    let body = '';
    let exceeded = false;
    req.on('data', chunk => {
      if (exceeded) return;
      body += chunk;
      if (Buffer.byteLength(body, 'utf-8') > maxBytes) {
        exceeded = true;
        req.destroy();
        resolve('');
      }
    });
    req.on('end', () => { if (!exceeded) resolve(body); });
  });
}

function findProject(id) {
  const projects = discoverProjects();
  return projects.find(p => p.id === id || p.name === id);
}

function readQualityConfig(projectPath) {
  const configPath = projectPaths.qualityConfigPath(projectPath, { forRead: true });
  if (!configPath) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeQualityConfig(projectPath, config) {
  const configPath = projectPaths.qualityConfigPath(projectPath, { forWrite: true });
  utils.ensureDir(path.dirname(configPath));
  utils.writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
  return configPath;
}

function getEffectiveConfig(projectPath) {
  return qualityConfig.deepMerge(qualityConfig.DEFAULTS, readQualityConfig(projectPath));
}

function getPlanPipeline(projectPath, complexity) {
  const config = getEffectiveConfig(projectPath);
  const pipelines = loadGlobalPipelines();
  const choice = config.planWorkflow && config.planWorkflow.pipeline;

  // Project specified a concrete pipeline that exists → use it directly
  if (choice && choice !== 'auto' && pipelines[choice]) {
    const p = pipelines[choice];
    if (Array.isArray(p) && p.length > 0) {
      return p.map(doc => String(doc).toLowerCase());
    }
  }

  // Backward compatibility: map old complexity names to new pipeline names
  const LEGACY_MAP = { 'simple': 's-bugfix', 'medium': 'm-bugfix', 'complex': 'm-feature' };

  // auto or unknown → complexity-based matching
  const resolved = pipelines[complexity] ? complexity : (LEGACY_MAP[complexity] || 'm-feature');
  const pipeline = pipelines[resolved] || pipelines['m-feature'] || ['tasks'];
  if (!Array.isArray(pipeline) || pipeline.length === 0) {
    return ['tasks'];
  }
  return pipeline.map(doc => String(doc).toLowerCase());
}

function validateDocName(docName) {
  return /^[a-z0-9][a-z0-9_-]*$/i.test(docName);
}

// ── API handlers ────────────────────────────────────

function handleListProjects(res) {
  json(res, 200, discoverProjects());
}

function handleGetPlans(projectPath, res) {
  const plansDir = path.join(projectPath, 'docs', 'plans');
  if (!fs.existsSync(plansDir)) return json(res, 200, []);

  const entries = fs.readdirSync(plansDir);
  const plans = [];
  const seen = {};

  // 标准目录格式 plan（P{NNN}-{slug}/ 含 progress.md）
  entries.forEach(function(entry) {
    const full = path.join(plansDir, entry);
    let st;
    try { st = fs.statSync(full); } catch { return; }
    if (!st.isDirectory() || !/^P\d{3}-/.test(entry)) return;
    seen[entry] = true;
    plans.push(buildDirPlanEntry(projectPath, plansDir, entry));
  });

  // 单文件格式 plan（P{NNN}-{slug}.md 直接躺在 plans/ 下；legacy / 手动建，
  // 无 progress.md、不走 approval 流程）。同名目录优先，避免重复。
  entries.forEach(function(entry) {
    const full = path.join(plansDir, entry);
    let st;
    try { st = fs.statSync(full); } catch { return; }
    if (!st.isFile() || !/^P\d{3}-.*\.md$/i.test(entry)) return;
    const id = entry.replace(/\.md$/i, '');
    if (seen[id]) return;
    plans.push(buildSingleFilePlanEntry(plansDir, entry, id));
  });

  json(res, 200, plans);
}

// 目录格式 plan 列表项（原 handleGetPlans 内联逻辑，重构抽出）
function buildDirPlanEntry(projectPath, plansDir, dir) {
  const progressPath = path.join(plansDir, dir, 'progress.md');
  const tasksPath = path.join(plansDir, dir, 'tasks.md');
  let plan = { id: dir, title: dir };
  if (fs.existsSync(progressPath)) {
    const content = fs.readFileSync(progressPath, 'utf-8');
    const approval = planParser.getApprovalState(content);
    const complexity = planParser.getComplexity(content);
    const priorityMatch = content.match(/^priority:\s*(P[1-4])/m);
    const priority = priorityMatch ? priorityMatch[1] : 'P2';
    const completed = planParser.isPlanCompleted(content);
    const grillingState = planParser.getGrillingState(content);
    const planStatus = planParser.getStatus(content);
    const pipeline = getPlanPipeline(projectPath, complexity);
    const titleMatch = content.match(/^#\s+Progress:\s*(.+)$/m);

    // P024 D2 fix: 优先解析 tasks.md，fallback 到 progress.md stats
    let stats;
    if (fs.existsSync(tasksPath)) {
      const tasksContent = fs.readFileSync(tasksPath, 'utf-8');
      stats = parseTasksMarkdown(tasksContent);
    } else {
      stats = planParser.parseProgress(content);
    }

    plan = {
      ...plan,
      title: titleMatch ? titleMatch[1].trim() : dir,
      complexity,
      priority,
      completed,
      status: planStatus,
      grillingState,
      pipeline: pipeline,
      total: stats.total,
      completedTasks: stats.completed,
      inProgress: stats.inProgress,
      pending: stats.pending,
      approval,
      activeTask: stats.activeTask,
      blockers: stats.blockers
    };
  }
  return plan;
}

// 单文件格式 plan 列表项（无 progress.md / approval 流程，best-effort 解析 Meta）
function buildSingleFilePlanEntry(plansDir, file, id) {
  const content = fs.readFileSync(path.join(plansDir, file), 'utf-8');
  const priorityMatch = content.match(/\*\*优先级\*\*\s*:\s*(P[1-4])/);
  return {
    id: id,
    title: parseSingleFileTitle(content, id),
    singleFile: true,
    status: parseSingleFileStatus(content),
    priority: priorityMatch ? priorityMatch[1] : 'P2',
    approval: {},
    pipeline: [],
    complexity: 'simple',
    completed: false,
    total: 0,
    completedTasks: 0,
    inProgress: 0,
    pending: 0
  };
}

// 单文件 plan 标题：第一行 # 标题，否则回退 plan id
function parseSingleFileTitle(content, fallback) {
  const m = content.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

// 单文件 plan 状态：best-effort 解析 Meta「**状态**: xxx」行（中英文冒号兼容）
function parseSingleFileStatus(content) {
  const m = content.match(/\*\*状态\*\*\s*[:：]\s*(.+)/);
  return m ? m[1].trim() : undefined;
}

// P024 运行时数据处理
function handleGetRuntimeMetrics(projectPath, res) {
  const metrics = runtimeMetrics.readMetrics(projectPath);
  json(res, 200, metrics);
}

// P025 日志查看器
function handleGetLogs(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const params = url.searchParams;
  const level = params.get('level') || 'all';
  const page = parseInt(params.get('page') || '1', 10);
  const pageSize = parseInt(params.get('pageSize') || '100', 10);

  const logPath = path.join(AIREIN_ROOT, '.claude', 'airein.log');
  if (!fs.existsSync(logPath)) {
    return json(res, 200, { lines: [], total: 0, page, pageSize });
  }

  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.split('\n').filter(Boolean);

  // 按级别筛选
  let filtered = lines;
  if (level !== 'all') {
    filtered = lines.filter(line => {
      const upper = line.toUpperCase();
      if (level === 'ERROR') return upper.includes('[ERROR]') || upper.includes('[ERR]');
      if (level === 'WARN') return upper.includes('[WARN]') || upper.includes('[WARNING]');
      if (level === 'INFO') return upper.includes('[INFO]') || upper.includes('[INF]');
      if (level === 'DEBUG') return upper.includes('[DEBUG]') || upper.includes('[DBG]');
      return true;
    });
  }

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const paginated = filtered.slice(start, start + pageSize);

  json(res, 200, { lines: paginated, total, page, pageSize });
}

// P025: ADR 关系解析
function parseADRFrontmatter(content) {
  const lines = content.split('\n');
  const frontmatter = {};
  let inFrontmatter = false;

  for (const line of lines) {
    if (line.startsWith('---')) {
      inFrontmatter = !inFrontmatter;
      if (inFrontmatter) continue;
      break;
    }
    if (!inFrontmatter) break;

    // 解析 key: value 格式
    const match = line.match(/^-\*\*([\w\s]+)\*\*:\s*(.+)$/);
    if (match) {
      const key = match[1].trim().toLowerCase();
      const value = match[2].trim();
      frontmatter[key] = value;
    }
  }

  return frontmatter;
}

function handleGetADRs(res) {
  const adrDir = path.join(AIREIN_ROOT, 'docs', 'adr');
  if (!fs.existsSync(adrDir)) {
    return json(res, 200, []);
  }

  const files = fs.readdirSync(adrDir).filter(f => f.endsWith('.md') && f !== 'README.md');
  const adrs = files.map(f => {
    const filePath = path.join(adrDir, f);
    const content = fs.readFileSync(filePath, 'utf-8');
    const frontmatter = parseADRFrontmatter(content);

    // 提取编号
    const numMatch = f.match(/^(\d+)-/);
    const num = numMatch ? parseInt(numMatch[1], 10) : 0;

    // 解析 supersedes 关系
    let supersedes = null;
    const supersedesMatch = content.match(/\*\*Supersedes\*\*:\s*\[([^\]]+)\]\(([^)]+)\)/);
    if (supersedesMatch) {
      const targetId = supersedesMatch[2];
      const targetNum = targetId.match(/(\d+)-/);
      supersedes = targetNum ? parseInt(targetNum[1], 10) : null;
    }

    return {
      id: f.replace('.md', ''),
      title: frontmatter.title || content.split('\n')[0].replace(/^#\s+ADR-\d+:\s*/, ''),
      status: frontmatter.status || 'unknown',
      date: frontmatter.date || '',
      supersedes,
      num
    };
  });

  // 按编号排序
  adrs.sort((a, b) => a.num - b.num);
  json(res, 200, adrs);
}

// P026 服务健康检查
function handleGetHealth(res) {
  const uptime = process.uptime();
  const uptimeFormatted = formatUptime(uptime);

  // 获取版本信息（从 package.json 或 git）
  let version = 'unknown';
  let commit = 'unknown';

  // 尝试从 package.json 获取版本
  const packageJsonPath = path.join(AIREIN_ROOT, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      version = packageJson.version || 'unknown';
    } catch {}
  }

  // 尝试从 git 获取 commit
  try {
    const gitDir = path.join(AIREIN_ROOT, '.git');
    if (fs.existsSync(gitDir)) {
      const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: AIREIN_ROOT,
        encoding: 'utf-8'
      });
      if (result.stdout && result.stdout.trim()) {
        commit = result.stdout.trim();
      }
    }
  } catch {}

  // 读取最近的错误日志（最多 3 条）
  const recentErrors = [];
  const logPath = path.join(AIREIN_ROOT, '.claude', 'airein.log');
  if (fs.existsSync(logPath)) {
    try {
      const logContent = fs.readFileSync(logPath, 'utf-8');
      const lines = logContent.split('\n').filter(Boolean);
      const errorLines = lines.filter(l =>
        l.toUpperCase().includes('[ERROR]') || l.toUpperCase().includes('[ERR]')
      );
      // 取最后 3 条错误
      const lastErrors = errorLines.slice(-3);
      for (const line of lastErrors) {
        // 尝试提取时间戳和错误类型
        const timeMatch = line.match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/);
        const timestamp = timeMatch ? timeMatch[0] : '';
        const errorType = line.includes('TypeError') ? 'TypeError' :
                         line.includes('EADDRINUSE') ? 'EADDRINUSE' :
                         line.includes('ENOENT') ? 'ENOENT' :
                         line.includes('EACCES') ? 'EACCES' : 'Error';
        recentErrors.push({ timestamp, type: errorType, message: line.slice(0, 100) });
      }
    } catch {}
  }

  json(res, 200, {
    status: 'healthy',
    version,
    commit,
    uptime: uptimeFormatted,
    uptimeSeconds: Math.floor(uptime),
    pid: process.pid,
    platform: process.platform,
    nodeVersion: process.version,
    recentErrors
  });
}

// 格式化运行时间
function formatUptime(seconds) {
  if (seconds < 60) return Math.floor(seconds) + 's';
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + 'm ' + s + 's';
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h + 'h ' + m + 'm';
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d + 'd ' + h + 'h ' + m + 'm';
}

function handleGetPlan(projectPath, planIdRaw, res) {
  // 容错：strip 末尾 .md（手贴 URL 带 .md / 单文件 plan 标识），与目录 plan 统一为无后缀 id
  const planId = String(planIdRaw || '').replace(/\.md$/i, '');
  if (!validatePlanId(planId)) return json(res, 400, { error: 'Invalid plan ID' });

  const plansDir = path.join(projectPath, 'docs', 'plans');
  const planDir = path.join(plansDir, planId);
  const planFile = path.join(plansDir, planId + '.md');

  // 优先目录格式
  let dirStat = false;
  try { dirStat = fs.existsSync(planDir) && fs.statSync(planDir).isDirectory(); } catch {}
  if (dirStat) return handleGetDirPlan(projectPath, planDir, planId, res);

  // 退而求其次：单文件格式
  let fileStat = false;
  try { fileStat = fs.existsSync(planFile) && fs.statSync(planFile).isFile(); } catch {}
  if (fileStat) return handleGetSingleFilePlan(planFile, planId, res);

  return json(res, 404, { error: 'Plan not found' });
}

// 目录格式 plan 详情（原 handleGetPlan 逻辑，重构抽出）
function handleGetDirPlan(projectPath, planDir, planId, res) {
  const docs = { id: planId };
  const progressPath = path.join(planDir, 'progress.md');

  if (fs.existsSync(progressPath)) {
    const content = fs.readFileSync(progressPath, 'utf-8');
    docs.progress = content;
    docs.stats = planParser.parseProgress(content);
    docs.approval = planParser.getApprovalState(content);
    docs.complexity = planParser.getComplexity(content);
    docs.completed = planParser.isPlanCompleted(content);
    docs.status = planParser.getStatus(content);
    docs.grillingState = planParser.getGrillingState(content);
    docs.pipeline = getPlanPipeline(projectPath, docs.complexity);
    const titleMatch = content.match(/^#\s+Progress:\s*(.+)$/m);
    docs.title = titleMatch ? titleMatch[1].trim() : planId;
  }

  const docNames = docs.pipeline || getPlanPipeline(projectPath, docs.complexity || 'm-feature');
  for (const doc of docNames) {
    const docPath = path.join(planDir, doc + '.md');
    if (fs.existsSync(docPath)) {
      docs[doc] = fs.readFileSync(docPath, 'utf-8');
    }
    // Detect sub-documents: design.md → design-*.md
    const subDocPattern = doc + '-';
    try {
      const subDocNames = fs.readdirSync(planDir)
        .filter(function(f) { return f.startsWith(subDocPattern) && f.endsWith('.md'); })
        .map(function(f) { return f.slice(0, -3); })
        .sort();
      if (subDocNames.length > 0) {
        docs[doc + '_subDocs'] = subDocNames;
        for (const sd of subDocNames) {
          const sdPath = path.join(planDir, sd + '.md');
          if (fs.existsSync(sdPath)) {
            docs[sd] = fs.readFileSync(sdPath, 'utf-8');
          }
        }
      }
    } catch {}
  }

  docs.existingDocs = ['progress'];
  for (const doc of docNames) {
    if (docs[doc] !== undefined) docs.existingDocs.push(doc);
    // Add sub-doc names to existing docs for tab rendering
    var subs = docs[doc + '_subDocs'];
    if (subs) {
      for (const sd of subs) {
        if (docs[sd] !== undefined) docs.existingDocs.push(sd);
      }
    }
  }

  // ── Sync approval state with actual file existence ─────────
  // If a doc is marked 'approved' but doesn't exist or is empty,
  // downgrade it to 'none' to prevent showing invalid approval button.
  // This fixes the race condition where progress.md is updated before
  // the doc file is fully written to disk.
  // Note: TOCTOU window exists between fs.existsSync (line 454) and the
  // actual use of docs[doc] (loaded at line 412), but this is a mitigation
  // for model-driven writes where the race window is much larger.
  for (const doc of docNames) {
    if (docs.approval && docs.approval[doc] === 'approved') {
      var docPath = path.join(planDir, doc + '.md');
      var exists = fs.existsSync(docPath);
      var hasContent = exists && (docs[doc] || '').length > 0;
      if (!exists || !hasContent) {
        // Downgrade to 'none' (matches getApprovalState default) since doc doesn't exist or is empty
        docs.approval[doc] = 'none';
      }
    }
  }

  json(res, 200, docs);
}

// 单文件格式 plan 详情：整个 .md 作为唯一文档（content 字段），无 approval/pipeline 流程
function handleGetSingleFilePlan(planFile, planId, res) {
  const content = fs.readFileSync(planFile, 'utf-8');
  json(res, 200, {
    id: planId,
    singleFile: true,
    title: parseSingleFileTitle(content, planId),
    content: content,
    existingDocs: ['content'],
    pipeline: [],
    approval: {},
    stats: {},
    complexity: 'simple',
    completed: false,
    status: parseSingleFileStatus(content)
  });
}

function handleGetDoc(projectPath, planId, docName, res) {
  if (!validatePlanId(planId)) return json(res, 400, { error: 'Invalid plan ID' });
  if (!validateDocName(docName)) return json(res, 400, { error: 'Invalid doc name' });

  const docPath = path.join(projectPath, 'docs', 'plans', planId, docName + '.md');
  if (!fs.existsSync(docPath)) return json(res, 404, { error: 'Document not found' });

  // Detect sub-documents: design.md → design-*.md in same directory
  const planDir = path.join(projectPath, 'docs', 'plans', planId);
  const subDocPattern = docName + '-';
  let subDocs = [];
  try {
    subDocs = fs.readdirSync(planDir)
      .filter(function(f) { return f.startsWith(subDocPattern) && f.endsWith('.md'); })
      .map(function(f) { return f.slice(0, -3); })  // strip .md
      .sort();
  } catch {}

  json(res, 200, { content: fs.readFileSync(docPath, 'utf-8'), subDocs: subDocs });
}

async function handleSaveDoc(projectPath, planId, docName, req, res) {
  if (!validatePlanId(planId)) return json(res, 400, { error: 'Invalid plan ID' });
  if (!validateDocName(docName)) return json(res, 400, { error: 'Invalid doc name' });

  const body = await readBody(req);
  if (!body) return json(res, 413, { error: 'Request body too large' });
  let parsed;
  try { parsed = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
  if (typeof parsed.content !== 'string') return json(res, 400, { error: 'Missing content' });

  const docPath = path.join(projectPath, 'docs', 'plans', planId, docName + '.md');
  utils.ensureDir(path.dirname(docPath));

  let content = parsed.content;
  if (docName === 'progress') {
    content = planParser.normalizeProgressFormat(content);
  }

  utils.writeFile(docPath, content);
  json(res, 200, { ok: true });
}

async function handleApprove(projectPath, planId, req, res) {
  if (!validatePlanId(planId)) return json(res, 400, { error: 'Invalid plan ID' });
  const body = await readBody(req);
  if (!body) return json(res, 413, { error: 'Request body too large' });
  let parsed;
  try { parsed = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }

  const { phase } = parsed;
  if (!validateDocName(phase)) {
    return json(res, 400, { error: 'Invalid phase' });
  }

  const progressPath = path.join(projectPath, 'docs', 'plans', planId, 'progress.md');
  if (!fs.existsSync(progressPath)) return json(res, 404, { error: 'Plan not found' });

  const content = fs.readFileSync(progressPath, 'utf-8');
  const approval = planParser.getApprovalState(content);
  const complexity = planParser.getComplexity(content);
  const pipeline = getPlanPipeline(projectPath, complexity);

  if (!pipeline.includes(phase)) {
    return json(res, 400, { error: 'Phase is not in the configured plan pipeline' });
  }

  const docPath = path.join(projectPath, 'docs', 'plans', planId, phase + '.md');
  if (!fs.existsSync(docPath)) {
    return json(res, 400, { error: phase + '.md does not exist yet' });
  }

  const errors = validateApproval(phase, approval, pipeline);
  if (errors.length > 0) return json(res, 400, { error: errors.join('; ') });

  // Doc-first: phase ## Status must already be approved; tasks also need panel format.
  // Do not parse tasks.md on every edit — only at approve time.
  const docRaw = fs.readFileSync(docPath, 'utf-8');
  const phaseDocs = {};
  phaseDocs[phase] = docRaw;
  const gate = progressApprovalGate.evaluateProgressApprovalGate({
    enabled: true,
    mode: 'strict',
    filePath: progressPath.replace(/\\/g, '/'),
    oldContent: content,
    newContent: planParser.setApprovalState(content, phase),
    phaseDocs: phaseDocs,
  });
  if (!gate.allow) {
    return json(res, 400, { error: gate.message || 'Approval prerequisites not met' });
  }

  // 用 plan-parser 的 setApprovalState 写入，兼容纯文本与 "- key: value" 列表前缀
  const updated = planParser.setApprovalState(content, phase);
  const today = utils.getDateString();
  const finalContent = updated.replace(/^updated:.*$/m, 'updated: ' + today);

  utils.writeFile(progressPath, finalContent);

  // Idempotent Status sync (already approved by gate)
  const docSynced = planParser.setDocStatusApproved(docRaw);
  if (docSynced !== docRaw) {
    utils.writeFile(docPath, docSynced);
  }
  const newApproval = planParser.getApprovalState(finalContent);
  json(res, 200, { ok: true, approval: newApproval });
}

function validateApproval(phase, approval, pipeline) {
  const errors = [];
  const index = pipeline.indexOf(phase);
  if (index === -1) {
    errors.push('Phase is not in the configured plan pipeline');
    return errors;
  }

  for (const previous of pipeline.slice(0, index)) {
    if (approval[previous] !== 'approved') {
      errors.push(capitalizeForMessage(previous) + ' must be approved first');
    }
  }

  return errors;
}

function capitalizeForMessage(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

async function handleCreatePlan(projectPath, req, res) {
  const body = await readBody(req);
  if (!body) return json(res, 413, { error: 'Request body too large' });
  let parsed;
  try { parsed = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }

  const { name, complexity, priority } = parsed;
  if (!name) return json(res, 400, { error: 'Name is required' });
  const comp = Object.keys(loadGlobalPipelines()).includes(complexity) ? complexity : 'm-feature';
  const pri = ['P1', 'P2', 'P3', 'P4'].includes(priority) ? priority : 'P2';

  const plansDir = path.join(projectPath, 'docs', 'plans');
  utils.ensureDir(plansDir);
  const existing = fs.readdirSync(plansDir).filter(d => /^P\d{3}-/.test(d));
  const maxId = existing.reduce((max, d) => {
    const num = parseInt(d.slice(1, 4));
    return num > max ? num : max;
  }, 0);
  const nextId = String(maxId + 1).padStart(3, '0');

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const planId = 'P' + nextId + '-' + slug;
  const planDir = path.join(plansDir, planId);
  utils.ensureDir(planDir);

  const today = utils.getDateString();
  const templates = getPlanTemplates(name, planId, comp, pri, today, getPlanPipeline(projectPath, comp));
  utils.writeFile(path.join(planDir, 'progress.md'), templates['progress.md']);

  json(res, 201, { id: planId, name: name, complexity: comp, priority: pri });
}

function getPlanTemplates(name, planId, complexity, priority, date, pipeline) {
  const t = {};
  const pipelineDocs = pipeline || getPlanPipeline(process.cwd(), complexity);
  const approvalLines = pipelineDocs.map(doc => doc + ': none');

  t['progress.md'] = [
    '# Progress: ' + name,
    'status: in_progress',
    'updated: ' + date,
    'plan: ' + planId,
    'complexity: ' + complexity,
    'priority: ' + priority,
    'grilling: in_progress',
    '',
    '## Task Stats',
    'total: 0',
    'completed: 0',
    'in_progress: 0',
    'pending: 0',
    '',
    '## Approval State',
    ...approvalLines,
    '',
    '## Active Task',
    'none',
    '',
    '## Blockers',
    '- none',
    ''
  ].join('\n');

  if (pipelineDocs.includes('requirements')) {
    t['requirements.md'] = [
      '# Requirements: ' + name,
      '',
      '## Problem Statement',
      '{description}',
      '',
      '## Acceptance Criteria',
      '- [ ] WHEN {condition} THEN {expected}',
      '',
      '## Constraints',
      '- {constraint}',
      '',
      '## Out of Scope',
      '- {exclusion}',
      '',
      '## Status: draft',
      ''
    ].join('\n');
  }

  if (pipelineDocs.includes('design')) {
    t['design.md'] = [
      '# Design: ' + name,
      '',
      '## Approach',
      '{approach}',
      '',
      '## Architecture',
      '- {module}',
      '',
      '## Key Decisions',
      '- {decision}',
      '',
      '## Risks',
      '| Risk | Probability | Impact | Mitigation |',
      '|------|------------|--------|------------|',
      '',
      '## Status: draft',
      ''
    ].join('\n');
  }

  if (pipelineDocs.includes('test-plan')) {
    t['test-plan.md'] = [
      '# Test Plan: ' + name,
      '',
      '## Test Strategy',
      '{strategy overview}',
      '',
      '## Test Cases',
      '- [ ] {test case 1}',
      '',
      '## Coverage Targets',
      '- Unit: {N}%',
      '- Integration: {N}%',
      '',
      '## Status: draft',
      ''
    ].join('\n');
  }

  if (pipelineDocs.includes('deployment')) {
    t['deployment.md'] = [
      '# Deployment: ' + name,
      '',
      '## Environments',
      '- {environment details}',
      '',
      '## Deployment Steps',
      '1. {step}',
      '',
      '## Rollback Plan',
      '- {rollback procedure}',
      '',
      '## Status: draft',
      ''
    ].join('\n');
  }

  t['tasks.md'] = [
    '# Tasks: ' + name,
    '',
    '> Progress: 0/0 tasks (0%)',
    '',
    '## 1.0 {Section}',
    '',
    '### 1.1 {Task}',
    '- **Status**: pending',
    '',
    ''
  ].join('\n');

  return t;
}

function handleArchivePlan(projectPath, planId, res) {
  if (!validatePlanId(planId)) return json(res, 400, { error: 'Invalid plan ID' });
  const progressPath = path.join(projectPath, 'docs', 'plans', planId, 'progress.md');
  if (!fs.existsSync(progressPath)) return json(res, 404, { error: 'Plan not found' });

  const content = fs.readFileSync(progressPath, 'utf-8');
  const status = planParser.getStatus(content);
  if (status === 'archived') return json(res, 400, { error: 'Plan is already archived' });

  const stats = planParser.parseProgress(content);
  if (stats.total === 0 || stats.completed < stats.total) {
    return json(res, 400, { error: 'Plan is not completed (' + stats.completed + '/' + stats.total + ' tasks done)' });
  }

  // Check all pipeline docs are approved
  const complexity = planParser.getComplexity(content);
  const pipeline = getPlanPipeline(projectPath, complexity);
  const approval = planParser.getApprovalState(content);
  const unapproved = pipeline.filter(function(doc) { return approval[doc] !== 'approved'; });
  if (unapproved.length > 0) {
    return json(res, 400, { error: 'Unapproved docs: ' + unapproved.join(', ') });
  }

  // Update status field in progress.md
  // Handle legacy plans without a status field by inserting one after the title line
  var updated;
  if (/^\s*status:\s*\S+/m.test(content)) {
    updated = content.replace(/^(\s*status:\s*)\S+/m, '$1archived');
  } else {
    updated = content.replace(/^(#\s+Progress:.+)$/m, '$1\nstatus: archived');
  }
  utils.writeFile(progressPath, updated);

  json(res, 200, { id: planId, status: 'archived' });
}

// ── Single-file plan migration (P030) ─────────────────────
// Migrate a single-file plan (docs/plans/P{NNN}-{slug}.md, all-in-one) to the
// standard directory format (docs/plans/P{NNN}-{slug}/progress.md), preserving
// content byte-for-byte. Inside a git repo, `git mv` keeps history traceable
// for tracked files; untracked plans (git mv rejects them) and non-git repos
// fall back to fs.renameSync. Path traversal is blocked upstream
// by validatePlanId (only ^P\d{3}-[a-z0-9-]+$ passes).

function isGitRepo(projectPath) {
  try {
    const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: projectPath, encoding: 'utf8' });
    return result.status === 0 && (result.stdout || '').trim() === 'true';
  } catch {
    return false;
  }
}

// Whether `srcRel` (path relative to projectPath) is tracked in the git index.
// `git mv` rejects untracked files ("fatal: not under version control"); for
// those we fall back to fs.renameSync since there's no history to preserve.
function isTrackedByGit(projectPath, srcRel) {
  const result = spawnSync('git', ['ls-files', '--error-unmatch', srcRel], { cwd: projectPath, encoding: 'utf8' });
  return result.status === 0;
}

/**
 * Migrate a single-file plan to the standard directory format.
 * @param {string} projectPath - Absolute project root.
 * @param {string} planId - Plan id passing validatePlanId (e.g. P070-migrate-me).
 * @returns {{ ok: boolean, code?: number, error?: string, id?: string, migrated?: boolean }}
 *   ok:false carries an HTTP-ish status code (400/404/409/500) and error.
 */
function migrateSingleFilePlan(projectPath, planId) {
  if (!validatePlanId(planId)) return { ok: false, code: 400, error: 'Invalid plan ID' };

  const plansDir = path.join(projectPath, 'docs', 'plans');
  const srcPath = path.join(plansDir, planId + '.md');
  if (!fs.existsSync(srcPath)) return { ok: false, code: 404, error: 'Single-file plan not found' };

  const content = fs.readFileSync(srcPath, 'utf-8');
  if (!content.trim()) return { ok: false, code: 400, error: 'Source plan is empty' };

  const destDir = path.join(plansDir, planId);
  if (fs.existsSync(destDir)) return { ok: false, code: 409, error: 'Target directory already exists' };

  const destPath = path.join(destDir, 'progress.md');
  fs.mkdirSync(destDir);

  try {
    const srcRel = path.relative(projectPath, srcPath);
    if (isGitRepo(projectPath) && isTrackedByGit(projectPath, srcRel)) {
      // Tracked file → git mv preserves history and stages the rename in the index.
      const destRel = path.relative(projectPath, destPath);
      const result = spawnSync('git', ['mv', srcRel, destRel], { cwd: projectPath, encoding: 'utf8' });
      if (result.status !== 0) {
        throw new Error('git mv failed: ' + ((result.stderr || '') + (result.stdout || '')).trim());
      }
    } else {
      // Non-git repo, or untracked plan (git mv rejects untracked with
      // "not under version control") → plain rename, no history to preserve.
      fs.renameSync(srcPath, destPath);
    }
  } catch (e) {
    // Rollback the just-created empty dir so a retry isn't blocked by "exists".
    try { fs.rmdirSync(destDir); } catch {}
    return { ok: false, code: 500, error: 'Migration failed: ' + e.message };
  }

  return { ok: true, id: planId, migrated: true };
}

function handleMigratePlan(projectPath, planId, res) {
  const result = migrateSingleFilePlan(projectPath, planId);
  if (!result.ok) return json(res, result.code, { error: result.error });
  json(res, 200, { id: result.id, migrated: true });
}

// ── Task progress handlers ─────────────────────────────

function parseTasksMarkdown(content) {
  return parseTasksPanel.parseTasksMarkdown(content);
}

function readTestsLedgerEnabled(projectPath) {
  try {
    const raw = readQualityConfig(projectPath);
    const effective = qualityConfig.deepMerge(qualityConfig.DEFAULTS, raw);
    return !!(effective.testsLedger && effective.testsLedger.enabled === true);
  } catch {
    return false;
  }
}

function handleGetPlanTasks(projectPath, planId, res) {
  if (!validatePlanId(planId)) return json(res, 400, { error: 'Invalid plan ID' });
  const testsLedgerEnabled = readTestsLedgerEnabled(projectPath);
  const tasksPath = path.join(projectPath, 'docs', 'plans', planId, 'tasks.md');
  if (fs.existsSync(tasksPath)) {
    const content = fs.readFileSync(tasksPath, 'utf-8');
    let parsed = parseTasksMarkdown(content);
    parsed.hasTasksDoc = true;
    parsed.testsLedgerEnabled = testsLedgerEnabled;
    const progressPathForStatus = path.join(projectPath, 'docs', 'plans', planId, 'progress.md');
    if (!parsed.unsupported && fs.existsSync(progressPathForStatus)) {
      parsed = parseTasksPanel.applyProgressTaskStatuses(
        parsed,
        fs.readFileSync(progressPathForStatus, 'utf-8')
      );
      parsed.hasTasksDoc = true;
      parsed.testsLedgerEnabled = testsLedgerEnabled;
    }
    json(res, 200, parsed);
    return;
  }

  // Fallback: no tasks.md, derive stats from progress.md (## Task Stats)
  const progressPath = path.join(projectPath, 'docs', 'plans', planId, 'progress.md');
  if (!fs.existsSync(progressPath)) {
    json(res, 200, {
      tasks: [], total: 0, completed: 0, inProgress: 0, pending: 0, blocked: 0,
      hasTasksDoc: false, panelCompatible: true, unsupported: false, unsupportedMessage: null,
      testsLedgerEnabled: testsLedgerEnabled,
    });
    return;
  }

  const stats = parseProgressStats(fs.readFileSync(progressPath, 'utf-8'));
  stats.testsLedgerEnabled = testsLedgerEnabled;
  json(res, 200, stats);
}


function handleGetPlanTestsLedger(projectPath, planId, res) {
  if (!validatePlanId(planId)) return json(res, 400, { error: 'Invalid plan ID' });
  const ledgerPath = path.join(projectPath, 'docs', 'plans', planId, 'tests.md');
  if (!fs.existsSync(ledgerPath)) {
    return json(res, 200, {
      hasTestsDoc: false,
      format: null,
      entries: [],
      groups: [],
      panelCompatible: true,
    });
  }
  const content = fs.readFileSync(ledgerPath, 'utf-8');
  const parsed = parseTestsLedger.parseTestsLedger(content);
  const groups = parseTestsLedger.groupLedgerByTask(parsed.entries || []);
  json(res, 200, Object.assign({}, parsed, {
    hasTestsDoc: true,
    groups: groups,
  }));
}

// Extract task counts from a progress.md ## Task Stats block.
// Returns the same shape as parseTasksMarkdown so the frontend needs no changes.
function parseProgressStats(content) {
  const block = content.match(/##\s*Task Stats\s*\n([\s\S]*?)(?=\n##|\n*$)/i);
  const out = { tasks: [], total: 0, completed: 0, inProgress: 0, pending: 0, blocked: 0, hasTasksDoc: false };
  if (!block) return out;
  const get = (key) => {
    const m = block[1].match(new RegExp(key + '\\s*:\\s*(\\d+)', 'i'));
    return m ? parseInt(m[1], 10) : 0;
  };
  out.total = get('total');
  out.completed = get('completed');
  out.inProgress = get('in_progress') || get('inProgress');
  out.pending = get('pending');
  out.blocked = get('blocked');
  // Counts only when tasks.md is absent — no synthetic nodes (panel stays empty).
  out.panelCompatible = true;
  out.unsupported = false;
  out.unsupportedMessage = null;
  return out;
}


// ── Template handlers ───────────────────────────────────

function handleListTemplates(res) {
  const templatesDir = path.join(AIREIN_ROOT, 'templates');
  if (!fs.existsSync(templatesDir)) return json(res, 200, []);

  const templates = [];
  function walk(dir, prefix) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = prefix ? prefix + '/' + entry.name : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), relPath);
      } else {
        const stat = fs.statSync(path.join(dir, entry.name));
        templates.push({
          path: relPath,
          size: stat.size,
          modified: stat.mtime.toISOString().split('T')[0]
        });
      }
    }
  }
  walk(templatesDir, '');
  json(res, 200, templates);
}

function handleGetTemplate(templatePath, res) {
  const templatesRoot = path.join(AIREIN_ROOT, 'templates');
  const fullPath = safePath(templatesRoot, templatePath);
  if (!fullPath) return json(res, 400, { error: 'Invalid path' });
  if (!fs.existsSync(fullPath)) return json(res, 404, { error: 'Template not found' });

  json(res, 200, { content: fs.readFileSync(fullPath, 'utf-8'), path: templatePath });
}

async function handleSaveTemplate(templatePath, req, res) {
  const templatesRoot = path.join(AIREIN_ROOT, 'templates');
  const fullPath = safePath(templatesRoot, templatePath);
  if (!fullPath) return json(res, 400, { error: 'Invalid path' });

  const body = await readBody(req);
  if (!body) return json(res, 413, { error: 'Request body too large' });
  let parsed;
  try { parsed = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
  if (typeof parsed.content !== 'string') return json(res, 400, { error: 'Missing content' });

  if (templatePath.endsWith('.json')) {
    try { JSON.parse(parsed.content); } catch {
      return json(res, 400, { error: 'Invalid JSON' });
    }
  }
  utils.ensureDir(path.dirname(fullPath));
  utils.writeFile(fullPath, parsed.content);
  json(res, 200, { ok: true });
}

// ── Project Docs handlers ─────────────────────────────────

function handleListProjectDocs(projectPath, res) {
  const docs = [];

  // Category 1: AI 基础文档（用户写的项目级 AI 配置）
  const aiDocs = ['CLAUDE.md', 'MEMORY.md', 'quality.json', 'pipelines.json'];
  aiDocs.forEach(function(name) {
    const filePath = path.join(projectPath, name);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      docs.push({
        path: name,
        size: stat.size,
        modified: stat.mtime.toISOString().split('T')[0]
      });
    }
  });

  // Category 2 & 3: docs/ 目录（包括 plans/）
  const docsDir = path.join(projectPath, 'docs');
  if (fs.existsSync(docsDir)) {
    function walkDocs(dir, prefix) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const relPath = prefix ? prefix + '/' + entry.name : entry.name;
        if (entry.isDirectory()) {
          walkDocs(path.join(dir, entry.name), relPath);
        } else {
          const stat = fs.statSync(path.join(dir, entry.name));
          docs.push({
            path: 'docs/' + relPath,
            size: stat.size,
            modified: stat.mtime.toISOString().split('T')[0]
          });
        }
      }
    }
    walkDocs(docsDir, '');
  }

  // Category 4: CC memory 目录（~/.claude/projects/{key}/memory/）
  const ccMemoryDir = getCCMemoryDir(projectPath);
  if (ccMemoryDir) {
    const memoryFiles = fs.readdirSync(ccMemoryDir).filter(f => f.endsWith('.md'));
    for (const file of memoryFiles) {
      const filePath = path.join(ccMemoryDir, file);
      const stat = fs.statSync(filePath);
      docs.push({
        path: 'memory/' + file,
        size: stat.size,
        modified: stat.mtime.toISOString().split('T')[0],
        isCCMemory: true  // 标记为 CC memory 文件
      });
    }
  }

  json(res, 200, docs);
}

function handleGetProjectDoc(projectPath, docPath, res) {
  // Determine document type and base directory
  let fullPath, basePath;
  const aiBaseDocs = ['CLAUDE.md', 'MEMORY.md', 'quality.json', 'pipelines.json'];

  if (aiBaseDocs.indexOf(docPath) !== -1) {
    // AI 基础文档（项目根目录）
    basePath = projectPath;
    fullPath = safePath(basePath, docPath);
  } else if (docPath.indexOf('rules/') === 0) {
    // L0 规则文件（项目根目录 rules/）
    basePath = projectPath;
    fullPath = safePath(basePath, docPath);
  } else if (docPath.indexOf('docs/') === 0) {
    // 归档文档或计划文档（docs/ 目录）
    basePath = path.join(projectPath, 'docs');
    const relPath = docPath.replace('docs/', '');
    fullPath = safePath(basePath, relPath);
  } else if (docPath.indexOf('memory/') === 0) {
    // CC memory 文件（~/.claude/projects/{key}/memory/）
    const ccMemoryDir = getCCMemoryDir(projectPath);
    if (!ccMemoryDir) return json(res, 404, { error: 'CC memory directory not found' });
    const relPath = docPath.replace('memory/', '');
    fullPath = safePath(ccMemoryDir, relPath);
  } else if (docPath.indexOf('cc-/') === 0) {
    // CC 项目目录文件（~/.claude/projects/{key}/）
    const ccProjectDir = getCCProjectDir(projectPath);
    if (!ccProjectDir) return json(res, 404, { error: 'CC project directory not found' });
    const relPath = docPath.replace('cc-/', '');
    fullPath = safePath(ccProjectDir, relPath);
  } else {
    // Legacy: default to docs/ directory
    basePath = path.join(projectPath, 'docs');
    fullPath = safePath(basePath, docPath);
  }

  if (!fullPath) return json(res, 400, { error: 'Invalid path' });

  if (!fs.existsSync(fullPath)) return json(res, 404, { error: 'Document not found' });
  const content = fs.readFileSync(fullPath, 'utf8');

  // Detect sub-documents: design.md → design-*.md in same directory
  const docDir = path.dirname(fullPath);
  const baseName = path.basename(fullPath, '.md');
  const subDocPattern = baseName + '-';
  let subDocs = [];
  try {
    subDocs = fs.readdirSync(docDir)
      .filter(function(f) { return f.startsWith(subDocPattern) && f.endsWith('.md'); })
      .map(function(f) { return f.slice(0, -3); })
      .sort();
  } catch {}

  json(res, 200, { content: content, path: docPath, subDocs: subDocs });
}

async function handleSaveProjectDoc(projectPath, docPath, req, res) {
  if (!/\.(md|txt|json)$/i.test(docPath)) return json(res, 400, { error: 'Only .md, .txt, and .json files are allowed' });

  // Determine document type and base directory
  let fullPath, basePath;
  const aiBaseDocs = ['CLAUDE.md', 'MEMORY.md', 'quality.json', 'pipelines.json'];

  if (aiBaseDocs.indexOf(docPath) !== -1) {
    // AI 基础文档（项目根目录）
    basePath = projectPath;
    fullPath = safePath(basePath, docPath);
  } else if (docPath.indexOf('rules/') === 0) {
    // L0 规则文件（项目根目录 rules/）
    basePath = projectPath;
    fullPath = safePath(basePath, docPath);
  } else if (docPath.indexOf('docs/') === 0) {
    // 归档文档或计划文档（docs/ 目录）
    basePath = path.join(projectPath, 'docs');
    const relPath = docPath.replace('docs/', '');
    fullPath = safePath(basePath, relPath);
  } else if (docPath.indexOf('memory/') === 0) {
    // CC memory 文件（只读，不允许保存）
    return json(res, 403, { error: 'CC memory files are read-only' });
  } else if (docPath.indexOf('cc-/') === 0) {
    // CC 项目目录文件（只读，不允许保存）
    return json(res, 403, { error: 'CC project files are read-only' });
  } else {
    // Legacy: default to docs/ directory
    basePath = path.join(projectPath, 'docs');
    fullPath = safePath(basePath, docPath);
  }

  if (!fullPath) return json(res, 400, { error: 'Invalid path' });

  const body = await readBody(req);
  if (!body) return json(res, 413, { error: 'Request body too large' });
  let parsed;
  try { parsed = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
  if (typeof parsed.content !== 'string') return json(res, 400, { error: 'Missing content' });

  utils.ensureDir(path.dirname(fullPath));
  utils.writeFile(fullPath, parsed.content);
  json(res, 200, { ok: true });
}

// ── Tools: project registry (P004) ───────────────────────

function handleGetRegistryTools(res) {
  const entries = dashboardProjects.listRegistryEntries();
  const staleCount = entries.filter((e) => !e.exists).length;
  json(res, 200, {
    registryPath: dashboardProjects.resolveRegistryPath(),
    entries,
    total: entries.length,
    staleCount,
  });
}

async function handleRegisterRegistry(req, res) {
  const body = await readBody(req);
  if (!body) return json(res, 413, { error: 'Request body too large' });
  let parsed;
  try { parsed = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
  if (!parsed.path || typeof parsed.path !== 'string') {
    return json(res, 400, { error: 'Missing path' });
  }
  const result = dashboardProjects.registerProject(parsed.path, { name: parsed.name });
  if (!result.ok) return json(res, 400, { error: result.error || 'Register failed' });
  invalidateProjectsCache();
  json(res, 200, result);
}

async function handleUnregisterRegistry(req, res) {
  const body = await readBody(req);
  if (!body) return json(res, 413, { error: 'Request body too large' });
  let parsed;
  try { parsed = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
  if (!parsed.path || typeof parsed.path !== 'string') {
    return json(res, 400, { error: 'Missing path' });
  }
  const result = dashboardProjects.unregisterProject(parsed.path);
  invalidateProjectsCache();
  json(res, 200, result);
}

function handlePruneRegistry(res) {
  const result = dashboardProjects.pruneStaleProjects();
  invalidateProjectsCache();
  json(res, 200, result);
}

// ── Config handlers ───────────────────────────────────

function handleGetConfig(projectPath, res) {
  const rawConfig = readQualityConfig(projectPath);
  const effective = qualityConfig.deepMerge(qualityConfig.DEFAULTS, rawConfig);

  json(res, 200, { raw: rawConfig, effective: effective, defaults: qualityConfig.DEFAULTS });
}

async function handleSaveConfig(projectPath, req, res) {
  const body = await readBody(req);
  if (!body) return json(res, 413, { error: 'Request body too large' });
  let parsed;
  try { parsed = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }

  const { updates } = parsed;
  if (!updates || typeof updates !== 'object') {
    return json(res, 400, { error: 'Missing updates object' });
  }

  const existing = readQualityConfig(projectPath);
  const merged = qualityConfig.deepMerge(existing, updates);
  writeQualityConfig(projectPath, merged);
  json(res, 200, { ok: true, config: merged });
}

function handleGetLanguageProfiles(projectPath, res) {
  const raw = readQualityConfig(projectPath);
  const effective = qualityConfig.deepMerge(qualityConfig.DEFAULTS, raw);
  const globalProfiles = loadGlobalLanguageProfiles();
  json(res, 200, {
    active: effective.languageProfiles?.active || [],
    available: Object.keys(globalProfiles).filter(k => k !== 'default'),
    effective: effective.languageProfiles || { active: [], overrides: {} },
    overrides: raw.languageProfiles?.overrides || {},
    defaults: qualityConfig.DEFAULTS.languageProfiles
  });
}

async function handleSaveLanguageProfiles(projectPath, req, res) {
  const body = await readBody(req);
  if (!body) return json(res, 413, { error: 'Request body too large' });
  let parsed;
  try { parsed = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }

  const existing = readQualityConfig(projectPath);

  // Support both new active[] and legacy overrides
  if (!Array.isArray(parsed.active) && !parsed.overrides) {
    return json(res, 400, { error: 'Missing active or overrides' });
  }

  const update = { languageProfiles: {} };
  if (Array.isArray(parsed.active)) {
    update.languageProfiles.active = parsed.active;
  }
  if (parsed.overrides && typeof parsed.overrides === 'object' && !Array.isArray(parsed.overrides)) {
    update.languageProfiles.overrides = parsed.overrides;
  }

  const merged = qualityConfig.deepMerge(existing, update);
  writeQualityConfig(projectPath, merged);
  json(res, 200, { ok: true, active: merged.languageProfiles?.active || [] });
}

// ── Global pipeline management ────────────────────────

function handleGetGlobalPipelines(res) {
  const templatesPath = path.join(AIREIN_ROOT, 'templates', 'pipelines.json');
  if (fs.existsSync(templatesPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(templatesPath, 'utf8'));
      return json(res, 200, raw);
    } catch {}
  }
  // Fallback: return hardcoded defaults
  json(res, 200, {
    defaultComplexity: 'm-feature',
    definitions: {
      's-feature': { label: 'S-Feature', description: 'Small project feature', docs: ['requirements', 'tasks'] },
      's-bugfix': { label: 'S-Bugfix', description: 'Small project bugfix', docs: ['tasks'] },
      'm-feature': { label: 'M-Feature', description: 'Medium project feature', docs: ['requirements', 'design', 'test-plan', 'tasks'] },
      'm-bugfix': { label: 'M-Bugfix', description: 'Medium project bugfix', docs: ['requirements', 'tasks'] },
      'm-urgent': { label: 'M-Urgent', description: 'Medium project urgent', docs: ['tasks'] },
      'l-feature': { label: 'L-Feature', description: 'Large project feature', docs: ['requirements', 'design', 'test-plan', 'deployment', 'tasks'] },
      'l-bugfix': { label: 'L-Bugfix', description: 'Large project bugfix', docs: ['requirements', 'design', 'test-plan', 'tasks'] },
      'hotfix': { label: 'Hotfix', description: 'Emergency fix', docs: ['tasks'] }
    }
  });
}

async function handleSaveGlobalPipelines(req, res) {
  const body = await readBody(req);
  if (!body) return json(res, 413, { error: 'Request body too large' });
  let parsed;
  try { parsed = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }

  if (!parsed.definitions || typeof parsed.definitions !== 'object' || Array.isArray(parsed.definitions)) {
    return json(res, 400, { error: 'Missing definitions object' });
  }
  for (const [name, def] of Object.entries(parsed.definitions)) {
    if (!def.docs || !Array.isArray(def.docs) || def.docs.length === 0) {
      return json(res, 400, { error: `Pipeline "${name}" must have a non-empty docs array` });
    }
    if (!/^[a-z][a-z0-9_-]*$/.test(name)) {
      return json(res, 400, { error: `Pipeline name "${name}" must be lowercase alphanumeric (start with letter)` });
    }
    for (const doc of def.docs) {
      if (typeof doc !== 'string' || !doc.trim()) {
        return json(res, 400, { error: `Pipeline "${name}" has empty or invalid doc name` });
      }
    }
  }

  const templatesDir = path.join(AIREIN_ROOT, 'templates');
  const templatesPath = path.join(templatesDir, 'pipelines.json');
  utils.ensureDir(templatesDir);
  utils.writeFile(templatesPath, JSON.stringify(parsed, null, 2) + '\n');
  json(res, 200, { ok: true, definitions: Object.keys(parsed.definitions) });
}

// ── Global language profile management ────────────────────────

function handleGetGlobalLanguageProfiles(res, profileName) {
  if (profileName) {
    // GET /api/language-profiles/:name — single profile
    const profiles = loadGlobalLanguageProfiles();
    const profile = profiles[profileName];
    if (!profile) return json(res, 404, { error: `Profile "${profileName}" not found` });
    return json(res, 200, profile);
  }
  // GET /api/language-profiles — all profiles
  const profiles = loadGlobalLanguageProfiles();
  json(res, 200, profiles);
}

async function handleSaveGlobalLanguageProfile(req, res, profileName) {
  const body = await readBody(req);
  if (!body) return json(res, 413, { error: 'Request body too large' });
  let parsed;
  try { parsed = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }

  if (!profileName || typeof profileName !== 'string') {
    return json(res, 400, { error: 'Profile name is required in URL' });
  }
  if (!/^[a-z][a-z0-9_-]*$/.test(profileName)) {
    return json(res, 400, { error: `Profile name "${profileName}" must be lowercase alphanumeric (start with letter, hyphens/underscores allowed)` });
  }
  if (!parsed.name || parsed.name !== profileName) {
    return json(res, 400, { error: `Profile body name must match URL name "${profileName}"` });
  }
  if (!Array.isArray(parsed.extensions) || parsed.extensions.length === 0) {
    return json(res, 400, { error: 'Profile must have a non-empty extensions array' });
  }

  const profilesDir = path.join(AIREIN_ROOT, 'templates', 'language-profiles');
  utils.ensureDir(profilesDir);
  const filePath = path.join(profilesDir, profileName + '.json');
  utils.writeFile(filePath, JSON.stringify(parsed, null, 2) + '\n');
  json(res, 200, { ok: true, name: profileName });
}

function handleDeleteGlobalLanguageProfile(res, profileName) {
  if (!profileName) return json(res, 400, { error: 'Profile name is required in URL' });
  if (profileName === 'default' || profileName === '_default') {
    return json(res, 403, { error: 'Cannot delete the default profile' });
  }

  // Resolve file by profile name field, not filename — handles _default.json → "default"
  const profilesDir = path.join(AIREIN_ROOT, 'templates', 'language-profiles');
  let targetFile = null;
  try {
    const files = fs.readdirSync(profilesDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(profilesDir, file), 'utf8'));
        if (raw.name === profileName) { targetFile = path.join(profilesDir, file); break; }
      } catch { /* skip invalid */ }
    }
  } catch { /* dir missing */ }

  if (!targetFile) return json(res, 404, { error: `Profile "${profileName}" not found` });
  try { fs.unlinkSync(targetFile); } catch { return json(res, 500, { error: 'Failed to delete profile' }); }
  json(res, 200, { ok: true, deleted: profileName });
}

// ── HTML serving ───────────────────────────────────

function serveIndex(res) {
  const htmlPath = path.join(__dirname, 'public', 'index.html');
  if (!fs.existsSync(htmlPath)) {
    return json(res, 500, { error: 'index.html not found' });
  }
  html(res, fs.readFileSync(htmlPath, 'utf-8'));
}

// ── Static assets ───────────────────────────────────────
// Serve shared frontend modules (e.g. doc-links.js) loaded via <script src>.
// Whitelisted extensions only; path.basename strips any directory component so
// the request can never escape the public/ directory.

const PUBLIC_ASSET_MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function servePublicAsset(reqPath, res) {
  const base = path.basename(reqPath); // strip dirs → traversal blocked
  const mime = PUBLIC_ASSET_MIME[path.extname(base).toLowerCase()];
  if (!mime) return json(res, 404, { error: 'Not found' });
  const full = path.join(__dirname, 'public', base);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    return json(res, 404, { error: 'Not found' });
  }
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
  res.end(fs.readFileSync(full));
}

// ── Router ─────────────────────────────────────

async function handler(req, res) {
  // P015 Task 1+2: ingress validation — DNS rebinding (Host), CSRF (Origin +
  // strict Content-Type on mutating methods).
  if (!isHostAllowed(req.headers.host)) {
    return json(res, 403, { error: 'Forbidden: invalid Host' });
  }
  const isMutating = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
  if (isMutating) {
    if (!isOriginAllowed(req.headers.origin)) {
      return json(res, 403, { error: 'Forbidden: invalid Origin' });
    }
    const contentType = (req.headers['content-type'] || '').toLowerCase();
    if (!contentType.startsWith('application/json')) {
      return json(res, 415, { error: 'Unsupported Media Type: application/json required' });
    }
  }

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, 'http://' + req.headers.host);
  const p = url.pathname;
  const method = req.method;

  try {
    if (p === '/' && method === 'GET') return serveIndex(res);
    // Top-level static assets from public/ (single segment + whitelisted ext).
    if (method === 'GET' && /^\/[^/]+\.(js|css|svg|png|ico)$/i.test(p)) {
      return servePublicAsset(p, res);
    }
    if (p === '/api/projects' && method === 'GET') return handleListProjects(res);
    if (p === '/api/templates' && method === 'GET') return handleListTemplates(res);

    const tplMatch = p.match(/^\/api\/templates\/(.+\.md|.+\.json)$/);
    if (tplMatch) {
      const tplPath = tplMatch[1];
      if (method === 'GET') return handleGetTemplate(tplPath, res);
      if (method === 'PUT') return handleSaveTemplate(tplPath, req, res);
    }

    const approveMatch = p.match(/^\/api\/projects\/([^/]+)\/plans\/([^/]+)\/approve$/);
    if (approveMatch && method === 'POST') {
      const project = findProject(approveMatch[1]);
      if (!project) return json(res, 404, { error: 'Project not found' });
      return handleApprove(project.path, approveMatch[2], req, res);
    }

    const archiveMatch = p.match(/^\/api\/projects\/([^/]+)\/plans\/([^/]+)\/archive$/);
    if (archiveMatch && method === 'POST') {
      const project = findProject(archiveMatch[1]);
      if (!project) return json(res, 404, { error: 'Project not found' });
      return handleArchivePlan(project.path, archiveMatch[2], res);
    }

    // Migrate single-file plan → directory format (P030). Must be matched BEFORE
    // the generic doc route below, else "migrate" is captured as a doc name.
    const migrateMatch = p.match(/^\/api\/projects\/([^/]+)\/plans\/([^/]+)\/migrate$/);
    if (migrateMatch && method === 'POST') {
      const project = findProject(migrateMatch[1]);
      if (!project) return json(res, 404, { error: 'Project not found' });
      return handleMigratePlan(project.path, migrateMatch[2], res);
    }

    // Plan tasks data (must be matched BEFORE the generic doc route, since
    // "tasks" would otherwise be captured as a doc name)
    const planTasksMatch = p.match(/^\/api\/projects\/([^/]+)\/plans\/([^/]+)\/tasks$/);
    if (planTasksMatch && method === 'GET') {
      const project = findProject(planTasksMatch[1]);
      if (!project) return json(res, 404, { error: 'Project not found' });
      return handleGetPlanTasks(project.path, planTasksMatch[2], res);
    }

    const planTestsLedgerMatch = p.match(/^\/api\/projects\/([^/]+)\/plans\/([^/]+)\/tests-ledger$/);
    if (planTestsLedgerMatch && method === 'GET') {
      const project = findProject(planTestsLedgerMatch[1]);
      if (!project) return json(res, 404, { error: 'Project not found' });
      return handleGetPlanTestsLedger(project.path, planTestsLedgerMatch[2], res);
    }

    const docMatch = p.match(/^\/api\/projects\/([^/]+)\/plans\/([^/]+)\/([a-z0-9][a-z0-9_-]*)$/i);
    if (docMatch) {
      const project = findProject(docMatch[1]);
      if (!project) return json(res, 404, { error: 'Project not found' });
      if (method === 'GET') return handleGetDoc(project.path, docMatch[2], docMatch[3], res);
      if (method === 'PUT') return handleSaveDoc(project.path, docMatch[2], docMatch[3], req, res);
    }

    const planMatch = p.match(/^\/api\/projects\/([^/]+)\/plans\/([^/]+)$/);
    if (planMatch && method === 'GET') {
      const project = findProject(planMatch[1]);
      if (!project) return json(res, 404, { error: 'Project not found' });
      return handleGetPlan(project.path, planMatch[2], res);
    }

    const plansMatch = p.match(/^\/api\/projects\/([^/]+)\/plans$/);
    if (plansMatch) {
      const project = findProject(plansMatch[1]);
      if (!project) return json(res, 404, { error: 'Project not found' });
      if (method === 'GET') return handleGetPlans(project.path, res);
      if (method === 'POST') return handleCreatePlan(project.path, req, res);
    }

    // P024 运行时数据 API
    const runtimeMatch = p.match(/^\/api\/projects\/([^/]+)\/runtime-metrics$/);
    if (runtimeMatch && method === 'GET') {
      const project = findProject(runtimeMatch[1]);
      if (!project) return json(res, 404, { error: 'Project not found' });
      return handleGetRuntimeMetrics(project.path, res);
    }

    // P025 日志查看器 API
    const logsMatch = p.match(/^\/api\/logs$/);
    if (logsMatch && method === 'GET') {
      return handleGetLogs(req, res);
    }

    // P025 ADR 关系 API
    const adrsMatch = p.match(/^\/api\/adrs$/);
    if (adrsMatch && method === 'GET') {
      return handleGetADRs(res);
    }

    // P026 服务健康检查 API
    const healthMatch = p.match(/^\/api\/health$/);
    if (healthMatch && method === 'GET') {
      return handleGetHealth(res);
    }

    // Tools: dashboard project registry
    if (p === '/api/tools/registry' && method === 'GET') {
      return handleGetRegistryTools(res);
    }
    if (p === '/api/tools/registry/register' && method === 'POST') {
      return handleRegisterRegistry(req, res);
    }
    if (p === '/api/tools/registry/unregister' && method === 'POST') {
      return handleUnregisterRegistry(req, res);
    }
    if (p === '/api/tools/registry/prune' && method === 'POST') {
      return handlePruneRegistry(res);
    }

    // Project docs: list
    const docsListMatch = p.match(/^\/api\/projects\/([^/]+)\/docs$/);
    if (docsListMatch && method === 'GET') {
      const project = findProject(docsListMatch[1]);
      if (!project) return json(res, 404, { error: 'Project not found' });
      return handleListProjectDocs(project.path, res);
    }

    // Project docs: read / write individual doc
    const projDocMatch = p.match(/^\/api\/projects\/([^/]+)\/docs\/(.+\.md|.+\.txt)$/);
    if (projDocMatch) {
      let docPath;
      try {
        docPath = decodeURIComponent(projDocMatch[2]);
      } catch {
        return json(res, 400, { error: 'Invalid path encoding' });
      }
      const project = findProject(projDocMatch[1]);
      if (!project) return json(res, 404, { error: 'Project not found' });
      if (method === 'GET') return handleGetProjectDoc(project.path, docPath, res);
      if (method === 'PUT') return handleSaveProjectDoc(project.path, docPath, req, res);
    }

    const languageProfilesMatch = p.match(/^\/api\/projects\/([^/]+)\/language-profiles$/);
    if (languageProfilesMatch) {
      const project = findProject(languageProfilesMatch[1]);
      if (!project) return json(res, 404, { error: 'Project not found' });
      if (method === 'GET') return handleGetLanguageProfiles(project.path, res);
      if (method === 'PUT') return handleSaveLanguageProfiles(project.path, req, res);
    }

    // Global pipeline management (not per-project)
    if (p === '/api/pipelines') {
      if (method === 'GET') return handleGetGlobalPipelines(res);
      if (method === 'PUT') return handleSaveGlobalPipelines(req, res);
    }

    // Global language profile management (not per-project)
    if (p === '/api/language-profiles' && method === 'GET') {
      return handleGetGlobalLanguageProfiles(res, null);
    }
    const langProfileMatch = p.match(/^\/api\/language-profiles\/([a-z][a-z0-9_-]*)$/);
    if (langProfileMatch) {
      const lpName = langProfileMatch[1];
      if (method === 'GET') return handleGetGlobalLanguageProfiles(res, lpName);
      if (method === 'PUT') return handleSaveGlobalLanguageProfile(req, res, lpName);
      if (method === 'DELETE') return handleDeleteGlobalLanguageProfile(res, lpName);
    }

    const configMatch = p.match(/^\/api\/projects\/([^/]+)\/config$/);
    if (configMatch) {
      const project = findProject(configMatch[1]);
      if (!project) return json(res, 404, { error: 'Project not found' });
      if (method === 'GET') return handleGetConfig(project.path, res);
      if (method === 'PUT') return handleSaveConfig(project.path, req, res);
    }

    json(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('Server error:', err);
    json(res, 500, { error: 'Internal server error' });
  }
}

// ── Start ──────────────────────────────────────

const server = http.createServer(handler);
const BIND = process.env.DASHBOARD_BIND || '127.0.0.1';
server.listen(PORT, BIND, () => {
  const url = 'http://localhost:' + PORT;
  console.log('');
  console.log('  Dashboard running at ' + url);
  console.log('  Bound to ' + BIND + ' (set DASHBOARD_BIND to change)');
  console.log('');

  // spawn (no shell) — url is built from parseInt(PORT) so injection is already
  // impossible; avoid the shell anyway for defense-in-depth.
  const openerBin = process.platform === 'win32' ? 'cmd' :
                    process.platform === 'darwin' ? 'open' : 'xdg-open';
  const openerArgs = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try { spawn(openerBin, openerArgs, { detached: true, stdio: 'ignore' }).unref(); } catch {}
});

module.exports = {
  handler,
  discoverProjects,
  invalidateProjectsCache,
  isDiscoverableProject,
  resolveAllowedHosts,
  resolveKernelRoot,
  findProject,
  readQualityConfig,
  handleGetConfig,
  handleSaveConfig,
  handleGetLanguageProfiles,
  handleSaveLanguageProfiles,
  handleGetGlobalPipelines,
  handleSaveGlobalPipelines,
  handleGetGlobalLanguageProfiles,
  handleSaveGlobalLanguageProfile,
  handleDeleteGlobalLanguageProfile,
  handleListProjectDocs,
  handleGetProjectDoc,
  handleSaveProjectDoc,
  handleGetPlans,
  handleGetPlan,
  migrateSingleFilePlan,
  handleMigratePlan,
  handleGetRegistryTools,
  handleRegisterRegistry,
  handleUnregisterRegistry,
  handlePruneRegistry,
};
