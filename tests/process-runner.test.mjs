import assert from 'node:assert/strict';
import process from 'node:process';
import test from 'node:test';
import { runCommand, runService, runServiceGroup } from '../lib/process-runner.mjs';
import { captureProcessOutput, stripAnsi } from './test-utils.mjs';

test('runService emits a plain START service marker before passthrough output', async () => {
  const { stdout } = await captureProcessOutput(() => runService(
    'test-service',
    process.execPath,
    ['-e', "console.log('Now listening on: http://localhost:46100')"],
    process.cwd(),
  ));

  const lines = stripAnsi(stdout).split(/\r?\n/).filter(Boolean);
  const markerLine = lines.find((line) => line.includes('START service'));

  assert.equal(markerLine, 'START service');
  assert.ok(lines.some((line) => line.includes('Now listening on: http://localhost:46100')));
});

test('runCommand does not emit CMD or CWD lines', async () => {
  const { stdout } = await captureProcessOutput(() => runCommand({
    scope: 'test-command',
    description: 'sample command',
    command: process.execPath,
    args: ['-e', "console.log('hello')"],
    cwd: process.cwd(),
    outputMode: 'passthrough',
  }));

  const output = stripAnsi(stdout);

  assert.doesNotMatch(output, /\bcmd>/i);
  assert.doesNotMatch(output, /\bcwd>/i);
  assert.match(output, /sample command/);
  assert.match(output, /hello/);
});

test('runCommand logs plain lifecycle lines when spinner is disabled', async () => {
  const { stdout } = await captureProcessOutput(() => runCommand({
    scope: 'test-command',
    description: 'non-interactive command',
    command: process.execPath,
    args: ['-e', "console.log('hello')"],
    cwd: process.cwd(),
    outputMode: 'capture-on-fail',
    spinner: false,
  }));

  const output = stripAnsi(stdout);

  assert.match(output, /\[>\] non-interactive command/);
  assert.match(output, /\[\+\] non-interactive command \(/);
});

test('runServiceGroup prefixes output with the service command name', async () => {
  const { stdout } = await captureProcessOutput(() => runServiceGroup([
    {
      commandName: 'run-repo-a-web',
      command: process.execPath,
      args: ['-e', "console.log('web ready'); setTimeout(() => process.exit(0), 50)"],
      cwd: process.cwd(),
      env: {},
    },
    {
      commandName: 'run-repo-b-api',
      command: process.execPath,
      args: ['-e', "console.log('api ready'); setTimeout(() => process.exit(0), 50)"],
      cwd: process.cwd(),
      env: {},
    },
  ]));

  const output = stripAnsi(stdout);

  assert.match(output, /START service run-repo-a-web/);
  assert.match(output, /START service run-repo-b-api/);
  assert.match(output, /\[run-repo-a-web\] web ready/);
  assert.match(output, /\[run-repo-b-api\] api ready/);
});
