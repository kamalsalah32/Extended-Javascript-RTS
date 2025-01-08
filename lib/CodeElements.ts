import { readFileSync } from 'fs';
import {
  FunctionDeclaration,
  ClassDeclaration,
  ClassBody,
  Identifier,
  TSParameterProperty,
  Pattern,
  RestElement,
  FunctionExpression,
  ArrowFunctionExpression,
  ClassExpression,
  StringLiteral,
  NumericLiteral,
  BigIntLiteral,
  PrivateName,
  Expression,
  Program
} from '@babel/types';
import generate from '@babel/generator';

const actualGenerate = (generate as any).default || generate;

const isStringArraysEqual = (arr1: string[], arr2: string[]) => {
  let arr1Length = arr1.length;
  if (arr1Length !== arr2.length) return false;
  for (let i = 0; i < arr1Length; i++) {
    if (arr1[i] !== arr2[i]) return false;
  }
  return true;
};

export enum CodeElementType {
  FILE = 'Program',

  FUNCTION_DECLARATION = 'FunctionDeclaration',
  FUNCTION_EXPRESSION = 'FunctionExpression',
  ARROW_FUNCTION_EXPRESSION = 'ArrowFunctionExpression',

  CLASS_DECLARATION = 'ClassDeclaration',
  CLASS_EXPRESSION = 'ClassExpression',
  CLASS_METHOD = 'ClassMethod',
  CLASS_PRIVATE_METHOD = 'ClassPrivateMethod',
  CLASS_PROPERTY = 'ClassProperty',
  CLASS_PRIVATE_PROPERTY = 'ClassPrivateProperty',

  VARIABLE_DECLARATION = 'VariableDeclaration',
  VARIABLE_DECLARATOR = 'VariableDeclarator',

  UNSUPPORTED_NODE_TYPE = 'UnsupportedNodeType'
}

export type ChangedFunction = {
  function: string;
  file: string;
  params: number;
  class?: string;
};

export type FileState = {
  id: number;
  fileName: string;
  fileId: number;
  functionIds: number[];
  classIds: number[];
  codeElementsMap: { [id: number]: CodeElement };
  globalVariables: string[];
};

export abstract class CodeElement {
  constructor(public id: number, public name: string, public code: string) {}

  static extractParams(
    parameters: (Identifier | Pattern | RestElement | TSParameterProperty)[]
  ): string[] {
    return parameters.map((param) => {
      if (param.type === 'Identifier') return param.name;
      else return JSON.stringify(param);
    });
  }
}

export class FileCodeElement extends CodeElement {
  constructor(id: number, name: string, code: string) {
    super(id, name, code);
  }

  static astNodeToCodeElement(
    astNode: Program,
    id: number,
    fileName: string
  ): FileCodeElement {
    return new FileCodeElement(id, fileName, JSON.stringify(astNode.body));
  }
}

export class ClassCodeElement extends CodeElement {
  constructor(
    id: number,
    name: string,
    code: string,
    public methods: ClassMethodCodeElement[],
    public properties: ClassPropertyCodeElement[],
    public fileName: string,
    public superClass: string | null,
    public typeParameters: string,
    public nodeType: CodeElementType
  ) {
    super(id, name, code);
  }

  static classDeclarationToCodeElement(
    astNode: ClassDeclaration,
    fileName: string,
    id: number
  ): ClassCodeElement {
    const classCodeElement = new ClassCodeElement(
      id,
      astNode.id?.name || '',
      JSON.stringify(astNode.body),
      [],
      [],
      fileName,
      !astNode.superClass ? null : actualGenerate(astNode.superClass).code,
      !astNode.typeParameters ? '' : JSON.stringify(astNode.typeParameters),
      CodeElementType.CLASS_DECLARATION
    );
    this.buildClassBodyNodes(classCodeElement, astNode.body);
    return classCodeElement;
  }

  static classExpressionToCodeElement(
    astNode: ClassExpression,
    fileName: string,
    id: number,
    name: string
  ): ClassCodeElement {
    const classCodeElement = new ClassCodeElement(
      id,
      name,
      JSON.stringify(astNode.body),
      [],
      [],
      fileName,
      !astNode.superClass ? null : actualGenerate(astNode.superClass).code,
      astNode.typeParameters ? JSON.stringify(astNode.typeParameters) : '',
      CodeElementType.CLASS_EXPRESSION
    );
    this.buildClassBodyNodes(classCodeElement, astNode.body);
    return classCodeElement;
  }

  static extractClassNodeName(
    key:
      | Identifier
      | StringLiteral
      | NumericLiteral
      | BigIntLiteral
      | PrivateName
      | Expression
  ): string {
    switch (key.type) {
      case 'Identifier':
        return key.name;
      case 'StringLiteral':
        return key.value;
      case 'NumericLiteral':
        return 'NumericLiteral#' + key.value;
      case 'BigIntLiteral':
        return 'BigIntLiteral#' + key.value;
      case 'PrivateName':
        return key.id.name;
      default:
        return JSON.stringify(key);
    }
  }

  static buildClassBodyNodes(
    classCodeElement: ClassCodeElement,
    classBody: ClassBody
  ) {
    let propertyCode;
    let indexOfColon;
    classBody.body.forEach((classBodyNode) => {
      switch (classBodyNode.type) {
        case CodeElementType.CLASS_METHOD:
          classCodeElement.methods.push(
            new ClassMethodCodeElement(
              this.extractClassNodeName(classBodyNode.key),
              'public',
              classBodyNode.static,
              classBodyNode.kind,
              classBodyNode.async,
              JSON.stringify(classBodyNode.body),
              this.extractParams(classBodyNode.params)
            )
          );
          break;
        case CodeElementType.CLASS_PRIVATE_METHOD:
          classCodeElement.methods.push(
            new ClassMethodCodeElement(
              this.extractClassNodeName(classBodyNode.key),
              'private',
              classBodyNode.static,
              classBodyNode.kind,
              classBodyNode.async ?? false,
              JSON.stringify(classBodyNode.body),
              this.extractParams(classBodyNode.params)
            )
          );
          break;
        case CodeElementType.CLASS_PROPERTY:
          propertyCode = actualGenerate(classBodyNode).code;
          indexOfColon = propertyCode.indexOf(':');
          classCodeElement.properties.push(
            new ClassPropertyCodeElement(
              this.extractClassNodeName(classBodyNode.key),
              classBodyNode.value ? JSON.stringify(classBodyNode.value) : null,
              'public',
              classBodyNode.static,
              !classBodyNode.typeAnnotation
                ? ''
                : propertyCode.slice(indexOfColon + 1).slice(0, -1)
            )
          );
          break;
        case CodeElementType.CLASS_PRIVATE_PROPERTY:
          propertyCode = actualGenerate(classBodyNode).code;
          indexOfColon = propertyCode.indexOf(':');
          classCodeElement.properties.push(
            new ClassPropertyCodeElement(
              this.extractClassNodeName(classBodyNode.key),
              classBodyNode.value ? JSON.stringify(classBodyNode.value) : null,
              'private',
              classBodyNode.static,
              !classBodyNode.typeAnnotation
                ? ''
                : propertyCode.slice(indexOfColon + 1).slice(0, -1)
            )
          );
          break;
      }
    });
  }

  shouldFallbackToFileDependency(afterNode: ClassCodeElement): boolean {
    if (this.superClass && !afterNode.superClass) return true; // super class has been removed
    if (this.typeParameters !== afterNode.typeParameters) return true; // type parameters have been changed
    if (this.code === afterNode.code) return false; // class has not changed in any way

    const beforeProperties = [...this.properties];
    const afterProperties = [...afterNode.properties];

    for (const beforeProperty of beforeProperties) {
      const hasEquivalentProperty = afterProperties.some((afterProperty) => {
        if (
          beforeProperty.name !== afterProperty.name ||
          beforeProperty.value !== afterProperty.value ||
          beforeProperty.isStatic !== afterProperty.isStatic ||
          beforeProperty.type !== afterProperty.type
        ) {
          return false;
        }

        if (
          beforeProperty.access === 'public' &&
          afterProperty.access === 'private'
        ) {
          return false;
        }

        // Property has not been modified semantically
        return true;
      });

      // An old property has been modified in a way that requires every test that uses the class to be rerun
      if (!hasEquivalentProperty) return true;
    }

    return false;
  }

  getSemanticallyChangedMethods(
    afterNode: ClassCodeElement
  ): ChangedFunction[] {
    console.log(
      `Retrieving changed methods between versions of class "${this.name}"`
    );

    if (this.code === afterNode.code) return [];

    // Checking class methods
    const beforeMethods = [...this.methods];
    const afterMethods = [...afterNode.methods];
    const changedMethods: ChangedFunction[] = [];

    beforeMethods.forEach((beforeMethod) => {
      const hasEquivalentMethod = afterMethods.some((afterMethod) => {
        if (
          beforeMethod.name !== afterMethod.name ||
          beforeMethod.params.length !== afterMethod.params.length
        ) {
          return false;
        }

        if (beforeMethod.isSemanticallyChanged(afterMethod)) {
          changedMethods.push({
            function: beforeMethod.name,
            file: this.fileName,
            params: beforeMethod.params.length,
            class: this.name
          });
        }
        return true;
      });

      if (!hasEquivalentMethod) {
        changedMethods.push({
          function: beforeMethod.name,
          file: this.fileName,
          params: beforeMethod.params.length,
          class: this.name
        });
      }
    });

    return changedMethods;
  }

  getMethods(): ChangedFunction[] {
    return this.methods.map((method) => {
      return {
        function: method.name,
        file: this.fileName,
        params: method.params.length,
        class: this.name
      };
    });
  }
}

export class ClassMethodCodeElement {
  constructor(
    public name: string,
    public access: 'public' | 'private',
    public isStatic: boolean,
    public kind: 'get' | 'set' | 'method' | 'constructor',
    public async: boolean,
    public code: string,
    public params: string[]
  ) {}

  isSemanticallyChanged(method: ClassMethodCodeElement): boolean {
    if (
      (this.access === 'public' && method.access === 'private') ||
      this.kind !== method.kind ||
      this.isStatic !== method.isStatic ||
      this.async !== method.async
    ) {
      return true;
    }

    if (this.code === method.code) return false;
    else {
      if (isStringArraysEqual(this.params, method.params)) {
        return true; // Parameters have not changed but body has changed
      } else {
        let m1Code = this.code;
        let m2Code = method.code;
        for (let i = 0; i < this.params.length; i++) {
          m2Code = m2Code.replace(method.params[i], this.params[i]);
        }
        if (m1Code === m2Code)
          return false; // Parameters renamed and body adjusted accordingly
        else {
          return true;
        }
      }
    }
  }
}

export class ClassPropertyCodeElement {
  constructor(
    public name: string,
    public value: string | null,
    public access: 'public' | 'private',
    public isStatic: boolean,
    public type: string
  ) {}
}

export class FunctionCodeElement extends CodeElement {
  constructor(
    id: number,
    name: string,
    code: string,
    public async: boolean,
    public fileName: string,
    public params: string[],
    public nodeType: CodeElementType
  ) {
    super(id, name, code);
  }

  getFunction(): ChangedFunction {
    return {
      function: this.name,
      file: this.fileName,
      params: this.params.length,
      class: this.name
    };
  }

  isSemanticallyChanged(functionNode: FunctionCodeElement): boolean {
    if (this.async !== functionNode.async) {
      return true;
    }

    if (this.code === functionNode.code) return false;
    else {
      if (isStringArraysEqual(this.params, functionNode.params)) {
        return true; // Parameters have not changed but body has changed
      } else {
        let m1Code = this.code;
        let m2Code = functionNode.code;
        for (let i = 0; i < this.params.length; i++) {
          m2Code = m2Code.replace(this.params[i], functionNode.params[i]);
        }
        if (m1Code === m2Code)
          return false; // Parameters renamed and body adjusted accordingly
        else {
          return true;
        }
      }
    }
  }

  static functionDeclarationToCodeElement(
    astNode: FunctionDeclaration,
    fileName: string,
    id: number
  ): FunctionCodeElement {
    return new FunctionCodeElement(
      id,
      astNode.id?.name || '',
      JSON.stringify(astNode.body),
      astNode.async,
      fileName,
      this.extractParams(astNode.params),
      CodeElementType.FUNCTION_DECLARATION
    );
  }

  static functionExpressionToCodeElement(
    astNode: FunctionExpression | ArrowFunctionExpression,
    fileName: string,
    id: number,
    name: string,
    nodeType: CodeElementType
  ) {
    return new FunctionCodeElement(
      id,
      name,
      JSON.stringify(astNode.body),
      astNode.async,
      fileName,
      this.extractParams(astNode.params),
      nodeType
    );
  }
}

export class UnsupportedCodeElement extends CodeElement {
  isEquivalent(node: CodeElement): boolean {
    return this.code === node.code;
  }
}

/**  Show difference between 2 versions of the project **/
export enum ModificationType {
  RENAME = 'rename', // No re-running of related tests required (IMPORTANT: Need to check uses)
  MODIFY_SIGNATURE = 'modify signature', // Re-run related tests
  MODIFY_BODY = 'modify body', // Re-run related tests
  CHANGE_SYNTAX = 'change syntax' // No re-running of related tests required
}

type GitRenamedFile = {
  oldFileName: string;
  newFileName: string;
  modificationPercentage: number;
};

export class GitChanges {
  public addedFiles: string[] = [];
  public deletedFiles: string[] = [];
  public modifiedFiles: string[] = [];
  public renamedFiles: GitRenamedFile[] = [];

  constructor(gitChanges: string, isFile: boolean) {
    try {
      let changes: string[][] = [];
      if (isFile) {
        changes = readFileSync(gitChanges, 'utf8')
          .split(/\n/)
          .map((line) => line.split(/\t/));
      } else {
        changes = gitChanges.split(/\n/).map((line) => line.split(/\t/));
      }

      changes.forEach((change) => {
        if (change.length > 1) {
          const changeType = change[0];
          switch (changeType) {
            case 'A':
              this.addedFiles.push(change[1]);
              break;
            case 'D':
              this.deletedFiles.push(change[1]);
              break;
            case 'M':
              this.modifiedFiles.push(change[1]);
              break;
            default:
              if (changeType.charAt(0) === 'R')
                this.renamedFiles.push({
                  oldFileName: change[1],
                  newFileName: change[2],
                  modificationPercentage: Number(changeType.substring(1))
                });
              else
                throw new Error('Unexpected change type encountered in file');
          }
        }
      });
    } catch (error: any) {
      throw new GitChangesParsingError(
        `Error parsing file containing git changes. Message: ${error.message}`
      );
    }
  }
}

/* Custom Errors */
class GitChangesParsingError extends Error {}
