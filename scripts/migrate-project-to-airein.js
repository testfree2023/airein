#!/usr/bin/env node
/**
 * migrate-project-to-airein.js — 将 legacy 项目 .claude/ 数据迁到 .airein/
 *
 * 用法（在项目根目录）：
 *   node ~/.airein/scripts/migrate-project-to-airein.js
 *   node ~/.airein/scripts/migrate-project-to-airein.js --dry-run
 *
 * P004 前老项目：config/memory/logs/self-learning 在 .claude/；
 * 迁移后 canonical 在 .airein/，CC 项目额外建 .claude/rules shim。
 */

'use strict';

const path = require('path');
const { migrateProjectToAirein } = require('./lib/project-migrate');

function parseArgs(argv) {
  const flags = { dryRun: false, projectRoot: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run' || a === '-n') flags.dryRun = true;
    else if (a === '--project' || a === '-C') { flags.projectRoot = argv[++i]; }
    else if (a === '--help' || a === '-h') flags.help = true;
  }
  return flags;
}

function printHelp() {
  process.stdout.write(
    '用法: migrate-project-to-airein.js [--dry-run] [--project <dir>]\n\n' +
    '  在项目根执行，将 legacy <项目>/.claude/{config,memory,logs,...}\n' +
    '  迁到 canonical <项目>/.airein/，并为 CC 创建 .claude/rules shim。\n\n' +
    '  --dry-run   仅预览，不写盘\n' +
    '  --project   指定项目根（默认当前目录）\n',
  );
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    printHelp();
    process.exit(0);
  }

  const projectRoot = path.resolve(flags.projectRoot);
  process.stdout.write('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  process.stdout.write('  P004 项目结构迁移 (.claude → .airein)\n');
  process.stdout.write('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n');
  process.stdout.write(`  项目: ${projectRoot}\n`);
  if (flags.dryRun) process.stdout.write('  模式: dry-run（预览）\n');
  process.stdout.write('\n');

  const result = migrateProjectToAirein(projectRoot, { dryRun: flags.dryRun });
  for (const line of result.log) process.stdout.write(`  ${line}\n`);
  for (const w of result.warnings || []) process.stdout.write(`  ⚠️  ${w}\n`);

  process.stdout.write('\n');
  if (result.noop) {
    process.stdout.write('  ✅ 无需迁移\n');
    process.exit(0);
  }
  if (!result.ok) {
    process.stderr.write(`  ❌ 迁移失败: ${result.error || 'shim error'}\n`);
    process.exit(1);
  }
  process.stdout.write(`  ✅ 迁移完成（${result.moved} 项）\n\n`);
  process.exit(0);
}

if (require.main === module) main();
