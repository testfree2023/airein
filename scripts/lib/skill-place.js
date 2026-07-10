/**
 * skill-place — K1 skills 放置策略（P001-cross-platform · design §4 · test-plan §3.1）
 *
 * 纯函数：给定源 skills 目录 + 宿主 + 安装根，返回「放置动作」列表（不执行 IO）。
 * airein skill 内容零改动；分发层（install-host.js）据此执行 copy/skip。
 *
 * 单一真相源不变量（design §4）：每宿主放置的 SKILL.md 内容逐字节等同源 —— 这里只决定
 * 「放到哪 / 放不放」，不改内容。name 校验（目录名 == frontmatter name）在此拦截，避免
 * 宿主按目录名加载时名实不符。
 *
 * 宿主 skills 发现路径（design §3 矩阵）：
 *   cursor    → .cursor/skills/<name>/      （copy）
 *   codex     → .agents/skills/<name>/      （copy；注意是 .agents 复数，非 .codex）
 *   codebuddy → .codebuddy/skills/<name>/   （copy）
 *   opencode  → 零放置                       （type:'none'；OC 原生搜 .claude/skills/）
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 宿主 → skills 发现子路径（相对安装根）。opencode 不在此表（零放置）。
 * @type {Record<string,string>}
 */
const HOST_SKILLS_DIR = {
  cursor: '.cursor/skills',
  codex: '.agents/skills',
  codebuddy: '.codebuddy/skills',
};

/**
 * Extract the `name` field from SKILL.md YAML frontmatter.
 * @param {string} content - Raw SKILL.md content.
 * @returns {string|null} Parsed name, or null if frontmatter/name absent.
 */
function extractFrontmatterName(content) {
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const nameLine = fm[1].match(/^name:\s*(.+?)\s*$/m);
  return nameLine ? nameLine[1] : null;
}

/**
 * Compute skill placement actions for a host.
 *
 * @param {string} srcSkillsDir - Source skills/ directory (truth source).
 * @param {string} host - One of: cursor/codex/codebuddy/opencode.
 * @param {string} targetRoot - Installation root (project dir or home).
 * @returns {{ actions: Array<{type:string,name:string,src:string,dest:(string|null)}>, errors: string[] }}
 *   `actions`: one per valid skill (sorted by name for idempotency).
 *   `errors`: name-mismatch / missing-SKILL.md entries (those skills are skipped).
 * @throws {Error} if `host` is not supported.
 */
function skillPlace(srcSkillsDir, host, targetRoot) {
  const isPlacementHost = host in HOST_SKILLS_DIR;
  if (!isPlacementHost && host !== 'opencode') {
    throw new Error(
      `skillPlace: unknown host "${host}" (known: cursor/codex/codebuddy/opencode)`,
    );
  }

  const entries = fs.readdirSync(srcSkillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort(); // 稳定顺序 → 幂等

  const actions = [];
  const errors = [];
  for (const name of entries) {
    const skillDir = path.join(srcSkillsDir, name);
    const mdPath = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(mdPath)) {
      errors.push(`${name}: missing SKILL.md — skipped`);
      continue;
    }
    const fmName = extractFrontmatterName(fs.readFileSync(mdPath, 'utf8'));
    if (fmName !== name) {
      errors.push(
        `${name}: directory name "${name}" ≠ frontmatter name "${fmName}" — skipped`,
      );
      continue;
    }

    if (host === 'opencode') {
      // OC 原生搜 .claude/skills/ —— 零放置，但仍遍历以做 name 校验。
      actions.push({
        type: 'none',
        name,
        src: skillDir,
        dest: null,
        reason: 'opencode natively loads .claude/skills/',
      });
    } else {
      // dest 用 POSIX 分隔，保持跨平台一致的描述；install-host 执行时再按平台落盘。
      const dest = [targetRoot, HOST_SKILLS_DIR[host], name].join('/');
      actions.push({ type: 'copy', name, src: skillDir, dest });
    }
  }

  return { actions, errors };
}

module.exports = {
  skillPlace,
  HOST_SKILLS_DIR,
  extractFrontmatterName,
};
