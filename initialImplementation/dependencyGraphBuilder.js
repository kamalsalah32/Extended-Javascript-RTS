import ASTgenerater from './ASTgenerater.cjs';
import fs from 'fs';

import Injector from './instrument/instrumentor.cjs';
import path from 'path';
import axios from 'axios';
import child_process from 'child_process';
import {
  repo,
  codeBase,
  evaluationResultsFolder,
  staticFileDependencyPath,
  testRunner,
  testRunnerVersion,
  testCommand,
  dependenciesInstallationCommand
} from './currentEvaluationRunConfig.cjs';

const SRTlibPath = './instrument/SRTlib.js';
const InstrumentorSrc = './instrument/';
const excepts = ['../uppy/babel.config.js'];

export const setupRtsDependencyGraphs = async (commitBefore) => {
  // Checkout previous commit since the assumption is a dynamic dependency graph existsand will be maintained
  await repo.checkout(commitBefore);

  // Inject code with loggers and save the dependency between tests and functions in dependencyGraph.json
  // the dictionary of all functions is saved in functionsMap.json
  const allTestNamesSet = await buildDynamicDependencyGraph();
  buildStaticDependencyGraph();
  fs.writeFileSync(
    path.join(evaluationResultsFolder, 'allTests.json'),
    JSON.stringify(Array.from(allTestNamesSet))
  );
};

const buildDynamicDependencyGraph = async () => {
  //init
  if (codeBase.endsWith('/')) {
    codeBase = codeBase.substring(0, codeBase.length - 1);
  }

  let injectedCodebase = codeBase + '-injected';

  // generate AST for codebase
  ASTgenerater.generate(codeBase, excepts);

  // create injected dir
  console.log('making injected folder', injectedCodebase);
  if (!fs.existsSync(injectedCodebase)) {
    fs.mkdirSync(injectedCodebase);
  }
  ASTgenerater.copyDir(codeBase, injectedCodebase);

  const codeInjector = new Injector(codeBase);

  codeInjector.getInjected();

  console.log('injection complete!');
  // update package.json jest configuration

  const injectedPackageJson = JSON.parse(
    fs.readFileSync(path.join(injectedCodebase, 'package.json'))
  );

  injectedPackageJson.dependencies = {
    SRTutil: 'file:./SRTutil',
    axios: '1.7.5'
  };

  injectedPackageJson.dependencies[testRunner] = testRunnerVersion;

  fs.writeFileSync(
    injectedCodebase + '/package.json',
    JSON.stringify(injectedPackageJson)
  );

  // copy SRTlib.js to injected node_modules
  // ! use package.json dependency "file:"
  const SRTUtilFolder = path.join(injectedCodebase, 'SRTutil');
  if (!fs.existsSync(SRTUtilFolder)) {
    fs.mkdirSync(SRTUtilFolder);
  }
  fs.copyFileSync(
    path.join(InstrumentorSrc, 'SRTpackage.json'),
    path.join(injectedCodebase, 'SRTutil', 'package.json')
  );
  fs.copyFileSync(SRTlibPath, path.join(SRTUtilFolder, 'index.js'));
  fs.copyFileSync(
    path.join(InstrumentorSrc, 'SRTTypeDefinitions.d.ts'),
    path.join(injectedCodebase, 'SRTutil', 'SRTutil.d.ts')
  );

  //run npm install in injected folder

  installDependenciesAndRunTests(injectedCodebase);

  console.log('Running tests: DONE');

  // get call graph
  let callGraph;

  await axios.get('http://localhost:8888/log-path').then((res) => {
    callGraph = fs.readFileSync(res.data.path);
    callGraph = '[' + callGraph + ']';
    callGraph = callGraph.replace(/,]/g, ']');
    fs.writeFileSync(res.data.path + '.json', callGraph);
    fs.unlinkSync(res.data.path);
    console.log('SUCCESS');
  });

  console.log('finished!');
  return codeInjector.testNames;
};

const buildStaticDependencyGraph = () => {
  child_process.execSync(
    `madge --extensions ts,tsx,js,mjs,cjs,jsx --json ${codeBase} > ${staticFileDependencyPath}`,
    {
      stdio: [0, 1, 2]
    }
  );
};

const installDependenciesAndRunTests = (injectedCodebase) => {
  child_process.execSync(
    `cd ${injectedCodebase} && ${dependenciesInstallationCommand}`,
    {
      stdio: [0, 1, 2]
    }
  );

  // run tests in injected codebase
  child_process.execSync(`cd ${injectedCodebase} && ${testCommand}`, {
    stdio: [0, 1, 2]
  });
};
