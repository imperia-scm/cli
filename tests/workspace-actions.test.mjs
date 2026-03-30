import assert from 'node:assert/strict';
import test from 'node:test';
import { runPrepare } from '../lib/workspace-actions.mjs';
import { clearTestRuntimeContext, useTestRuntimeContext } from './test-utils.mjs';

test('runPrepare syncs only the selected repos but rebuilds every selected repository', async (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);
  const calls = [];
  const finishedMessages = [];

  await runPrepare(
    {
      repoKeys: ['repo-b', 'repo-a'],
      syncGitRepoKeys: ['repo-b'],
      services: ['run-repo-b-api'],
      scope: 'run',
      title: 'Preparing selected repositories and services.',
    },
    {
      createProgressReporterFn: () => ({
        async runStep(label, operation) {
          calls.push(['step', label]);
          return await operation();
        },
        finish(message) {
          finishedMessages.push(message);
        },
      }),
      runGitSyncFn: async (repoKeys) => {
        calls.push(['sync', repoKeys]);
      },
      runStopServicesFn: async (options) => {
        calls.push(['stop', options]);
      },
      runRebuildRepositoryFn: async (repoKey) => {
        calls.push(['rebuild', repoKey]);
      },
    },
  );

  assert.deepEqual(calls, [
    ['step', 'Synchronize repositories'],
    ['sync', ['repo-b']],
    ['step', 'Stop running services'],
    ['stop', { services: ['run-repo-b-api'] }],
    ['step', 'Rebuild repo-b backend'],
    ['rebuild', 'repo-b'],
    ['step', 'Rebuild repo-a backend'],
    ['rebuild', 'repo-a'],
  ]);
  assert.deepEqual(finishedMessages, ['Preparation completed.']);
});
