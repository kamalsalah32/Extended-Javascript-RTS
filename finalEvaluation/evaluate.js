import fs from 'fs';
import path from 'path';
import { GitChanges } from '../dist/CodeElements.js';
import { getSemanticallyChangedFiles } from '../dist/ChangeAnalyzer.js';
import { getConfig } from '../dist/CurrentEvaluationRunConfig.js';
import { runRelatedTestFiles, runRetestAll } from '../dist/TestRunner.js';
import { readAndParseFile } from '../FileParser.js';
import fsExtra from 'fs-extra';

let commitToEvaluate,
  codebase,
  evaluationResultsFolder,
  resultsFilePath,
  affectedFilesPath,
  repo,
  dependenciesInstallationCommand,
  testCommand,
  loggingExtension;

const getEvaluationRunId = () => {
  const currentDate = new Date();
  return `${currentDate.getFullYear()}${currentDate.getMonth() + 1}${
    currentDate.getDay() + 1
  }${currentDate.getHours()}${currentDate.getMinutes()}${currentDate.getSeconds()}`;
};

const addFilesBefore = (gitChanges, localPath, files) => {
  gitChanges.deletedFiles.forEach((deletedFileName) => {
    files.deletedFiles[deletedFileName] = readAndParseFile(
      localPath,
      deletedFileName
    );
  });

  gitChanges.modifiedFiles.forEach((modifiedFileName) => {
    files.modifiedFiles.before[modifiedFileName] = readAndParseFile(
      localPath,
      modifiedFileName
    );
  });

  gitChanges.renamedFiles
    .filter((renamedFile) => renamedFile.modificationPercentage !== 0)
    .forEach((renamedFile) => {
      files.renamedFiles.mappings.push({
        oldName: renamedFile.oldFileName,
        newName: renamedFile.newFileName
      });
      const oldFileName = renamedFile.oldFileName;
      files.renamedFiles.before[oldFileName] = readAndParseFile(
        localPath,
        oldFileName
      );
    });
};

const addFilesAfter = (gitChanges, localPath, files) => {
  gitChanges.addedFiles.forEach((addedFileName) => {
    files.addedFiles[addedFileName] = readAndParseFile(
      localPath,
      addedFileName
    );
  });

  gitChanges.modifiedFiles.forEach((modifiedFileName) => {
    files.modifiedFiles.after[modifiedFileName] = readAndParseFile(
      localPath,
      modifiedFileName
    );
  });

  gitChanges.renamedFiles
    .filter((renamedFile) => renamedFile.modificationPercentage !== 0)
    .forEach((renamedFile) => {
      const newFileName = renamedFile.newFileName;
      files.renamedFiles.after[newFileName] = readAndParseFile(
        localPath,
        newFileName
      );
    });
};

const getDiff = async (localPath, commit) => {
  try {
    // await repo.reset(['--hard']);
    await repo.stash();
    console.log('Retrieving changed files by commit', commit);
    const commitBefore = `${commit}~1`;
    const diff = await repo.diff(['--name-status', commitBefore, commit]);
    const gitChanges = new GitChanges(diff, false);

    const affectedFiles = {
      addedFiles: {},
      deletedFiles: {},
      modifiedFiles: { before: {}, after: {} },
      renamedFiles: { mappings: [], before: {}, after: {} }
    };

    console.log('Checking out commit:', commitBefore);
    await repo.checkout(commitBefore);
    addFilesBefore(gitChanges, localPath, affectedFiles);

    console.log('Checking out commit:', commit);
    await repo.checkout(commit);
    addFilesAfter(gitChanges, localPath, affectedFiles);

    fs.writeFileSync(affectedFilesPath, JSON.stringify(affectedFiles));
    console.log('Affected files have been parsed and ASTs created');
  } catch (error) {
    console.error('Error while getting affectedFiles:', error);
  }
};

const extractTestSummary = (filePath) => {
  try {
    // Read the log file
    const logContent = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf8')
      : '';

    // Define patterns to match specific lines
    const patterns = {
      testFiles: /Test Files\s+.+/,
      tests: /Tests\s+.+/,
      duration: /Duration\s+.+/
    };

    // Extract matches for each pattern
    const results = {
      testFiles: logContent.match(patterns.testFiles)?.[0] || 'No match found',
      tests: logContent.match(patterns.tests)?.[0] || 'No match found',
      duration: logContent.match(patterns.duration)?.[0] || 'No match found'
    };

    return results;
  } catch (error) {
    console.error('Error reading or processing the file:', error);
    return null;
  }
};

const getJavascriptProjectTestCommand = async (repo, commit, codebase) => {
  await repo.checkout(commit);
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(codebase, 'package.json'))
  );
  if (packageJson.scripts['test'].includes('vitest'))
    return 'npm run test related';
  else return 'npm run test --findRelatedTests';
};

const logEvaluationResults = (runType, changeAnalysisTimeInSeconds) => {
  const testSummaryFilePath = path.join(
    evaluationResultsFolder,
    `testSummary${runType}.log`
  );
  const resultsFile = JSON.parse(fs.readFileSync(resultsFilePath, 'utf8'));
  resultsFile[commitToEvaluate] = resultsFile[commitToEvaluate] || {};
  resultsFile[commitToEvaluate][runType] =
    resultsFile[commitToEvaluate][runType] || {};
  const testSummary = extractTestSummary(testSummaryFilePath);
  console.log('testSummary:', testSummary);
  if (testSummary.tests !== 'No match found') {
    resultsFile[commitToEvaluate][runType].testSummary = testSummary;
  } else {
    resultsFile[commitToEvaluate][runType].testSummary = {
      duration: '0s'
    };
    // if (runType !== 'RetestAll')
    //   resultsFile[commitToEvaluate][runType].testSummary = {
    //     testFiles: 'Test Suites: 20 passed, 20 total',
    //     tests: 'Tests: 25598 passed, 25598 total',
    //     duration: 'Time: x'
    //   };
    // else
    //   resultsFile[commitToEvaluate][runType].testSummary = {
    //     testFiles: 'Test Suites: 41 passed, 41 total',
    //     tests: 'Tests: 26530 passed, 26530 total',
    //     duration: 'Time: x'
    //   };
  }

  if (changeAnalysisTimeInSeconds)
    resultsFile[commitToEvaluate][runType].changeAnalysisTimeInSeconds =
      changeAnalysisTimeInSeconds;
  fs.writeFileSync(resultsFilePath, JSON.stringify(resultsFile));
};

const retestAll = async () => {
  console.log('Running RetestAll...');
  await runRetestAll(
    codebase,
    dependenciesInstallationCommand,
    testCommand,
    path.join(evaluationResultsFolder, `testSummaryRetestAll.json`),
    loggingExtension
  );
  logEvaluationResults('RetestAll');
};

const runEvaluation = async () => {
  const resultsFile = JSON.parse(fs.readFileSync(resultsFilePath, 'utf8'));

  if (!resultsFile[commitToEvaluate]?.ExtendedRTS) await main('ExtendedRTS');
  else if (!resultsFile[commitToEvaluate].NormalRTS) await main('NormalRTS');
  //else if (!resultsFile[commitToEvaluate].RetestAll) await main('RetestAll');
  else
    throw new Error(
      `All evaluations have been run for commit '${commitToEvaluate}'`
    );
};

const cleanup = async () => {
  console.log('Start Cleanup...');
  let nodeModulesPath = path.join(codebase, 'node_modules');
  let packageLockPath = path.join(codebase, 'package-lock.json');

  if (await fsExtra.pathExists(nodeModulesPath)) {
    await fsExtra.remove(nodeModulesPath);
    console.log('node_modules deleted successfully.');
  }

  // if (await fsExtra.pathExists(packageLockPath)) {
  //   await fsExtra.remove(packageLockPath);
  //   console.log('package-lock.json deleted successfully.');
  // }

  console.log('Cleanup done.');
};

const main = async (runType) => {
  // Get difference between commits and write it in affectedFiles.json
  await getDiff(codebase, commitToEvaluate);

  // Run all required tests
  switch (runType) {
    case 'RetestAll':
      await retestAll();
      break;
    case 'NormalRTS':
      runTestSelectionEvaluation('NormalRTS');
      break;
    case 'ExtendedRTS':
      runTestSelectionEvaluation('ExtendedRTS');
      break;
  }

  //await cleanup();
};

const runTestSelectionEvaluation = async (rtsType) => {
  const start = performance.now();
  getSemanticallyChangedFiles(
    affectedFilesPath,
    evaluationResultsFolder,
    rtsType
  );
  const end = performance.now();
  const changeAnalysisTimeInSeconds = (end - start) / 1000;
  runRelatedTestFiles(
    codebase,
    dependenciesInstallationCommand,
    testCommand,
    evaluationResultsFolder,
    rtsType,
    loggingExtension
  );
  logEvaluationResults(rtsType, changeAnalysisTimeInSeconds);
};

const runEvaluationsForCommit = async (config) => {
  commitToEvaluate = config.commitToEvaluate;
  codebase = config.codebase;
  evaluationResultsFolder = config.evaluationResultsFolder;
  resultsFilePath = config.resultsFilePath;
  affectedFilesPath = config.affectedFilesPath;
  repo = config.repo;
  dependenciesInstallationCommand = config.dependenciesInstallationCommand;
  testCommand = config.testCommand;
  loggingExtension = config.loggingExtension;

  if (!fs.existsSync(evaluationResultsFolder)) {
    fs.mkdirSync(evaluationResultsFolder, { recursive: true });
  }

  if (!fs.existsSync(resultsFilePath))
    fs.writeFileSync(resultsFilePath, JSON.stringify({}));

  while (true) {
    try {
      await runEvaluation();
    } catch (error) {
      console.log(`Completed evaluation for commit '${commitToEvaluate}'`);
      break;
    }
  }
};
const runAllEvaluations = async () => {
  const evaluationRunId = getEvaluationRunId();
  const directoryPath = './finalEvaluation/evaluatedCommits';

  const file = 'webpack';

  const includesTests = file.includes('_includesTests');
  const projectName = includesTests ? file.split('_')[0] : file;
  const commits = JSON.parse(
    fs.readFileSync(path.join(directoryPath, file + '.json'))
  );

  (async () => {
    for (const commit of commits) {
      const config = getConfig(
        evaluationRunId,
        projectName,
        commit,
        includesTests
      );
      await runEvaluationsForCommit(config);
    }
  })();
};

runAllEvaluations();
