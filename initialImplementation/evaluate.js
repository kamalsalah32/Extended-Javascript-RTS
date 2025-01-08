import fs from 'fs';
import path from 'path';
import { GitChanges } from './lib/cst.js';
import { setupRtsDependencyGraphs } from './dependencyGraphBuilder.js';
import { getAllChangedFunctionsAndFiles } from './lib/ChangeAnalyzer.js';
import {
  commitToEvaluate,
  commitBefore,
  codeBase,
  evaluationResultsFolder,
  resultsFilePath,
  affectedFilesPath,
  staticFileDependencyPath,
  repo
} from './currentEvaluationRunConfig.cjs';
import {
  runRetestAll,
  runSelectedTests,
  prepareTestRun
} from './lib/TestRunner.js';
import fsExtra from 'fs-extra';
import { readAndParseFile } from './lib/FileParser.js';

//const [commitToEvaluate, commitBefore] = process.argv.slice(2);
//console.log('evaluate.js', commitToEvaluate, commitBefore);

if (!fs.existsSync(evaluationResultsFolder)) {
  fs.mkdirSync(evaluationResultsFolder, { recursive: true });
}

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
    console.log('Retrieving changed files by commit', commit);
    const diff = await repo.diff(['--name-status', commitBefore, commit]);
    const gitChanges = new GitChanges(diff, false);

    console.log('Checking out commit:', commit);
    await repo.checkout(commit);
    const affectedFiles = {
      addedFiles: {},
      deletedFiles: {},
      modifiedFiles: { before: {}, after: {} },
      renamedFiles: { mappings: [], before: {}, after: {} }
    };
    addFilesAfter(gitChanges, localPath, affectedFiles);

    console.log('Checking out commit:', commitBefore);
    await repo.checkout(commitBefore);
    addFilesBefore(gitChanges, localPath, affectedFiles);

    fs.writeFileSync(affectedFilesPath, JSON.stringify(affectedFiles));
    console.log('Affected files have been parsed and ASTs created');
  } catch (error) {
    console.error('Error while getting affectedFiles:', error);
  }
};

const createTestSelectionCodeBase = async () => {
  await repo.checkout(commitToEvaluate);
  let testSelectionCodeBase = codeBase + '-testSelection';

  await fsExtra
    .copy(codeBase, testSelectionCodeBase)
    .then(() => console.log('Directory copied successfully!'))
    .catch((error) => console.error('Error copying directory:', error));
};

const getTestFilesToRun = (filesToRerunSet) => {
  if (filesToRerunSet.size == 0) return [];
  const staticFileDependency = JSON.parse(
    fs.readFileSync(staticFileDependencyPath, 'utf8')
  );

  function findAllDependents(fileList, dependencyGraph) {
    const dependents = new Set();

    // Helper function to find dependents recursively
    function findDependentsRecursive(targetFile) {
      for (const [file, dependencies] of Object.entries(dependencyGraph)) {
        if (dependencies.includes(targetFile) && !dependents.has(file)) {
          dependents.add(file);
          findDependentsRecursive(file); // Recur for indirect dependents
        }
      }
    }

    // Iterate over the list of target files
    fileList.forEach((targetFile) => {
      findDependentsRecursive(targetFile);
    });

    return Array.from(dependents); // Convert the Set to an Array
  }

  return findAllDependents(filesToRerunSet, staticFileDependency).filter(
    (file) => file.includes('test')
  );
};

const extractTestSummary = (filePath) => {
  try {
    // Read the log file
    const logContent = fs.readFileSync(filePath, 'utf8');

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

const cleanup = async () => {
  console.log('Start Cleanup...');
  let testSelectionCodeBase = codeBase + '-testSelection';
  let astCodeBase = codeBase + '-AST';
  let injectedCodeBase = codeBase + '-injected';
  let dependencyLogFilePath = path.join(
    evaluationResultsFolder,
    'dynamicDependencyGraph'
  );

  if (await fsExtra.pathExists(dependencyLogFilePath)) {
    await fsExtra.remove(dependencyLogFilePath);
    console.log('Dynamic dependency file deleted successfully.');
  }

  if (await fsExtra.pathExists(testSelectionCodeBase)) {
    await fsExtra.remove(testSelectionCodeBase);
    console.log('Test selection folder deleted successfully.');
  }

  if (await fsExtra.pathExists(astCodeBase)) {
    await fsExtra.remove(astCodeBase);
    console.log('AST codebase deleted successfully.');
  }

  if (await fsExtra.pathExists(injectedCodeBase)) {
    await fsExtra.remove(injectedCodeBase);
    console.log('Injected codebase deleted successfully.');
  }
  console.log('Cleanup done.');
};

const logEvaluationResults = (runType) => {
  const testSummaryFilePath = path.join(
    evaluationResultsFolder,
    `testSummary${runType}.log`
  );
  const resultsFile = JSON.parse(fs.readFileSync(resultsFilePath, 'utf8'));
  if (fs.existsSync(testSummaryFilePath)) {
    const testSummary = extractTestSummary(testSummaryFilePath);
    resultsFile[commitToEvaluate][runType].testSummary = testSummary;
  } else {
    resultsFile[commitToEvaluate][runType].testSummary = {
      duration: '0s'
    };
  }
  fs.writeFileSync(resultsFilePath, JSON.stringify(resultsFile));
};

const retestAll = () => {
  console.log('Running RetestAll...');
  const testsRunningTimeRetestAll = runRetestAll(
    codeBase,
    path.join(evaluationResultsFolder, `testSummaryRetestAll.log`)
  );
  console.log(`RetestAll - total testing time: ${testsRunningTimeRetestAll}s`);
  const resultsFile = JSON.parse(fs.readFileSync(resultsFilePath, 'utf8'));

  if (!resultsFile[commitToEvaluate]) resultsFile[commitToEvaluate] = {};
  if (!resultsFile[commitToEvaluate].RetestAll)
    resultsFile[commitToEvaluate].RetestAll = {};
  resultsFile[commitToEvaluate].RetestAll.testRunningTimeInSeconds =
    testsRunningTimeRetestAll;
  fs.writeFileSync(resultsFilePath, JSON.stringify(resultsFile));
};

const testSelection = async (rtsType) => {
  console.log(`Running evaluation '${rtsType}'`);
  const testSelectionProcessStartTime = performance.now();
  const allTestNamesSet = new Set(
    JSON.parse(
      fs.readFileSync(
        path.join(evaluationResultsFolder, 'allTests.json'),
        'utf8'
      )
    )
  );

  // The changed files are analyzed and a list of all changed functions is written in changedFunctions.json
  // The function also returns a set of files for which all tests that access that file need to be rerun
  const [, semanticallyChangedFiles] = getAllChangedFunctionsAndFiles(
    affectedFilesPath,
    evaluationResultsFolder,
    rtsType
  );

  const testFilesToRun = getTestFilesToRun(semanticallyChangedFiles);
  const testSelectionProcessEndTime = performance.now();
  const gettingTestsToRunTime =
    (testSelectionProcessEndTime - testSelectionProcessStartTime) / 1000;

  const { testsToRun, preparingTestRunTime } = prepareTestRun(
    codeBase + '-testSelection',
    evaluationResultsFolder,
    allTestNamesSet,
    testFilesToRun,
    rtsType
  );

  const testSelectionTime = gettingTestsToRunTime + preparingTestRunTime;

  // Run test selection
  console.log('Running Test Selection...');
  const runningSelectedTestsTime = runSelectedTests(
    codeBase + '-testSelection',
    testFilesToRun,
    testsToRun,
    path.join(evaluationResultsFolder, `testSummary${rtsType}.log`)
  );
  console.log(`Total test selection time: ${testSelectionTime}s`);
  console.log(`Test running time: ${runningSelectedTestsTime}s`);

  const resultsFile = JSON.parse(fs.readFileSync(resultsFilePath, 'utf8'));
  if (!resultsFile[commitToEvaluate]) resultsFile[commitToEvaluate] = {};
  if (!resultsFile[commitToEvaluate][rtsType])
    resultsFile[commitToEvaluate][rtsType] = {};

  resultsFile[commitToEvaluate][rtsType].testSelectionTimeInSeconds =
    testSelectionTime;
  resultsFile[commitToEvaluate][rtsType].testRunningTimeInSeconds =
    runningSelectedTestsTime;
  fs.writeFileSync(resultsFilePath, JSON.stringify(resultsFile));
};

const runEvaluation = async () => {
  const resultsFile = JSON.parse(fs.readFileSync(resultsFilePath, 'utf8'));
  if (
    !fs.existsSync(
      path.join(evaluationResultsFolder, 'dynamicDependencyGraph.json')
    )
  )
    await setupRtsDependencyGraphs(commitBefore);
  else {
    if (!resultsFile[commitToEvaluate]?.ExtendedRTS) main('ExtendedRTS');
    else if (!resultsFile[commitToEvaluate].NormalRTS) main('NormalRTS');
    else if (!resultsFile[commitToEvaluate].RetestAll) main('RetestAll');
    else
      throw new Error(
        `All evaluations have been run for commit '${commitToEvaluate}'`
      );
  }
  await cleanup();
};

const main = async (runType) => {
  await cleanup();
  // Get difference between commits and write it in affectedFiles.json
  await getDiff(codeBase, commitToEvaluate);

  // Checkout commit and copy codebase to a folder that can be modified freely without changing cloned folder
  await createTestSelectionCodeBase();

  // Run all required tests
  switch (runType) {
    case 'RetestAll':
      retestAll();
      break;
    case 'NormalRTS':
      testSelection('NormalRTS');
      break;
    case 'ExtendedRTS':
      testSelection('ExtendedRTS');
      break;
  }

  logEvaluationResults(runType);

  await cleanup();
};

runEvaluation();
