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
  const output = stripAnsi(stdout);
  assert.match(output, /Quick Start/);
  assert.match(output, /imp init/);
  assert.match(output, /imp launch-services/);
  assert.match(output, /Commands/);
  assert.match(output, /init/);
  assert.match(output, /launch-services/);
  assert.match(output, /run-service/);
  assert.match(output, /prepare-workspace/);
  assert.match(output, /build-solution/);
  assert.match(output, /sync-repository/);
  assert.doesNotMatch(output, /select-services-to-launch/);
  assert.doesNotMatch(output, /prepare-services-to-launch/);
  assert.doesNotMatch(output, /\blaunch-service\b/);
  assert.doesNotMatch(output, /launch-services-prepare/);
  assert.doesNotMatch(output, /run-service-exec/);
  assert.doesNotMatch(output, /run-repo-a-web/);
  assert.doesNotMatch(output, /\brebuild\b/);
});

test('runStartupTasks prints usage for unknown commands', async (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);

  const { result, stdout, stderr } = await captureProcessOutput(() => runStartupTasks(['unknown-command'], createCommandRegistry()));
  const output = stripAnsi(`${stderr}\n${stdout}`);

  assert.equal(result, 1);
  assert.match(output, /Unknown command: unknown-command/);
  assert.match(output, /Commands/);
});
