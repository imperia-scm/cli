import assert from 'node:assert/strict';
import test from 'node:test';
import { getManagedPorts, getSelectedRepoKeys, getServiceDefinitions, getServicesByCommandNames } from '../lib/services.mjs';
import { clearTestRuntimeContext, useTestRuntimeContext } from './test-utils.mjs';

test('service definitions expose the interactive run services in launch order', (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);

  assert.deepEqual(
    getServiceDefinitions().map((service) => service.commandName),
    [
      'run-repo-b-api',
      'run-repo-b-proxy',
      'run-repo-a-api',
      'run-repo-b-web',
      'run-repo-a-web',
    ],
  );
});

test('getSelectedRepoKeys returns only repo-a when all selected services belong to that repo', (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);
  const repoKeys = getSelectedRepoKeys([
    'run-repo-a-api',
    'run-repo-a-web',
  ]);

  assert.deepEqual(repoKeys, ['repo-a']);
});

test('getSelectedRepoKeys returns only repo-b when all selected services belong to that repo', (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);
  const repoKeys = getSelectedRepoKeys([
    'run-repo-b-api',
    'run-repo-b-web',
  ]);

  assert.deepEqual(repoKeys, ['repo-b']);
});

test('getSelectedRepoKeys returns both repos when the selection is mixed', (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);
  const repoKeys = getSelectedRepoKeys(getServicesByCommandNames([
    'run-repo-b-api',
    'run-repo-a-web',
  ]));

  assert.deepEqual(repoKeys, ['repo-b', 'repo-a']);
});

test('getManagedPorts returns only the ports used by the selected services', (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);
  const ports = getManagedPorts([
    'run-repo-b-api',
    'run-repo-a-web',
  ]);

  assert.deepEqual(ports, [46100, 46111]);
});

test('getManagedPorts returns all managed service ports in launch order by default', (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);
  assert.deepEqual(getManagedPorts(), [46100, 46101, 46102, 46110, 46111]);
});
