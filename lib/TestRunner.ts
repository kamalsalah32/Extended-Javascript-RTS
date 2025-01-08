import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import { ChangedFunction } from './CodeElements.js';
import child_process from 'child_process';
import { RtsType } from './ChangeAnalyzer.js';

type Dependency = {
  function: number;
  test: string;
};

export const runRetestAll = async (
  codebase: string,
  dependenciesInstallationCommand: string,
  testCommand: string,
  testSummaryFilePath: string,
  loggingExtension: string
) => {
  child_process.execSync(
    `cd ${codebase} && sudo ${dependenciesInstallationCommand}`,
    {
      stdio: [0, 1, 2]
    }
  );

  try {
    child_process.execSync(
      `cd ${codebase} && sudo ${testCommand} ${loggingExtension}../../../${testSummaryFilePath}`,
      {
        stdio: [0, 1, 2]
      }
    );
  } catch {
    let nodeModulesPath = path.join(codebase, 'node_modules');
    let packageLockPath = path.join(codebase, 'package-lock.json');

    if (await fsExtra.pathExists(nodeModulesPath)) {
      await fsExtra.remove(nodeModulesPath);
      console.log('node_modules deleted successfully.');
    }

    if (await fsExtra.pathExists(packageLockPath)) {
      await fsExtra.remove(packageLockPath);
      console.log('package-lock.json deleted successfully.');
    }

    child_process.execSync(
      `cd ${codebase} && sudo ${dependenciesInstallationCommand}`,
      {
        stdio: [0, 1, 2]
      }
    );

    child_process.execSync(
      `cd ${codebase} && sudo ${testCommand} --json --outputFile=../../../${testSummaryFilePath}`,
      {
        stdio: [0, 1, 2]
      }
    );
  }
};

export const runSelectedTests = (
  codebase: string,
  testFilesToRun: string[], // These are files whose tests haven't been marked with skip
  testsToRun: Set<string>,
  testSummaryFilePath: string
): number => {
  if (testsToRun.size !== 0 || testFilesToRun.length !== 0) {
    child_process.execSync(
      `cd ${codebase} && sudo corepack enable && sudo yarn install && pwd`,
      {
        stdio: [0, 1, 2]
      }
    );

    const runningSelectedTestsStartTime = performance.now();
    // run tests in injected codebase
    child_process.execSync(
      `cd ${codebase} && sudo corepack enable && sudo yarn test:unit > ../../${testSummaryFilePath}`,
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
  codebase: string,
  logFolderPath: string,
  testFilesToRun: string[], // These are files whose tests haven't been marked with skip
  rtsType: string
): { testsToRun: Set<string>; preparingTestRunTime: number } => {
  const preparingTestFilesStartTime = performance.now();
  const filesDictionary: { [testFileName: string]: string } = {};
  const testsToRun = getTestsToRun(logFolderPath, rtsType);
  const transformedTestsToRun: { [fileName: string]: Set<string> } = {};
  testsToRun.forEach((test) => {
    const testSplit = test.split(' > ');
    const testFile = testSplit[0];
    const testName = testSplit[testSplit.length - 1];
    if (!transformedTestsToRun[testFile])
      transformedTestsToRun[testFile] = new Set([testName]);
    else transformedTestsToRun[testFile].add(testName);
  });
  // for (const originalTest of allTestNamesSet) {
  //   const [testFileName, testName] = originalTest.split(' > ');

  //   let testFileContent = '';
  //   if (!filesDictionary[testFileName]) {
  //     testFileContent = fs.readFileSync(
  //       path.join(codebase, testFileName),
  //       'utf8'
  //     );
  //   } else {
  //     testFileContent = filesDictionary[testFileName];
  //   }

  //   if (!testFilesToRun.includes(testFileName)) {
  //     const shouldTestRun =
  //       transformedTestsToRun[testFileName] &&
  //       transformedTestsToRun[testFileName].has(testName);
  //     filesDictionary[testFileName] = editTest(
  //       testName,
  //       testFileContent,
  //       shouldTestRun
  //     );
  //   }
  // }

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

const getTestsToRun = (logFolderPath: string, rtsType: string): Set<string> => {
  const changedFunctions = JSON.parse(
    fs.readFileSync(
      path.join(logFolderPath, `${rtsType}ChangedFunctions.json`),
      'utf8'
    )
  ) as ChangedFunction[];
  const changedFunctionsStringifiedSet = new Set(
    changedFunctions.map((f) => JSON.stringify(f))
  );
  const dependencyGraph = JSON.parse(
    fs.readFileSync(
      path.join(logFolderPath, 'dynamicDependencyGraph.json'),
      'utf8'
    )
  ) as Dependency[];
  const functionsMap = JSON.parse(
    fs.readFileSync(path.join(logFolderPath, 'functionsMap.json'), 'utf8')
  ) as { [id: number]: ChangedFunction };

  const changedFunctionsIds: Set<string> = new Set();

  for (let functionId in functionsMap) {
    const stringifiedFunction = JSON.stringify(functionsMap[functionId]);
    if (changedFunctionsStringifiedSet.has(stringifiedFunction))
      changedFunctionsIds.add(functionId);
  }

  const testsSet: Set<string> = new Set();
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

const editTest = (
  testName: string,
  testFileContent: string,
  shouldRun: boolean
) => {
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

export const runRelatedTestFiles = (
  codebase: string,
  dependenciesInstallationCommand: string,
  testCommand: string,
  evaluationResultsFolder: string,
  rtsType: RtsType,
  loggingExtension: string
) => {
  const sematicallyChangedFiles = fs.readFileSync(
    path.join(
      evaluationResultsFolder,
      `${rtsType}SemanticallyChangedFiles.txt`
    ),
    'utf8'
  );

  const testSummaryFilePath = path.join(
    evaluationResultsFolder,
    `testSummary${rtsType}.txt`
  );

  if (sematicallyChangedFiles.length !== 0) {
    console.log('Changed files:', sematicallyChangedFiles);
    child_process.execSync(
      `cd ${codebase} && ${dependenciesInstallationCommand}`,
      {
        stdio: 'inherit'
      }
    );

    try {
      // child_process.execSync(
      //   `cd ${codebase} && sudo ${testCommand} related ${sematicallyChangedFiles} > ../../../${testSummaryFilePath}`,
      //   {
      //     stdio: 'inherit'
      //   }
      // );

      const terminalCommand = `cd ${codebase} && ${testCommand} --findRelatedTests ${sematicallyChangedFiles} ${loggingExtension}../../../${testSummaryFilePath}`;
      console.log('Executing:', terminalCommand);
      child_process.execSync(terminalCommand, {
        stdio: 'inherit'
      });
    } catch (error) {
      console.log('Error while running tests:', error);
    }
  }
};
