import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { clearRuntimeContextForTests, inspectCliOptions, loadRuntimeContextFromArgv } from '../lib/runtime-config.mjs';

test('inspectCliOptions defaults to the imperia-cli workspace config path', () => {
  const cwd = path.join('C:', 'workspace', 'repo');
  const parsed = inspectCliOptions(['prepare'], { cwd });

  assert.deepEqual(parsed.commandArgv, ['prepare']);
  assert.equal(parsed.configPath, path.join(cwd, '.vscode', 'imperia-cli.config.json'));
});

test('loadRuntimeContextFromArgv expands workspace placeholders and service definitions', async (t) => {
  const workspaceFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'imperia-cli-config-'));
  const configDir = path.join(workspaceFolder, '.vscode');
  const configPath = path.join(configDir, 'imperia-cli.config.json');

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({
    workspace: { name: 'fixture' },
    repositories: [
      {
        key: 'repo-a',
        root: '${workspaceFolder}',
        solutionPath: '${workspaceFolder}/Backend/Backend.sln',
        buildTaskLabel: '(repo-a) rebuild',
      },
      {
        key: 'repo-b',
        root: '${workspaceFolder}/../repo-b',
        solutionPath: '${workspaceFolder}/../repo-b/Backend/Backend.sln',
        existenceLabel: 'repo-b repository',
        buildTaskLabel: '(repo-b) rebuild',
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
    ['prepare', '--config', configPath],
    { cwd: workspaceFolder },
  );

  assert.deepEqual(commandArgv, ['prepare']);
  assert.equal(context.workspaceFolder, workspaceFolder);
  assert.equal(context.workspaceName, 'fixture');
  assert.equal(context.repositoriesByKey.get('repo-b').root, path.resolve(workspaceFolder, '..', 'repo-b'));
  assert.equal(context.servicesByCommandName.get('run-repo-a-web').cwd, path.join(workspaceFolder, 'Frontend'));
  assert.equal(context.servicesByCommandName.get('run-repo-a-web').preflight[0].type, 'npm-auth');
  assert.equal(
    context.runSelectionStatePath,
    path.join(workspaceFolder, '.git', 'task-state', 'imperia-cli-run-selection.json'),
  );
});
