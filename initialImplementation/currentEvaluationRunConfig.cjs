const path = require('path');
const simpleGit = require('simple-git');
const fs = require('fs');

// const runConfig = JSON.parse(fs.readFileSync('runConfig.json', 'utf8'));
// const projectName = runConfig.projectName; // uppy
// const commitToEvaluate = runConfig.commitToEvaluate;
const projectName = 'uppy'; // uppy
const commitToEvaluate = '014f1da0e55223cf837f879cbe1a61a89a8a263a';

const evaluationFolder = './evaluation';
const commitBefore = commitToEvaluate + '~1';
const codeBase = path.join(evaluationFolder, projectName);
const repo = simpleGit(codeBase);

const evaluationResultsFolder = path.join(
  evaluationFolder,
  'experiments',
  projectName,
  commitToEvaluate
);

const resultsFilePath = path.join(
  evaluationFolder,
  'experiments',
  projectName,
  'results.json'
);

const affectedFilesPath = path.join(
  evaluationResultsFolder,
  'affectedFiles.json'
);

const staticFileDependencyPath = path.join(
  evaluationResultsFolder,
  'staticFileDependency.json'
);

const projectSpecificConfig = {
  uppy: {
    filesToExclude: [
      '.eslintrc',
      'build-css.js',
      'build-lib.js',
      'babel.config.js'
    ],
    testRunner: 'vitest',
    testRunnerVersion: '^1.2.1',
    dependenciesInstallationCommand: 'sudo yarn install',
    testCommand: 'sudo yarn test:unit'
  },
  webpack: {
    filesToExclude: [
      '.eslintrc',
      'test/cases',
      'test/watchCases',
      'test/statsCases',
      'test/hotCases',
      'test/configCases',
      'has-syntax-error.js',
      'jest.config.js',
      'test/fixtures/b.js',
      'wasm-bindgen-esm/pkg/hi_wasm_bg.wasm.d.ts',
      'patch-node-env.js'
    ],
    testRunner: 'jest',
    testRunnerVersion: '^29.7.0',
    dependenciesInstallationCommand: 'sudo yarn install',
    testCommand: 'sudo yarn test:unit'
  },
  Javascript: {
    filesToExclude: ['vitest.config.ts'],
    testRunner: 'vitest',
    testRunnerVersion: '^0.34.6',
    dependenciesInstallationCommand: 'sudo npm i',
    testCommand: 'sudo npm run test'
  },
  storybook: {},
  mermaid: {
    filesToExclude: ['/dist/'],
    testRunner: 'vitest',
    testRunnerVersion: '^1.4.0',
    dependenciesInstallationCommand: 'sudo pnpm install',
    testCommand: 'sudo pnpm run ci'
  }
};

const filesToExclude = projectSpecificConfig[projectName].filesToExclude;
const testRunner = projectSpecificConfig[projectName].testRunner;
const testRunnerVersion = projectSpecificConfig[projectName].testRunnerVersion;
const dependenciesInstallationCommand =
  projectSpecificConfig[projectName].dependenciesInstallationCommand;
const testCommand = projectSpecificConfig[projectName].testCommand;

module.exports = {
  codeBase,
  commitToEvaluate,
  commitBefore,
  evaluationResultsFolder,
  resultsFilePath,
  affectedFilesPath,
  staticFileDependencyPath,
  repo,
  filesToExclude,
  testRunner,
  testRunnerVersion,
  testCommand,
  dependenciesInstallationCommand
};
