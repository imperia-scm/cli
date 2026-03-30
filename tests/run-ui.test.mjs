import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyRunSelectionInput,
  createRunSelectionState,
  getSelectedServices,
  mapRunKeypressToInput,
  renderRunSelectionScreen,
} from '../lib/run-ui.mjs';
import { getServiceDefinitions } from '../lib/services.mjs';
import { clearTestRuntimeContext, stripAnsi, useTestRuntimeContext } from './test-utils.mjs';

test('run selector moves focus and toggles the focused service', (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);
  let state = createRunSelectionState(getServiceDefinitions());

  state = applyRunSelectionInput(state, 'down').state;
  state = applyRunSelectionInput(state, 'toggle-focused').state;

  assert.equal(state.cursorIndex, 1);
  assert.deepEqual(
    getSelectedServices(state).map((service) => service.commandName),
    ['run-repo-b-proxy'],
  );
});

test('run selector toggles focused repo sync rows and select-all state', (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);
  let state = createRunSelectionState(getServiceDefinitions());

  state = applyRunSelectionInput(state, 'toggle-all').state;
  state = applyRunSelectionInput(state, 'down').state;
  state = applyRunSelectionInput(state, 'down').state;
  state = applyRunSelectionInput(state, 'down').state;
  state = applyRunSelectionInput(state, 'down').state;
  state = applyRunSelectionInput(state, 'down').state;
  state = applyRunSelectionInput(state, 'down').state;
  state = applyRunSelectionInput(state, 'toggle-focused').state;

  assert.deepEqual([...state.syncGitRepoKeys], ['repo-b']);

  state = applyRunSelectionInput(state, 'down').state;
  state = applyRunSelectionInput(state, 'toggle-focused').state;

  assert.deepEqual(state.syncGitRepoKeys, new Set(['repo-b', 'repo-a']));

  state = applyRunSelectionInput(state, 'toggle-sync-git').state;

  assert.deepEqual([...state.syncGitRepoKeys], []);
  assert.equal(getSelectedServices(state).length, getServiceDefinitions().length);

  state = applyRunSelectionInput(state, 'toggle-all').state;

  assert.equal(getSelectedServices(state).length, 0);
});

test('run selector exposes confirm and cancel actions', (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);
  const state = createRunSelectionState(getServiceDefinitions());
  const selectedState = applyRunSelectionInput(state, 'toggle-focused').state;

  const invalidConfirmResult = applyRunSelectionInput(state, 'confirm');

  assert.equal(invalidConfirmResult.action, null);
  assert.equal(invalidConfirmResult.state.validationMessage, 'No services selected. Select at least one service before running.');
  assert.equal(applyRunSelectionInput(selectedState, 'confirm').action, 'confirm');
  assert.equal(applyRunSelectionInput(state, 'cancel').action, 'cancel');
});

test('run selector maps keypresses and renders instructions', (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);
  const state = createRunSelectionState(getServiceDefinitions());
  const screen = stripAnsi(renderRunSelectionScreen(state));

  assert.equal(mapRunKeypressToInput({ name: 'up' }), 'up');
  assert.equal(mapRunKeypressToInput({ name: 'down' }), 'down');
  assert.equal(mapRunKeypressToInput({ name: 'space' }), 'toggle-focused');
  assert.equal(mapRunKeypressToInput({ name: 'return' }), 'confirm');
  assert.equal(mapRunKeypressToInput({ name: 'escape' }), 'cancel');
  assert.equal(mapRunKeypressToInput({ name: 'c', ctrl: true }), 'interrupt');
  assert.match(screen, /API \(repo-b, \.NET\)/);
  assert.match(screen, /Web \(repo-a, Web\)/);
  assert.match(screen, /^imperia-cli$/m);
  assert.match(screen, /Controls/);
  assert.match(screen, /\[arrows\] \[j\/k\] move/);
  assert.match(screen, /\[space\] toggle focused/);
  assert.match(screen, /\[a\] all services/);
  assert.match(screen, /\[g\] visible sync repos/);
  assert.match(screen, /\[enter\] run/);
  assert.match(screen, /\[esc\] \[q\] cancel/);
  assert.match(screen, /Services \(select the services to launch with VS Code tasks\)/);
  assert.match(screen, /Synchronization \(get latest changes from fetch origin, then pull --ff-only --autostash if there are changes\)/);
  assert.match(screen, /Selection/);
  assert.match(screen, /All repositories/);
  assert.doesNotMatch(screen, /\n  \[.\] repo-b\n/);
});

test('run selector lets g preselect git sync before any repo is selected', (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);
  let state = createRunSelectionState(getServiceDefinitions());

  state = applyRunSelectionInput(state, 'toggle-sync-git').state;

  assert.deepEqual(state.syncGitRepoKeys, new Set(['repo-b', 'repo-a']));

  const screen = stripAnsi(renderRunSelectionScreen(state));

  assert.match(screen, /\[x\] All repositories/);
  assert.match(screen, /Repositories to synchronize: 0\/0/);
});

test('run selector renders and clears validation message for empty confirm', (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);
  let state = createRunSelectionState(getServiceDefinitions());

  state = applyRunSelectionInput(state, 'confirm').state;

  const errorScreen = stripAnsi(renderRunSelectionScreen(state));

  assert.match(errorScreen, /No services selected\. Select at least one service before running\./);

  state = applyRunSelectionInput(state, 'down').state;

  assert.equal(state.validationMessage, null);
});

test('run selector renders repo sync rows only for selected repos and shows partial global state', (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);
  let state = createRunSelectionState(getServiceDefinitions());

  state = applyRunSelectionInput(state, 'toggle-focused').state;

  const singleRepoScreen = stripAnsi(renderRunSelectionScreen(state));

  assert.match(singleRepoScreen, /\n  \[.\] repo-b\n/);
  assert.doesNotMatch(singleRepoScreen, /\n  \[.\] repo-a\n/);

  state = applyRunSelectionInput(state, 'down').state;
  state = applyRunSelectionInput(state, 'down').state;
  state = applyRunSelectionInput(state, 'toggle-focused').state;

  state = applyRunSelectionInput(state, 'down').state;
  state = applyRunSelectionInput(state, 'down').state;
  state = applyRunSelectionInput(state, 'down').state;
  state = applyRunSelectionInput(state, 'down').state;
  state = applyRunSelectionInput(state, 'down').state;
  state = applyRunSelectionInput(state, 'toggle-focused').state;

  const partialScreen = stripAnsi(renderRunSelectionScreen(state));

  assert.match(partialScreen, /  \[-\] All repositories/);
});
