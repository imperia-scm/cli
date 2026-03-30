import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { clearRuntimeContextForTests, inspectCliOptions, loadRuntimeContextFromArgv } from '../lib/runtime-config.mjs';

test('inspectCliOptions defaults to the imperia-cli workspace config path', () => {
  const cwd = path.join('C:', 'workspace', 'repo');
  const parsed = inspectCliOptions(['prepare-workspace'], { cwd });

  assert.deepEqual(parsed.commandArgv, ['prepare-workspace']);
  assert.equal(parsed.configPath, path.join(cwd, '.vscode', 'imperia-cli.config.json'));
});

test('loadRuntimeContextFromArgv expands workspace placeholders and service definitions', async (t) => {
  const workspaceFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'imperia-cli-config-'));
  const configDir = path.join(workspaceFolder, '.vscode');
  const configPath = path.join(configDir, 'imperia-cli.config.json');

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({
    workspace: { name: 'fixture' },
    repositoryTasks: {
      syncMaxConcurrentRepositories: 4,
      buildMaxConcurrentRepositories: 2,
    },
    repositories: [
      {
        key: 'repo-a',
        root: '${workspaceFolder}',
        solutionPath: '${workspaceFolder}/Backend/Backend.sln',
        buildTaskLabel: '(repo-a) build solution',
      },
      {
        key: 'repo-b',
        root: '${workspaceFolder}/../repo-b',
        solutionPath: '${workspaceFolder}/../repo-b/Backend/Backend.sln',
        existenceLabel: 'repo-b repository',
        buildTaskLabel: '(repo-b) build solution',
      },
    ],
    services: [
      {
        commandName: 'run-repo-a-web',
        repoKey: 'repo-a',
        cwd: '${workspaceFolder}/Frontend',
        command: 'npm.cmd',
        args: ['start'],
        ports: [46111],
        preflight: [
          { type: 'npm-auth' },
          {
            label: 'Install frontend dependencies',
            command: 'npm.cmd',
            args: ['install'],
            cwd: '${workspaceFolder}/Frontend',
          },
        ],
      },
    ],
  }, null, 2), 'utf8');

  t.after(() => clearRuntimeContextForTests());

  const { commandArgv, context } = await loadRuntimeContextFromArgv(
    ['prepare-workspace', '--config', configPath],
    { cwd: workspaceFolder },
  );

  assert.deepEqual(commandArgv, ['prepare-workspace']);
  assert.equal(context.workspaceFolder, workspaceFolder);
  assert.equal(context.workspaceName, 'fixture');
  assert.deepEqual(context.repositoryTasks, {
    syncMaxConcurrentRepositories: 4,
    buildMaxConcurrentRepositories: 2,
  });
  assert.equal(context.repositoriesByKey.get('repo-b').root, path.resolve(workspaceFolder, '..', 'repo-b'));
  assert.equal(context.servicesByCommandName.get('run-repo-a-web').cwd, path.join(workspaceFolder, 'Frontend'));
  assert.equal(context.servicesByCommandName.get('run-repo-a-web').preflight[0].type, 'npm-auth');
  assert.equal(
    context.runSelectionStatePath,
    path.join(workspaceFolder, '.git', 'task-state', 'imperia-cli-run-selection.json'),
  );
});

test('loadRuntimeContextFromArgv defaults repositoryTasks to sequential execution', async (t) => {
  const workspaceFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'imperia-cli-config-'));
  const configDir = path.join(workspaceFolder, '.vscode');
  const configPath = path.join(configDir, 'imperia-cli.config.json');

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({
    repositories: [
      {
        key: 'repo-a',
        root: '${workspaceFolder}',
        solutionPath: '${workspaceFolder}/Backend/Backend.sln',
      },
    ],
  }, null, 2), 'utf8');

  t.after(() => clearRuntimeContextForTests());

  const { context } = await loadRuntimeContextFromArgv(
    ['prepare-workspace', '--config', configPath],
    { cwd: workspaceFolder },
  );

  assert.deepEqual(context.repositoryTasks, {
    syncMaxConcurrentRepositories: 1,
    buildMaxConcurrentRepositories: 1,
  });
});

test('loadRuntimeContextFromArgv rejects invalid repositoryTasks concurrency values', async (t) => {
  const workspaceFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'imperia-cli-config-'));
  const configDir = path.join(workspaceFolder, '.vscode');
  const configPath = path.join(configDir, 'imperia-cli.config.json');

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({
    repositoryTasks: {
      syncMaxConcurrentRepositories: 0,
      buildMaxConcurrentRepositories: '2',
    },
    repositories: [
      {
        key: 'repo-a',
        root: '${workspaceFolder}',
        solutionPath: '${workspaceFolder}/Backend/Backend.sln',
      },
    ],
  }, null, 2), 'utf8');

  t.after(() => clearRuntimeContextForTests());

  await assert.rejects(
    loadRuntimeContextFromArgv(['prepare-workspace', '--config', configPath], { cwd: workspaceFolder }),
    /repositoryTasks\.syncMaxConcurrentRepositories must be an integer greater than or equal to 1\./,
  );
});

test('loadRuntimeContextFromArgv rejects non-numeric build concurrency values', async (t) => {
  const workspaceFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'imperia-cli-config-'));
  const configDir = path.join(workspaceFolder, '.vscode');
  const configPath = path.join(configDir, 'imperia-cli.config.json');

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({
    repositoryTasks: {
      syncMaxConcurrentRepositories: 2,
      buildMaxConcurrentRepositories: '2',
    },
    repositories: [
      {
        key: 'repo-a',
        root: '${workspaceFolder}',
        solutionPath: '${workspaceFolder}/Backend/Backend.sln',
      },
    ],
  }, null, 2), 'utf8');

  t.after(() => clearRuntimeContextForTests());

  await assert.rejects(
    loadRuntimeContextFromArgv(['prepare-workspace', '--config', configPath], { cwd: workspaceFolder }),
    /repositoryTasks\.buildMaxConcurrentRepositories must be an integer greater than or equal to 1\./,
  );
});
