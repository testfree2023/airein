/**
 * Test: Global language profile templates
 *
 * Verifies that language profile templates exist as individual JSON files
 * under templates/language-profiles/ and that the loader function
 * correctly reads and validates them.
 */

const fs = require('fs');
const path = require('path');
const {
  describe, assertOk, assertEqual, assertContains, projectRoot, printSummary
} = require('./helpers');

const PROFILES_DIR = path.join(projectRoot(), 'templates', 'language-profiles');
const QUALITY_CONFIG_PATH = path.join(projectRoot(), 'scripts', 'lib', 'quality-config.js');

describe('global language profiles: template files', suite => {
  suite.test('_default.json exists and is valid', () => {
    const p = path.join(PROFILES_DIR, '_default.json');
    assertOk(fs.existsSync(p), '_default.json exists');
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    assertEqual(data.name, 'default', 'name is default');
    assertOk(Array.isArray(data.secretPatterns), 'has secretPatterns');
    assertOk(Array.isArray(data.exemptPatterns), 'has exemptPatterns');
    assertOk(Array.isArray(data.testDirectories), 'has testDirectories');
    assertOk(data.impactThresholds, 'has impactThresholds');
  });

  suite.test('java.json exists and has required fields', () => {
    const p = path.join(PROFILES_DIR, 'java.json');
    assertOk(fs.existsSync(p), 'java.json exists');
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    assertEqual(data.name, 'java', 'name is java');
    assertOk(data.extensions.indexOf('.java') >= 0, 'has .java extension');
    assertOk(Array.isArray(data.testPatterns), 'has testPatterns');
    assertOk(Array.isArray(data.testNameTemplates), 'has testNameTemplates');
    assertOk(Array.isArray(data.buildCommands), 'has buildCommands');
    assertOk(data.conventions, 'has conventions');
    assertEqual(data.conventions.sourceDirectory, 'src/main/java', 'sourceDirectory');
  });

  suite.test('typescript.json exists and has TS extensions', () => {
    const p = path.join(PROFILES_DIR, 'typescript.json');
    assertOk(fs.existsSync(p), 'typescript.json exists');
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    assertOk(data.extensions.indexOf('.ts') >= 0, 'has .ts');
    assertOk(data.extensions.indexOf('.tsx') >= 0, 'has .tsx');
  });

  suite.test('all 7 language files exist', () => {
    const expected = ['_default', 'javascript', 'typescript', 'python', 'java', 'go', 'rust', 'kotlin'];
    for (const name of expected) {
      assertOk(fs.existsSync(path.join(PROFILES_DIR, name + '.json')), name + '.json exists');
    }
  });
});

describe('global language profiles: loader function', suite => {
  suite.test('loadGlobalLanguageProfiles is exported from quality-config', () => {
    const mod = require(QUALITY_CONFIG_PATH);
    assertOk(typeof mod.loadGlobalLanguageProfiles === 'function', 'function exported');
  });

  suite.test('loadGlobalLanguageProfiles returns map with default + languages', () => {
    const { loadGlobalLanguageProfiles } = require(QUALITY_CONFIG_PATH);
    const profiles = loadGlobalLanguageProfiles();
    assertOk(profiles.default, 'has default profile');
    assertOk(profiles.java, 'has java profile');
    assertOk(profiles.typescript, 'has typescript profile');
    assertOk(profiles.python, 'has python profile');
    assertOk(profiles.go, 'has go profile');
    assertOk(profiles.rust, 'has rust profile');
    assertOk(profiles.kotlin, 'has kotlin profile');
    assertOk(profiles.javascript, 'has javascript profile');
  });

  suite.test('each language profile has extensions array', () => {
    const { loadGlobalLanguageProfiles } = require(QUALITY_CONFIG_PATH);
    const profiles = loadGlobalLanguageProfiles();
    for (const name of Object.keys(profiles)) {
      if (name === 'default') continue;
      assertOk(Array.isArray(profiles[name].extensions), name + ' has extensions');
      assertOk(profiles[name].extensions.length > 0, name + ' extensions non-empty');
    }
  });

  suite.test('DEFAULTS.languageProfiles has active field', () => {
    const { DEFAULTS } = require(QUALITY_CONFIG_PATH);
    assertOk(Array.isArray(DEFAULTS.languageProfiles.active), 'active is array');
  });
});

process.exit(printSummary());
