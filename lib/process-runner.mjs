import { spawn } from 'node:child_process';
import process from 'node:process';
import { sleep } from './fs-utils.mjs';
import { formatCommand, formatDuration, log } from './logging.mjs';
import { createSpinner, emitLifecycleMarker } from './terminal-ui.mjs';

const activeChildren = new Set();
let shutdownRequested = false;
let signalHandlersRegistered = false;

function resolveSpawnCommand(command, args) {
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)) {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', command, ...args],
    };
  }

  return { command, args };
}

function summarizeOutput(outputText) {
  const lastNonEmptyLine = outputText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  return lastNonEmptyLine ?? null;
}

function writeCapturedOutput(target, outputText) {
  if (!outputText.trim()) {
    return;
  }

  target.write(outputText.endsWith('\n') ? outputText : `${outputText}\n`);
}

function finishSpinner(spinner, method, text) {
  if (!spinner) {
    return false;
  }

  spinner[method](text);
  return true;
}

export class CommandError extends Error {
  constructor(scope, commandLine, code, signal, outputText = '') {
    super(`Command failed${scope ? ` (${scope})` : ''} with ${signal ? `signal ${signal}` : `exit code ${code}`}: ${commandLine}`);
    this.name = 'CommandError';
    this.code = code;
    this.signal = signal;
    this.outputText = outputText;
  }
}

function createLineWriter(target, prefix) {
  let buffer = '';

  return {
    write(chunk) {
      buffer += chunk;

      while (true) {
        const newlineIndex = buffer.indexOf('\n');

        if (newlineIndex === -1) {
          break;
        }

        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
        target.write(prefix ? `${prefix}${line}\n` : `${line}\n`);
        buffer = buffer.slice(newlineIndex + 1);
      }
    },
    flush() {
      if (buffer.length === 0) {
        return;
      }

      target.write(prefix ? `${prefix}${buffer}\n` : `${buffer}\n`);
      buffer = '';
    },
  };
}

function pipeStream(stream, target, prefix, chunks, forwardOutput) {
  if (!stream) {
    return Promise.resolve();
  }

  stream.setEncoding('utf8');

  if (!prefix) {
    stream.on('data', (chunk) => {
      if (chunks) {
        chunks.push(chunk);
      }

      if (forwardOutput) {
        target.write(chunk);
      }
    });

    return new Promise((resolve) => {
      stream.on('end', resolve);
    });
  }

  const writer = createLineWriter(target, prefix);

  stream.on('data', (chunk) => {
    if (chunks) {
      chunks.push(chunk);
    }

    if (forwardOutput) {
      writer.write(chunk);
    }
  });

  return new Promise((resolve) => {
    stream.on('end', () => {
      if (forwardOutput) {
        writer.flush();
      }

      resolve();
    });
  });
}

function announceCommand(scope, description, outputMode, spinnerEnabled) {
  if (outputMode === 'passthrough' || !spinnerEnabled) {
    log(scope, 'START', description);
  }
}

function buildChildEnv(env = {}) {
  const childEnv = { ...process.env, ...env };

  // Avoid inheriting Node's test-runner worker context into spawned commands.
  if (!Object.hasOwn(env, 'NODE_TEST_CONTEXT')) {
    delete childEnv.NODE_TEST_CONTEXT;
  }

  return childEnv;
}

export async function runCommand({
  scope,
  description,
  command,
  args = [],
  cwd = process.cwd(),
  env = {},
  outputPrefix = null,
  collectOutput = false,
  stdin = 'inherit',
  throwOnError = true,
  announce = true,
  forwardOutput = true,
  outputMode = 'capture-on-fail',
  spinner = true,
  successOutputSummary = false,
}) {
  const startedAt = Date.now();
  const commandLine = formatCommand(command, args);
  const spawnTarget = resolveSpawnCommand(command, args);
  const shouldForwardOutput = outputMode === 'passthrough' ? forwardOutput : false;
  const shouldCollectOutput = collectOutput || outputMode !== 'passthrough';
  const stdoutChunks = shouldCollectOutput ? [] : null;
  const stderrChunks = shouldCollectOutput ? [] : null;
  const childEnv = buildChildEnv(env);
  const spinnerEnabled = spinner && outputMode !== 'passthrough';

  if (announce) {
    announceCommand(scope, description, outputMode, spinnerEnabled);
  }

  const activeSpinner = announce && spinnerEnabled ? createSpinner(description) : null;

  return await new Promise((resolve, reject) => {
    const child = spawn(spawnTarget.command, spawnTarget.args, {
      cwd,
      env: childEnv,
      stdio: [stdin, 'pipe', 'pipe'],
      windowsHide: false,
    });

    activeChildren.add(child);

    child.once('error', (error) => {
      activeChildren.delete(child);
      finishSpinner(activeSpinner, 'fail', `${description} (${formatDuration(startedAt)})`);
      reject(error);
    });

    const stdoutDone = pipeStream(child.stdout, process.stdout, outputPrefix, stdoutChunks, shouldForwardOutput);
    const stderrDone = pipeStream(child.stderr, process.stderr, outputPrefix, stderrChunks, shouldForwardOutput);

    child.once('close', async (code, signal) => {
      activeChildren.delete(child);
      await Promise.all([stdoutDone, stderrDone]);

      const outputText = shouldCollectOutput ? `${stdoutChunks.join('')}${stderrChunks.join('')}` : '';
      const duration = formatDuration(startedAt);
      const isSuccess = code === 0;
      const shouldResolve = isSuccess || (!throwOnError && code !== null);

      if (shouldResolve) {
        if (announce) {
          if (!finishSpinner(activeSpinner, isSuccess ? 'succeed' : 'fail', `${description} (${duration})`)) {
            log(scope, isSuccess ? 'OK' : 'FAIL', `${description} (${duration})`);
          }

          if (successOutputSummary && isSuccess) {
            const summary = summarizeOutput(outputText);

            if (summary) {
              log(scope, 'INFO', summary);
            }
          }

          if (!isSuccess && outputMode !== 'passthrough') {
            writeCapturedOutput(process.stderr, outputText);
          }
        }

        resolve({ code: code ?? 1, signal, outputText });
        return;
      }

      if (announce) {
        if (!finishSpinner(activeSpinner, 'fail', `${description} (${duration})`)) {
          log(scope, 'FAIL', `${description} (${duration})`);
        }

        if (outputMode !== 'passthrough') {
          writeCapturedOutput(process.stderr, outputText);
        }
      }

      reject(new CommandError(scope, commandLine, code ?? 1, signal, outputText));
    });
  });
}

export async function captureCommand(command, args, options = {}) {
  const { outputText, code } = await runCommand({
    scope: options.scope ?? 'capture',
    description: options.description ?? command,
    command,
    args,
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? {},
    collectOutput: true,
    throwOnError: options.throwOnError ?? true,
    announce: false,
    stdin: 'ignore',
    forwardOutput: false,
    outputMode: 'capture-on-fail',
  });

  return { outputText, code };
}

export async function captureTrimmed(command, args, options = {}) {
  const { outputText } = await captureCommand(command, args, options);
  return outputText.trim();
}

export async function runService(commandName, command, args, cwd, env = {}) {
  emitLifecycleMarker('START', 'service');

  await runCommand({
    scope: commandName,
    description: 'service',
    command,
    args,
    cwd,
    env,
    outputPrefix: null,
    outputMode: 'passthrough',
  });
}

function createServiceGroupPrefix(commandName) {
  return `[${commandName}] `;
}

async function terminateChildren(children, signal = 'SIGINT') {
  for (const child of children) {
    if (child.killed) {
      continue;
    }

    try {
      child.kill(signal);
    } catch {
      child.kill();
    }
  }

  await sleep(1000);

  for (const child of children) {
    if (child.killed) {
      continue;
    }

    try {
      child.kill('SIGKILL');
    } catch {
      child.kill();
    }
  }
}

export async function runServiceGroup(services) {
  if (!Array.isArray(services) || services.length === 0) {
    return;
  }

  const children = [];
  let remaining = services.length;
  let shutdownStarted = false;
  let shutdownReason = null;
  let finalError = null;

  return await new Promise((resolve, reject) => {
    const maybeFinish = () => {
      if (remaining !== 0) {
        return;
      }

      if (finalError) {
        reject(finalError);
        return;
      }

      resolve();
    };

    const beginShutdown = async (originChild, reason, error = null) => {
      if (shutdownStarted) {
        return;
      }

      shutdownStarted = true;
      shutdownReason = reason;

      if (error && !finalError) {
        finalError = error;
      }

      const otherChildren = children.filter((child) => child !== originChild && !child.killed);

      if (otherChildren.length === 0) {
        return;
      }

      await terminateChildren(otherChildren);
    };

    for (const service of services) {
      const spawnTarget = resolveSpawnCommand(service.command, service.args);
      let childSettled = false;
      const childEnv = buildChildEnv(service.env);
      const child = spawn(spawnTarget.command, spawnTarget.args, {
        cwd: service.cwd,
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: false,
      });

      children.push(child);
      activeChildren.add(child);
      emitLifecycleMarker('START', `service ${service.commandName}`);

      const prefix = createServiceGroupPrefix(service.commandName);
      const stdoutDone = pipeStream(child.stdout, process.stdout, prefix, null, true);
      const stderrDone = pipeStream(child.stderr, process.stderr, prefix, null, true);

      child.once('error', (error) => {
        if (childSettled) {
          return;
        }

        childSettled = true;
        activeChildren.delete(child);
        remaining -= 1;
        void (async () => {
          await beginShutdown(child, 'error', error);
          maybeFinish();
        })();
      });

      child.once('close', (code, signal) => {
        if (childSettled) {
          return;
        }

        childSettled = true;
        activeChildren.delete(child);
        remaining -= 1;

        void (async () => {
          await Promise.all([stdoutDone, stderrDone]);

          const error = code === 0 && !signal
            ? null
            : new CommandError(
              service.commandName,
              formatCommand(service.command, service.args),
              code ?? 1,
              signal,
            );

          if (!shutdownStarted) {
            await beginShutdown(child, error ? 'error' : 'success', error);
          } else if (shutdownReason === 'error' && error && !finalError) {
            finalError = error;
          }

          maybeFinish();
        })();
      });
    }
  });
}

export async function terminateActiveChildren(signal = 'SIGINT') {
  shutdownRequested = true;
  const children = [...activeChildren];

  if (children.length === 0) {
    return;
  }
  await terminateChildren(children, signal);
}

export function registerSignalHandlers() {
  if (signalHandlersRegistered) {
    return;
  }

  signalHandlersRegistered = true;

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      void (async () => {
        log('launcher', 'FAIL', `Received ${signal}. Stopping child processes.`);
        await terminateActiveChildren(signal);
        process.exit(130);
      })();
    });
  }
}
