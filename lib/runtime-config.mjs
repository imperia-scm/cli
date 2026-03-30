import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export const npmRegistryUrl = 'https://registry.npmjs.org/';
export const npmAuthTokenKey = '//registry.npmjs.org/:_authToken';
export const isWindows = process.platform === 'win32';
export const nodeCommand = process.execPath;
export const npmCommand = isWindows ? 'npm.cmd' : 'npm';

let runtimeContext = null;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resolveTemplateString(value, variables) {
  return value.replace(/\$\{([^}]+)\}/g, (match, key) => {
    if (!Object.hasOwn(variables, key)) {
      throw new Error(`Unknown template variable: ${match}`);
    }

    return variables[key];
  });
}

function resolveTemplates(value, variables) {
  if (typeof value === 'string') {
    return resolveTemplateString(value, variables);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolveTemplates(entry, variables));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, resolveTemplates(entryValue, variables)]),
    );
  }

  return value;
}

function normalizeStringRecord(value = {}) {
  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key, String(entryValue)]),
  );
}

function normalizePositiveInteger(value, fieldName, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${fieldName} must be an integer greater than or equal to 1.`);
  }

  return value;
}

function normalizeRepositoryTasks(repositoryTasks = {}) {
  if (!isPlainObject(repositoryTasks)) {
    throw new Error('repositoryTasks must be an object when provided.');
  }

  return {
    syncMaxConcurrentRepositories: normalizePositiveInteger(
      repositoryTasks.syncMaxConcurrentRepositories,
      'repositoryTasks.syncMaxConcurrentRepositories',
      1,
    ),
    buildMaxConcurrentRepositories: normalizePositiveInteger(
      repositoryTasks.buildMaxConcurrentRepositories,
      'repositoryTasks.buildMaxConcurrentRepositories',
      1,
    ),
  };
}

function parseCliOptions(argv) {
  let configPath = null;
  const commandArgv = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--config') {
      const nextValue = argv[index + 1];

      if (!nextValue) {
        throw new Error('Missing value for --config.');
      }

      configPath = nextValue;
      index += 1;
      continue;
    }

    if (argument.startsWith('--config=')) {
      configPath = argument.slice('--config='.length);
      continue;
    }

    commandArgv.push(argument);
  }

  return { configPath, commandArgv };
}

function resolveConfigPath(configPath, cwd) {
  if (configPath) {
    return path.resolve(cwd, configPath);
  }

  return path.join(cwd, '.vscode', 'imperia-cli.config.json');
}

export function inspectCliOptions(argv, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const { configPath: configPathOption, commandArgv } = parseCliOptions(argv);

  return {
    cwd,
    commandArgv,
    configPath: resolveConfigPath(configPathOption, cwd),
  };
}

function normalizeRepository(repository) {
  if (!repository?.key) {
    throw new Error('Every repository entry must define a key.');
  }

  if (!repository.root) {
    throw new Error(`Repository "${repository.key}" must define a root.`);
  }

  if (!repository.solutionPath) {
    throw new Error(`Repository "${repository.key}" must define a solutionPath.`);
  }

  return {
    key: repository.key,
    label: repository.label ?? repository.key,
    root: path.resolve(repository.root),
    existenceLabel: repository.existenceLabel ?? null,
    buildStateFileName: repository.buildStateFileName ?? `${repository.key}-build.state`,
    solutionPath: path.resolve(repository.solutionPath),
    buildTaskLabel: repository.buildTaskLabel ?? `(${repository.key}) build solution`,
  };
}

function normalizePreflightStep(step, service) {
  if (step.type === 'npm-auth') {
    return {
      type: 'npm-auth',
      label: step.label ?? 'Validate npm authentication',
      cwd: step.cwd ? path.resolve(step.cwd) : service.cwd,
    };
  }

  if (!step.command) {
    throw new Error(`Service "${service.commandName}" preflight steps must define a command.`);
  }

  return {
    type: 'command',
    label: step.label ?? step.description ?? step.command,
    command: step.command,
    args: Array.isArray(step.args) ? step.args.map(String) : [],
    cwd: step.cwd ? path.resolve(step.cwd) : service.cwd,
    env: normalizeStringRecord(step.env),
  };
}

function normalizeService(service, repositoriesByKey) {
  if (!service?.commandName) {
    throw new Error('Every service entry must define a commandName.');
  }

  if (!service.repoKey) {
    throw new Error(`Service "${service.commandName}" must define a repoKey.`);
  }

  const repository = repositoriesByKey.get(service.repoKey);

  if (!repository) {
    throw new Error(`Service "${service.commandName}" references an unknown repository "${service.repoKey}".`);
  }

  if (!service.command) {
    throw new Error(`Service "${service.commandName}" must define a command.`);
  }

  const normalizedService = {
    commandName: service.commandName,
    description: service.description ?? service.commandName,
    title: service.title ?? service.commandName,
    repoKey: service.repoKey,
    runtime: service.runtime ? String(service.runtime) : null,
    ports: Array.isArray(service.ports) ? service.ports.map((port) => Number(port)) : [],
    cwd: service.cwd ? path.resolve(service.cwd) : repository.root,
    env: normalizeStringRecord(service.env),
    command: service.command,
    args: Array.isArray(service.args) ? service.args.map(String) : [],
    preflight: [],
    preflightTitle: service.preflightTitle ?? null,
  };

  normalizedService.preflight = Array.isArray(service.preflight)
    ? service.preflight.map((step) => normalizePreflightStep(step, normalizedService))
    : [];

  return normalizedService;
}

function buildRuntimeContext(rawConfig, configPath) {
  const configDir = path.dirname(configPath);
  const workspaceFolder = path.resolve(configDir, '..');
  const variables = {
    workspaceFolder,
    configDir,
  };
  const expandedConfig = resolveTemplates(rawConfig, variables);
  const repositories = Array.isArray(expandedConfig.repositories)
    ? expandedConfig.repositories.map(normalizeRepository)
    : [];

  if (repositories.length === 0) {
    throw new Error('The workspace config must define at least one repository.');
  }

  const repositoriesByKey = new Map(repositories.map((repository) => [repository.key, repository]));
  const services = Array.isArray(expandedConfig.services)
    ? expandedConfig.services.map((service) => normalizeService(service, repositoriesByKey))
    : [];
  const servicesByCommandName = new Map(services.map((service) => [service.commandName, service]));
  const runSelectionStatePath = expandedConfig.state?.runSelectionPath
    ? path.resolve(expandedConfig.state.runSelectionPath)
    : path.join(workspaceFolder, '.git', 'task-state', 'imperia-cli-run-selection.json');
  const repositoryTasks = normalizeRepositoryTasks(expandedConfig.repositoryTasks);

  return {
    configPath,
    workspaceFolder,
    workspaceName: expandedConfig.workspace?.name ?? path.basename(workspaceFolder),
    repositoryTasks,
    repositories,
    repositoriesByKey,
    services,
    servicesByCommandName,
    runSelectionStatePath,
  };
}

export async function loadRuntimeContextFromArgv(argv, options = {}) {
  const { cwd, commandArgv, configPath } = inspectCliOptions(argv, options);
  const fileText = await fs.readFile(configPath, 'utf8');
  const rawConfig = JSON.parse(fileText);
  const context = buildRuntimeContext(rawConfig, configPath);

  runtimeContext = context;

  return {
    commandArgv,
    context,
  };
}

export function getRuntimeContext() {
  if (!runtimeContext) {
    throw new Error('Runtime context has not been initialized.');
  }

  return runtimeContext;
}

export function hasRuntimeContext() {
  return runtimeContext !== null;
}

export function setRuntimeContextForTests(context) {
  runtimeContext = context;
}

export function clearRuntimeContextForTests() {
  runtimeContext = null;
}
