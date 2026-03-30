import { formatDuration, log } from './logging.mjs';

export function createProgressReporter(scope, steps, title = null) {
  let currentStep = 0;
  const startedAt = Date.now();

  if (title) {
    log(scope, 'INFO', title);
  }

  return {
    async runStep(label, operation) {
      const nextStep = currentStep + 1;
      const stepStartedAt = Date.now();
      const prefix = `[${nextStep}/${steps}]`;

      log(scope, 'STEP', `${prefix} ${label}`);

      try {
        const result = await operation();
        currentStep = nextStep;
        log(scope, 'OK', `${prefix} ${label} (${formatDuration(stepStartedAt)})`);
        return result;
      } catch (error) {
        log(scope, 'FAIL', `${prefix} ${label} (${formatDuration(stepStartedAt)})`);
        throw error;
      }
    },
    finish(message = 'Completed.') {
      log(scope, 'OK', `${message} (${formatDuration(startedAt)})`);
    },
  };
}
