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

test('bin/imp.mjs allows init outside VS Code tasks', async () => {
  const workspaceFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'imperia-cli-bin-init-'));
  await execFileAsync('git', ['init'], { cwd: workspaceFolder });

  const result = await runCli(['init'], { cwd: workspaceFolder });

  assert.equal(result.code, 0);
  await fs.access(path.join(workspaceFolder, '.vscode', 'imperia-cli.config.json'));
  await fs.access(path.join(workspaceFolder, '.vscode', 'tasks.json'));
});

test('bin/imp.mjs still rejects prepare outside VS Code tasks', async () => {
  const workspaceFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'imperia-cli-bin-gate-'));
  const result = await runCli(['prepare'], { cwd: workspaceFolder });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /This CLI can only be started from VS Code tasks/);
});
