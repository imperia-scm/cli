import assert from 'node:assert/strict';
import test from 'node:test';
import { launchCommand, runServiceCommand } from '../lib/commands.mjs';
import { getServicesByCommandNames } from '../lib/services.mjs';
import { clearTestRuntimeContext, useTestRuntimeContext } from './test-utils.mjs';

test('runServiceCommand requires a service command name', async (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);

  await assert.rejects(
    runServiceCommand([]),
    /Use `imp run-service <service-command>` or `imp launch-services`\./,
  );
});

test('runServiceCommand prepares shared repositories and runs the requested service', async (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);
  const calls = [];

  await runServiceCommand(['run-repo-a-web'], {
    runPrepareSharedRepositoriesFn: async () => {
      calls.push('prepare');
    },
    runConfiguredServiceFn: async (commandName) => {
      calls.push(['run', commandName]);
    },
  });

  assert.deepEqual(calls, [
    'prepare',
    ['run', 'run-repo-a-web'],
  ]);
});

test('launchCommand selects, prepares and launches the selected services', async (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);
  const selectedServices = getServicesByCommandNames([
    'run-repo-b-api',
    'run-repo-a-web',
  ]);
  const calls = [];

  await launchCommand([], {
    selectServicesFn: async () => {
      calls.push('select');
      return {
        cancelled: false,
        syncGit: true,
        syncGitRepoKeys: ['repo-b', 'repo-a'],
        selectedServices,
      };
    },
    readSelectionFn: async () => {
      calls.push('read');
      return {
        selectedServices,
        selectedCommandNames: selectedServices.map((service) => service.commandName),
        repoKeys: ['repo-b', 'repo-a'],
        syncGitRepoKeys: ['repo-b', 'repo-a'],
      };
    },
    prepareSelectionFn: async (selection, options) => {
      calls.push(['prepare', selection.selectedCommandNames, options.scope]);
      return true;
    },
    runConfiguredServicesFn: async (services) => {
      calls.push(['launch', services.map((service) => service.commandName)]);
    },
  });

  assert.deepEqual(calls, [
    'select',
    'read',
    ['prepare', ['run-repo-b-api', 'run-repo-a-web'], 'launch-services'],
    ['launch', ['run-repo-b-api', 'run-repo-a-web']],
  ]);
});
