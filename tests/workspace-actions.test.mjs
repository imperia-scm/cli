import assert from 'node:assert/strict';
import test from 'node:test';
import { runGitSync, runPrepare, runRebuildRepositories } from '../lib/workspace-actions.mjs';
import { clearTestRuntimeContext, useTestRuntimeContext } from './test-utils.mjs';

function createRepository(key, root) {
  return {
    key,
    label: key,
    root,
    existenceLabel: null,
    buildStateFileName: `${key}-build.state`,
    solutionPath: `${root}/Backend/${key}.sln`,
    buildTaskLabel: `(${key}) build solution`,
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('runPrepare syncs only the selected repos and rebuilds them as a single phase', async (t) => {
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
      runRebuildRepositoriesFn: async (repoKeys) => {
        calls.push(['rebuild', repoKeys]);
      },
    },
  );

  assert.deepEqual(calls, [
    ['step', 'Synchronize repositories'],
    ['sync', ['repo-b']],
    ['step', 'Stop running services'],
    ['stop', { services: ['run-repo-b-api'] }],
    ['step', 'Rebuild selected backends'],
    ['rebuild', ['repo-b', 'repo-a']],
  ]);
  assert.deepEqual(finishedMessages, ['Preparation completed.']);
});

test('runGitSync respects the configured sync concurrency limit', async (t) => {
  useTestRuntimeContext({
    repositoryTasks: {
      syncMaxConcurrentRepositories: 2,
      buildMaxConcurrentRepositories: 1,
    },
    repositories: [
      createRepository('repo-a', 'C:/workspace/repo-a'),
      createRepository('repo-b', 'C:/workspace/repo-b'),
      createRepository('repo-c', 'C:/workspace/repo-c'),
    ],
    services: [],
  });
  t.after(clearTestRuntimeContext);

  let activeCount = 0;
  let maxActiveCount = 0;

  await runGitSync(['repo-a', 'repo-b', 'repo-c'], {
    ensureRepositoryAvailableFn: async () => {},
    syncRepositoryFn: async () => {
      activeCount += 1;
      maxActiveCount = Math.max(maxActiveCount, activeCount);
      await wait(20);
      activeCount -= 1;
    },
  });

  assert.equal(maxActiveCount, 2);
});

test('runGitSync aggregates sync failures in repository order', async (t) => {
  useTestRuntimeContext({
    repositoryTasks: {
      syncMaxConcurrentRepositories: 3,
      buildMaxConcurrentRepositories: 1,
    },
    repositories: [
      createRepository('repo-a', 'C:/workspace/repo-a'),
      createRepository('repo-b', 'C:/workspace/repo-b'),
      createRepository('repo-c', 'C:/workspace/repo-c'),
    ],
    services: [],
  });
  t.after(clearTestRuntimeContext);

  await assert.rejects(
    runGitSync(['repo-a', 'repo-b', 'repo-c'], {
      ensureRepositoryAvailableFn: async () => {},
      syncRepositoryFn: async (targetRepoRoot) => {
        if (targetRepoRoot.endsWith('repo-a') || targetRepoRoot.endsWith('repo-c')) {
          throw new Error(`sync failed for ${targetRepoRoot}`);
        }
      },
    }),
    (error) => {
      assert.equal(error.name, 'RepositoryPhaseError');
      assert.equal(error.message, 'Sync failed for repositories: repo-a, repo-c');
      assert.equal(error.errors.length, 2);
      return true;
    },
  );
});

test('runPrepare does not stop services or build when sync fails', async (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);
  const calls = [];

  await assert.rejects(
    runPrepare(
      { repoKeys: ['repo-a', 'repo-b'] },
      {
        createProgressReporterFn: () => ({
          async runStep(label, operation) {
            calls.push(['step', label]);
            return await operation();
          },
          finish() {},
        }),
        runGitSyncFn: async () => {
          calls.push(['sync']);
          throw new Error('sync failed');
        },
        runStopServicesFn: async () => {
          calls.push(['stop']);
        },
        runRebuildRepositoriesFn: async () => {
          calls.push(['rebuild']);
        },
      },
    ),
    /sync failed/,
  );

  assert.deepEqual(calls, [
    ['step', 'Synchronize repositories'],
    ['sync'],
  ]);
});

test('runRebuildRepositories respects the configured build concurrency limit', async (t) => {
  useTestRuntimeContext({
    repositoryTasks: {
      syncMaxConcurrentRepositories: 1,
      buildMaxConcurrentRepositories: 2,
    },
    repositories: [
      createRepository('repo-a', 'C:/workspace/repo-a'),
      createRepository('repo-b', 'C:/workspace/repo-b'),
      createRepository('repo-c', 'C:/workspace/repo-c'),
    ],
    services: [],
  });
  t.after(clearTestRuntimeContext);

  let activeCount = 0;
  let maxActiveCount = 0;

  await runRebuildRepositories(['repo-a', 'repo-b', 'repo-c'], {
    runRebuildRepositoryFn: async () => {
      activeCount += 1;
      maxActiveCount = Math.max(maxActiveCount, activeCount);
      await wait(20);
      activeCount -= 1;
    },
  });

  assert.equal(maxActiveCount, 2);
});

test('runRebuildRepositories aggregates build failures in repository order', async (t) => {
  useTestRuntimeContext({
    repositoryTasks: {
      syncMaxConcurrentRepositories: 1,
      buildMaxConcurrentRepositories: 3,
    },
    repositories: [
      createRepository('repo-a', 'C:/workspace/repo-a'),
      createRepository('repo-b', 'C:/workspace/repo-b'),
      createRepository('repo-c', 'C:/workspace/repo-c'),
    ],
    services: [],
  });
  t.after(clearTestRuntimeContext);

  await assert.rejects(
    runRebuildRepositories(['repo-a', 'repo-b', 'repo-c'], {
      runRebuildRepositoryFn: async (repoKey) => {
        if (repoKey !== 'repo-b') {
          throw new Error(`build failed for ${repoKey}`);
        }
      },
    }),
    (error) => {
      assert.equal(error.name, 'RepositoryPhaseError');
      assert.equal(error.message, 'Build failed for repositories: repo-a, repo-c');
      assert.equal(error.errors.length, 2);
      return true;
    },
  );
});
