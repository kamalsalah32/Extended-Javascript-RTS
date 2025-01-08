import child_process from 'child_process';
import {
  codeBase,
  staticFileDependencyPath
} from './currentEvaluationRunConfig.cjs';

export const buildStaticDependencyGraph = () => {
  child_process.execSync(
    `madge --extensions ts,tsx,js,mjs,cjs,jsx --json ${codeBase} > ${staticFileDependencyPath}`,
    {
      stdio: [0, 1, 2]
    }
  );
};
