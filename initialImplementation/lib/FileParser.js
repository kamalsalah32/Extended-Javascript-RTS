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

export const readAndParseFile = (localPath, fileName) => {
  const file = fs.readFileSync(path.join(localPath, fileName), 'utf-8');
  const parsedFile = JSON.stringify(parseFile(file));
  const trailingCommaRegex = /,"extra":\{[^}]*\}/g;
  const filteredFile = parsedFile.replace(trailingCommaRegex, '');
  return JSON.parse(filteredFile);
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
