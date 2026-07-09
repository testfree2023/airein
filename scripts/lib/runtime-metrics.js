#!/usr/bin/env node
/**
 * Runtime Metrics — 运行时数据管理库
 *
 * 负责读写 .claude/runtime-metrics.json，供 hook 和 dashboard 使用
 */

const fs = require('fs');
const path = require('path');

const FILE_NAME = 'runtime-metrics.json';

/**
 * 获取运行时数据文件路径
 * @param {string} projectDir - 项目根目录
 * @returns {string} 文件路径
 */
function getMetricsPath(projectDir) {
  return path.join(projectDir, '.claude', FILE_NAME);
}

/**
 * 读取运行时数据
 * @param {string} projectDir - 项目根目录
 * @returns {object} 运行时数据对象
 */
function readMetrics(projectDir) {
  const metricsPath = getMetricsPath(projectDir);
  if (!fs.existsSync(metricsPath)) {
    return createEmptyMetrics();
  }
  try {
    return JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
  } catch (e) {
    return createEmptyMetrics();
  }
}

/**
 * 写入运行时数据
 * @param {string} projectDir - 项目根目录
 * @param {object} metrics - 运行时数据对象
 * @returns {boolean} 是否成功
 */
function writeMetrics(projectDir, metrics) {
  const metricsPath = getMetricsPath(projectDir);
  try {
    fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 创建空的运行时数据对象
 * @returns {object} 空数据对象
 */
function createEmptyMetrics() {
  return {
    timestamp: new Date().toISOString(),
    testGuard: {
      interceptions: 0,
      lastInterception: null
    },
    qualitySentinel: {
      warnings: [],
      lastCheck: null
    },
    regressionGate: {
      passed: true,
      lastRun: null
    },
    testCoverage: {
      ratio: 0,
      sourceFiles: 0,
      lastRun: null
    }
  };
}

/**
 * 更新运行时数据的某个字段
 * @param {string} projectDir - 项目根目录
 * @param {string} category - 类别（testGuard/qualitySentinel/regressionGate/testCoverage）
 * @param {object} data - 要更新的数据
 * @returns {boolean} 是否成功
 */
function updateMetrics(projectDir, category, data) {
  const metrics = readMetrics(projectDir);
  metrics.timestamp = new Date().toISOString();
  if (metrics[category]) {
    metrics[category] = { ...metrics[category], ...data };
  }
  return writeMetrics(projectDir, metrics);
}

module.exports = {
  getMetricsPath,
  readMetrics,
  writeMetrics,
  createEmptyMetrics,
  updateMetrics
};
