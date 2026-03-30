import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  clearRunSelectionState,
  readResolvedRunSelectionState,
  readRunSelectionState,
  setRunLaunchState,
  takeRunLaunchCommand,
  writeRunSelectionState,
} from '../lib/run-selection-state.mjs';
import { getServicesByCommandNames } from '../lib/services.mjs';
import { clearTestRuntimeContext, useTestRuntimeContext } from './test-utils.mjs';

test('run selection state persists and resolves selected services and repos', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'imperiascm-cli-run-'));
  const filePath = path.join(tempDir, 'run-selection.json');
  useTestRuntimeContext({ runSelectionStatePath: filePath });
  t.after(clearTestRuntimeContext);

  await writeRunSelectionState({
    syncGit: true,
    syncGitRepoKeys: ['repo-b', 'repo-a'],
    selectedServices: getServicesByCommandNames([
      'run-repo-b-api',
      'run-repo-a-web',
    ]),
  }, filePath);

  const rawState = await readRunSelectionState(filePath);
  const resolvedState = await readResolvedRunSelectionState(filePath);

  assert.deepEqual(rawState, {
    syncGit: true,
    syncGitRepoKeys: ['repo-b', 'repo-a'],
    selectedCommandNames: ['run-repo-b-api', 'run-repo-a-web'],
    launchMode: null,
    pendingCommandNames: [],
  });
  assert.deepEqual(resolvedState.repoKeys, ['repo-b', 'repo-a']);
  assert.deepEqual(
    resolvedState.selectedServices.map((service) => service.commandName),
    ['run-repo-b-api', 'run-repo-a-web'],
  );
});

test('run selection state clears cleanly', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'imperiascm-cli-run-'));
  const filePath = path.join(tempDir, 'run-selection.json');
  useTestRuntimeContext({ runSelectionStatePath: filePath });
  t.after(clearTestRuntimeContext);

  await writeRunSelectionState({
    syncGit: false,
    syncGitRepoKeys: ['repo-b'],
    selectedServices: getServicesByCommandNames(['run-repo-a-api']),
  }, filePath);
  await clearRunSelectionState(filePath);

  const state = await readRunSelectionState(filePath);

  assert.deepEqual(state, {
    syncGit: false,
    syncGitRepoKeys: [],
    selectedCommandNames: [],
    launchMode: null,
    pendingCommandNames: [],
  });
});

test('run launch state can be activated and consumed across multiple services', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'imperiascm-cli-run-'));
  const filePath = path.join(tempDir, 'run-selection.json');
  useTestRuntimeContext({ runSelectionStatePath: filePath });
  t.after(clearTestRuntimeContext);

  await writeRunSelectionState({
    syncGit: true,
    syncGitRepoKeys: ['repo-b', 'repo-a'],
    selectedServices: getServicesByCommandNames([
      'run-repo-b-api',
      'run-repo-a-web',
    ]),
  }, filePath);
  await setRunLaunchState({
    launchMode: 'selected',
    commandNames: ['run-repo-b-api', 'run-repo-a-web'],
  }, filePath);

  assert.deepEqual(
    await takeRunLaunchCommand('run-repo-b-proxy', filePath),
    {
      launchMode: 'selected',
      shouldRun: false,
    },
  );
  assert.deepEqual(
    await takeRunLaunchCommand('run-repo-b-api', filePath),
    {
      launchMode: 'selected',
      shouldRun: true,
    },
  );

  const intermediateState = await readRunSelectionState(filePath);

  assert.deepEqual(intermediateState, {
    syncGit: true,
    syncGitRepoKeys: ['repo-b', 'repo-a'],
    selectedCommandNames: ['run-repo-b-api', 'run-repo-a-web'],
    launchMode: 'selected',
    pendingCommandNames: ['run-repo-a-web'],
  });

  assert.deepEqual(
    await takeRunLaunchCommand('run-repo-a-web', filePath),
    {
      launchMode: 'selected',
      shouldRun: true,
    },
  );

  const finalState = await readRunSelectionState(filePath);

  assert.deepEqual(finalState, {
    syncGit: true,
    syncGitRepoKeys: ['repo-b', 'repo-a'],
    selectedCommandNames: ['run-repo-b-api', 'run-repo-a-web'],
    launchMode: null,
    pendingCommandNames: [],
  });
});

test('run selection state migrates legacy syncGit and prunes non-selected repo sync state', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'imperiascm-cli-run-'));
  const filePath = path.join(tempDir, 'run-selection.json');
  useTestRuntimeContext({ runSelectionStatePath: filePath });
  t.after(clearTestRuntimeContext);

  await fs.writeFile(
    filePath,
    JSON.stringify({
      syncGit: true,
      selectedCommandNames: ['run-repo-b-api'],
      launchMode: null,
      pendingCommandNames: [],
    }),
    'utf8',
  );

  assert.deepEqual(await readRunSelectionState(filePath), {
    syncGit: true,
    syncGitRepoKeys: ['repo-b'],
    selectedCommandNames: ['run-repo-b-api'],
    launchMode: null,
    pendingCommandNames: [],
  });

  await writeRunSelectionState({
    syncGitRepoKeys: ['repo-b', 'repo-a'],
    selectedServices: getServicesByCommandNames(['run-repo-b-api']),
  }, filePath);

  assert.deepEqual(await readResolvedRunSelectionState(filePath), {
    syncGit: true,
    syncGitRepoKeys: ['repo-b'],
    selectedCommandNames: ['run-repo-b-api'],
    launchMode: null,
    pendingCommandNames: [],
    selectedServices: getServicesByCommandNames(['run-repo-b-api']),
    repoKeys: ['repo-b'],
  });
});
