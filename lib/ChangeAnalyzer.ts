import * as babelTypes from '@babel/types';
import { CodeElementsBuilder } from './CodeElementsBuilder.js';
import {
  ChangedFunction,
  ClassCodeElement,
  FunctionCodeElement
} from './CodeElements.js';
import fs from 'fs';
import path from 'path';
import { TestFileAnalyzer } from './TestFileAnalyzer.js';

type FileAstDictionary = { [fileName: string]: babelTypes.File };
type AffectedFiles = {
  addedFiles: FileAstDictionary;
  deletedFiles: FileAstDictionary;
  modifiedFiles: { before: FileAstDictionary; after: FileAstDictionary };
  renamedFiles: {
    mappings: {
      [oldFileName: string]: string;
    };
    before: FileAstDictionary;
    after: FileAstDictionary;
  };
};

export enum RtsType {
  NORMAL = 'NormalRTS',
  EXTENDED = 'ExtendedRTS'
}

const testFileEndings = [
  'test.js',
  'test.ts',
  'test.jsx',
  'test.tsx',
  'spec.js',
  'spec.ts',
  'unittest.js',
  'unittest.ts'
];

const isTestFile = (fileName: string) => {
  return testFileEndings.some((testFileEnding) =>
    fileName.includes(testFileEnding)
  );
};

export const getSemanticallyChangedFiles = (
  affectedFilesPath: string,
  logPath: string,
  rtsType: RtsType
) => {
  const affectedFiles = JSON.parse(
    fs.readFileSync(affectedFilesPath, 'utf8')
  ) as AffectedFiles;
  const codeElementsBuilder = new CodeElementsBuilder();
  const testFileAnalyzer = new TestFileAnalyzer();
  switch (rtsType) {
    case RtsType.NORMAL:
      getSemanticallyChangedFilesNormalRts(
        affectedFiles,
        codeElementsBuilder,
        logPath
      );
      break;
    case RtsType.EXTENDED:
      getSemanticallyChangedFilesExtendedRts(
        affectedFiles,
        codeElementsBuilder,
        testFileAnalyzer,
        logPath
      );
      break;
  }
};

const getSemanticallyChangedFilesNormalRts = (
  affectedFiles: AffectedFiles,
  codeElementsBuilder: CodeElementsBuilder,
  logPath: string
) => {
  let [deletedFilesToRerun] = addChangedFunctionsFromFileAstDictionary(
    codeElementsBuilder,
    affectedFiles.deletedFiles
  );

  let [renamedFilesToRerun] = addChangedFunctionsFromFileAstDictionary(
    codeElementsBuilder,
    affectedFiles.renamedFiles.before
  );

  let [modifiedFilesToRerun, modifiedTestFiles] =
    addChangedFunctionsFromFileAstDictionary(
      codeElementsBuilder,
      affectedFiles.modifiedFiles.before,
      true
    );

  let sematicallyChangedFiles = [
    ...deletedFilesToRerun,
    ...renamedFilesToRerun,
    ...modifiedFilesToRerun
  ].join(' ');

  fs.writeFileSync(
    path.join(logPath, 'NormalRTSSemanticallyChangedFiles.txt'),
    sematicallyChangedFiles
  );

  path.join(logPath, 'NormalRTSModifiedTestFiles.txt'),
    (modifiedTestFiles as string[]).join(' ');
};

const getSemanticallyChangedFilesExtendedRts = (
  affectedFiles: AffectedFiles,
  codeElementsBuilder: CodeElementsBuilder,
  testFileAnalyzer: TestFileAnalyzer,
  logPath: string
) => {
  let [deletedFilesToRerun] = addChangedFunctionsFromFileAstDictionary(
    codeElementsBuilder,
    affectedFiles.deletedFiles
  );

  let [renamedFilesToRerun] = addChangedFunctionsFromFileAstDictionary(
    codeElementsBuilder,
    affectedFiles.renamedFiles.before
  );

  let [modifiedFilesToRerun, modifiedTestFiles] =
    addSemanticallyChangedFunctionsForModifiedFiles(
      codeElementsBuilder,
      testFileAnalyzer,
      affectedFiles.modifiedFiles
    );

  let sematicallyChangedFiles = [
    ...deletedFilesToRerun,
    ...renamedFilesToRerun,
    ...modifiedFilesToRerun
  ].join(' ');

  fs.writeFileSync(
    path.join(logPath, 'ExtendedRTSSemanticallyChangedFiles.txt'),
    sematicallyChangedFiles
  );

  fs.writeFileSync(
    path.join(logPath, 'ExtendedRTSModifiedTestFiles.txt'),
    (modifiedTestFiles as string[]).join(' ')
  );
};

const addChangedFunctionsFromFileAstDictionary = (
  codeElementsBuilder: CodeElementsBuilder,
  FileAstDictionary: FileAstDictionary,
  isFileModified?: boolean
) => {
  const sematicallyChangedFiles = new Set<string>();
  const modifiedTestFiles: string[] = [];
  for (let fileName in FileAstDictionary) {
    if (isTestFile(fileName) && isFileModified) {
      modifiedTestFiles.push(fileName);
    } else {
      const changedFunctions: ChangedFunction[] = [];
      const fileCodeElements = codeElementsBuilder.buildCodeElementsFromAst(
        fileName,
        FileAstDictionary[fileName]
      );

      fileCodeElements.classIds.forEach((classId) => {
        const codeElement = fileCodeElements.codeElementsMap[
          classId
        ] as ClassCodeElement;
        if (codeElement.properties.length !== 0)
          sematicallyChangedFiles.add(fileName);
        changedFunctions.push(...codeElement.getMethods());
      });
      fileCodeElements.functionIds.forEach((functionId) => {
        const codeElement = fileCodeElements.codeElementsMap[
          functionId
        ] as FunctionCodeElement;
        changedFunctions.push(codeElement.getFunction());
      });
      if (changedFunctions.length !== 0) sematicallyChangedFiles.add(fileName);
    }
  }

  return [sematicallyChangedFiles, modifiedTestFiles];
};

const addSemanticallyChangedFunctionsForModifiedFiles = (
  codeElementsBuilder: CodeElementsBuilder,
  testFileAnalyzer: TestFileAnalyzer,
  modifiedFiles: { before: FileAstDictionary; after: FileAstDictionary }
) => {
  const sematicallyChangedFiles = new Set<string>();
  const modifiedTestFiles: string[] = [];
  for (let fileName in modifiedFiles.before) {
    const changedFunctions: ChangedFunction[] = [];
    if (isTestFile(fileName)) {
      modifiedTestFiles.push(fileName);
    } else {
      // Get all changed functions in modified files
      const fileCodeElementsBefore =
        codeElementsBuilder.buildCodeElementsFromAst(
          fileName,
          modifiedFiles.before[fileName]
        );
      const fileCodeElementsAfter =
        codeElementsBuilder.buildCodeElementsFromAst(
          fileName,
          modifiedFiles.after[fileName]
        );

      const functionsBefore = fileCodeElementsBefore.functionIds.map(
        (functionId) =>
          fileCodeElementsBefore.codeElementsMap[
            functionId
          ] as FunctionCodeElement
      );
      const functionsAfter = fileCodeElementsAfter.functionIds.map(
        (functionId) =>
          fileCodeElementsAfter.codeElementsMap[
            functionId
          ] as FunctionCodeElement
      );

      functionsBefore.forEach((functionBefore) => {
        const hasEquivalentMethod = functionsAfter.some((functionAfter) => {
          if (
            functionBefore.name !== functionAfter.name ||
            functionBefore.params.length !== functionAfter.params.length
          ) {
            return false;
          }

          if (functionBefore.isSemanticallyChanged(functionAfter)) {
            changedFunctions.push({
              function: functionBefore.name,
              file: fileName,
              params: functionBefore.params.length
            });
          }
          return true;
        });

        if (!hasEquivalentMethod) {
          changedFunctions.push({
            function: functionBefore.name,
            file: fileName,
            params: functionBefore.params.length
          });
        }
      });

      // Get all changed methods for classes in modified files
      const classesBefore = fileCodeElementsBefore.classIds.map(
        (classId) =>
          fileCodeElementsBefore.codeElementsMap[classId] as ClassCodeElement
      );
      const classesAfter = fileCodeElementsAfter.classIds.map(
        (classId) =>
          fileCodeElementsAfter.codeElementsMap[classId] as ClassCodeElement
      );

      let fallbackToFileDependency = false;

      const globalVariablesBefore = fileCodeElementsBefore.globalVariables;
      const globalVariablesAfter = fileCodeElementsAfter.globalVariables;

      for (const globalVariableBefore of globalVariablesBefore) {
        const hasEquivalentVariable = globalVariablesAfter.some(
          (globalVariableAfter) => {
            return globalVariableBefore === globalVariableAfter;
          }
        );

        if (!hasEquivalentVariable) {
          fallbackToFileDependency = true;
          break;
        }
      }

      classesBefore.forEach((classBefore) => {
        const hasEquivalentClass = classesAfter.some((classAfter) => {
          if (classBefore.name !== classAfter.name) {
            return false;
          }

          changedFunctions.push(
            ...classBefore.getSemanticallyChangedMethods(classAfter)
          );
          if (
            !fallbackToFileDependency &&
            classBefore.shouldFallbackToFileDependency(classAfter)
          ) {
            fallbackToFileDependency = true;
          }
          return true;
        });

        if (!hasEquivalentClass) {
          changedFunctions.push(...classBefore.getMethods());
        }
      });

      if (fallbackToFileDependency || changedFunctions.length !== 0)
        sematicallyChangedFiles.add(fileName);
    }
  }

  return [sematicallyChangedFiles, modifiedTestFiles];
};
