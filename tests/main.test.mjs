import assert from 'node:assert/strict';
import test from 'node:test';
import { createCommandRegistry } from '../lib/commands.mjs';
import { runStartupTasks } from '../lib/main.mjs';
import { clearTestRuntimeContext, captureProcessOutput, stripAnsi, useTestRuntimeContext } from './test-utils.mjs';

test('runStartupTasks prints usage for help', async (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);

  const { result, stdout } = await captureProcessOutput(() => runStartupTasks(['--help'], createCommandRegistry()));

  assert.equal(result, 0);
  assert.match(stripAnsi(stdout), /Run this workflow from VS Code tasks/);
  assert.match(stripAnsi(stdout), /imp init/);
  assert.match(stripAnsi(stdout), /init/);
  assert.match(stripAnsi(stdout), /prepare/);
  assert.match(stripAnsi(stdout), /rebuild/);
  assert.doesNotMatch(stripAnsi(stdout), /prepare-selected-run/);
  assert.doesNotMatch(stripAnsi(stdout), /run-repo-a-web/);
});

test('runStartupTasks prints usage for unknown commands', async (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);

  const { result, stdout, stderr } = await captureProcessOutput(() => runStartupTasks(['unknown-command'], createCommandRegistry()));
  const output = stripAnsi(`${stderr}\n${stdout}`);

  assert.equal(result, 1);
  assert.match(output, /Unknown command: unknown-command/);
  assert.match(output, /Commands:/);
});
