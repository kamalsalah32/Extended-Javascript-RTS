import babelWalk, { SimpleVisitors } from 'babel-walk';
import {
  Expression,
  File,
  isV8IntrinsicIdentifier,
  Super,
  V8IntrinsicIdentifier,
  Node,
  isStringLiteral
} from '@babel/types';
import generate from '@babel/generator';

const actualGenerate = (generate as any).default || generate;

type TestsState = {
  // currentTestFileName: string;
  // testsMap: TestsMap;
  tests: Test[];
};
type TestsMap = { [testFileName: string]: Test[] };

type Test = {
  callee: string;
  testName: string;
  testBody: string;
};

const getCalleeName = (callee: Expression | Super | V8IntrinsicIdentifier) => {
  if (isV8IntrinsicIdentifier(callee)) return callee.name;
  return undefined;
};

const isTest = (name: string) => {
  return ['it', 'test'].includes(name);
};

const isTestSuite = (name: string) => {
  return ['describe'].includes(name);
};

const toString = (node: Node) => {
  if (isStringLiteral(node)) return node.value;
  return JSON.stringify(node);
};

const addTestToTestsMap = (
  callee: string,
  testName: string,
  testBody: string,
  // fileName: string,
  testsState: TestsState
) => {
  const test = {
    callee,
    testName,
    testBody
  };
  // testsState.testsMap[fileName] ??= [];
  // testsState.testsMap[fileName].push(test);
  testsState.tests.push(test);
};

export class TestFileAnalyzer {
  public static TestFileVisitors: SimpleVisitors<TestsState> = {
    CallExpression(node, state) {
      const callee = actualGenerate(node.callee).code;
      if (callee && isTest(callee)) {
        const testName = actualGenerate(node.arguments[0]).code;
        const testBody = node.arguments[1]
          ? JSON.stringify(node.arguments[1])
          : '';
        addTestToTestsMap(callee, testName, testBody, state);
      }
    }
  };

  getChangedTests(babelAstBefore: File, babelAstAfter: File): string[] {
    const testsBefore = this.getTestsFromAst(babelAstBefore);
    const testsAfter = this.getTestsFromAst(babelAstAfter);
    const testsToRun: string[] = [];

    testsAfter.forEach((testAfter) => {
      const hasEquivalentMethod = testsBefore.some((testBefore) => {
        return (
          testAfter.testName === testBefore.testName &&
          testAfter.testBody === testBefore.testBody &&
          testAfter.callee === testBefore.callee
        );
      });

      if (!hasEquivalentMethod) {
        testsToRun.push(testAfter.testName);
      }
    });

    return testsToRun;
  }

  getTestsFromAst(
    // fileName: string,
    babelAst: File,
    testsState?: TestsState
  ): Test[] {
    if (!testsState)
      testsState = {
        tests: []
      };

    this.getTests(babelAst, testsState);
    return testsState.tests;
  }

  private getTests(babelAst: File, testsState: TestsState): void {
    babelWalk.simple<TestsState>(TestFileAnalyzer.TestFileVisitors)(
      babelAst,
      testsState
    );
  }
}
