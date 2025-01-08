/**
 * This File is based on the Insrumentor implementation of NodeSRT
 * GitHub Repository: https://github.com/charlie-cyf/nodeSRT
 */

const fs = require('fs');
const babelWalk = require('babel-walk');
const path = require('path');
const astring = require('astring');
const { parseStmt } = require('../ASTgenerater.cjs');
const babelGenerator = require('@babel/generator').default;
const { isVariableDeclarator, isIdentifier } = require('@babel/types');
const generate = require('@babel/generator');

const { JsxGenerator } = require('./astringJsx.cjs');

const { t } = require('typy');
const {
  evaluationResultsFolder,
  filesToExclude,
  testRunner
} = require('../currentEvaluationRunConfig.cjs');

// Counter used to assign an id for all functions found
let functionCounter = 0;

// functionMap to add all encountered functions to log them in one file at the end
const functionsMap = {};

/**
 * check if tests inside a test site
 * @param {Object} ancestors
 */
function isInsideDecribe(ancestors) {
  try {
    let idx = ancestors.length - 1;
    while (idx >= 0) {
      if (
        t(ancestors[idx], 'type').safeObject === 'CallExpression' &&
        t(ancestors[idx], 'callee.name').safeObject === 'describe'
      ) {
        return getSuiteName(ancestors[idx]);
      }
      idx--;
    }
  } finally {
    return false;
  }
}

function getSuiteName(node) {
  // handle suite name has TemplateLiteral
  if (t(node, 'arguments[0].type').safeObject === 'TemplateLiteral') {
    const name = astring.generate(node.arguments[0], {
      generator: JsxGenerator,
      comments: true
    });
    return name.substring(1, name.length - 1);
  } else {
    return t(node, 'arguments[0].value').safeObject;
  }
}

function LValToString(id) {
  if (isIdentifier(id)) return id.name;
  return JSON.stringify(id);
}

module.exports = class Instrumentor {
  // codebase: path to codebase
  constructor(codebase) {
    if (codebase.endsWith('/')) {
      codebase = codebase.substring(0, codebase.length - 1);
    }
    this.codebaseName = codebase;
    this.astPath = codebase + '-AST';
    this.outputPath = codebase + '-injected';
    this.testSelectionDir = codebase + '-testSelection';

    this.testNames = new Set();
    if (!fs.existsSync(this.outputPath)) {
      fs.mkdirSync(this.outputPath);
    }
  }

  getInjected() {
    this.injectHelper(this.astPath, this.outputPath);
  }

  injectHelper(astDir, outputDir) {
    fs.readdirSync(astDir).forEach((file) => {
      const state = {
        counter: functionCounter
      };
      if (
        path.extname(file) === '.json' &&
        !filesToExclude.some((filetoExclude) => file.includes(filetoExclude))
      ) {
        let fullPath = astDir + '/' + file;
        let tree = JSON.parse(fs.readFileSync(fullPath));
        let program = tree.program;
        const iFileName = fullPath
          .replace(this.astPath + '/', '')
          .replace('.json', '');

        if (
          iFileName.includes('/create-react-app') ||
          iFileName.endsWith('.jsx') ||
          iFileName.endsWith('.ts') ||
          iFileName.endsWith('.tsx')
        ) {
          program.body.unshift(parseStmt("import SRTlib from 'SRTutil';"));
        } else {
          if (tree.sourceType === 'module')
            program.body.unshift(parseStmt("import SRTlib from 'SRTutil';"));
          else program.body.unshift(parseStmt("import SRTlib from 'SRTutil';"));
          // program.body.unshift(
          //   parseStmt("const SRTlib = require('SRTutil');")
          // );
        }

        // if file is test
        try {
          if (
            fullPath.includes('test.ts') ||
            fullPath.includes('test.tsx') ||
            fullPath.includes('spec.ts') ||
            fullPath.includes('test.js') ||
            fullPath.includes('spec.js') ||
            fullPath.endsWith('test.jsx')
          ) {
            const testNames = [];
            const testSuiteNames = new Set();
            babelWalk.ancestor({
              BlockStatement(node, state, ancestors) {
                let suiteName = isInsideDecribe(ancestors);
                if (suiteName) testSuiteNames.add(suiteName);
                else {
                  const parentIndex = ancestors.length - 3;
                  if (
                    t(ancestors[parentIndex], 'type').safeObject ===
                      'CallExpression' &&
                    ['it', 'test'].includes(
                      t(ancestors[parentIndex], 'callee.name').safeObject
                    )
                  ) {
                    let testName = t(
                      ancestors[parentIndex],
                      'arguments[0].value'
                    ).safeObject;
                    testNames.push(testName);
                  }
                }
                node.body.forEach((stmt) => {
                  if (
                    t(stmt, 'expression.callee.name').safeObject === 'it' ||
                    t(stmt, 'expression.callee.name').safeObject === 'test'
                  ) {
                    let itNode = stmt.expression;
                    let testName = t(itNode, 'arguments[0].value').safeObject;
                    if (
                      t(itNode, 'arguments[0].type').safeString ===
                      'StringLiteral'
                    ) {
                      testName = t(itNode, 'arguments[0].value').safeString;
                    } else {
                      testName = generate.default(itNode.arguments[0]).code;
                    }
                    testNames.push(testName);
                    // handle non ArrowFunction argument it
                    if (
                      ![
                        'ArrowFunctionExpression',
                        'FunctionExpression'
                      ].includes(t(itNode, 'arguments[1].type').safeObject)
                    ) {
                      const argument = itNode.arguments[1];
                      if (argument.type === 'CallExpression') {
                        itNode.arguments[1] = {
                          type: 'ArrowFunctionExpression',
                          id: null,
                          generator: false,
                          async: true,
                          params: [],
                          body: {
                            type: 'BlockStatement',
                            body: [
                              {
                                type: 'ExpressionStatement',
                                expression: argument
                              }
                            ],
                            directives: []
                          }
                        };
                      } else {
                        itNode.arguments[1] = {
                          type: 'ArrowFunctionExpression',
                          id: null,
                          generator: false,
                          async: true,
                          params: [],
                          body: {
                            type: 'BlockStatement',
                            body: [
                              {
                                type: 'ExpressionStatement',
                                expression: {
                                  type: 'CallExpression',
                                  callee: argument,
                                  arguments: []
                                }
                              }
                            ],
                            directives: []
                          }
                        };
                      }
                    }
                    if (
                      itNode.arguments[1].type === 'ArrowFunctionExpression' ||
                      itNode.arguments[1].type === 'FunctionExpression'
                    ) {
                      if (itNode.arguments[1].body.type !== 'BlockStatement') {
                        // turn into blockStatment
                        const expStmt = {
                          type: 'ExpressionStatement',
                          expression: itNode.arguments[1].body
                        };
                        itNode.arguments[1].body = {
                          type: 'BlockStatement',
                          body: [expStmt]
                        };
                      }
                    }
                  }
                });
              }
            })(tree, {
              counter: 0
            });

            testNames.forEach((testName) =>
              this.testNames.add(`${iFileName} > ${testName}`)
            );
            program.body.unshift(
              parseStmt(`import { afterAll } from '${testRunner}'`)
            );
            program.body.push(
              parseStmt(`afterAll(async () => { await SRTlib.endLogger();} )`)
            );
          } else {
            let functionMap = new Map();
            const getListOfId = Instrumentor.getListOfId;
            const functionHandler = this.functionHandler;
            if (!filesToExclude.some((file) => iFileName.includes(file))) {
              program.body.unshift(
                parseStmt(`import { expect } from '${testRunner}'`)
              );

              const buildFunctionStartMsg = function (functionName) {
                const temp = {
                  function: functionName
                };
                const tempString = JSON.stringify(temp);
                const escapedTestName = `expect.getState().currentTestName?.replace(/"/g, '\\\\"')`;
                return parseStmt(
                  'SRTlib.send(`' +
                    tempString.slice(0, -1) +
                    ', "test": "${' +
                    escapedTestName +
                    '}"},`);'
                );
              };

              babelWalk.ancestor({
                FunctionDeclaration(node, state) {
                  const paramsNum = node.params.length;
                  const funcName = node.id.name;
                  const id = state.counter++;
                  functionsMap[id] = {
                    function: funcName,
                    file: iFileName,
                    params: paramsNum
                  };
                  node.body.body.unshift(
                    buildFunctionStartMsg(id, paramsNum, false, undefined)
                  );
                },

                FunctionExpression(node, state, ancestors) {
                  functionHandler(
                    node,
                    ancestors,
                    getListOfId,
                    functionMap,
                    buildFunctionStartMsg,
                    iFileName,
                    state
                  );
                },

                ArrowFunctionExpression(node, state, ancestors) {
                  // handle arrow function implicit return
                  if (node.body.type !== 'BlockStatement') {
                    const returnStmt = {
                      type: 'ReturnStatement',
                      argument: node.body
                    };
                    node.body = {
                      type: 'BlockStatement',
                      body: [returnStmt]
                    };
                  }

                  functionHandler(
                    node,
                    ancestors,
                    getListOfId,
                    functionMap,
                    buildFunctionStartMsg,
                    iFileName,
                    state
                  );
                },
                ClassMethod(node, state, ancestors) {
                  const funcName = t(node, 'key.name').safeObject;
                  if (funcName) {
                    const classDeclare = ancestors[ancestors.length - 3];
                    let className = '';
                    if (classDeclare.type === 'ClassDeclaration')
                      className = classDeclare.id.name;
                    else {
                      for (let i = ancestors.length - 4; i > 1; i--) {
                        if (ancestors[i]?.id?.name)
                          className = ancestors[i].id.name;
                      }
                    }
                    const id = state.counter++;
                    functionsMap[id] = {
                      function: funcName,
                      file: iFileName,
                      params: node.params.length,
                      class: className
                    };
                    node.body.body.unshift(buildFunctionStartMsg(id));
                  }
                },
                ClassPrivateMethod(node, state, ancestors) {
                  const funcName = t(node, 'key.id.name').safeObject;
                  if (funcName) {
                    const classDeclare = ancestors[ancestors.length - 3];
                    let className = '';
                    if (classDeclare.type === 'ClassDeclaration')
                      className = classDeclare.id.name;
                    else {
                      for (let i = ancestors.length - 4; i > 1; i--) {
                        if (ancestors[i]?.id?.name)
                          className = ancestors[i].id.name;
                      }
                    }
                    const id = state.counter++;
                    functionsMap[id] = {
                      function: funcName,
                      file: iFileName,
                      params: node.params.length,
                      class: classDeclare.id.name
                    };
                    node.body.body.unshift(buildFunctionStartMsg(id));
                  }
                }
              })(tree, state);
            }
          }

          functionCounter = state.counter;
          fs.writeFileSync(
            outputDir + '/' + file.replace('.json', ''),
            babelGenerator(tree).code
          );
        } catch (err) {
          // throw err;
          console.log('injection to', fullPath, 'failed!', err);
        }
      } else if (fs.lstatSync(astDir + '/' + file).isDirectory()) {
        let dirName = file.split('/').pop();
        if (!fs.existsSync(outputDir + '/' + dirName))
          fs.mkdirSync(outputDir + '/' + dirName);
        this.injectHelper(astDir + '/' + file, outputDir + '/' + dirName);
      }
    });
    fs.writeFileSync(
      path.join(evaluationResultsFolder, 'functionsMap.json'),
      JSON.stringify(functionsMap)
    );
  }

  functionHandler(node, ancestors, buildFunctionStartMsg, fileName, state) {
    const paramsNum = node.params.length;
    // Function is assigned to a variable
    const directAncestor = ancestors[ancestors.length - 2];
    if (isVariableDeclarator(directAncestor)) {
      const functionName = LValToString(directAncestor.id);

      let id = state.counter++;
      functionsMap[id] = {
        function: functionName,
        file: fileName,
        params: paramsNum
      };
      node.body.body.unshift(buildFunctionStartMsg(id));
    }
  }

  static getListOfId(ancestors, idList) {
    let ancestorIdx = ancestors.length - 2; // Last element is the node itself so we start with the one before it
    const memberExpHandler = function (node) {
      let temp = node.object;
      if (node.property.type === 'Identifier') {
        idList.unshift(node.property.name);
      }

      if (temp.type === 'MemberExpression') {
        memberExpHandler(temp);
      } else if (temp.type === 'Identifier') {
        idList.unshift(temp.name);
      }
    };
    while (ancestorIdx >= 0) {
      const ancestor = ancestors[ancestorIdx--];
      // console.log('ancestor', ancestor)
      switch (ancestor.type) {
        case 'FunctionExpression':
          if (ancestor.id && ancestor.id.type === 'Identifier') {
            idList.unshift(ancestor.id.name);
          }
          break;
        case 'AssignmentExpression':
          if (ancestor.left.type === 'MemberExpression') {
            memberExpHandler(ancestor.left);
          } else if (ancestor.left.type === 'Identifier') {
            idList.unshift(ancestor.left.name);
          }
          break;
        case 'FunctionDeclaration':
        case 'ArrowFunctionExpression':
        case 'Program':
          return idList;
        case 'CallExpression':
          if (ancestor.callee.type === 'Identifier') {
            idList.unshift(ancestor.callee.name);
          } else if (ancestor.callee.type === 'MemberExpression') {
            let callee = ancestor.callee;
            do {
              if (callee.property.type === 'Identifier') {
                idList.unshift(callee.property.name);
              }

              if (callee.object.type === 'CallExpression') {
                callee = callee.object.callee;
                if (callee.type === 'Identifier') {
                  idList.unshift(callee.name);
                  break;
                }
              } else if (callee.object.type === 'MemberExpression') {
                memberExpHandler(callee.object);
                break;
              } else if (callee.object.type === 'Identifier') {
                idList.unshift(callee.object.name);
                break;
              } else {
                break;
              }
            } while (callee.object); //&& callee.object.type !== "Identifier"
          }
          break;
        case 'Property':
          if (ancestor.key.type === 'Identifier') {
            idList.unshift(ancestor.key.name);
          }
          break;
        case 'ClassProperty':
          if (ancestor.key.type === 'Identifier') {
            idList.unshift(ancestor.key.name);
          }
          break;
        case 'VariableDeclarator':
          if (ancestor.id.type === 'Identifier') {
            idList.unshift(ancestor.id.name);
          }
          break;
        case 'ReturnStatement':
          idList.unshift('ReturnStatement');
          break;
        case 'NewExpression':
          idList.unshift('NewExpression');
          break;
        default:
          break;
      }
    }
    return idList;
  }

  static getSuiteName(node) {
    // handle suite name has TemplateLiteral
    return getSuiteName(node);
  }

  static isInsideDecribe(ancestors) {
    return isInsideDecribe(ancestors);
  }
};
