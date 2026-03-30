import process from 'node:process';
import readline from 'node:readline';
import colors from 'yoctocolors';
import { getRepositoryDefinition } from './repositories.mjs';
import { getSelectedRepoKeys } from './services.mjs';

function cloneSelectionState(state, overrides = {}) {
  return {
    ...state,
    selectedCommandNames: new Set(state.selectedCommandNames),
    syncGitRepoKeys: new Set(state.syncGitRepoKeys),
    ...overrides,
  };
}

export function createRunSelectionState(services) {
  return {
    services,
    cursorIndex: 0,
    selectedCommandNames: new Set(),
    syncGitRepoKeys: new Set(),
    validationMessage: null,
  };
}

export function getSelectedServices(state) {
  return state.services.filter((service) => state.selectedCommandNames.has(service.commandName));
}

function getVisibleRunSyncRepoKeys(state) {
  return getSelectedRepoKeys(getSelectedServices(state));
}

function getAllRunSyncRepoKeys(state) {
  return getSelectedRepoKeys(state.services);
}

function getGlobalRunSyncRepoKeys(state) {
  const visibleRepoKeys = getVisibleRunSyncRepoKeys(state);
  return visibleRepoKeys.length > 0 ? visibleRepoKeys : getAllRunSyncRepoKeys(state);
}

function getSelectedVisibleRunSyncRepoKeys(state) {
  return getVisibleRunSyncRepoKeys(state).filter((repoKey) => state.syncGitRepoKeys.has(repoKey));
}

function hasAllVisibleRunSyncReposSelected(state, visibleRepoKeys = getVisibleRunSyncRepoKeys(state)) {
  return visibleRepoKeys.length > 0 && visibleRepoKeys.every((repoKey) => state.syncGitRepoKeys.has(repoKey));
}

function hasSomeVisibleRunSyncReposSelected(state, visibleRepoKeys = getVisibleRunSyncRepoKeys(state)) {
  return visibleRepoKeys.some((repoKey) => state.syncGitRepoKeys.has(repoKey));
}

function getRunSelectionEntries(state) {
  return [
    ...state.services.map((service) => ({
      type: 'service',
      commandName: service.commandName,
    })),
    {
      type: 'sync-global',
    },
    ...getVisibleRunSyncRepoKeys(state).map((repoKey) => ({
      type: 'sync-repo',
      repoKey,
    })),
  ];
}

function normalizeRunCursorIndex(state, entries = getRunSelectionEntries(state)) {
  if (entries.length === 0) {
    return 0;
  }

  return Math.max(0, Math.min(state.cursorIndex, entries.length - 1));
}

export function moveRunSelectionCursor(state, delta) {
  const entries = getRunSelectionEntries(state);

  if (entries.length === 0) {
    return cloneSelectionState(state, { cursorIndex: 0 });
  }

  const currentIndex = normalizeRunCursorIndex(state, entries);
  const nextIndex = (currentIndex + delta + entries.length) % entries.length;
  return cloneSelectionState(state, { cursorIndex: nextIndex });
}

function toggleRunService(state, commandName) {
  const nextState = cloneSelectionState(state);

  if (nextState.selectedCommandNames.has(commandName)) {
    nextState.selectedCommandNames.delete(commandName);
  } else {
    nextState.selectedCommandNames.add(commandName);
  }

  return nextState;
}

function toggleRunSyncGitRepo(state, repoKey) {
  const nextState = cloneSelectionState(state);

  if (nextState.syncGitRepoKeys.has(repoKey)) {
    nextState.syncGitRepoKeys.delete(repoKey);
  } else {
    nextState.syncGitRepoKeys.add(repoKey);
  }

  return nextState;
}

export function toggleFocusedRunService(state) {
  const entries = getRunSelectionEntries(state);

  if (entries.length === 0) {
    return cloneSelectionState(state);
  }

  const focusedEntry = entries[normalizeRunCursorIndex(state, entries)];

  if (focusedEntry.type === 'service') {
    return toggleRunService(state, focusedEntry.commandName);
  }

  if (focusedEntry.type === 'sync-global') {
    return toggleRunSyncGit(state);
  }

  if (focusedEntry.type === 'sync-repo') {
    return toggleRunSyncGitRepo(state, focusedEntry.repoKey);
  }

  return cloneSelectionState(state);
}

export function toggleRunSyncGit(state) {
  const visibleRepoKeys = getGlobalRunSyncRepoKeys(state);

  if (visibleRepoKeys.length === 0) {
    return cloneSelectionState(state);
  }

  const nextState = cloneSelectionState(state);
  const allVisibleSelected = hasAllVisibleRunSyncReposSelected(state, visibleRepoKeys);

  for (const repoKey of visibleRepoKeys) {
    if (allVisibleSelected) {
      nextState.syncGitRepoKeys.delete(repoKey);
    } else {
      nextState.syncGitRepoKeys.add(repoKey);
    }
  }

  return nextState;
}

export function toggleAllRunServices(state) {
  const nextState = cloneSelectionState(state);
  const allSelected = nextState.services.length > 0 && nextState.services.every(
    (service) => nextState.selectedCommandNames.has(service.commandName),
  );

  nextState.selectedCommandNames = allSelected
    ? new Set()
    : new Set(nextState.services.map((service) => service.commandName));

  return nextState;
}

export function applyRunSelectionInput(state, input) {
  const nextState = state.validationMessage && input !== 'confirm'
    ? cloneSelectionState(state, { validationMessage: null })
    : state;

  switch (input) {
    case 'up':
      return { state: moveRunSelectionCursor(nextState, -1), action: null };
    case 'down':
      return { state: moveRunSelectionCursor(nextState, 1), action: null };
    case 'toggle-focused':
      return { state: toggleFocusedRunService(nextState), action: null };
    case 'toggle-sync-git':
      return { state: toggleRunSyncGit(nextState), action: null };
    case 'toggle-all':
      return { state: toggleAllRunServices(nextState), action: null };
    case 'confirm':
      return getSelectedServices(nextState).length > 0
        ? { state: nextState, action: 'confirm' }
        : {
            state: cloneSelectionState(nextState, {
              validationMessage: 'No services selected. Select at least one service before launching.',
            }),
            action: null,
          };
    case 'cancel':
      return { state: nextState, action: 'cancel' };
    default:
      return { state: nextState, action: null };
  }
}

export function mapRunKeypressToInput(key, text = '') {
  if (key?.ctrl && key.name === 'c') {
    return 'interrupt';
  }

  if (key?.name === 'up' || text === 'k') {
    return 'up';
  }

  if (key?.name === 'down' || text === 'j') {
    return 'down';
  }

  if (key?.name === 'space') {
    return 'toggle-focused';
  }

  if (text === 'g') {
    return 'toggle-sync-git';
  }

  if (text === 'a') {
    return 'toggle-all';
  }

  if (key?.name === 'return' || key?.name === 'enter') {
    return 'confirm';
  }

  if (key?.name === 'escape' || text === 'q') {
    return 'cancel';
  }

  return null;
}

function renderSelectableLine(label, checkbox, isFocused) {
  const cursor = isFocused ? colors.cyan('>') : ' ';
  return `${cursor} ${checkbox} ${label}`;
}

function renderControlKey(label) {
  return colors.cyan(`[${label}]`);
}

function renderControlsBlock() {
  return [
    colors.bold('Controls'),
    `  ${renderControlKey('arrows')} ${renderControlKey('j/k')} move   ${renderControlKey('space')} toggle focused   ${renderControlKey('a')} all services`,
    `  ${renderControlKey('g')} visible sync repos   ${renderControlKey('enter')} launch   ${renderControlKey('esc')} ${renderControlKey('q')} cancel`,
  ];
}

function renderServiceLine(service, isSelected, isFocused) {
  const checkbox = isSelected ? colors.green('[x]') : '[ ]';
  const metadata = [service.repoKey, service.runtime].filter(Boolean).join(', ');
  return renderSelectableLine(
    `${service.title}${metadata ? ` ${colors.dim(`(${metadata})`)}` : ''}`,
    checkbox,
    isFocused,
  );
}

function renderGlobalSyncGitLine(state, isFocused) {
  const visibleRepoKeys = getGlobalRunSyncRepoKeys(state);
  const allSelected = hasAllVisibleRunSyncReposSelected(state, visibleRepoKeys);
  const someSelected = hasSomeVisibleRunSyncReposSelected(state, visibleRepoKeys);
  const checkbox = allSelected
    ? colors.green('[x]')
    : someSelected
      ? colors.yellow('[-]')
      : '[ ]';

  return renderSelectableLine(
    `All repositories ${colors.dim('(toggle with g)')}`,
    checkbox,
    isFocused,
  );
}

function renderRepoSyncGitLine(repoKey, isSelected, isFocused) {
  const checkbox = isSelected ? colors.green('[x]') : '[ ]';
  const repository = getRepositoryDefinition(repoKey);
  return renderSelectableLine(repository.label, checkbox, isFocused);
}

export function renderRunSelectionScreen(state) {
  const selectedCount = getSelectedServices(state).length;
  const visibleRepoKeys = getVisibleRunSyncRepoKeys(state);
  const selectedVisibleRepoKeys = getSelectedVisibleRunSyncRepoKeys(state);
  const entries = getRunSelectionEntries(state);
  const cursorIndex = normalizeRunCursorIndex(state, entries);
  const serviceLines = state.services.map((service, index) =>
    renderServiceLine(
      service,
      state.selectedCommandNames.has(service.commandName),
      index === cursorIndex,
    ),
  );
  const globalSyncLine = renderGlobalSyncGitLine(state, cursorIndex === state.services.length);
  const repoSyncLines = visibleRepoKeys.map((repoKey, index) =>
    renderRepoSyncGitLine(
      repoKey,
      state.syncGitRepoKeys.has(repoKey),
      cursorIndex === state.services.length + 1 + index,
    ),
  );

  return [
    colors.bold(colors.cyan('imperiascm-cli')),
    '',
    ...renderControlsBlock(),
    '',
    `${colors.bold('Services')} ${colors.dim('(select the services to launch)')}`,
    ...serviceLines,
    '',
    `${colors.bold('Synchronization')} ${colors.dim('(get latest changes from fetch origin, then pull --ff-only --autostash if there are changes)')}`,
    globalSyncLine,
    ...repoSyncLines,
    '',
    colors.bold('Selection'),
    `  Services to launch: ${selectedCount}`,
    `  Repositories to synchronize: ${selectedVisibleRepoKeys.length}/${visibleRepoKeys.length}`,
    ...(state.validationMessage ? ['', colors.red(state.validationMessage)] : []),
  ].join('\n');
}

export function buildNonInteractiveRunError() {
  return new Error('[launch-services] Interactive terminal required. Run this command from an interactive terminal session.');
}

function countRenderedLines(screenText) {
  return screenText.length === 0 ? 1 : screenText.split('\n').length;
}

export async function showRunSelectionPrompt(
  services,
  {
    stdin = process.stdin,
    stdout = process.stdout,
  } = {},
) {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== 'function') {
    throw buildNonInteractiveRunError();
  }

  return await new Promise((resolve, reject) => {
    let state = createRunSelectionState(services);
    const wasRaw = stdin.isRaw;
    let settled = false;
    let renderedLineCount = 0;
    let usingAlternateScreen = false;
    let cursorHidden = false;

    const moveToRenderStart = () => {
      if (renderedLineCount <= 0) {
        return;
      }

      if (renderedLineCount > 1) {
        readline.moveCursor(stdout, 0, -(renderedLineCount - 1));
      }

      readline.cursorTo(stdout, 0);
    };

    const render = () => {
      const screen = renderRunSelectionScreen(state);

      if (!usingAlternateScreen) {
        stdout.write('\x1b[?1049h');
        usingAlternateScreen = true;
      }

      if (!cursorHidden) {
        stdout.write('\x1b[?25l');
        cursorHidden = true;
      }

      moveToRenderStart();
      readline.clearScreenDown(stdout);
      stdout.write(screen);
      renderedLineCount = countRenderedLines(screen);
    };

    const cleanup = () => {
      if (usingAlternateScreen) {
        stdout.write('\x1b[?1049l');
        usingAlternateScreen = false;
      } else {
        moveToRenderStart();
        readline.clearScreenDown(stdout);
      }

      if (cursorHidden) {
        stdout.write('\x1b[?25h');
        cursorHidden = false;
      }

      stdin.removeListener('keypress', onKeypress);

      if (stdin.isTTY) {
        stdin.setRawMode(Boolean(wasRaw));
      }

      stdin.pause();
    };

    const finish = (handler) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      handler();
    };

    const onKeypress = (text, key) => {
      const input = mapRunKeypressToInput(key, text);

      if (!input) {
        return;
      }

      if (input === 'interrupt') {
        finish(() => {
          process.kill(process.pid, 'SIGINT');
        });
        return;
      }

      const result = applyRunSelectionInput(state, input);
      state = result.state;

      if (result.action === 'confirm') {
        finish(() => {
          const syncGitRepoKeys = getSelectedVisibleRunSyncRepoKeys(state);
          resolve({
            cancelled: false,
            syncGit: hasAllVisibleRunSyncReposSelected(state),
            syncGitRepoKeys,
            selectedServices: getSelectedServices(state),
          });
        });
        return;
      }

      if (result.action === 'cancel') {
        finish(() => {
          const syncGitRepoKeys = getSelectedVisibleRunSyncRepoKeys(state);
          resolve({
            cancelled: true,
            syncGit: hasAllVisibleRunSyncReposSelected(state),
            syncGitRepoKeys,
            selectedServices: [],
          });
        });
        return;
      }

      render();
    };

    try {
      readline.emitKeypressEvents(stdin);
      stdin.setEncoding('utf8');
      stdin.setRawMode(true);
      stdin.resume();
      stdin.on('keypress', onKeypress);
      render();
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
