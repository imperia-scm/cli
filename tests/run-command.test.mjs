import assert from 'node:assert/strict';
import test from 'node:test';
import { runInteractiveCommand } from '../lib/run-command.mjs';
import { getServicesByCommandNames } from '../lib/services.mjs';
import { clearTestRuntimeContext, useTestRuntimeContext } from './test-utils.mjs';

test('runInteractiveCommand stores the selected services for later VS Code tasks', async (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);
  const persistedSelections = [];

  await runInteractiveCommand({
    presentSelection: async () => ({
      cancelled: false,
      syncGit: true,
      syncGitRepoKeys: ['repo-b', 'repo-a'],
      selectedServices: getServicesByCommandNames([
        'run-repo-b-api',
        'run-repo-a-web',
      ]),
    }),
    persistSelection: async (selection) => {
      persistedSelections.push(selection);
    },
    clearSelection: async () => {
      throw new Error('should not clear');
    },
  });

  assert.equal(persistedSelections.length, 1);
  assert.equal(persistedSelections[0].syncGit, true);
  assert.deepEqual(persistedSelections[0].syncGitRepoKeys, ['repo-b', 'repo-a']);
  assert.deepEqual(
    persistedSelections[0].selectedServices.map((service) => service.commandName),
    ['run-repo-b-api', 'run-repo-a-web'],
  );
});

test('runInteractiveCommand clears persisted selection when the prompt is cancelled', async (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);
  let cleared = 0;

  await runInteractiveCommand({
    presentSelection: async () => ({
      cancelled: true,
      syncGit: false,
      syncGitRepoKeys: [],
      selectedServices: [],
    }),
    persistSelection: async () => {
      throw new Error('should not persist');
    },
    clearSelection: async () => {
      cleared += 1;
    },
  });

  assert.equal(cleared, 1);
});

test('runInteractiveCommand fails in a non-interactive session', async (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);

  await assert.rejects(
    runInteractiveCommand({
      io: {
        stdin: { isTTY: false },
        stdout: { isTTY: false },
      },
    }),
    /Interactive terminal required/,
  );
});
