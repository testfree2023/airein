#!/usr/bin/env node
/**
 * codex.js — CDX 宿主归一化入口（P001-cross-platform · design §6.1 · test-plan §3.4）
 *
 * Codex hook command 引用本文件（design §3.4）：
 *   node "$PLUGIN_ROOT/scripts/hooks/host/codex.js" <hookId> [profilesCsv]
 * 职责：CDX stdin 同 CC schema（恒等归一化），项目根从 stdin cwd 解析 → spawn 既有 airein
 * hook → 映射阻断输出（stdout permissionDecision:deny）。逻辑全在 host-runner。
 */

'use strict';

require('./host-runner').runHostEntry('codex');
