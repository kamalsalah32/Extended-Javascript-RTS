import {
  ClassCodeElement,
  CodeElementType,
  FileCodeElement,
  FileState,
  FunctionCodeElement
} from './CodeElements.js';
import { readFileSync } from 'fs';
import { parse } from '@babel/parser';
import * as babelTypes from '@babel/types';
import babelWalk, { AncestorVisitor } from 'babel-walk';
import generate from '@babel/generator';

const actualGenerate = (generate as any).default || generate;

const LValToString = (id: babelTypes.LVal): string => {
  if (babelTypes.isIdentifier(id)) return id.name;
  return JSON.stringify(id);
};

const isGlobalVariable = (ancestors: babelTypes.Node[]): boolean => {
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

export class CodeElementsBuilder {
  public static babelWalkVisitors: AncestorVisitor<FileState> = {
    File(node, state) {
      const id = state.id++;
      const codeElement = FileCodeElement.astNodeToCodeElement(
        node.program,
        id,
        state.fileName
      );
      state.fileId = id;
      state.codeElementsMap[id] = codeElement;
    },
    FunctionDeclaration(node, state) {
      const id = state.id++;
      const codeElement = FunctionCodeElement.functionDeclarationToCodeElement(
        node,
        state.fileName,
        id
      );
      state.functionIds.push(id);
      state.codeElementsMap[id] = codeElement;
    },
    FunctionExpression(node, state, ancestors) {
      // Function is assigned to a variable
      const directAncestor = ancestors[ancestors.length - 2];
      if (babelTypes.isVariableDeclarator(directAncestor)) {
        const id = state.id++;
        let functionName = LValToString(directAncestor.id);
        const codeElement = FunctionCodeElement.functionExpressionToCodeElement(
          node,
          state.fileName,
          id,
          functionName,
          CodeElementType.FUNCTION_EXPRESSION
        );
        state.functionIds.push(id);
        state.codeElementsMap[id] = codeElement;
      }
    },
    ArrowFunctionExpression(node, state, ancestors) {
      // Function is assigned to a variable
      const directAncestor = ancestors[ancestors.length - 2];
      if (babelTypes.isVariableDeclarator(directAncestor)) {
        const id = state.id++;
        let functionName = LValToString(directAncestor.id);
        const codeElement = FunctionCodeElement.functionExpressionToCodeElement(
          node,
          state.fileName,
          id,
          functionName,
          CodeElementType.ARROW_FUNCTION_EXPRESSION
        );
        state.functionIds.push(id);
        state.codeElementsMap[id] = codeElement;
      }
    },
    ClassDeclaration(node, state) {
      const id = state.id++;
      const codeElement = ClassCodeElement.classDeclarationToCodeElement(
        node,
        state.fileName,
        id
      );
      state.classIds.push(id);
      state.codeElementsMap[id] = codeElement;
    },
    ClassExpression(node, state, ancestors) {
      // Function is assigned to a variable
      const directAncestor = ancestors[ancestors.length - 2];
      if (babelTypes.isVariableDeclarator(directAncestor)) {
        const id = state.id++;
        let className = LValToString(directAncestor.id);
        const codeElement = ClassCodeElement.classExpressionToCodeElement(
          node,
          state.fileName,
          id,
          className
        );
        state.classIds.push(id);
        state.codeElementsMap[id] = codeElement;
      }
    },
    VariableDeclarator(node, state, ancestors) {
      if (isGlobalVariable(ancestors))
        state.globalVariables.push(actualGenerate(node).code);
    }
  };

  buildCodeElementsForFile(fileName: string, fileState?: FileState): FileState {
    if (!fileState)
      fileState = {
        id: 0,
        fileName,
        fileId: 0,
        functionIds: [],
        classIds: [],
        codeElementsMap: {},
        globalVariables: []
      };

    const file = readFileSync(fileName, 'utf8');
    const babelAst = parse(file, {
      sourceType: 'unambiguous',
      attachComment: false
    });

    this.buildCodeElements(babelAst, fileState);
    return fileState;
  }

  buildCodeElementsFromAst(
    fileName: string,
    babelAst: babelTypes.File,
    fileState?: FileState
  ): FileState {
    if (!fileState)
      fileState = {
        id: 0,
        fileName,
        fileId: 0,
        functionIds: [],
        classIds: [],
        codeElementsMap: {},
        globalVariables: []
      };

    this.buildCodeElements(babelAst, fileState);
    return fileState;
  }

  private buildCodeElements(
    babelAst: babelTypes.File,
    fileState: FileState
  ): void {
    babelWalk.ancestor<FileState>(CodeElementsBuilder.babelWalkVisitors)(
      babelAst,
      fileState
    );
  }
}
