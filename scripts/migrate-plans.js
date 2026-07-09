#!/usr/bin/env node
/**
 * migrate-plans.js — Migrate old single-file plans to new directory format.
 *
 * For each docs/plans/*.md:
 *   1. Create directory docs/plans/P{NNN}-{slug}/
 *   2. Split content into requirements.md, design.md, tasks.md
 *   3. Generate progress.md (machine-readable status)
 *   4. Delete original .md file
 */

const fs = require('fs');
const path = require('path');

const plansDir = path.join(__dirname, '..', '..', 'docs', 'plans');

if (!fs.existsSync(plansDir)) {
  console.error('No docs/plans/ directory found');
  process.exit(1);
}

const files = fs.readdirSync(plansDir).filter(f => f.endsWith('.md'));

if (files.length === 0) {
  console.log('No single-file plans to migrate');
  process.exit(0);
}

for (const file of files) {
  const filePath = path.join(plansDir, file);
  const baseName = file.replace('.md', '');
  const dirPath = path.join(plansDir, baseName);

  console.log(`Migrating: ${file} → ${baseName}/`);

  // Create directory
  fs.mkdirSync(dirPath, { recursive: true });

  // Read content
  const content = fs.readFileSync(filePath, 'utf8');

  // Extract title
  const titleMatch = content.match(/^#\s+Plan:\s*(.+)/m);
  const title = titleMatch ? titleMatch[1].trim() : baseName;

  // Split into sections
  const sections = content.split(/^## /m).filter(Boolean);

  // Build requirements.md (first few sections)
  const reqSections = [];
  const designSections = [];
  const taskSections = [];

  for (const section of sections) {
    const header = section.split('\n')[0].trim();
    if (/^(一|二|三|现状|需求|问题)/.test(header)) {
      reqSections.push(section);
    } else if (/^(四|五|六|方案|设计|架构)/.test(header)) {
      designSections.push(section);
    } else if (/^(七|八|实施|阶段|任务)/.test(header)) {
      taskSections.push(section);
    }
  }

  // Write requirements.md
  const reqContent = `# Requirements: ${title}\n\n## Status: approved\n\n` +
    (reqSections.length > 0
      ? reqSections.map(s => '## ' + s).join('\n\n')
      : `Migrated from ${file}. Original content preserved in design.md.\n`);
  fs.writeFileSync(path.join(dirPath, 'requirements.md'), reqContent);

  // Write design.md
  const designContent = `# Design: ${title}\n\n## Status: approved\n\n` +
    (designSections.length > 0
      ? designSections.map(s => '## ' + s).join('\n\n')
      : content);
  fs.writeFileSync(path.join(dirPath, 'design.md'), designContent);

  // Write tasks.md
  const tasksContent = `# Tasks: ${title}\n\n> Progress: All completed\n\n` +
    (taskSections.length > 0
      ? taskSections.map(s => '## ' + s).join('\n\n')
      : `All tasks completed. See design.md for implementation details.\n`);
  fs.writeFileSync(path.join(dirPath, 'tasks.md'), tasksContent);

  // Generate progress.md (completed plan)
  const today = new Date().toISOString().split('T')[0];
  const progressContent = `# Progress: ${title}
updated: ${today}
plan: ${baseName}
complexity: complex

## Task Stats
total: 1
completed: 1
in_progress: 0
pending: 0

## Approval State
requirements: approved
design: approved
tasks: approved

## Active Task
none (completed)

## Blockers
- none
`;
  fs.writeFileSync(path.join(dirPath, 'progress.md'), progressContent);

  // Delete original file
  fs.unlinkSync(filePath);
  console.log(`  ✓ Migrated and removed ${file}`);
}

console.log(`\nMigration complete: ${files.length} plan(s) migrated`);
