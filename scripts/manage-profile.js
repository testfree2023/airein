#!/usr/bin/env node
/**
 * manage-profile.js — Selective ECC component cleanup
 *
 * Cleans up skills, agents, and commands in ~/.claude/ based on a
 * profile configuration. Run this script to deploy the curated
 * selection from the project repo to the user's Claude config.
 *
 * Usage:
 *   node scripts/manage-profile.js [--dry-run] [--backup]
 *
 * Flags:
 *   --dry-run   Show what would be deleted without deleting
 *   --backup    Copy deleted items to ~/.claude/backup-v1/ before removing
 *
 * This script ONLY modifies ~/.claude/{skills,agents,commands}/.
 * It does NOT touch hooks, rules, settings, or memory files.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Configuration: What to KEEP ──────────────────────────────────
// Everything NOT in these lists gets deleted.

const KEEP_SKILLS = [
  // Core workflow
  'tdd', 'search-first', 'strategic-compact',
  // Quality
  'security-review', 'security-scan', 'coding-standards',
  // Documentation
  'documentation-lookup',
  // Testing
  'e2e-testing',
  // Dev tools
  'database-migrations', 'api-design', 'deployment-patterns', 'docker-patterns',
  // Patterns
  'backend-patterns', 'postgres-patterns', 'frontend-patterns',
  // Automation
  'autonomous-loops', 'eval-airein',
  // Learning (v2 only)
  'continuous-learning-v2',
  // TypeScript ecosystem
  'bun-runtime', 'nextjs-turbopack', 'mcp-server-patterns',
  // Python
  'python-patterns', 'python-testing',
  // Go
  'golang-patterns', 'golang-testing',
  // Java
  'java-coding-standards', 'jpa-patterns',
  'springboot-patterns', 'springboot-security', 'springboot-tdd', 'springboot-verification',

  // ── Custom skills (NOT from ECC) — always keep ──
  'init-project', 'new-plan', 'next', 'status',
  'log-change',
  'model-guide', 'find-skills', 'prompt-optimizer',
];

const KEEP_AGENTS = [
  'pm',
  'product-expert',
  'tech-lead',
];

const KEEP_COMMANDS = [
  'tdd', 'code-review', 'verify',
];

// ── Implementation ───────────────────────────────────────────────

function getClaudeDir() {
  return path.join(os.homedir(), '.claude');
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    backup: args.includes('--backup'),
  };
}

function listDir(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch { return []; }
}

function cleanDirectory(baseDir, keepSet, itemType, opts) {
  const entries = listDir(baseDir);
  let removed = 0;
  let kept = 0;

  for (const entry of entries) {
    const name = entry.name;

    // Skip non-target types
    if (itemType === 'skills' && !entry.isDirectory()) continue;
    if (itemType === 'agents' && (!entry.isFile() || !name.endsWith('.md'))) continue;
    if (itemType === 'commands') {
      // Commands can be files or directories
      if (!entry.isFile() && !entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
    }

    const bareName = name.replace(/\.md$/, '');

    if (keepSet.has(bareName)) {
      kept++;
      continue;
    }

    const fullPath = path.join(baseDir, name);

    if (opts.dryRun) {
      console.log(`  [DRY] Would remove: ${itemType}/${name}`);
    } else {
      if (opts.backup) {
        const backupDir = path.join(getClaudeDir(), 'backup-v1', itemType);
        fs.mkdirSync(backupDir, { recursive: true });
        try {
          if (entry.isDirectory()) {
            copyDirRecursive(fullPath, path.join(backupDir, name));
          } else {
            fs.copyFileSync(fullPath, path.join(backupDir, name));
          }
        } catch (backupErr) {
          console.error(`  ⚠️  Backup failed for ${itemType}/${name}: ${backupErr.message}. Skipping delete.`);
          removed--; // don't count as removed
          continue;
        }
      }
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`  Removed: ${itemType}/${name}`);
    }
    removed++;
  }

  return { removed, kept };
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function main() {
  const opts = parseArgs();
  const claudeDir = getClaudeDir();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ECC Profile Manager — Selective Cleanup');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (opts.dryRun) console.log('  Mode: DRY RUN (no changes)');
  else if (opts.backup) console.log('  Mode: BACKUP + CLEAN');
  else console.log('  Mode: CLEAN (no backup)');
  console.log('');

  // Skills
  console.log(`📚 Skills (keep ${KEEP_SKILLS.length}):`);
  const skillsDir = path.join(claudeDir, 'skills');
  const skillResult = cleanDirectory(skillsDir, new Set(KEEP_SKILLS), 'skills', opts);
  console.log(`  Result: ${skillResult.kept} kept, ${skillResult.removed} removed`);
  console.log('');

  // Agents
  console.log(`🤖 Agents (keep ${KEEP_AGENTS.length}):`);
  const agentsDir = path.join(claudeDir, 'agents');
  const agentResult = cleanDirectory(agentsDir, new Set(KEEP_AGENTS), 'agents', opts);
  console.log(`  Result: ${agentResult.kept} kept, ${agentResult.removed} removed`);
  console.log('');

  // Commands
  console.log(`⌨️  Commands (keep ${KEEP_COMMANDS.length}):`);
  const commandsDir = path.join(claudeDir, 'commands');
  const commandResult = cleanDirectory(commandsDir, new Set(KEEP_COMMANDS), 'commands', opts);
  console.log(`  Result: ${commandResult.kept} kept, ${commandResult.removed} removed`);
  console.log('');

  // Summary
  const totalRemoved = skillResult.removed + agentResult.removed + commandResult.removed;
  const totalKept = skillResult.kept + agentResult.kept + commandResult.kept;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (opts.dryRun) {
    console.log(`  Would remove: ${totalRemoved} items`);
    console.log(`  Would keep:   ${totalKept} items`);
    console.log('');
    console.log('  Run without --dry-run to apply changes.');
    console.log('  Add --backup to save removed items first.');
  } else {
    console.log(`  ✅ Cleaned: ${totalRemoved} items removed`);
    console.log(`  ✅ Kept:    ${totalKept} items`);
    if (opts.backup) {
      console.log(`  💾 Backup: ~/.claude/backup-v1/`);
    }
    console.log('');
    console.log('  Estimated token savings: ~' + Math.round(totalRemoved * 0.1) + 'K tokens');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main();
