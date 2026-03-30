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
    log('launch-services', 'SKIP', 'Launch cancelled.');
    return null;
  }

  if (selection.selectedServices.length === 0) {
    await clearSelection();
    log('launch-services', 'SKIP', 'No services selected.');
    return null;
  }

  await persistSelection(selection);
  log('launch-services', 'OK', `Stored ${selection.selectedServices.length} selected service(s).`);
  return selection;
}
