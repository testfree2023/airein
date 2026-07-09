#!/usr/bin/env node
/**
 * dedup-archive.js — 清理 self-learning-archive.md 中的重复记录
 *
 * 按 (type, normalizedInstruction, ts) 去重：
 * - 同一时间（ts 完全相同）的相同指令只保留一条
 * - 不同时间的相同指令保留多条
 */

const fs = require('fs');
const path = require('path');

const ARCHIVE_HEADER = '# Self-Learning Archive（append-only，勿手改）\n\n';
const BLOCK_RE = /---\s*\n([\s\S]*?)\n---/g;
const FIELD_RE = /^(\w+):\s*(.*)$/;

function normalizeInstruction(text) {
  if (text == null) return '';
  return String(text).trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseFrontmatterBody(body) {
  const fields = {};
  for (const line of body.split('\n')) {
    const m = line.match(FIELD_RE);
    if (m) fields[m[1]] = m[2];
  }
  if (fields.type !== 'allow' && fields.type !== 'deny') return null;
  if (!fields.instruction || !fields.instruction.trim()) return null;
  return {
    ts: fields.ts || '',
    type: fields.type,
    instruction: fields.instruction,
    prompt: fields.prompt || ''
  };
}

function parseArchive(content) {
  if (!content || typeof content !== 'string') return [];
  const records = [];
  BLOCK_RE.lastIndex = 0;
  let m;
  while ((m = BLOCK_RE.exec(content)) !== null) {
    const rec = parseFrontmatterBody(m[1]);
    if (rec) records.push(rec);
  }
  return records;
}

function formatBlock(r) {
  return ['---', `ts: ${r.ts}`, `type: ${r.type}`, `instruction: ${r.instruction}`, `prompt: ${r.prompt}`, '---'].join('\n');
}

function dedupeRecords(records) {
  const seen = new Set();
  const result = [];
  for (const r of records) {
    const key = r.type + '|' + normalizeInstruction(r.instruction) + '|' + r.ts;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(r);
    }
  }
  return result;
}

function main() {
  const archivePath = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'projects', 'F--codes-home-work-airein', 'self-learning-archive.md');

  if (!fs.existsSync(archivePath)) {
    console.log('Archive file not found:', archivePath);
    process.exit(1);
  }

  const content = fs.readFileSync(archivePath, 'utf8');
  const records = parseArchive(content);

  console.log(`Original: ${records.length} records`);

  const deduped = dedupeRecords(records);
  console.log(`After dedup: ${deduped.length} records (removed ${records.length - deduped.length} duplicates)`);

  const newContent = ARCHIVE_HEADER + deduped.map(formatBlock).join('\n') + '\n';
  fs.writeFileSync(archivePath, newContent, 'utf8');

  console.log('✅ Archive deduplicated:', archivePath);
}

if (require.main === module) {
  main();
}
