import { readFileSync } from 'fs';
import generate from '@babel/generator';
const isStringArraysEqual = (arr1, arr2) => {
  let arr1Length = arr1.length;
  if (arr1Length !== arr2.length) return false;
  for (let i = 0; i < arr1Length; i++) {
    if (arr1[i] !== arr2[i]) return false;
  }
  return true;
};
export var CodeElementType;
(function (CodeElementType) {
  CodeElementType['FILE'] = 'Program';
  CodeElementType['FUNCTION_DECLARATION'] = 'FunctionDeclaration';
  CodeElementType['FUNCTION_EXPRESSION'] = 'FunctionExpression';
  CodeElementType['ARROW_FUNCTION_EXPRESSION'] = 'ArrowFunctionExpression';
  CodeElementType['CLASS_DECLARATION'] = 'ClassDeclaration';
  CodeElementType['CLASS_EXPRESSION'] = 'ClassExpression';
  CodeElementType['CLASS_METHOD'] = 'ClassMethod';
  CodeElementType['CLASS_PRIVATE_METHOD'] = 'ClassPrivateMethod';
  CodeElementType['CLASS_PROPERTY'] = 'ClassProperty';
  CodeElementType['CLASS_PRIVATE_PROPERTY'] = 'ClassPrivateProperty';
  CodeElementType['VARIABLE_DECLARATION'] = 'VariableDeclaration';
  CodeElementType['VARIABLE_DECLARATOR'] = 'VariableDeclarator';
  CodeElementType['UNSUPPORTED_NODE_TYPE'] = 'UnsupportedNodeType';
})(CodeElementType || (CodeElementType = {}));
export class CodeElement {
  id;
  name;
  code;
  constructor(id, name, code) {
    this.id = id;
    this.name = name;
    this.code = code;
  }
  static extractParams(parameters) {
    return parameters.map((param) => {
      if (param.type === 'Identifier') return param.name;
      else return JSON.stringify(param);
    });
  }
}
export class FileCodeElement extends CodeElement {
  constructor(id, name, code) {
    super(id, name, code);
  }
  static astNodeToCodeElement(astNode, id, fileName) {
    return new FileCodeElement(id, fileName, JSON.stringify(astNode.body));
  }
}
export class ClassCodeElement extends CodeElement {
  methods;
  properties;
  fileName;
  superClass;
  nodeType;
  constructor(
    id,
    name,
    code,
    methods,
    properties,
    fileName,
    superClass,
    nodeType
  ) {
    super(id, name, code);
    this.methods = methods;
    this.properties = properties;
    this.fileName = fileName;
    this.superClass = superClass;
    this.nodeType = nodeType;
  }
  static classDeclarationToCodeElement(astNode, fileName, id) {
    const classCodeElement = new ClassCodeElement(
      id,
      astNode.id?.name || '',
      JSON.stringify(astNode.body),
      [],
      [],
      fileName,
      !astNode.superClass ? null : generate.default(astNode.superClass).code,
      CodeElementType.CLASS_DECLARATION
    );
    this.buildClassBodyNodes(classCodeElement, astNode.body);
    return classCodeElement;
  }
  static classExpressionToCodeElement(astNode, fileName, id, name) {
    const classCodeElement = new ClassCodeElement(
      id,
      name,
      JSON.stringify(astNode.body),
      [],
      [],
      fileName,
      !astNode.superClass ? null : generate.default(astNode.superClass).code,
      CodeElementType.CLASS_EXPRESSION
    );
    this.buildClassBodyNodes(classCodeElement, astNode.body);
    return classCodeElement;
  }
  static extractClassNodeName(key) {
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
  static buildClassBodyNodes(classCodeElement, classBody) {
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
          propertyCode = generate.default(classBodyNode).code;
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
          propertyCode = generate.default(classBodyNode).code;
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
  shouldFallbackToFileDependency(afterNode) {
    if (this.code === afterNode.code) return false; // class has not changed in any way
    if (this.superClass && !afterNode.superClass) return true; // super class has been removed
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
      if (!hasEquivalentProperty) {
        return true;
      }
    }
    return false;
  }
  getSemanticallyChangedMethods(afterNode) {
    console.log(
      `Retrieving changed methods between versions of class "${this.name}"`
    );
    if (this.code === afterNode.code) return [];
    // Checking class methods
    const beforeMethods = [...this.methods];
    const afterMethods = [...afterNode.methods];
    const changedMethods = [];
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
  getMethods() {
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
  name;
  access;
  isStatic;
  kind;
  async;
  code;
  params;
  constructor(name, access, isStatic, kind, async, code, params) {
    this.name = name;
    this.access = access;
    this.isStatic = isStatic;
    this.kind = kind;
    this.async = async;
    this.code = code;
    this.params = params;
  }
  isSemanticallyChanged(method) {
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
  name;
  value;
  access;
  isStatic;
  type;
  constructor(name, value, access, isStatic, type) {
    this.name = name;
    this.value = value;
    this.access = access;
    this.isStatic = isStatic;
    this.type = type;
  }
}
export class FunctionCodeElement extends CodeElement {
  async;
  fileName;
  params;
  nodeType;
  constructor(id, name, code, async, fileName, params, nodeType) {
    super(id, name, code);
    this.async = async;
    this.fileName = fileName;
    this.params = params;
    this.nodeType = nodeType;
  }
  getFunction() {
    return {
      function: this.name,
      file: this.fileName,
      params: this.params.length,
      class: this.name
    };
  }
  isSemanticallyChanged(functionNode) {
    if (this.async !== functionNode.async) {
      return true;
    }
    if (this.code === functionNode.code) return false;
    else {
      if (isStringArraysEqual(this.params, functionNode.params)) {
        return true; // Parameters have not changed but body has changed
      } else {
        let m1Code = this.code;
        let m2Code = this.code;
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
  static functionDeclarationToCodeElement(astNode, fileName, id) {
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
    astNode,
    fileName,
    id,
    name,
    nodeType
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
  isEquivalent(node) {
    return this.code === node.code;
  }
}
/**  Show difference between 2 versions of the project **/
export var ModificationType;
(function (ModificationType) {
  ModificationType['RENAME'] = 'rename';
  ModificationType['MODIFY_SIGNATURE'] = 'modify signature';
  ModificationType['MODIFY_BODY'] = 'modify body';
  ModificationType['CHANGE_SYNTAX'] = 'change syntax'; // No re-running of related tests required
})(ModificationType || (ModificationType = {}));
export class GitChanges {
  addedFiles = [];
  deletedFiles = [];
  modifiedFiles = [];
  renamedFiles = [];
  constructor(gitChanges, isFile) {
    try {
      let changes = [];
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
    } catch (error) {
      throw new GitChangesParsingError(
        `Error parsing file containing git changes. Message: ${error.message}`
      );
    }
  }
}
/* Custom Errors */
class GitChangesParsingError extends Error {}
