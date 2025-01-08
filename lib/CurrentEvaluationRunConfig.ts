import fs from 'fs';
import path from 'path';
import simpleGit from 'simple-git';

interface ProjectConfig {
  filesToExclude: string[];
  testRunner: string;
  testRunnerVersion: string;
  dependenciesInstallationCommand: string;
  testCommand: string;
}

const projectSpecificConfig: Record<string, Partial<ProjectConfig>> = {
  uppy: {
    filesToExclude: [
      '.eslintrc',
      'build-css.js',
      'build-lib.js',
      'babel.config.js'
    ],
    testRunner: 'vitest',
    testRunnerVersion: '^1.2.1',
    dependenciesInstallationCommand: 'yarn install',
    testCommand: 'yarn test:unit'
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
    testRunner: 'jest', // Vitest for commits after Oct 3, 2023 (Commit: 86d333ee94d6ce3f71220d3bc90b56b50381ed7e)
    testRunnerVersion: '^29.2.0',
    dependenciesInstallationCommand: 'npm i',
    testCommand: 'npm run test'
  }
};

export const getConfig = (
  evaluationRunId: string,
  projectName: string,
  commitToEvaluate: string,
  includesTests: boolean
) => {
  const evaluationFolder = path.join('finalEvaluation', 'evaluation');
  const commitBefore = `${commitToEvaluate}~1`;
  const codebase = path.join(evaluationFolder, projectName);
  const repo = simpleGit(codebase);

  const evaluationResultsFolder = path.join(
    evaluationFolder,
    'experiments',
    projectName,
    evaluationRunId,
    includesTests ? 'withTests' : 'withoutTests',
    commitToEvaluate
  );

  const resultsFilePath = path.join(
    evaluationFolder,
    'experiments',
    projectName,
    evaluationRunId,
    includesTests ? 'withTests' : 'withoutTests',
    'staticDependencyResults.json'
  );

  const affectedFilesPath = path.join(
    evaluationResultsFolder,
    'affectedFiles.json'
  );

  const staticFileDependencyPath = path.join(
    evaluationResultsFolder,
    'staticFileDependency.json'
  );

  const projectConfig = projectSpecificConfig[projectName] as ProjectConfig;
  const filesToExclude = projectConfig.filesToExclude;
  const testRunner = projectConfig.testRunner;
  const testRunnerVersion = projectConfig.testRunnerVersion;
  const dependenciesInstallationCommand =
    projectConfig.dependenciesInstallationCommand;
  const testCommand = projectConfig.testCommand;

  // Retrieving logging extension was made dynamic because of projects were
  // the testing framework was changed like project 'TheAlgorithms/Javascript'
  const packageJsonFile = JSON.parse(
    fs.readFileSync(path.join(codebase, 'package.json'), 'utf8')
  );
  const testScript = testCommand.split(' ').pop() ?? '';
  const loggingExtension = packageJsonFile.scripts[testScript].includes('jest')
    ? '--json --outputFile='
    : '> ';

  return {
    codebase,
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
    dependenciesInstallationCommand,
    loggingExtension
  };
};
