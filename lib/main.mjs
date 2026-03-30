import { registerSignalHandlers } from './process-runner.mjs';
import {
  buildUsageText,
  finishSession,
  renderError,
  startSession,
} from './terminal-ui.mjs';

function printUsage(commandDefinitions) {
  console.log(buildUsageText(commandDefinitions));
}

export async function runStartupTasks(argv, { commandDefinitions, commands }) {
  registerSignalHandlers();

  const commandName = argv[0];

  if (!commandName || commandName === '--help' || commandName === '-h' || commandName === 'help') {
    printUsage(commandDefinitions);
    return 0;
  }

  if (!commands[commandName]) {
    console.error(`Unknown command: ${commandName}`);
    console.error('');
    printUsage(commandDefinitions);
    return 1;
  }

  startSession(commandName);

  try {
    await commands[commandName](argv.slice(1));
    finishSession('ok');
    return 0;
  } catch (error) {
    renderError(error);
    finishSession('fail');
    return 1;
  }
}
