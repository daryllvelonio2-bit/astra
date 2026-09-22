import { ExecutionResult } from './types';

export async function runClientJavaScript(code: string): Promise<ExecutionResult> {
  let logs: string[] = [];
  const customConsole = {
    log: (...args: any[]) => {
      logs.push(args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg))).join(' '));
    },
    error: (...args: any[]) => {
      logs.push('[Error] ' + args.join(' '));
    },
    warn: (...args: any[]) => {
      logs.push('[Warn] ' + args.join(' '));
    },
  };

  try {
    // Create a sandboxed function execution with overridden console
    const runFn = new Function('console', `
      try {
        ${code}
      } catch (err) {
        console.error(err.message);
      }
    `);

    runFn(customConsole);

    return {
      stdout: logs.join('\n'),
      stderr: '',
      exitCode: 0,
    };
  } catch (err: any) {
    return {
      stdout: logs.join('\n'),
      stderr: err.message || String(err),
      exitCode: 1,
    };
  }
}
