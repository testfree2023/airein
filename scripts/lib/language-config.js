#!/usr/bin/env node
/**
 * Language Config — shared multi-language rule configuration.
 *
 * Centralizes source extensions, test naming conventions, commands, and
 * language-specific regex patterns so hooks do not hardcode per-language
 * rules. Languages are defined globally in templates/language-profiles/*.json;
 * projects activate specific languages via quality.json languageProfiles.active.
 */

const fs = require('fs');
const path = require('path');
const { loadQualityConfig, loadGlobalLanguageProfiles } = require('./quality-config');

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function compilePatterns(patterns) {
  return unique(patterns).map(pattern => new RegExp(pattern, 'i'));
}

/**
 * Merge an array of profiles into a single config object.
 * Starts from _default baseline, then layers each profile via union.
 */
function buildMergedConfig(globalProfiles, profiles, extraOverrides) {
  const baseline = globalProfiles['default'] || {};
  const merged = {
    extensions: [],
    testPatterns: [],
    testNameTemplates: [],
    testDirectories: [...asArray(baseline.testDirectories)],
    exemptPatterns: [...asArray(baseline.exemptPatterns)],
    buildCommands: [],
    testCommands: [],
    debugPatterns: [],
    secretPatterns: [...asArray(baseline.secretPatterns)],
    importPatterns: {},
    exportPatterns: {},
    impactThresholds: baseline.impactThresholds ? { ...baseline.impactThresholds } : { medium: 3, high: 9 },
    conventions: {}
  };

  // Merge all profiles (base + overrides combined)
  const allProfiles = extraOverrides ? [...profiles, ...Object.values(extraOverrides)] : profiles;

  for (const profile of allProfiles) {
    merged.extensions.push(...asArray(profile.extensions));
    merged.testPatterns.push(...asArray(profile.testPatterns));
    merged.testNameTemplates.push(...asArray(profile.testNameTemplates));
    merged.debugPatterns.push(...asArray(profile.debugPatterns));
    merged.secretPatterns.push(...asArray(profile.secretPatterns));
    merged.exemptPatterns.push(...asArray(profile.exemptPatterns));
    merged.testDirectories.push(...asArray(profile.testDirectories));

    // Commands from global profiles are { cmd, configFile } objects
    if (Array.isArray(profile.buildCommands)) {
      merged.buildCommands.push(...profile.buildCommands.filter(c => c && c.cmd));
    }
    if (Array.isArray(profile.testCommands)) {
      merged.testCommands.push(...profile.testCommands.filter(c => c && c.cmd));
    }

    // Legacy path: single buildCommand/testCommand string fields
    if (profile.buildCommand) {
      merged.buildCommands.push({ cmd: profile.buildCommand, configFile: profile.buildConfigFile || profile.configFile || null });
    }
    if (profile.testCommand) {
      merged.testCommands.push({ cmd: profile.testCommand, configFile: profile.testConfigFile || profile.buildConfigFile || profile.configFile || null });
    }

    for (const [ext, patterns] of Object.entries(profile.importPatterns || {})) {
      merged.importPatterns[ext] = unique([...(merged.importPatterns[ext] || []), ...asArray(patterns)]);
    }
    for (const [ext, patterns] of Object.entries(profile.exportPatterns || {})) {
      merged.exportPatterns[ext] = unique([...(merged.exportPatterns[ext] || []), ...asArray(patterns)]);
    }

    // conventions must be flat key-value pairs (string values only).
    // If nested conventions are added later, switch to deepMerge here.
    if (profile.conventions) {
      merged.conventions = { ...merged.conventions, ...profile.conventions };
    }
    if (profile.impactThresholds) {
      merged.impactThresholds = { ...merged.impactThresholds, ...profile.impactThresholds };
    }
  }

  merged.extensions = unique(merged.extensions);
  merged.testPatterns = unique(merged.testPatterns);
  merged.testNameTemplates = unique(merged.testNameTemplates);
  merged.testDirectories = unique(merged.testDirectories);
  merged.exemptPatterns = unique(merged.exemptPatterns);
  merged.debugPatterns = unique(merged.debugPatterns);
  merged.secretPatterns = unique(merged.secretPatterns);
  return merged;
}

/**
 * Build a merged config from global language profiles based on project settings.
 *
 * Three-tier fallback:
 * 1. active: ["java", "typescript"] → merge _default + those languages only
 * 2. overrides: { java: {...} }      → legacy path (all profiles + overrides union)
 * 3. no config                       → load ALL global profiles (backward compat)
 */
function getMergedConfig() {
  const quality = loadQualityConfig();
  const globalProfiles = loadGlobalLanguageProfiles();
  const profilesActive = quality.languageProfiles?.active || [];
  const profilesOverrides = quality.languageProfiles?.overrides || {};
  const hasOverrides = Object.keys(profilesOverrides).length > 0;

  if (profilesActive.length > 0) {
    // NEW PATH: project activates specific languages by name
    const profiles = profilesActive.map(name => globalProfiles[name]).filter(Boolean);
    return buildMergedConfig(globalProfiles, profiles, null);
  }

  if (hasOverrides) {
    // LEGACY PATH: all global profiles as baseline + overrides on top.
    // Old behavior was DEFAULT_PROFILE (all languages) + overrides → union.
    return buildMergedConfig(globalProfiles, Object.values(globalProfiles), profilesOverrides);
  }

  // NO CONFIG: load all global profiles (backward compat)
  return buildMergedConfig(globalProfiles, Object.values(globalProfiles), null);
}

function getSourceExtensions() {
  return new Set(getMergedConfig().extensions);
}

function isTestFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const base = path.basename(normalized);
  return compilePatterns(getMergedConfig().testPatterns).some(pattern => pattern.test(base) || pattern.test(normalized));
}

function isExemptFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return compilePatterns(getMergedConfig().exemptPatterns).some(pattern => pattern.test(normalized));
}

function renderTemplate(template, sourcePath) {
  const ext = path.extname(sourcePath);
  const dir = path.dirname(sourcePath);
  const base = path.basename(sourcePath, ext);
  return path.join(dir, template.replace('{base}', base).replace('{ext}', ext));
}

function findTestFile(sourcePath) {
  const normalized = sourcePath.replace(/\\/g, '/');
  const ext = path.extname(normalized);
  const base = path.basename(normalized, ext);

  if (ext === '.java' && normalized.includes('src/main/java/')) {
    return normalized.replace('src/main/java/', 'src/test/java/').replace(/\.java$/, 'Test.java');
  }
  if (ext === '.go') {
    return normalized.replace(/\.go$/, '_test.go');
  }
  if (ext === '.py') {
    return path.join(path.dirname(normalized), `test_${base}${ext}`);
  }

  const config = getMergedConfig();
  const templates = config.testNameTemplates;
  return renderTemplate(templates[0], normalized);
}

function commandExists(cwd, command) {
  return !command.configFile || fs.existsSync(path.join(cwd, command.configFile));
}

function dedupeCommands(commands) {
  const seen = new Set();
  return commands.filter(command => {
    const key = `${command.cmd}::${command.configFile || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getBuildCommands(cwd = process.cwd()) {
  return dedupeCommands(getMergedConfig().buildCommands).filter(command => commandExists(cwd, command));
}

function getTestCommands(cwd = process.cwd()) {
  return dedupeCommands(getMergedConfig().testCommands).filter(command => commandExists(cwd, command));
}

function getDebugPatterns() {
  return compilePatterns(getMergedConfig().debugPatterns);
}

function getSecretPatterns() {
  return compilePatterns(getMergedConfig().secretPatterns);
}

function getImportPatterns(ext) {
  return getMergedConfig().importPatterns[ext] || [];
}

function getExportPatterns(ext) {
  return getMergedConfig().exportPatterns[ext] || [];
}

function getImpactThresholds() {
  return getMergedConfig().impactThresholds;
}

module.exports = {
  getSourceExtensions,
  isTestFile,
  isExemptFile,
  findTestFile,
  getBuildCommands,
  getTestCommands,
  getDebugPatterns,
  getSecretPatterns,
  getImportPatterns,
  getExportPatterns,
  getImpactThresholds,
  getMergedConfig
};
