import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { clearRuntimeContextForTests, setRuntimeContextForTests } from '../lib/runtime-config.mjs';

export async function captureProcessOutput(action) {
  const stdoutChunks = [];
  const stderrChunks = [];
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = (chunk, encoding, callback) => {
    stdoutChunks.push(String(chunk));

    if (typeof encoding === 'function') {
      encoding();
    }

    if (typeof callback === 'function') {
      callback();
    }

    return true;
  };

  process.stderr.write = (chunk, encoding, callback) => {
    stderrChunks.push(String(chunk));

    if (typeof encoding === 'function') {
      encoding();
    }

    if (typeof callback === 'function') {
      callback();
    }

    return true;
  };

  try {
    const result = await action();

    return {
      result,
      stdout: stdoutChunks.join(''),
      stderr: stderrChunks.join(''),
    };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
}

export function stripAnsi(text) {
  return text.replace(/\u001B\[[0-9;]*m/g, '');
}

export function createTestRuntimeContext(overrides = {}) {
  const workspaceFolder = overrides.workspaceFolder ?? path.join(os.tmpdir(), 'imperiascm-cli-workspace');
  const configPath = overrides.configPath ?? path.join(workspaceFolder, '.vscode', 'imperiascm-cli.config.json');
  const runSelectionStatePath = overrides.runSelectionStatePath ?? path.join(workspaceFolder, '.git', 'task-state', 'imperiascm-cli-run-selection.json');
  const repositories = overrides.repositories ?? [
    {
      key: 'repo-a',
      label: 'repo-a',
      root: workspaceFolder,
      existenceLabel: null,
      buildStateFileName: 'repo-a-build.state',
      solutionPath: path.join(workspaceFolder, 'Backend', 'Backend.sln'),
      buildTaskLabel: '(repo-a) build solution',
    },
    {
      key: 'repo-b',
      label: 'repo-b',
      root: path.join(workspaceFolder, '..', 'repo-b'),
      existenceLabel: 'repo-b repository',
      buildStateFileName: 'repo-b-build.state',
      solutionPath: path.join(workspaceFolder, '..', 'repo-b', 'Backend', 'Backend.sln'),
      buildTaskLabel: '(repo-b) build solution',
    },
  ];
  const repositoriesByKey = new Map(repositories.map((repository) => [repository.key, repository]));
  const services = overrides.services ?? [
    {
      commandName: 'run-repo-b-api',
      description: 'Run the repo-b API service on port 46100',
      title: 'API',
      repoKey: 'repo-b',
      runtime: '.NET',
      ports: [46100],
      cwd: repositoriesByKey.get('repo-b').root,
      env: { ASPNETCORE_ENVIRONMENT: 'Development' },
      command: 'dotnet',
      args: ['run'],
      preflight: [],
      preflightTitle: null,
    },
    {
      commandName: 'run-repo-b-proxy',
      description: 'Run the repo-b proxy service on port 46101',
      title: 'Proxy',
      repoKey: 'repo-b',
      runtime: '.NET',
      ports: [46101],
      cwd: repositoriesByKey.get('repo-b').root,
      env: { ASPNETCORE_ENVIRONMENT: 'Development' },
      command: 'dotnet',
      args: ['run'],
      preflight: [],
      preflightTitle: null,
    },
    {
      commandName: 'run-repo-a-api',
      description: 'Run the repo-a API service on port 46102',
      title: 'API',
      repoKey: 'repo-a',
      runtime: '.NET',
      ports: [46102],
      cwd: repositoriesByKey.get('repo-a').root,
      env: { ASPNETCORE_ENVIRONMENT: 'Development' },
      command: 'dotnet',
      args: ['run'],
      preflight: [],
      preflightTitle: null,
    },
    {
      commandName: 'run-repo-b-web',
      description: 'Run the repo-b web app',
      title: 'Web',
      repoKey: 'repo-b',
      runtime: 'Web',
      ports: [46110],
      cwd: path.join(repositoriesByKey.get('repo-b').root, 'Frontend'),
      env: {},
      command: 'npm.cmd',
      args: ['start'],
      preflight: [],
      preflightTitle: null,
    },
    {
      commandName: 'run-repo-a-web',
      description: 'Run the repo-a web app',
      title: 'Web',
      repoKey: 'repo-a',
      runtime: 'Web',
      ports: [46111],
      cwd: path.join(repositoriesByKey.get('repo-a').root, 'Frontend'),
      env: {},
      command: 'npm.cmd',
      args: ['start'],
      preflight: [],
      preflightTitle: null,
    },
  ];

  return {
    configPath,
    workspaceFolder,
    workspaceName: overrides.workspaceName ?? 'test-workspace',
    repositoryTasks: overrides.repositoryTasks ?? {
      syncMaxConcurrentRepositories: 1,
      buildMaxConcurrentRepositories: 1,
    },
    repositories,
    repositoriesByKey,
    services,
    servicesByCommandName: new Map(services.map((service) => [service.commandName, service])),
    runSelectionStatePath,
  };
}

export function useTestRuntimeContext(contextOverrides = {}) {
  const context = createTestRuntimeContext(contextOverrides);
  setRuntimeContextForTests(context);
  return context;
}

export function clearTestRuntimeContext() {
  clearRuntimeContextForTests();
}
