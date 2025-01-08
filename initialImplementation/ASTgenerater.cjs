/**
 * This File is based on the ASTgenerator implementation of NodeSRT
 * GitHub Repository: https://github.com/charlie-cyf/nodeSRT
 */

const fs = require('fs');
const babelParser = require('@babel/parser');
const Path = require('path');
const { filesToExclude } = require('./currentEvaluationRunConfig.cjs');

function generaterHelper(path, ASTpath, excepts) {
  let files = fs.readdirSync(path);

  files.forEach((file) => {
    if (
      Path.extname(file) === '.js' ||
      Path.extname(file) === '.ts' ||
      Path.extname(file) === '.tsx' ||
      Path.extname(file) === '.jsx'
    ) {
      const fullPath = Path.join(path, file);
      try {
        let content = fs.readFileSync(fullPath, 'utf-8');

        // Kamal: Added exception for uppy build files
        if (
          !excepts.includes(fullPath) &&
          !filesToExclude.some((fileToExclude) =>
            fullPath.includes(fileToExclude)
          )
        ) {
          let tree = parseHelper(content);

          fs.writeFileSync(
            ASTpath + '/' + file + '.json',
            JSON.stringify(tree)
          );
        }
      } catch (error) {
        console.log(fullPath, error);
      }
    } else if (
      fs.lstatSync(path + '/' + file).isDirectory() &&
      file !== 'node_modules'
    ) {
      let dirName = file.split('/').pop();
      if (!fs.existsSync(ASTpath + '/' + dirName))
        fs.mkdirSync(ASTpath + '/' + dirName);
      generaterHelper(path + '/' + file, ASTpath + '/' + dirName, excepts);
    }
  }, this);
}

function parseHelper(code) {
  return babelParser.parse(code, {
    sourceType: 'unambiguous',
    allowImportExportEverywhere: true,
    plugins: [
      'jsx',
      'classProperties',
      'typescript',
      'classPrivateProperties',
      'classPrivateMethods',
      'decorators-legacy'
    ]
  });
}

module.exports = class ASTgenerater {
  // take source code, return parsed ast
  static parse(code) {
    return parseHelper(code);
  }

  static parseStmt(stmt) {
    return parseHelper(stmt).program.body[0];
  }

  // will ignore paths in excepts
  static generate(path, excepts) {
    if (path.endsWith('/')) {
      path = path.substring(0, path.length - 1);
    }

    const filename = path.split('/').pop();
    const ASTpath = path + '/../' + filename + '-AST';
    if (!fs.existsSync(ASTpath)) fs.mkdirSync(ASTpath);

    generaterHelper(path, path + '/../' + filename + '-AST', excepts);
  }

  static copyDir(source, distination) {
    const copy = function (source, distination) {
      fs.readdirSync(source).forEach((file) => {
        if (file === 'node_modules') return;
        if (fs.lstatSync(Path.join(source, file)).isDirectory()) {
          if (!fs.existsSync(Path.join(distination, file)))
            fs.mkdirSync(Path.join(distination, file), { recursive: true });
          copy(Path.join(source, file), Path.join(distination, file));
        } else {
          try {
            const internalDirectory = Path.dirname(file);
            if (!fs.existsSync(Path.join(distination, internalDirectory)))
              fs.mkdirSync(Path.join(distination, internalDirectory), {
                recursive: true
              });
            fs.copyFileSync(
              Path.join(source, file),
              Path.join(distination, file)
            );
          } catch (error) {
            console.log('copy Error!', error);
          }
        }
      });
    };
    copy(source, distination);
  }
};
