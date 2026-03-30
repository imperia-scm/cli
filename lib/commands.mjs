import { ensureNpmUserAuthentication } from './npm-auth.mjs';
import { runCommand, runService } from './process-runner.mjs';
import { createProgressReporter } from './progress.mjs';
import { getRepositoryOrder } from './repositories.mjs';
import { hasRuntimeContext } from './runtime-config.mjs';
import { runInteractiveCommand } from './run-command.mjs';
import { readResolvedRunSelectionState, setRunLaunchState, takeRunLaunchCommand } from './run-selection-state.mjs';
import { getServiceDefinition, getServiceDefinitions } from './services.mjs';
import { runInitCommand } from './init-workspace.mjs';
import {
  ensureRepositoryAvailable,
  runGitSync,
  runPrepare as runPrepareRepositories,
  runRebuildRepository,
  runStopServices,
} from './workspace-actions.mjs';

async function runConfiguredService(commandName) {
  const service = getServiceDefinition(commandName);

  await ensureRepositoryAvailable(service.repoKey);

  if (service.preflight.length > 0) {
    const progress = createProgressReporter(
      commandName,
      service.preflight.length,
      service.preflightTitle ?? `Preparing ${service.title}.`,
    );

    for (const step of service.preflight) {
      await progress.runStep(step.label, async () => {
        if (step.type === 'npm-auth') {
          await ensureNpmUserAuthentication(step.cwd);
          return;
        }

        await runCommand({
          scope: commandName,
          description: step.label,
          command: step.command,
          args: step.args,
          cwd: step.cwd,
          env: step.env,
          outputMode: 'capture-on-fail',
          successOutputSummary: true,
        });
      });
    }

    progress.finish('Service preflight completed. Starting process.');
  }

  await runService(service.commandName, service.command, service.args, service.cwd, service.env);
}

async function runPrepareSharedRepositories() {
  await runPrepareRepositories({
    repoKeys: getRepositoryOrder(),
    scope: 'prepare',
    title: 'Preparing repositories and shared services.',
  });
}

async function runPrepareSelectedRepositories() {
  const selection = await readResolvedRunSelectionState();

  if (selection.selectedServices.length === 0) {
    await setRunLaunchState({ launchMode: null });
    return;
  }

  await runPrepareRepositories({
    repoKeys: selection.repoKeys,
    syncGitRepoKeys: selection.syncGitRepoKeys,
    services: selection.selectedServices,
    scope: 'run',
    title: 'Preparing selected repositories and services.',
  });

  await setRunLaunchState({
    launchMode: 'selected',
    commandNames: selection.selectedCommandNames,
  });
}

async function runTaskService(args = []) {
  const commandName = args[0];

  if (!commandName) {
    throw new Error('[run-task-service] Missing service command name.');
  }

  getServiceDefinition(commandName);

  const launchState = await takeRunLaunchCommand(commandName);

  if (launchState.launchMode) {
    if (!launchState.shouldRun) {
      return;
    }

    await runConfiguredService(commandName);
    return;
  }

  await runPrepareSharedRepositories();
  await runConfiguredService(commandName);
}

async function runRebuild(args = []) {
  const repoKey = args[0];

  if (!repoKey) {
    throw new Error('[rebuild] Missing repository key.');
  }

  await runRebuildRepository(repoKey);
}

export function buildCommandDefinitions() {
  const serviceDefinitions = hasRuntimeContext() ? getServiceDefinitions() : [];

  return {
    init: {
      description: 'Bootstrap .vscode/tasks.json and imperia-cli.config.json for the current workspace',
      run: runInitCommand,
    },
    run: {
      description: 'Interactively select services for the VS Code run tasks',
      run: runInteractiveCommand,
    },
    'git-sync': {
      description: 'Sync configured repositories',
      run: () => runGitSync(getRepositoryOrder()),
    },
    'stop-services': {
      description: 'Stop processes bound to the managed local service ports',
      run: runStopServices,
    },
    rebuild: {
      description: 'Rebuild a configured repository backend',
      run: runRebuild,
    },
    prepare: {
      description: 'Sync repositories, stop services and rebuild configured backends',
      run: runPrepareSharedRepositories,
    },
    'prepare-selected-run': {
      description: 'Prepare the repositories needed by the current run selection',
      run: runPrepareSelectedRepositories,
      hidden: true,
    },
    'run-task-service': {
      description: 'Run a service task either from the current launch state or as a standalone service task',
      run: runTaskService,
      hidden: true,
    },
    ...Object.fromEntries(
      serviceDefinitions.map((service) => [
        service.commandName,
        {
          description: service.description,
          run: () => runConfiguredService(service.commandName),
          hidden: true,
        },
      ]),
    ),
  };
}

export function createCommandRegistry() {
  const commandDefinitions = buildCommandDefinitions();
  const commands = Object.fromEntries(
    Object.entries(commandDefinitions).map(([name, definition]) => [name, definition.run]),
  );

  return {
    commandDefinitions,
    commands,
  };
}
