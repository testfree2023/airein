/**
 * T03 — skill-place 单元测试（P001-cross-platform · K1 放置策略 · test-plan §3.1）
 *
 * 被测：`skillPlace(srcSkillsDir, host, targetRoot) → { actions, errors }`（`lib/skill-place.js` 纯函数）。
 *
 * 契约：airein `skills/<name>/SKILL.md` 内容零改动；分发层只做「放置」——返回动作描述列表
 * （不执行 IO）。每宿主 skills 发现路径不同（design §3 矩阵 + §4）：CUR `.cursor/skills/`、
 * CDX `.agents/skills/`（**非** `.codex/skills/`）、CB `.codebuddy/skills/`、OC 原生搜
 * `.claude/skills/`（零放置 type:'none'）。
 *
 * name 校验：源 skill 目录名必须 == SKILL.md frontmatter `name`（design §4 不变量），不等 → errors。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { describe, assertEqual, assertOk, assertContains, assertNotContains, printSummary } = require('./helpers');
const { skillPlace } = require('../scripts/lib/skill-place');

const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');
const TARGET = '/tgt-project';

describe('skillPlace: CUR（cursor）放置', (suite) => {
  suite.test('每个源 skill → {type:copy, dest 含 .cursor/skills/<name>}', () => {
    const { actions } = skillPlace(SKILLS_DIR, 'cursor', TARGET);
    assertOk(actions.length > 0, '产出非空 actions');
    for (const a of actions) {
      assertEqual(a.type, 'copy', `${a.name}: type=copy`);
      assertContains(a.dest, '.cursor/skills', `${a.name}: dest 含 .cursor/skills`);
      assertOk(a.dest.endsWith(a.name), `${a.name}: dest 以 name 结尾`);
    }
  });
});

describe('skillPlace: CDX（codex）放置', (suite) => {
  suite.test('dest 含 .agents/skills/（复数 agents）', () => {
    const { actions } = skillPlace(SKILLS_DIR, 'codex', TARGET);
    assertOk(actions.length > 0, '产出非空');
    for (const a of actions) {
      assertContains(a.dest, '.agents/skills', `${a.name}: dest 含 .agents/skills`);
    }
  });

  suite.test('dest 绝不是 ~/.codex/skills 或 .codex/skills（design §3 修正）', () => {
    const { actions } = skillPlace(SKILLS_DIR, 'codex', TARGET);
    for (const a of actions) {
      assertNotContains(a.dest, '.codex', `${a.name}: dest 不含 .codex`);
    }
  });
});

describe('skillPlace: CB（codebuddy）放置', (suite) => {
  suite.test('dest 含 .codebuddy/skills/', () => {
    const { actions } = skillPlace(SKILLS_DIR, 'codebuddy', TARGET);
    assertOk(actions.length > 0, '产出非空');
    for (const a of actions) {
      assertContains(a.dest, '.codebuddy/skills', `${a.name}: dest 含 .codebuddy/skills`);
      assertEqual(a.type, 'copy', `${a.name}: type=copy`);
    }
  });
});

describe('skillPlace: OC（opencode）零放置', (suite) => {
  suite.test('OC → 每个 skill {type:none}（原生搜 .claude/skills/）', () => {
    const { actions } = skillPlace(SKILLS_DIR, 'opencode', TARGET);
    assertOk(actions.length > 0, 'OC 仍遍历 skill（为 name 校验）');
    for (const a of actions) {
      assertEqual(a.type, 'none', `${a.name}: type=none`);
      assertEqual(a.dest, null, `${a.name}: dest=null（零放置）`);
    }
  });
});

describe('skillPlace: name 校验', (suite) => {
  suite.test('真实 skills/ 全部 name==目录名 → errors 空', () => {
    const { errors } = skillPlace(SKILLS_DIR, 'cursor', TARGET);
    assertEqual(errors.length, 0, `真实 skills 无 name 校验错误（got: ${errors.join('; ')}）`);
  });

  suite.test('目录名 ≠ frontmatter name → 进 errors 且不进 actions', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-place-'));
    const skillDir = path.join(tmp, 'realdir');
    fs.mkdirSync(skillDir);
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: mismatch-name\ndescription: x\n---\nbody');
    try {
      const { actions, errors } = skillPlace(tmp, 'cursor', TARGET);
      assertOk(errors.length > 0, 'name 不匹配报错');
      assertOk(errors.some((e) => e.includes('realdir')), '错误提及目录名 realdir');
      assertOk(actions.every((a) => a.name !== 'realdir'), '不匹配的 skill 不进 actions');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  suite.test('缺 SKILL.md → 进 errors', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-place-'));
    fs.mkdirSync(path.join(tmp, 'orphan'));
    try {
      const { errors } = skillPlace(tmp, 'cursor', TARGET);
      assertOk(errors.length > 0, '缺 SKILL.md 报错');
      assertOk(errors.some((e) => e.includes('orphan')), '错误提及 orphan');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('skillPlace: 幂等（纯函数）', (suite) => {
  suite.test('同输入重复调用 → 相同 actions（深相等）', () => {
    const r1 = skillPlace(SKILLS_DIR, 'cursor', TARGET);
    const r2 = skillPlace(SKILLS_DIR, 'cursor', TARGET);
    assertEqual(JSON.stringify(r1), JSON.stringify(r2), '两次调用结果一致');
  });
});

describe('skillPlace: 未知 host fail-fast', (suite) => {
  suite.test('未知 host 抛错（不静默）', () => {
    let threw = false;
    try { skillPlace(SKILLS_DIR, 'gemini', TARGET); } catch { threw = true; }
    assertOk(threw, '未知 host 抛错');
  });
});

process.exit(printSummary());
