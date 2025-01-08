import {
  ClassCodeElement,
  CodeElementType,
  FileCodeElement,
  FunctionCodeElement
} from './codeElement.js';
import { readFileSync } from 'fs';
import { parse } from '@babel/parser';
import * as babelTypes from '@babel/types';
import generate from '@babel/generator';
import babelWalk from 'babel-walk';
const LValToString = (id) => {
  if (babelTypes.isIdentifier(id)) return id.name;
  return JSON.stringify(id);
};
const isGlobalVariable = (ancestors) => {
  for (const ancestor of ancestors) {
    if (
      babelTypes.isFunctionDeclaration(ancestor) ||
      babelTypes.isFunctionExpression(ancestor) ||
      babelTypes.isArrowFunctionExpression(ancestor) ||
      babelTypes.isClassBody(ancestor)
    )
      return false;
  }
  return true;
};
export class CstBuilder {
  static babelWalkVisitors = {
    File(node, state) {
      const id = state.id++;
      const cstNode = FileCodeElement.astNodeToCodeElement(
        node.program,
        id,
        state.fileName
      );
      state.fileId = id;
      state.cstMap[id] = cstNode;
    },
    FunctionDeclaration(node, state) {
      const id = state.id++;
      const cstNode = FunctionCodeElement.functionDeclarationToCodeElement(
        node,
        state.fileName,
        id
      );
      state.functionIds.push(id);
      state.cstMap[id] = cstNode;
    },
    FunctionExpression(node, state, ancestors) {
      // Function is assigned to a variable
      const directAncestor = ancestors[ancestors.length - 2];
      if (babelTypes.isVariableDeclarator(directAncestor)) {
        const id = state.id++;
        let functionName = LValToString(directAncestor.id);
        const cstNode = FunctionCodeElement.functionExpressionToCodeElement(
          node,
          state.fileName,
          id,
          functionName,
          CodeElementType.FUNCTION_EXPRESSION
        );
        state.functionIds.push(id);
        state.cstMap[id] = cstNode;
      }
    },
    ArrowFunctionExpression(node, state, ancestors) {
      // Function is assigned to a variable
      const directAncestor = ancestors[ancestors.length - 2];
      if (babelTypes.isVariableDeclarator(directAncestor)) {
        const id = state.id++;
        let functionName = LValToString(directAncestor.id);
        const cstNode = FunctionCodeElement.functionExpressionToCodeElement(
          node,
          state.fileName,
          id,
          functionName,
          CodeElementType.ARROW_FUNCTION_EXPRESSION
        );
        state.functionIds.push(id);
        state.cstMap[id] = cstNode;
      }
    },
    ClassDeclaration(node, state) {
      const id = state.id++;
      const cstNode = ClassCodeElement.classDeclarationToCodeElement(
        node,
        state.fileName,
        id
      );
      state.classIds.push(id);
      state.cstMap[id] = cstNode;
    },
    ClassExpression(node, state, ancestors) {
      // Function is assigned to a variable
      const directAncestor = ancestors[ancestors.length - 2];
      if (babelTypes.isVariableDeclarator(directAncestor)) {
        const id = state.id++;
        let className = LValToString(directAncestor.id);
        const cstNode = ClassCodeElement.classExpressionToCodeElement(
          node,
          state.fileName,
          id,
          className
        );
        state.classIds.push(id);
        state.cstMap[id] = cstNode;
      }
    },
    VariableDeclarator(node, state, ancestors) {
      if (isGlobalVariable(ancestors))
        state.globalVariables.push(generate.default(node).code);
    }
  };
  buildCstForFile(fileName, fileState) {
    if (!fileState)
      fileState = {
        id: 0,
        fileName,
        fileId: 0,
        functionIds: [],
        classIds: [],
        cstMap: {},
        globalVariables: []
      };
    const file = readFileSync(fileName, 'utf8');
    const babelAst = parse(file, {
      sourceType: 'unambiguous',
      attachComment: false
    });
    this.buildCst(babelAst, fileState);
    return fileState;
  }
  buildCstFromAst(fileName, babelAst, fileState) {
    if (!fileState)
      fileState = {
        id: 0,
        fileName,
        fileId: 0,
        functionIds: [],
        classIds: [],
        cstMap: {},
        globalVariables: []
      };
    this.buildCst(babelAst, fileState);
    return fileState;
  }
  buildCst(babelAst, fileState) {
    babelWalk.ancestor(CstBuilder.babelWalkVisitors)(babelAst, fileState);
  }
}
