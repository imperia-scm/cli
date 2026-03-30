import { ensurePathExists } from './fs-utils.mjs';
import { createProgressReporter } from './progress.mjs';
import { invokeTrackedBuild, syncRepository } from './repo-tasks.mjs';
import { getRepositoryDefinition, normalizeRepositoryKeys } from './repositories.mjs';
import { getRuntimeContext } from './runtime-config.mjs';
import { stopServices } from './service-control.mjs';

export async function ensureRepositoryAvailable(repoKey) {
  const repository = getRepositoryDefinition(repoKey);

  if (repository.existenceLabel) {
    await ensurePathExists(repository.root, repository.existenceLabel);
  }
}

export class RepositoryPhaseError extends AggregateError {
  constructor(phaseLabel, failures) {
    super(
      failures.map((failure) => failure.error),
      `${phaseLabel} failed for repositories: ${failures.map((failure) => failure.repoKey).join(', ')}`,
    );
    this.name = 'RepositoryPhaseError';
    this.phaseLabel = phaseLabel;
    this.failures = failures;
  }
}

function getRepositoryTaskLimits() {
  return getRuntimeContext().repositoryTasks;
}

async function runRepositoryPool(repoKeys, maxConcurrentRepositories, runTask) {
  const failures = [];
  let nextIndex = 0;
  const workerCount = Math.min(maxConcurrentRepositories, repoKeys.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= repoKeys.length) {
          return;
        }

        const repoKey = repoKeys[currentIndex];

        try {
          await runTask(repoKey);
        } catch (error) {
          failures.push({ repoKey, error, index: currentIndex });
        }
      }
    }),
  );

  failures.sort((left, right) => left.index - right.index);
  return failures;
}

export async function runGitSync(repoKeys, options = {}) {
  const normalizedRepoKeys = normalizeRepositoryKeys(repoKeys);

  if (normalizedRepoKeys.length === 0) {
    return;
  }

  const limits = getRepositoryTaskLimits();
  const maxConcurrentRepositories = options.maxConcurrentRepositories ?? limits.syncMaxConcurrentRepositories;
  const ensureRepositoryAvailableFn = options.ensureRepositoryAvailableFn ?? ensureRepositoryAvailable;
  const syncRepositoryFn = options.syncRepositoryFn ?? syncRepository;
  const failures = await runRepositoryPool(normalizedRepoKeys, maxConcurrentRepositories, async (repoKey) => {
    const repository = getRepositoryDefinition(repoKey);

    await ensureRepositoryAvailableFn(repoKey);
    await syncRepositoryFn(repository.root, repository.label, {
      interactive: maxConcurrentRepositories === 1,
    });
  });

  if (failures.length > 0) {
    throw new RepositoryPhaseError('Sync', failures);
  }
}

export async function runStopServices(options = {}) {
  await stopServices(options);
}

export async function runRebuildRepository(repoKey, options = {}) {
  const repository = getRepositoryDefinition(repoKey);

  await ensureRepositoryAvailable(repoKey);
  await invokeTrackedBuild({
    targetRepoRoot: repository.root,
    stateFileName: repository.buildStateFileName,
    solutionPath: repository.solutionPath,
    buildTaskLabel: repository.buildTaskLabel,
    taskLabel: repository.buildTaskLabel,
    interactive: options.interactive ?? true,
  });
}

export async function runRebuildRepositories(repoKeys, options = {}) {
  const normalizedRepoKeys = normalizeRepositoryKeys(repoKeys);

  if (normalizedRepoKeys.length === 0) {
    return;
  }

  const limits = getRepositoryTaskLimits();
  const maxConcurrentRepositories = options.maxConcurrentRepositories ?? limits.buildMaxConcurrentRepositories;
  const runRebuildRepositoryFn = options.runRebuildRepositoryFn ?? runRebuildRepository;
  const failures = await runRepositoryPool(normalizedRepoKeys, maxConcurrentRepositories, async (repoKey) => {
    await runRebuildRepositoryFn(repoKey, {
      interactive: maxConcurrentRepositories === 1,
    });
  });

  if (failures.length > 0) {
    throw new RepositoryPhaseError('Build', failures);
  }
}

export async function runPrepare({
  repoKeys,
  syncGitRepoKeys = null,
  services = null,
  scope = 'prepare-workspace',
  title = 'Preparing repositories and shared services.',
} = {}, {
  createProgressReporterFn = createProgressReporter,
  runGitSyncFn = runGitSync,
  runStopServicesFn = runStopServices,
  runRebuildRepositoriesFn = runRebuildRepositories,
} = {}) {
  const normalizedRepoKeys = normalizeRepositoryKeys(repoKeys);
  const normalizedSyncGitRepoKeys = syncGitRepoKeys === null
    ? normalizedRepoKeys
    : normalizeRepositoryKeys(syncGitRepoKeys).filter((repoKey) => normalizedRepoKeys.includes(repoKey));
  const totalSteps = 1 + (normalizedRepoKeys.length > 0 ? 1 : 0) + (normalizedSyncGitRepoKeys.length > 0 ? 1 : 0);
  const progress = createProgressReporterFn(scope, totalSteps, title);

  if (normalizedSyncGitRepoKeys.length > 0) {
    await progress.runStep('Synchronize repositories', () => runGitSyncFn(normalizedSyncGitRepoKeys));
  }

  await progress.runStep('Stop running services', () => runStopServicesFn({ services }));

  if (normalizedRepoKeys.length > 0) {
    await progress.runStep('Rebuild selected backends', () => runRebuildRepositoriesFn(normalizedRepoKeys));
  }

  progress.finish('Preparation completed.');
}
