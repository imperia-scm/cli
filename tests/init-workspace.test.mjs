import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { runInitCommand } from '../lib/init-workspace.mjs';

const execFileAsync = promisify(execFile);

async function createGitWorkspace() {
  const workspaceFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'imperiascm-cli-init-'));
  await execFileAsync('git', ['init'], { cwd: workspaceFolder });
  return workspaceFolder;
}

async function readJson(targetPath) {
  return JSON.parse(await fs.readFile(targetPath, 'utf8'));
}

test('runInitCommand creates config and tasks for an empty workspace', async () => {
  const workspaceFolder = await createGitWorkspace();
  const solutionPath = path.join(workspaceFolder, 'Backend', 'Backend.sln');
  const configPath = path.join(workspaceFolder, '.vscode', 'imperiascm-cli.config.json');
  const tasksPath = path.join(workspaceFolder, '.vscode', 'tasks.json');

  await fs.mkdir(path.dirname(solutionPath), { recursive: true });
  await fs.writeFile(solutionPath, '', 'utf8');

  await runInitCommand([], { cwd: workspaceFolder });

  const config = await readJson(configPath);
  const tasks = await readJson(tasksPath);
  const repoKey = path.basename(workspaceFolder);

  assert.equal(
    config.$schema,
    'https://raw.githubusercontent.com/imperia-scm/cli/main/schemas/imperiascm-cli.config.schema.json',
  );
  assert.equal(config.workspace.name, repoKey);
  assert.deepEqual(config.repositories, [
    {
      key: repoKey,
      root: '${workspaceFolder}',
      solutionPath: '${workspaceFolder}/Backend/Backend.sln',
    },
  ]);
  assert.deepEqual(config.services, []);

  assert.equal(tasks.$schema, 'vscode://schemas/tasks');
  assert.equal(tasks.version, '2.0.0');
  assert.deepEqual(
    tasks.tasks.map((task) => task.label),
    [
      'select services to launch via imperiascm-cli',
      'prepare services to launch via imperiascm-cli',
      'launch services via imperiascm-cli',
    ],
  );
  assert.deepEqual(tasks.tasks.find((task) => task.label === 'launch services via imperiascm-cli').group, {
    kind: 'build',
    isDefault: true,
  });
  assert.deepEqual(tasks.tasks.find((task) => task.label === 'launch services via imperiascm-cli').dependsOn, [
    'select services to launch via imperiascm-cli',
    'prepare services to launch via imperiascm-cli',
  ]);
  assert.equal(tasks.tasks.find((task) => task.label === 'launch services via imperiascm-cli').dependsOrder, 'sequence');
  assert.equal(tasks.tasks.find((task) => task.label === 'select services to launch via imperiascm-cli').presentation.clear, true);
  assert.equal(tasks.tasks.find((task) => task.label === 'select services to launch via imperiascm-cli').presentation.focus, true);
  assert.equal(tasks.tasks.find((task) => task.label === 'select services to launch via imperiascm-cli').presentation.showReuseMessage, false);
  assert.equal(tasks.tasks.find((task) => task.label === 'prepare services to launch via imperiascm-cli').presentation.clear, true);
  assert.equal(tasks.tasks.find((task) => task.label === 'prepare services to launch via imperiascm-cli').hide, true);
  assert.deepEqual(tasks.tasks.find((task) => task.label === 'select services to launch via imperiascm-cli').args, ['select-services-to-launch', '--config', '${workspaceFolder}/.vscode/imperiascm-cli.config.json']);
  assert.equal(tasks.tasks.find((task) => task.label === 'run selected services via imperiascm-cli'), undefined);
});

test('runInitCommand keeps placeholder solutionPath when no solution file is detected', async () => {
  const workspaceFolder = await createGitWorkspace();

  await runInitCommand([], { cwd: workspaceFolder });

  const config = await readJson(path.join(workspaceFolder, '.vscode', 'imperiascm-cli.config.json'));

  assert.equal(config.repositories[0].solutionPath, '${workspaceFolder}/path/to/Backend.sln');
});

test('runInitCommand merges existing config and JSONC tasks without touching manual tasks', async () => {
  const workspaceFolder = await createGitWorkspace();
  const configPath = path.join(workspaceFolder, '.vscode', 'imperiascm-cli.config.json');
  const tasksPath = path.join(workspaceFolder, '.vscode', 'tasks.json');
  const repoKey = path.basename(workspaceFolder);

  await fs.mkdir(path.join(workspaceFolder, '.vscode'), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({
    repositories: [
      {
        key: 'existing-repo',
        root: '${workspaceFolder}/../existing-repo',
        solutionPath: '${workspaceFolder}/../existing-repo/Backend/Existing.sln',
      },
    ],
    services: [
      {
        commandName: 'run-existing-service',
        repoKey: 'existing-repo',
        command: 'npm.cmd',
      },
    ],
  }, null, 2), 'utf8');
  await fs.writeFile(tasksPath, `{
  // user-maintained tasks should remain untouched
  "version": "2.0.0",
  "tasks": [
    {
      "label": "manual: custom",
      "type": "shell",
      "command": "echo",
      "args": ["keep-me"],
    },
    {
      "label": "imperiascm-cli: prepare workspace",
      "type": "shell",
      "command": "imp",
      "args": ["prepare-workspace"],
    },
  ],
}
`, 'utf8');

  await runInitCommand([], { cwd: workspaceFolder });
  await runInitCommand([], { cwd: workspaceFolder });

  const config = await readJson(configPath);
  const tasks = await readJson(tasksPath);

  assert.equal(
    config.$schema,
    'https://raw.githubusercontent.com/imperia-scm/cli/main/schemas/imperiascm-cli.config.schema.json',
  );
  assert.equal(config.workspace.name, repoKey);
  assert.deepEqual(
    config.repositories.map((repository) => repository.key),
    ['existing-repo', repoKey],
  );
  assert.equal(config.services.length, 1);

  assert.deepEqual(
    tasks.tasks.map((task) => task.label),
    [
      'manual: custom',
      'select services to launch via imperiascm-cli',
      'prepare services to launch via imperiascm-cli',
      'run service run-existing-service via imperiascm-cli',
      'run selected services via imperiascm-cli',
      'launch services via imperiascm-cli',
    ],
  );
  assert.equal(tasks.$schema, 'vscode://schemas/tasks');
  assert.deepEqual(tasks.tasks.find((task) => task.label === 'launch services via imperiascm-cli').group, {
    kind: 'build',
    isDefault: true,
  });
  assert.deepEqual(tasks.tasks.find((task) => task.label === 'launch services via imperiascm-cli').dependsOn, [
    'select services to launch via imperiascm-cli',
    'prepare services to launch via imperiascm-cli',
    'run selected services via imperiascm-cli',
  ]);
  assert.equal(tasks.tasks.find((task) => task.label === 'select services to launch via imperiascm-cli').presentation.clear, true);
  assert.equal(tasks.tasks.find((task) => task.label === 'select services to launch via imperiascm-cli').presentation.focus, true);
  assert.equal(tasks.tasks.find((task) => task.label === 'prepare services to launch via imperiascm-cli').presentation.clear, true);
  assert.deepEqual(tasks.tasks.find((task) => task.label === 'run selected services via imperiascm-cli').dependsOn, [
    'run service run-existing-service via imperiascm-cli',
  ]);
  assert.equal(tasks.tasks.find((task) => task.label === 'run service run-existing-service via imperiascm-cli').presentation.clear, true);
  assert.deepEqual(
    tasks.tasks.find((task) => task.label === 'run service run-existing-service via imperiascm-cli').args,
    ['launch-service', 'run-existing-service', '--config', '${workspaceFolder}/.vscode/imperiascm-cli.config.json'],
  );
});

test('runInitCommand points custom config paths to the published GitHub schema', async () => {
  const workspaceFolder = await createGitWorkspace();
  const customConfigPath = path.join(workspaceFolder, '.config', 'studio.json');

  await runInitCommand(['--config', '.config/studio.json'], { cwd: workspaceFolder });

  const config = await readJson(customConfigPath);

  assert.equal(
    config.$schema,
    'https://raw.githubusercontent.com/imperia-scm/cli/main/schemas/imperiascm-cli.config.schema.json',
  );
});

test('runInitCommand fails on invalid existing config without writing tasks', async () => {
  const workspaceFolder = await createGitWorkspace();
  const configPath = path.join(workspaceFolder, '.vscode', 'imperiascm-cli.config.json');
  const tasksPath = path.join(workspaceFolder, '.vscode', 'tasks.json');

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, '{ invalid json', 'utf8');

  await assert.rejects(
    runInitCommand([], { cwd: workspaceFolder }),
    /Unable to merge config file/,
  );

  await assert.rejects(fs.access(tasksPath));
});
