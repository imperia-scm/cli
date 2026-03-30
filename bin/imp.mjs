#!/usr/bin/env node

import process from 'node:process';
import { createCommandRegistry } from '../lib/commands.mjs';
import { runStartupTasks } from '../lib/main.mjs';
import { inspectCliOptions, loadRuntimeContextFromArgv } from '../lib/runtime-config.mjs';

const vscodeTaskEnvironmentKey = 'IMPERIA_CLI_VSCODE_TASK';

function isRunningFromVsCodeTask() {
  return process.env[vscodeTaskEnvironmentKey] === '1';
}

const parsedCliOptions = inspectCliOptions(process.argv.slice(2));
const isInitCommand = parsedCliOptions.commandArgv[0] === 'init';

if (!isInitCommand && !isRunningFromVsCodeTask()) {
  console.error('This CLI can only be started from VS Code tasks.');
  console.error('Use Ctrl+Shift+B or run a task from .vscode/tasks.json.');
  process.exit(1);
}

try {
  let commandArgv = parsedCliOptions.commandArgv;

  if (!isInitCommand) {
    const runtimeContext = await loadRuntimeContextFromArgv(process.argv.slice(2));
    commandArgv = runtimeContext.commandArgv;
  }

  const registry = createCommandRegistry();
  const exitCode = await runStartupTasks(commandArgv, registry);
  process.exit(exitCode);
} catch (error) {
  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(error);
  }

  process.exit(1);
}
