/**
 * host-detect — P004 宿主环境只读探测（纯函数 + 可选 PATH 扫描）
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HOST_IDS = ['claude-code', 'cursor', 'codex', 'codebuddy', 'opencode'];

/** 首版 P004 完整 setup 支持的宿主 */
const SELECTABLE_V1 = new Set(['claude-code', 'cursor']);

const DETECTORS = {
  'claude-code': (homeDir, _pathEnv) => {
    const signals = [
      path.join(homeDir, '.claude', 'settings.json'),
      path.join(homeDir, '.claude', 'hooks.json'),
    ];
    if (signals.some((p) => exists(p))) {
      return { detected: true, reason: '~/.claude 配置存在' };
    }
    return { detected: false, reason: '未检测到 ~/.claude' };
  },
  cursor: (homeDir, pathEnv) => {
    if (exists(path.join(homeDir, '.cursor', 'hooks.json'))) {
      return { detected: true, reason: '~/.cursor/hooks.json 存在' };
    }
    if (cliOnPath('cursor', pathEnv)) {
      return { detected: true, reason: 'cursor CLI 在 PATH' };
    }
    return { detected: false, reason: '未检测到 Cursor' };
  },
  codex: (homeDir, pathEnv) => {
    if (exists(path.join(homeDir, '.codex', 'config.toml'))) {
      return { detected: true, reason: '~/.codex 存在' };
    }
    if (cliOnPath('codex', pathEnv)) {
      return { detected: true, reason: 'codex CLI 在 PATH' };
    }
    return { detected: false, reason: '未检测到 Codex' };
  },
  codebuddy: (homeDir, _pathEnv) => {
    if (exists(path.join(homeDir, '.codebuddy', 'settings.json'))) {
      return { detected: true, reason: '~/.codebuddy 存在' };
    }
    return { detected: false, reason: '未检测到 CodeBuddy' };
  },
  opencode: (homeDir, pathEnv) => {
    if (cliOnPath('opencode', pathEnv)) {
      return { detected: true, reason: 'opencode CLI 在 PATH' };
    }
    if (exists(path.join(homeDir, '.config', 'opencode'))) {
      return { detected: true, reason: '~/.config/opencode 存在' };
    }
    return { detected: false, reason: '未检测到 OpenCode' };
  },
};

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function cliOnPath(name, pathEnv) {
  const parts = (pathEnv || process.env.PATH || '').split(path.delimiter);
  for (const dir of parts) {
    if (!dir) continue;
    const candidate = path.join(dir, process.platform === 'win32' ? `${name}.exe` : name);
    if (exists(candidate)) return true;
  }
  return false;
}

/**
 * @param {{ homeDir?: string, pathEnv?: string }} [opts]
 * @returns {{ hosts: Array<{ id: string, detected: boolean, selectable: boolean, reason: string }> }}
 */
function hostDetect(opts = {}) {
  const homeDir = path.resolve(opts.homeDir || process.env.HOME || process.env.USERPROFILE || '');
  const pathEnv = opts.pathEnv !== undefined ? opts.pathEnv : process.env.PATH;

  const hosts = HOST_IDS.map((id) => {
    const det = DETECTORS[id](homeDir, pathEnv);
    const selectable = SELECTABLE_V1.has(id);
    let reason = det.reason;
    if (det.detected && !selectable) {
      reason = `${det.reason}；首版未启用，仅提示`;
    }
    return {
      id,
      detected: det.detected,
      selectable,
      reason,
    };
  });

  return { hosts };
}

module.exports = {
  HOST_IDS,
  SELECTABLE_V1,
  hostDetect,
};
