import assert from 'node:assert/strict';
import process from 'node:process';
import test from 'node:test';
import { runCommand, runService } from '../lib/process-runner.mjs';
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
