import { log } from './logging.mjs';
import {
  clearRunSelectionState,
  writeRunSelectionState,
} from './run-selection-state.mjs';
import { showRunSelectionPrompt } from './run-ui.mjs';
import { getServiceDefinitions } from './services.mjs';

export async function runInteractiveCommand(options = {}) {
  const {
    presentSelection = showRunSelectionPrompt,
    persistSelection = writeRunSelectionState,
    clearSelection = clearRunSelectionState,
  } = options;
  const selection = await presentSelection(getServiceDefinitions(), options.io ?? {});

  if (selection.cancelled) {
    await clearSelection();
    log('run', 'SKIP', 'Run cancelled.');
    return;
  }

  if (selection.selectedServices.length === 0) {
    await clearSelection();
    log('run', 'SKIP', 'No services selected.');
    return;
  }

  await persistSelection(selection);
  log('run', 'OK', `Stored ${selection.selectedServices.length} selected service(s) for VS Code tasks.`);
}
