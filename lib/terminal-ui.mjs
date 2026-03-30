import process from 'node:process';
import ora from 'ora';
import colors from 'yoctocolors';

const sessionState = {
  commandName: null,
  startedAt: 0,
  counts: {
    OK: 0,
    FAIL: 0,
    SKIP: 0,
    WARN: 0,
  },
};

const asciiSpinner = {
  interval: 80,
  frames: ['-', '\\', '|', '/'],
};

function formatElapsed(startMs) {
  const elapsedMs = Date.now() - startMs;

  if (elapsedMs < 1000) {
    return `${elapsedMs}ms`;
  }

  return `${(elapsedMs / 1000).toFixed(1)}s`;
}

function renderDivider() {
  return colors.dim('='.repeat(72));
}

function renderSessionLine() {
  return colors.dim('Workspace orchestration for local development services');
}

export function supportsInteractiveUi() {
  return Boolean(process.stdout.isTTY && process.stderr.isTTY);
}

export function startSession(commandName) {
  sessionState.commandName = commandName;
  sessionState.startedAt = Date.now();
  sessionState.counts = {
    OK: 0,
    FAIL: 0,
    SKIP: 0,
    WARN: 0,
  };

  console.log(renderDivider());
  console.log(colors.bold(colors.cyan('imperia-cli')));
  console.log(colors.dim(`command: ${commandName}`));
  console.log(renderSessionLine());
  console.log(renderDivider());
}

export function finishSession(status) {
  if (!sessionState.startedAt) {
    return;
  }

  const parts = [
    `${sessionState.counts.OK} ok`,
    `${sessionState.counts.SKIP} skipped`,
    `${sessionState.counts.FAIL} failed`,
  ];

  console.log(renderDivider());
  console.log(`${status === 'ok' ? formatStatusBadge('OK') : formatStatusBadge('FAIL')} ${sessionState.commandName} finished in ${formatElapsed(sessionState.startedAt)} | ${parts.join(' | ')}`);

  sessionState.commandName = null;
  sessionState.startedAt = 0;
}

export function recordStatus(status) {
  if (Object.hasOwn(sessionState.counts, status)) {
    sessionState.counts[status] += 1;
  }
}

export function createSpinner(text) {
  return ora({
    text,
    spinner: asciiSpinner,
    isEnabled: supportsInteractiveUi(),
    discardStdin: false,
    hideCursor: false,
    stream: process.stdout,
  }).start();
}

export function formatStatusBadge(status) {
  const statusMap = {
    START: colors.cyan('[>]'),
    OK: colors.green('[+]'),
    FAIL: colors.red('[x]'),
    WARN: colors.yellow('[!]'),
    SKIP: colors.yellow('[-]'),
    INFO: colors.blue('[i]'),
    STEP: colors.magenta('[*]'),
  };

  return statusMap[status] ?? colors.white('[?]');
}

export function emitLifecycleMarker(status, message) {
  console.log(`${status} ${message}`);
}

export function renderError(error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${formatStatusBadge('FAIL')} ${message}`);
}

export function buildUsageText(commandDefinitions) {
  const entries = Object.entries(commandDefinitions)
    .filter(([, definition]) => !definition.hidden)
    .map(([name, definition]) => ({
      name,
      description: definition.description,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const maxNameLength = Math.max(...entries.map((entry) => entry.name.length), 0);
  const commandLines = entries.map((entry) =>
    `  ${colors.cyan(entry.name.padEnd(maxNameLength, ' '))}  ${entry.description}`);

  return [
    renderDivider(),
    colors.bold(colors.cyan('imperia-cli')),
    renderSessionLine(),
    renderDivider(),
    '',
    colors.bold('Quick Start'),
    `  ${colors.cyan('imp init')}  scaffold the workspace files`,
    `  ${colors.cyan('imp launch-services')}  open the interactive multi-service launcher`,
    `  ${colors.cyan('imp run-service <service>')}  run one configured service by command name`,
    `  ${colors.cyan('Ctrl+Shift+B')}  open the generated default build task in VS Code`,
    '',
    colors.bold('Commands'),
    ...commandLines,
  ].join('\n');
}
