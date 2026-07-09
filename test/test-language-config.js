const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  describe, assertOk, assertEqual, assertContains, projectRoot, printSummary
} = require('./helpers');

const LANGUAGE_CONFIG_PATH = path.join(projectRoot(), 'scripts', 'lib', 'language-config.js');
const UTILS_PATH = path.join(projectRoot(), 'scripts', 'lib', 'utils.js');

function createTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-config-test-'));
  fs.mkdirSync(path.join(dir, '.claude', 'config'), { recursive: true });
  return dir;
}

function removeTempProject(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function loadForProject(projectDir, qualityConfig) {
  if (qualityConfig) {
    fs.writeFileSync(
      path.join(projectDir, '.claude', 'config', 'quality.json'),
      JSON.stringify(qualityConfig, null, 2)
    );
  }
  delete require.cache[require.resolve(LANGUAGE_CONFIG_PATH)];
  const { setProjectDir } = require(UTILS_PATH);
  setProjectDir(projectDir);
  return require(LANGUAGE_CONFIG_PATH);
}

describe('language-config: module loading', suite => {
  suite.test('language-config.js can be required without error', () => {
    const lang = require(LANGUAGE_CONFIG_PATH);
    assertOk(lang, 'module loads');
    assertOk(typeof lang.getSourceExtensions === 'function', 'getSourceExtensions exported');
    assertOk(typeof lang.isTestFile === 'function', 'isTestFile exported');
    assertOk(typeof lang.findTestFile === 'function', 'findTestFile exported');
    assertOk(typeof lang.getBuildCommands === 'function', 'getBuildCommands exported');
    assertOk(typeof lang.getTestCommands === 'function', 'getTestCommands exported');
  });
});

describe('language-config: defaults preserve existing behavior', suite => {
  const tmp = createTempProject();
  const lang = loadForProject(tmp);

  suite.test('default source extensions include existing hook languages', () => {
    const exts = lang.getSourceExtensions();
    assertOk(exts.has('.js'), 'includes .js');
    assertOk(exts.has('.ts'), 'includes .ts');
    assertOk(exts.has('.py'), 'includes .py');
    assertOk(exts.has('.java'), 'includes .java');
    assertOk(exts.has('.go'), 'includes .go');
    assertOk(exts.has('.rs'), 'includes .rs');
    assertOk(exts.has('.kt'), 'includes .kt');
  });

  suite.test('default test detection handles JS, Java, Go, and test-* prefix', () => {
    assertEqual(lang.isTestFile('src/foo.test.ts'), true, '.test.ts detected');
    assertEqual(lang.isTestFile('src/FooTest.java'), true, 'FooTest.java detected');
    assertEqual(lang.isTestFile('pkg/foo_test.go'), true, 'foo_test.go detected');
    assertEqual(lang.isTestFile('test/test-plan-system.js'), true, 'test-*.js detected');
  });

  suite.test('findTestFile uses Java Maven convention for src/main/java', () => {
    const result = lang.findTestFile('src/main/java/com/example/Foo.java');
    assertContains(result.replace(/\\/g, '/'), 'src/test/java/com/example/FooTest.java', 'Java test path');
  });

  suite.test('debug patterns include console.log and System.out.print', () => {
    const patterns = lang.getDebugPatterns();
    assertOk(patterns.some(p => p.test('console.log(value)')), 'console.log detected');
    assertOk(patterns.some(p => p.test('System.out.println(value)')), 'System.out detected');
  });

  suite.test('cleanup temp project', () => {
    removeTempProject(tmp);
    assertOk(true, 'cleanup done');
  });
});

describe('language-config: active language selection', suite => {
  suite.test('active: ["java"] loads only Java extensions and patterns', () => {
    const tmp = createTempProject();
    const lang = loadForProject(tmp, {
      languageProfiles: { active: ['java'] }
    });
    const exts = lang.getSourceExtensions();
    assertOk(exts.has('.java'), 'includes .java');
    // Java-only project should NOT have .js, .py, .go etc from other languages
    assertEqual(exts.has('.js'), false, 'no .js when only java active');
    assertEqual(exts.has('.py'), false, 'no .py when only java active');
    assertEqual(exts.has('.go'), false, 'no .go when only java active');
    removeTempProject(tmp);
  });

  suite.test('active: ["java", "typescript"] merges both languages', () => {
    const tmp = createTempProject();
    const lang = loadForProject(tmp, {
      languageProfiles: { active: ['java', 'typescript'] }
    });
    const exts = lang.getSourceExtensions();
    assertOk(exts.has('.java'), 'includes .java');
    assertOk(exts.has('.ts'), 'includes .ts');
    assertOk(exts.has('.tsx'), 'includes .tsx');
    // Should NOT have languages not in active list
    assertEqual(exts.has('.py'), false, 'no .py');
    assertEqual(exts.has('.go'), false, 'no .go');
    removeTempProject(tmp);
  });

  suite.test('active: ["java", "typescript"] test detection supports both', () => {
    const tmp = createTempProject();
    const lang = loadForProject(tmp, {
      languageProfiles: { active: ['java', 'typescript'] }
    });
    assertEqual(lang.isTestFile('src/UserServiceTest.java'), true, 'Java test detected');
    assertEqual(lang.isTestFile('src/user.service.test.ts'), true, 'TS test detected');
    removeTempProject(tmp);
  });

  suite.test('active: ["java"] Java Maven findTestFile convention works', () => {
    const tmp = createTempProject();
    const lang = loadForProject(tmp, {
      languageProfiles: { active: ['java'] }
    });
    const result = lang.findTestFile('src/main/java/com/example/Foo.java');
    assertContains(result.replace(/\\/g, '/'), 'src/test/java/com/example/FooTest.java', 'Java Maven test path');
    removeTempProject(tmp);
  });

  suite.test('active: [] with no config loads all languages (backward compat)', () => {
    const tmp = createTempProject();
    const lang = loadForProject(tmp);
    const exts = lang.getSourceExtensions();
    // When no active and no overrides, should load ALL global profiles
    assertOk(exts.has('.js'), 'includes .js (all loaded)');
    assertOk(exts.has('.ts'), 'includes .ts (all loaded)');
    assertOk(exts.has('.py'), 'includes .py (all loaded)');
    assertOk(exts.has('.java'), 'includes .java (all loaded)');
    assertOk(exts.has('.go'), 'includes .go (all loaded)');
    assertOk(exts.has('.rs'), 'includes .rs (all loaded)');
    assertOk(exts.has('.kt'), 'includes .kt (all loaded)');
    removeTempProject(tmp);
  });

  suite.test('active takes priority over legacy overrides', () => {
    const tmp = createTempProject();
    const lang = loadForProject(tmp, {
      languageProfiles: {
        active: ['python'],
        overrides: {
          java: { extensions: ['.java'] }
        }
      }
    });
    const exts = lang.getSourceExtensions();
    // active takes priority — only python, not java from overrides
    assertOk(exts.has('.py'), 'python from active');
    assertEqual(exts.has('.java'), false, 'java NOT loaded from overrides when active present');
    removeTempProject(tmp);
  });

  suite.test('active language inherits _default baseline patterns', () => {
    const tmp = createTempProject();
    const lang = loadForProject(tmp, {
      languageProfiles: { active: ['java'] }
    });
    // _default provides exemptPatterns, secretPatterns, testDirectories, impactThresholds
    const config = lang.getMergedConfig();
    assertOk(config.exemptPatterns.length > 0, 'exemptPatterns from _default');
    assertOk(config.secretPatterns.length > 0, 'secretPatterns from _default');
    assertOk(config.testDirectories.length > 0, 'testDirectories from _default');
    assertOk(config.impactThresholds, 'impactThresholds from _default');
    removeTempProject(tmp);
  });
});

describe('language-config: multi-language overrides merge by union', suite => {
  const tmp = createTempProject();
  const lang = loadForProject(tmp, {
    languageProfiles: {
      overrides: {
        java: {
          extensions: ['.java'],
          testPatterns: ['Test\\.java$', 'IT\\.java$'],
          testNameTemplates: ['{base}Test{ext}', '{base}IT{ext}'],
          sourceDirectory: 'src/main/java',
          testDirectory: 'src/test/java',
          buildCommand: 'mvn compile -q',
          testCommand: 'mvn test -q',
          buildConfigFile: 'pom.xml',
          debugPatterns: ['System\\.out\\.print', 'System\\.err\\.print']
        },
        typescript: {
          extensions: ['.ts', '.tsx'],
          testPatterns: ['\\.test\\.', '\\.spec\\.'],
          testNameTemplates: ['{base}.test{ext}', '{base}.spec{ext}'],
          buildCommand: 'npm run build',
          testCommand: 'npm test',
          buildConfigFile: 'package.json',
          debugPatterns: ['console\\.log']
        }
      }
    }
  });

  suite.test('source extensions are union of active languages and defaults', () => {
    const exts = lang.getSourceExtensions();
    assertOk(exts.has('.java'), 'java extension present');
    assertOk(exts.has('.ts'), 'typescript extension present');
    assertOk(exts.has('.py'), 'default python extension retained');
  });

  suite.test('test file detection supports Java and TypeScript simultaneously', () => {
    assertEqual(lang.isTestFile('src/UserServiceTest.java'), true, 'Java test recognized');
    assertEqual(lang.isTestFile('src/user.service.test.ts'), true, 'TypeScript test recognized');
  });

  suite.test('build commands filter by config files present in project', () => {
    fs.writeFileSync(path.join(tmp, 'pom.xml'), '<project></project>');
    fs.writeFileSync(path.join(tmp, 'package.json'), '{}');
    const commands = lang.getBuildCommands(tmp).map(c => c.cmd);
    assertOk(commands.includes('mvn compile -q'), 'maven build command included');
    assertOk(commands.includes('npm run build'), 'npm build command included');
  });

  suite.test('test commands filter by config files present in project', () => {
    const commands = lang.getTestCommands(tmp).map(c => c.cmd);
    assertOk(commands.includes('mvn test -q'), 'maven test command included');
    assertOk(commands.includes('npm test'), 'npm test command included');
  });

  suite.test('cleanup temp project', () => {
    removeTempProject(tmp);
    assertOk(true, 'cleanup done');
  });
});

process.exit(printSummary());
