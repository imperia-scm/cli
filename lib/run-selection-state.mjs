import fs from 'node:fs/promises';
import path from 'node:path';
import { getRuntimeContext } from './runtime-config.mjs';
import { getSelectedRepoKeys, getServicesByCommandNames } from './services.mjs';

function getDefaultRunSelectionStatePath() {
  return getRuntimeContext().runSelectionStatePath;
}

function normalizeCommandNames(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry) => typeof entry === 'string'))]
    : [];
}

function normalizeLaunchMode(value) {
  return value === 'all' || value === 'selected' ? value : null;
}

function buildEmptyRunSelectionState() {
  return {
    syncGit: false,
    syncGitRepoKeys: [],
    selectedCommandNames: [],
    launchMode: null,
    pendingCommandNames: [],
  };
}

function normalizeRepoKeys(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry) => typeof entry === 'string'))]
    : [];
}

function filterSyncGitRepoKeys(syncGitRepoKeys, selectedRepoKeys) {
  return normalizeRepoKeys(syncGitRepoKeys).filter((repoKey) => selectedRepoKeys.includes(repoKey));
}

function deriveSyncGit(selectedRepoKeys, syncGitRepoKeys) {
  return selectedRepoKeys.length > 0 && selectedRepoKeys.every((repoKey) => syncGitRepoKeys.includes(repoKey));
}

function resolveSelectedRepoKeys(selectedCommandNames) {
  if (selectedCommandNames.length === 0) {
    return [];
  }

  try {
    return getSelectedRepoKeys(getServicesByCommandNames(selectedCommandNames));
  } catch {
    return [];
  }
}

export function serializeRunSelection(selection) {
  const selectedCommandNames = normalizeCommandNames(selection.selectedServices.map((service) => service.commandName));
  const selectedRepoKeys = getSelectedRepoKeys(selection.selectedServices);
  const syncGitRepoKeys = Array.isArray(selection.syncGitRepoKeys)
    ? filterSyncGitRepoKeys(selection.syncGitRepoKeys, selectedRepoKeys)
    : selection.syncGit
      ? [...selectedRepoKeys]
      : [];

  return {
    syncGit: deriveSyncGit(selectedRepoKeys, syncGitRepoKeys),
    syncGitRepoKeys,
    selectedCommandNames,
    launchMode: null,
    pendingCommandNames: [],
  };
}

async function writeRunSelectionData(state, filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8');
}

export async function writeRunSelectionState(selection, filePath = getDefaultRunSelectionStatePath()) {
  await writeRunSelectionData(serializeRunSelection(selection), filePath);
}

export async function clearRunSelectionState(filePath = getDefaultRunSelectionStatePath()) {
  try {
    await fs.rm(filePath, { force: true });
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function readRunSelectionState(filePath = getDefaultRunSelectionStatePath()) {
  try {
    const fileText = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(fileText);
    const selectedCommandNames = normalizeCommandNames(parsed.selectedCommandNames);
    const selectedRepoKeys = resolveSelectedRepoKeys(selectedCommandNames);
    const syncGitRepoKeys = Array.isArray(parsed.syncGitRepoKeys)
      ? filterSyncGitRepoKeys(parsed.syncGitRepoKeys, selectedRepoKeys)
      : parsed.syncGit
        ? [...selectedRepoKeys]
        : [];

    return {
      syncGit: deriveSyncGit(selectedRepoKeys, syncGitRepoKeys),
      syncGitRepoKeys,
      selectedCommandNames,
      launchMode: normalizeLaunchMode(parsed.launchMode),
      pendingCommandNames: normalizeCommandNames(parsed.pendingCommandNames),
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return buildEmptyRunSelectionState();
    }

    throw error;
  }
}

export async function readResolvedRunSelectionState(filePath = getDefaultRunSelectionStatePath()) {
  const state = await readRunSelectionState(filePath);
  const selectedServices = getServicesByCommandNames(state.selectedCommandNames);
  const repoKeys = getSelectedRepoKeys(selectedServices);
  const syncGitRepoKeys = filterSyncGitRepoKeys(state.syncGitRepoKeys, repoKeys);

  return {
    ...state,
    syncGit: deriveSyncGit(repoKeys, syncGitRepoKeys),
    syncGitRepoKeys,
    selectedServices,
    repoKeys,
  };
}

export async function setRunLaunchState({ launchMode, commandNames = [] }, filePath = getDefaultRunSelectionStatePath()) {
  const currentState = await readRunSelectionState(filePath);
  const normalizedLaunchMode = normalizeLaunchMode(launchMode);

  await writeRunSelectionData(
    {
      ...currentState,
      launchMode: normalizedLaunchMode,
      pendingCommandNames: normalizedLaunchMode ? normalizeCommandNames(commandNames) : [],
    },
    filePath,
  );
}

export async function takeRunLaunchCommand(commandName, filePath = getDefaultRunSelectionStatePath()) {
  const state = await readRunSelectionState(filePath);

  if (!state.launchMode || state.pendingCommandNames.length === 0) {
    return {
      launchMode: null,
      shouldRun: false,
    };
  }

  if (state.launchMode === 'selected' && !state.selectedCommandNames.includes(commandName)) {
    return {
      launchMode: 'selected',
      shouldRun: false,
    };
  }

  if (!state.pendingCommandNames.includes(commandName)) {
    return {
      launchMode: state.launchMode,
      shouldRun: false,
    };
  }

  const pendingCommandNames = state.pendingCommandNames.filter((entry) => entry !== commandName);

  await writeRunSelectionData(
    {
      ...state,
      launchMode: pendingCommandNames.length > 0 ? state.launchMode : null,
      pendingCommandNames,
    },
    filePath,
  );

  return {
    launchMode: state.launchMode,
    shouldRun: true,
  };
}
