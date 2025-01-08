// import { execSync } from 'child_process';
import fs from 'fs';
import { GitChanges } from '../dist/cst.js';
import path from 'path';
import simpleGit from 'simple-git';
import { parse } from '@babel/parser';
// import CstBuilder from '../dist/CstBuilder.js';

// const command =
//   "git diff HEAD~1 HEAD --name-status | grep -E '\\.js$' | grep -v '^node_modules/' > trial.txt";

// //execSync(command, { encoding: 'utf-8' });

// const gitChanges = new GitChanges('./changed_files.txt');
// console.log(gitChanges);

const getFilesBefore = (gitChanges, localPath) => {
  const files = { before: {} };
  const fileNamesBefore = [
    ...gitChanges.deletedFiles,
    ...gitChanges.modifiedFiles,
    ...gitChanges.renamedFiles.map((renamedFile) => renamedFile.oldFileName)
  ];

  fileNamesBefore.forEach((fileName) => {
    const file = fs.readFileSync(path.join(localPath, fileName), 'utf8');
    const fileAst = parse(file, {
      sourceType: 'unambiguous',
      sourceFilename: fileName,
      attachComment: false,
      allowImportExportEverywhere: true,
      plugins: [
        // enable jsx and flow syntax
        'jsx',
        //'flow',
        'classProperties',
        'typescript',
        'decorators'
      ]
    });

    files.before[fileName] = fileAst;
  });

  return files;
};

const getFilesAfter = (gitChanges, localPath) => {
  const files = { after: {} };
  const fileNamesAfter = [
    ...gitChanges.addedFiles,
    ...gitChanges.modifiedFiles,
    ...gitChanges.renamedFiles.map((renamedFile) => renamedFile.newFileName)
  ];

  fileNamesAfter.forEach((fileName) => {
    const file = fs.readFileSync(path.join(localPath, fileName), 'utf8');
    const fileAst = parse(file, {
      sourceType: 'unambiguous',
      sourceFilename: fileName,
      attachComment: false,
      allowImportExportEverywhere: true,
      plugins: [
        // enable jsx and flow syntax
        'jsx',
        //'flow',
        'classProperties',
        'typescript',
        'decorators'
      ]
    });
    files.after[fileName] = fileAst;
  });

  return files;
};

const cloneAndDiff = async (repoUrl, localPath, commit) => {
  try {
    const commitBefore = commit + '~1';
    const git = simpleGit();

    console.log('Cloning Repository');
    await git.clone(repoUrl, localPath);

    // Navigate to the cloned repository's directory
    const repo = simpleGit(localPath);

    console.log('Retrieving changed files by commit', commit);
    const diff = await repo.diff(['--name-status', commit, commitBefore]);
    const gitChanges = new GitChanges(diff, false);

    console.log('Checking out commit:', commitBefore);
    repo.checkout(commitBefore);
    const filesBefore = getFilesBefore(gitChanges, localPath);

    repo.checkout(commit);
    const filesAfter = getFilesAfter(gitChanges, localPath);
    const affectedFiles = { ...filesBefore, ...filesAfter };
    //return { ...filesBefore, ...filesAfter };
    fs.writeFileSync('AffectedFiles.json', JSON.stringify(affectedFiles));
  } catch (error) {
    console.error('Error:', error);
  }
};

// cloneAndDiff(
//   'https://github.com/transloadit/uppy.git', // repository URL
//   './evaluation/uppy', // local directory for clone
//   '20291e19e8becf523aa317ba2f33387f79ec086b' // commit
// );

const logs = JSON.parse(
  fs.readFileSync('./evaluation-uppy-1732014361805.log.json', 'utf8')
).map((log) => log.testName);
const logsSet = new Set(logs);
console.log(logs.length);

const logs1 = JSON.parse(
  fs.readFileSync('./evaluation-uppy-1732014655852.log.json', 'utf8')
).map((log) => log.testName);
const logsSet1 = new Set(logs1);
console.log(logs1.length);
