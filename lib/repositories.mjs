import { getRuntimeContext } from './runtime-config.mjs';

export function getRepositoryDefinitions() {
  return getRuntimeContext().repositories;
}

export function getRepositoryOrder() {
  return getRepositoryDefinitions().map((repository) => repository.key);
}

export function getRepositoryDefinition(repoKey) {
  const definition = getRuntimeContext().repositoriesByKey.get(repoKey);

  if (!definition) {
    throw new Error(`Unknown repository: ${repoKey}`);
  }

  return definition;
}

export function normalizeRepositoryKeys(repoKeys = getRepositoryOrder()) {
  return [...new Set(repoKeys)].map((repoKey) => getRepositoryDefinition(repoKey).key);
}
