import { CstBuilder } from './CstBuilder.js';
import fs from 'fs';
import path from 'path';
var RtsType;
(function (RtsType) {
  RtsType['NORMAL'] = 'NormalRTS';
  RtsType['EXTENDED'] = 'ExtendedRTS';
})(RtsType || (RtsType = {}));

export const getAllChangedFunctionsAndFiles = (
  affectedFilesPath,
  logPath,
  rtsType
) => {
  const affectedFiles = JSON.parse(fs.readFileSync(affectedFilesPath, 'utf8'));
  const cstBuilder = new CstBuilder();
  switch (rtsType) {
    case RtsType.NORMAL:
      return getAllChangedFunctionsAndFilesNormalRts(
        affectedFiles,
        cstBuilder,
        logPath
      );
    case RtsType.EXTENDED:
      return getAllChangedFunctionsAndFilesExtendedRts(
        affectedFiles,
        cstBuilder,
        logPath
      );
  }
};
const getAllChangedFunctionsAndFilesNormalRts = (
  affectedFiles,
  cstBuilder,
  logPath
) => {
  const changedFunctions = [];
  let deletedFilesToRerun = addChangedFunctionsFromFileAstDictionary(
    cstBuilder,
    affectedFiles.deletedFiles,
    changedFunctions
  );
  let renamedFilesToRerun = addChangedFunctionsFromFileAstDictionary(
    cstBuilder,
    affectedFiles.renamedFiles.before,
    changedFunctions
  );
  let modifiedFilesToRerun = addChangedFunctionsFromFileAstDictionary(
    cstBuilder,
    affectedFiles.modifiedFiles.before,
    changedFunctions
  );
  let filesToRerun = [
    ...deletedFilesToRerun,
    ...renamedFilesToRerun,
    ...modifiedFilesToRerun
  ];
  let filesToRerunSet = new Set(filesToRerun);
  fs.writeFileSync(
    path.join(logPath, 'NormalRTSChangedFunctions.json'),
    JSON.stringify(changedFunctions)
  );
  fs.writeFileSync(
    path.join(logPath, 'NormalRTSSemanticallyChangedFiles.json'),
    JSON.stringify(filesToRerun)
  );
  return [changedFunctions, filesToRerunSet];
};
const getAllChangedFunctionsAndFilesExtendedRts = (
  affectedFiles,
  cstBuilder,
  logPath
) => {
  const changedFunctions = [];
  let deletedFilesToRerun = addChangedFunctionsFromFileAstDictionary(
    cstBuilder,
    affectedFiles.deletedFiles,
    changedFunctions
  );
  let renamedFilesToRerun = addChangedFunctionsFromFileAstDictionary(
    cstBuilder,
    affectedFiles.renamedFiles.before,
    changedFunctions
  );
  let modifiedFilesToRerun = addSemanticallyChangedFunctionsForModifiedFiles(
    cstBuilder,
    affectedFiles.modifiedFiles,
    changedFunctions
  );
  let filesToRerun = [
    ...deletedFilesToRerun,
    ...renamedFilesToRerun,
    ...modifiedFilesToRerun
  ];
  let filesToRerunSet = new Set(filesToRerun);
  fs.writeFileSync(
    path.join(logPath, 'ExtendedRTSChangedFunctions.json'),
    JSON.stringify(changedFunctions)
  );
  fs.writeFileSync(
    path.join(logPath, 'ExtendedRTSSemanticallyChangedFiles.json'),
    JSON.stringify(filesToRerun)
  );
  return [changedFunctions, filesToRerunSet];
};
const addChangedFunctionsFromFileAstDictionary = (
  cstBuilder,
  FileAstDictionary,
  changedFunctions
) => {
  const filesToRerun = new Set();
  for (let fileName in FileAstDictionary) {
    const fileCst = cstBuilder.buildCstFromAst(
      fileName,
      FileAstDictionary[fileName]
    );
    fileCst.classIds.forEach((classId) => {
      const cstNode = fileCst.cstMap[classId];
      if (cstNode.properties.length !== 0) filesToRerun.add(fileName);
      changedFunctions.push(...cstNode.getMethods());
    });
    fileCst.functionIds.forEach((functionId) => {
      const cstNode = fileCst.cstMap[functionId];
      changedFunctions.push(cstNode.getFunction());
    });
  }
  return filesToRerun;
};
const addSemanticallyChangedFunctionsForModifiedFiles = (
  cstBuilder,
  modifiedFiles,
  changedFunctions
) => {
  const filesToRerun = new Set();
  for (let fileName in modifiedFiles.before) {
    // Get all changed functions in modified files
    const fileCstBefore = cstBuilder.buildCstFromAst(
      fileName,
      modifiedFiles.before[fileName]
    );
    const fileCstAfter = cstBuilder.buildCstFromAst(
      fileName,
      modifiedFiles.after[fileName]
    );
    const functionsBefore = fileCstBefore.functionIds.map(
      (functionId) => fileCstBefore.cstMap[functionId]
    );
    const functionsAfter = fileCstAfter.functionIds.map(
      (functionId) => fileCstBefore.cstMap[functionId]
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
    const classesBefore = fileCstBefore.classIds.map(
      (classId) => fileCstBefore.cstMap[classId]
    );
    const classesAfter = fileCstAfter.classIds.map(
      (classId) => fileCstAfter.cstMap[classId]
    );
    let fallbackToFileDependency = false;
    const globalVariablesBefore = fileCstBefore.globalVariables;
    const globalVariablesAfter = fileCstAfter.globalVariables;
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
        )
          fallbackToFileDependency = true;
        return true;
      });
      if (!hasEquivalentClass) {
        changedFunctions.push(...classBefore.getMethods());
      }
    });
    if (fallbackToFileDependency) filesToRerun.add(fileName);
  }
  return filesToRerun;
};
