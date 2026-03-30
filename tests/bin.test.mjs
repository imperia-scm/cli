import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);

function runCli(args, { cwd, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), 'bin', 'imp.mjs'), ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function createPrepareWorkspace() {
  const rootFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'imperiascm-cli-bin-prepare-'));
  const remoteFolder = path.join(rootFolder, 'remote.git');
  const workspaceFolder = path.join(rootFolder, 'workspace');
  const solutionPath = path.join(workspaceFolder, 'Backend', 'Backend.sln');

  await execFileAsync('git', ['init', '--bare', remoteFolder]);
  await execFileAsync('git', ['clone', remoteFolder, workspaceFolder]);
  await execFileAsync('git', ['config', 'user.name', 'imperiascm-cli'], { cwd: workspaceFolder });
  await execFileAsync('git', ['config', 'user.email', 'imperiascm-cli@example.test'], { cwd: workspaceFolder });

  await fs.mkdir(path.dirname(solutionPath), { recursive: true });
  await fs.writeFile(solutionPath, [
    'Microsoft Visual Studio Solution File, Format Version 12.00',
    '# Visual Studio Version 17',
    'VisualStudioVersion = 17.0.31903.59',
    'MinimumVisualStudioVersion = 10.0.40219.1',
    'Global',
    'EndGlobal',
    '',
  ].join('\r\n'), 'utf8');
  await fs.writeFile(path.join(workspaceFolder, 'README.md'), '# test\n', 'utf8');

  await execFileAsync('git', ['add', '.'], { cwd: workspaceFolder });
  await execFileAsync('git', ['commit', '-m', 'Initial commit'], { cwd: workspaceFolder });
  await execFileAsync('git', ['push', '-u', 'origin', 'HEAD'], { cwd: workspaceFolder });

  return { workspaceFolder };
}

async function createServiceWorkspace() {
  const { workspaceFolder } = await createPrepareWorkspace();
  const configPath = path.join(workspaceFolder, '.vscode', 'imperiascm-cli.config.json');
  const repoKey = path.basename(workspaceFolder);

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({
    workspace: {
      name: 'fixture',
    },
    repositories: [
      {
        key: repoKey,
        root: '${workspaceFolder}',
        solutionPath: '${workspaceFolder}/Backend/Backend.sln',
      },
    ],
    services: [
      {
        commandName: 'test-service',
        repoKey,
        command: process.execPath,
        args: ['-e', "console.log('service started')"],
      },
    ],
  }, null, 2), 'utf8');

  return { workspaceFolder };
}

test('bin/imp.mjs allows init outside VS Code tasks', async () => {
  const workspaceFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'imperiascm-cli-bin-init-'));
  await execFileAsync('git', ['init'], { cwd: workspaceFolder });

  const result = await runCli(['init'], { cwd: workspaceFolder });

  assert.equal(result.code, 0);
  await fs.access(path.join(workspaceFolder, '.vscode', 'imperiascm-cli.config.json'));
  await fs.access(path.join(workspaceFolder, '.vscode', 'tasks.json'));
});

test('bin/imp.mjs allows prepare-workspace outside VS Code tasks when the workspace is configured', async () => {
  const { workspaceFolder } = await createPrepareWorkspace();

  const initResult = await runCli(['init'], { cwd: workspaceFolder });

  assert.equal(initResult.code, 0);

  const result = await runCli(['prepare-workspace'], { cwd: workspaceFolder });

  assert.equal(result.code, 0);
});

test('bin/imp.mjs requires a service command name for run-service', async () => {
  const { workspaceFolder } = await createPrepareWorkspace();
  const initResult = await runCli(['init'], { cwd: workspaceFolder });

  assert.equal(initResult.code, 0);

  const result = await runCli(['run-service'], { cwd: workspaceFolder });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Use `imp run-service <service-command>` or `imp launch-services`\./);
});

test('bin/imp.mjs runs a configured service outside VS Code tasks', async () => {
  const { workspaceFolder } = await createServiceWorkspace();
  const result = await runCli(['run-service', 'test-service'], { cwd: workspaceFolder });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /service started/);
});
