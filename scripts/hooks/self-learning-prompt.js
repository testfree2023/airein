/**
 * hooks/self-learning-prompt.js — UserPromptSubmit 适配层（P019）
 *
 * CC UserPromptSubmit 事件 hook：每条用户消息触发。读 stdin（消费协议负载，
 * T1 暂不使用其内容）→ 输出元提示作为 `hookSpecificOutput.additionalContext`
 * 注入模型上下文（模型同轮搭便车识别允许/禁止指令并写缓冲）。
 *
 * 开关：`loadQualityConfig().selfLearning.enabled`（默认 true，T3）。enabled=false
 * 时不输出（空 stdout + exit 0），整条自学习链静默关闭。
 *
 * 红线：UserPromptSubmit 的 hook 必须 fail-open 永远 exit 0——exit 2 会阻断
 * 用户输入，是灾难性的。任何异常（stdin 坏、lib 抛错）都吞掉 exit 0。
 */

const { readStdinJson, output } = require('../lib/utils');
const { buildInjectionOutput } = require('../lib/self-learning');
const { loadQualityConfig } = require('../lib/quality-config');

async function main() {
  await readStdinJson();
  const cfg = loadQualityConfig();
  if (cfg.selfLearning && cfg.selfLearning.enabled === false) return;
  output(buildInjectionOutput());
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(() => process.exit(0));
}

module.exports = { main };
