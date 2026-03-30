import { ensurePathExists } from './fs-utils.mjs';
import { createProgressReporter } from './progress.mjs';
import { invokeTrackedBuild, syncRepository } from './repo-tasks.mjs';
import { getRepositoryDefinition, normalizeRepositoryKeys } from './repositories.mjs';
import { stopServices } from './service-control.mjs';

export async function ensureRepositoryAvailable(repoKey) {
  const repository = getRepositoryDefinition(repoKey);

  if (repository.existenceLabel) {
    await ensurePathExists(repository.root, repository.existenceLabel);
  }
}

export async function runGitSync(repoKeys) {
  for (const repoKey of normalizeRepositoryKeys(repoKeys)) {
    const repository = getRepositoryDefinition(repoKey);

    await ensureRepositoryAvailable(repoKey);
    await syncRepository(repository.root, repository.label);
  }
}

export async function runStopServices(options = {}) {
  await stopServices(options);
}

export async function runRebuildRepository(repoKey) {
  const repository = getRepositoryDefinition(repoKey);

  await ensureRepositoryAvailable(repoKey);
  await invokeTrackedBuild({
    targetRepoRoot: repository.root,
    stateFileName: repository.buildStateFileName,
    solutionPath: repository.solutionPath,
    buildTaskLabel: repository.buildTaskLabel,
    taskLabel: repository.buildTaskLabel,
  });
}

export async function runPrepare({
  repoKeys,
  syncGitRepoKeys = null,
  services = null,
  scope = 'prepare',
  title = 'Preparing repositories and shared services.',
} = {}, {
  createProgressReporterFn = createProgressReporter,
  runGitSyncFn = runGitSync,
  runStopServicesFn = runStopServices,
  runRebuildRepositoryFn = runRebuildRepository,
} = {}) {
  const normalizedRepoKeys = normalizeRepositoryKeys(repoKeys);
  const normalizedSyncGitRepoKeys = syncGitRepoKeys === null
    ? normalizedRepoKeys
    : normalizeRepositoryKeys(syncGitRepoKeys).filter((repoKey) => normalizedRepoKeys.includes(repoKey));
  const totalSteps = 1 + normalizedRepoKeys.length + (normalizedSyncGitRepoKeys.length > 0 ? 1 : 0);
  const progress = createProgressReporterFn(scope, totalSteps, title);

  if (normalizedSyncGitRepoKeys.length > 0) {
    await progress.runStep('Synchronize repositories', () => runGitSyncFn(normalizedSyncGitRepoKeys));
  }

  await progress.runStep('Stop running services', () => runStopServicesFn({ services }));

  for (const repoKey of normalizedRepoKeys) {
    const repository = getRepositoryDefinition(repoKey);
    await progress.runStep(`Rebuild ${repository.label} backend`, () => runRebuildRepositoryFn(repoKey));
  }

  progress.finish('Preparation completed.');
}
