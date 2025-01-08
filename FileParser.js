import fs from 'fs';
import path from 'path';
import babelParser from '@babel/parser';
import * as babelTypes from '@babel/types';

const babelPlugins = [
  'jsx',
  'classProperties',
  'typescript',
  'classPrivateProperties',
  'classPrivateMethods',
  'decorators-legacy'
];

function removeExtraKey(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  for (const key in obj) {
    if (key === 'extra') {
      delete obj[key];
    } else if (typeof obj[key] === 'object') {
      removeExtraKey(obj[key]);
    }
  }

  return obj;
}

export const readAndParseFile = (localPath, fileName) => {
  console.log('Reading file:', fileName);
  const file = fs.readFileSync(path.join(localPath, fileName), 'utf-8');
  const parsedFile = parseFile(file);
  return removeExtraKey(parsedFile);
};

const parseFile = (file) => {
  const babelAST = babelParser.parse(file, {
    sourceType: 'unambiguous',
    allowImportExportEverywhere: true,
    plugins: babelPlugins
  });
  babelTypes.removePropertiesDeep(babelAST);
  return babelAST;
};
