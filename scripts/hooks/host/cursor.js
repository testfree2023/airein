#!/usr/bin/env node
/**
 * cursor.js — CUR 宿主归一化入口（P001-cross-platform · design §6.1 · test-plan §3.4）
 *
 * Cursor hook command 引用本文件（design §3.4）：
 *   bash "$CURSOR_PROJECT_DIR/scripts/hooks/host/cursor.js" <hookId> [profilesCsv]
 * 职责：归一化 CUR 原生 stdin（conversation_id / camelCase 事件 / 嵌套 tool）→ CC schema →
 * spawn 既有 airein hook → 映射阻断输出（stdout permission:deny）。逻辑全在 host-runner。
 */

'use strict';

require('./host-runner').runHostEntry('cursor');
