import { formatStatusBadge, recordStatus } from './terminal-ui.mjs';

export function log(scope, status, message) {
  recordStatus(status);
  void scope;

  if (message) {
    console.log(`${formatStatusBadge(status)} ${message}`);
    return;
  }

  console.log(`${formatStatusBadge(status)}`);
}

function quoteArg(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

export function formatCommand(command, args) {
  return [command, ...args].map(quoteArg).join(' ');
}

export function formatDuration(startMs) {
  const elapsedMs = Date.now() - startMs;

  if (elapsedMs < 1000) {
    return `${elapsedMs}ms`;
  }

  return `${(elapsedMs / 1000).toFixed(1)}s`;
}
