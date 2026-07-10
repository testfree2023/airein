#!/usr/bin/env node
/**
 * codebuddy.js — CB 宿主归一化入口（P001-cross-platform · design §6.1 · test-plan §3.4）
 *
 * CodeBuddy hook command 引用本文件（design §3.4）：
 *   bash "$CODEBUDDY_PLUGIN_ROOT/scripts/hooks/host/codebuddy.js" <hookId> [profilesCsv]
 * 职责：CB schema 同 CC（恒等归一化），exit 2 原生透传（零映射）。逻辑全在 host-runner。
 */

'use strict';

require('./host-runner').runHostEntry('codebuddy');
