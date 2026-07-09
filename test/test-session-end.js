/**
 * Test: hooks/session-end.js — Stop 链自学习归档晋升挂载（P019 T5）
 *
 * 集成测试：spawnSync 跑真实 session-end hook，验证：
 *   - enabled 时 archiveAndPromote 触发（pending→archive→clear→rules30）
 *   - disabled 时跳过（pending 不动、archive 不生成）
 *   - fail-open：坏 pending / pending 缺失不崩，主流程仍 exit 0
 *
 * fixture：临时项目目录 T（cwd，含 .claude/memory + .claude/self-learning/pending.md）
 * + 临时 transcript key 目录 T2（archive 落点 = path.dirname(transcriptPath)）。
 */

const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  describe, assertEqual, assertOk, assertContains, projectRoot, printSummary
} = require('./helpers');

const hookPath = path.join(projectRoot(), 'scripts', 'hooks', 'session-end.js');

function runHook(stdinPayload, options = {}) {
  const input = JSON.stringify(stdinPayload);
  const res = spawnSync(process.execPath, [hookPath], {
    input,
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
    cwd: options.cwd
  });
  return { stdout: res.stdout || '', stderr: res.stderr || '', status: res.status };
}

function block(ts, instr) {
  return ['---', `ts: ${ts}`, 'type: deny', `instruction: ${instr}`, 'prompt: x', '---'].join('\n');
}

function setupProject(enabled) {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-se-proj-'));
  const T2 = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-se-key-'));
  fs.mkdirSync(path.join(T, '.claude', 'memory'), { recursive: true });
  fs.mkdirSync(path.join(T, '.claude', 'self-learning'), { recursive: true });
  fs.mkdirSync(path.join(T, '.claude', 'config'), { recursive: true });
  if (enabled === false) {
    fs.writeFileSync(
      path.join(T, '.claude', 'config', 'quality.json'),
      JSON.stringify({ selfLearning: { enabled: false } })
    );
  }
  fs.writeFileSync(
    path.join(T, '.claude', 'self-learning', 'pending.md'),
    [
      block('2026-06-10T00:00:00Z', '永不用 git add -A'),
      block('2026-06-12T00:00:00Z', '永不用 git add -a'),
      block('2026-06-14T00:00:00Z', '永不用 Git Add -A')
    ].join('\n')
  );
  return { T, T2, transcriptPath: path.join(T2, 'fake.jsonl') };
}

describe('session-end.js: self-learning 归档晋升 (T5)', suite => {
  suite.test('enabled → pending 归档 + 清空 + rules30 晋升', () => {
    const { T, T2, transcriptPath } = setupProject();
    const r = runHook({ transcript_path: transcriptPath }, { cwd: T });
    assertEqual(r.status, 0, '应 exit 0');

    const pending = fs.readFileSync(path.join(T, '.claude', 'self-learning', 'pending.md'), 'utf8');
    assertEqual(pending, '', 'pending 应清空');

    const archive = fs.readFileSync(path.join(T2, 'self-learning-archive.md'), 'utf8');
    assertContains(archive, 'type: deny', 'archive 应含归档块');

    const rulesPath = path.join(T, 'rules', '30-self-learned.md');
    assertOk(fs.existsSync(rulesPath), 'rules30 应生成');
    assertContains(fs.readFileSync(rulesPath, 'utf8'), '## Deny', 'rules30 应有 Deny 节');
  });

  suite.test('disabled → pending 保留不动 + archive 不生成', () => {
    const { T, T2, transcriptPath } = setupProject(false);
    const r = runHook({ transcript_path: transcriptPath }, { cwd: T });
    assertEqual(r.status, 0, '应 exit 0');

    const pending = fs.readFileSync(path.join(T, '.claude', 'self-learning', 'pending.md'), 'utf8');
    assertOk(pending.includes('type: deny'), 'disabled 时 pending 应保留');

    assertOk(
      !fs.existsSync(path.join(T2, 'self-learning-archive.md')),
      'disabled 时 archive 不应生成'
    );
  });

  suite.test('fail-open：坏 pending 不崩，exit 0', () => {
    const T = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-se-bad-'));
    const T2 = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-se-badkey-'));
    fs.mkdirSync(path.join(T, '.claude', 'memory'), { recursive: true });
    fs.mkdirSync(path.join(T, '.claude', 'self-learning'), { recursive: true });
    fs.writeFileSync(path.join(T, '.claude', 'self-learning', 'pending.md'), '这不是合法 frontmatter');
    const r = runHook({ transcript_path: path.join(T2, 'fake.jsonl') }, { cwd: T });
    assertEqual(r.status, 0, '坏 pending 必须 fail-open exit 0');
  });

  suite.test('fail-open：pending 缺失不崩，exit 0', () => {
    const T = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-se-nopend-'));
    const T2 = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-se-nopendkey-'));
    fs.mkdirSync(path.join(T, '.claude', 'memory'), { recursive: true });
    const r = runHook({ transcript_path: path.join(T2, 'fake.jsonl') }, { cwd: T });
    assertEqual(r.status, 0, 'pending 缺失必须 fail-open exit 0');
  });
});

printSummary();
