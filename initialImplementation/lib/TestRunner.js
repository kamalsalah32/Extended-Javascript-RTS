import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
import {
  testCommand,
  dependenciesInstallationCommand
} from '../currentEvaluationRunConfig.cjs';
export const runRetestAll = (codebase, testSummaryFilePath) => {
  child_process.execSync(
    `cd ${codebase} && ${dependenciesInstallationCommand}`,
    {
      stdio: [0, 1, 2]
    }
  );
  const startTime = performance.now();
  // run tests in injected codebase
  child_process.execSync(
    `cd ${codebase} && ${testCommand} > ../../${testSummaryFilePath}`,
    {
      stdio: [0, 1, 2]
    }
  );
  const endTime = performance.now();
  return (endTime - startTime) / 1000;
};
export const runSelectedTests = (
  codebase,
  testFilesToRun, // These are files whose tests haven't been marked with skip
  testsToRun,
  testSummaryFilePath
) => {
  if (testsToRun.size !== 0 || testFilesToRun.length !== 0) {
    child_process.execSync(
      `cd ${codebase} && ${dependenciesInstallationCommand}`,
      {
        stdio: [0, 1, 2]
      }
    );
    const runningSelectedTestsStartTime = performance.now();
    // run tests in injected codebase
    child_process.execSync(
      `cd ${codebase} && ${testCommand} > ../../${testSummaryFilePath}`,
      {
        stdio: [0, 1, 2]
      }
    );
    const runningSelectedTestsEndTime = performance.now();
    return (runningSelectedTestsEndTime - runningSelectedTestsStartTime) / 1000;
  }
  return 0;
};
export const prepareTestRun = (
  codebase,
  logFolderPath,
  allTestNamesSet,
  testFilesToRun, // These are files whose tests haven't been marked with skip
  rtsType
) => {
  const preparingTestFilesStartTime = performance.now();
  const filesDictionary = {};
  const testsToRun = getTestsToRun(logFolderPath, rtsType);
  const transformedTestsToRun = {};
  testsToRun.forEach((test) => {
    const testSplit = test.split(' > ');
    const testFile = testSplit[0];
    const testName = testSplit[testSplit.length - 1];
    if (!transformedTestsToRun[testFile])
      transformedTestsToRun[testFile] = new Set([testName]);
    else transformedTestsToRun[testFile].add(testName);
  });
  for (const originalTest of allTestNamesSet) {
    const [testFileName, testName] = originalTest.split(' > ');
    let testFileContent = '';
    if (!filesDictionary[testFileName]) {
      testFileContent = fs.readFileSync(
        path.join(codebase, testFileName),
        'utf8'
      );
    } else {
      testFileContent = filesDictionary[testFileName];
    }
    if (!testFilesToRun.includes(testFileName)) {
      const shouldTestRun =
        transformedTestsToRun[testFileName] &&
        transformedTestsToRun[testFileName].has(testName);
      filesDictionary[testFileName] = editTest(
        testName,
        testFileContent,
        shouldTestRun
      );
    }
  }
  if (testsToRun.size !== 0 || testFilesToRun.length !== 0) {
    for (let testFile in filesDictionary) {
      fs.writeFileSync(
        path.join(codebase, testFile),
        filesDictionary[testFile]
      );
    }
  }
  const preparingTestFilesEndTime = performance.now();
  return {
    testsToRun,
    preparingTestRunTime:
      (preparingTestFilesEndTime - preparingTestFilesStartTime) / 1000
  };
};
const getTestsToRun = (logFolderPath, rtsType) => {
  const changedFunctions = JSON.parse(
    fs.readFileSync(
      path.join(logFolderPath, `${rtsType}ChangedFunctions.json`),
      'utf8'
    )
  );
  const changedFunctionsStringifiedSet = new Set(
    changedFunctions.map((f) => JSON.stringify(f))
  );
  const dependencyGraph = JSON.parse(
    fs.readFileSync(
      path.join(logFolderPath, 'dynamicDependencyGraph.json'),
      'utf8'
    )
  );
  const functionsMap = JSON.parse(
    fs.readFileSync(path.join(logFolderPath, 'functionsMap.json'), 'utf8')
  );
  const changedFunctionsIds = new Set();
  for (let functionId in functionsMap) {
    const stringifiedFunction = JSON.stringify(functionsMap[functionId]);
    if (changedFunctionsStringifiedSet.has(stringifiedFunction))
      changedFunctionsIds.add(functionId);
  }
  const testsSet = new Set();
  if (changedFunctionsIds.size === 0) return testsSet;
  dependencyGraph.forEach((dependency) => {
    if (
      changedFunctionsIds.has(dependency.function.toString()) &&
      dependency.test !== 'undefined'
    )
      testsSet.add(dependency.test);
  });
  fs.writeFileSync(
    path.join(logFolderPath, 'rerunnableTests.txt'),
    Array.from(testsSet).join('\n')
  );
  return testsSet;
};
const editTest = (testName, testFileContent, shouldRun) => {
  const testAddition = shouldRun ? 'only' : 'skip';
  testFileContent = testFileContent.replaceAll(
    `it('${testName}',`,
    `it.${testAddition}('${testName}',`
  );
  testFileContent = testFileContent.replaceAll(
    `it("${testName}",`,
    `it.${testAddition}("${testName}",`
  );
  testFileContent = testFileContent.replaceAll(
    `it(\`${testName}\`,`,
    `it.${testAddition}(\`${testName}\`,`
  );
  testFileContent = testFileContent.replaceAll(
    `test('${testName}',`,
    `test.${testAddition}('${testName}',`
  );
  testFileContent = testFileContent.replaceAll(
    `test("${testName}",`,
    `test.${testAddition}("${testName}",`
  );
  testFileContent = testFileContent.replaceAll(
    `test(\`${testName}\`,`,
    `test.${testAddition}(\`${testName}\`,`
  );
  return testFileContent;
};
