import { ensureNpmUserAuthentication } from './npm-auth.mjs';
import { runCommand, runService, runServiceGroup } from './process-runner.mjs';
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

async function prepareConfiguredService(service) {
  await ensureRepositoryAvailable(service.repoKey);

  if (service.preflight.length > 0) {
    const progress = createProgressReporter(
      service.commandName,
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
          scope: service.commandName,
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
}

async function runConfiguredService(commandName) {
  const service = getServiceDefinition(commandName);

  await prepareConfiguredService(service);

  await runService(service.commandName, service.command, service.args, service.cwd, service.env);
}

async function runPrepareSharedRepositories() {
  await runPrepareRepositories({
    repoKeys: getRepositoryOrder(),
    scope: 'prepare-workspace',
    title: 'Preparing repositories and shared services.',
  });
}

async function prepareResolvedSelection(selection, options = {}) {
  if (selection.selectedServices.length === 0) {
    return false;
  }

  await runPrepareRepositories({
    repoKeys: selection.repoKeys,
    syncGitRepoKeys: selection.syncGitRepoKeys,
    services: selection.selectedServices,
    scope: options.scope ?? 'launch-services',
    title: options.title ?? 'Preparing selected repositories and services.',
  });

  return true;
}

async function runPrepareSelectedLaunch() {
  const selection = await readResolvedRunSelectionState();

  if (!(await prepareResolvedSelection(selection, {
    scope: 'launch-services',
    title: 'Preparing selected repositories and services.',
  }))) {
    await setRunLaunchState({ launchMode: null });
    return false;
  }

  await setRunLaunchState({
    launchMode: 'selected',
    commandNames: selection.selectedCommandNames,
  });

  return true;
}

async function runLaunchTaskService(args = []) {
  const commandName = args[0];

  if (!commandName) {
    throw new Error('[launch-service] Missing service command name.');
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

async function runConfiguredServices(services, options = {}) {
  for (const service of services) {
    await prepareConfiguredService(service);
  }

  await (options.runServiceGroupFn ?? runServiceGroup)(services.map((service) => ({
    commandName: service.commandName,
    command: service.command,
    args: service.args,
    cwd: service.cwd,
    env: service.env,
  })));
}

export async function runServiceCommand(args = [], options = {}) {
  const commandName = args[0];

  if (!commandName) {
    throw new Error('[run-service] Missing service command name. Use `imp run-service <service-command>` or `imp launch-services`.');
  }

  getServiceDefinition(commandName);
  await (options.runPrepareSharedRepositoriesFn ?? runPrepareSharedRepositories)();
  await (options.runConfiguredServiceFn ?? runConfiguredService)(commandName);
}

export async function launchCommand(args = [], options = {}) {
  const selection = await (options.selectServicesFn ?? runInteractiveCommand)();

  if (!selection || selection.cancelled || selection.selectedServices.length === 0) {
    return;
  }

  const resolvedSelection = await (options.readSelectionFn ?? readResolvedRunSelectionState)();
  const prepareSelectionFn = options.prepareSelectionFn ?? prepareResolvedSelection;
  const prepared = await prepareSelectionFn(resolvedSelection, {
    scope: 'launch-services',
    title: 'Preparing selected repositories and services.',
  });

  if (!prepared) {
    return;
  }

  await (options.runConfiguredServicesFn ?? runConfiguredServices)(resolvedSelection.selectedServices);
}

async function runRebuild(args = []) {
  const repoKey = args[0];

  if (!repoKey) {
    throw new Error('[build-solution] Missing repository key.');
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
    'run-service': {
      description: 'Run one configured service by command name after shared repository preparation',
      run: runServiceCommand,
    },
    'launch-services': {
      description: 'Interactively select services, prepare their repositories, and launch them',
      run: launchCommand,
    },
    'sync-repository': {
      description: 'Fetch and pull configured repositories when upstream changes exist',
      run: () => runGitSync(getRepositoryOrder()),
    },
    'stop-services': {
      description: 'Stop processes bound to the managed local service ports',
      run: runStopServices,
    },
    'build-solution': {
      description: 'Build the configured backend solution for one repository',
      run: runRebuild,
    },
    'prepare-workspace': {
      description: 'Synchronize repositories, stop managed services, and build selected backend solutions',
      run: runPrepareSharedRepositories,
    },
    'select-services-to-launch': {
      description: 'Interactively select services for the launch flow',
      run: runInteractiveCommand,
      hidden: true,
    },
    'prepare-services-to-launch': {
      description: 'Prepare the repositories needed by the current launch selection',
      run: runPrepareSelectedLaunch,
      hidden: true,
    },
    'launch-service': {
      description: 'Run one generated launch task service from the current launch state or as a standalone task',
      run: runLaunchTaskService,
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
