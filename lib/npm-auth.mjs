import process from 'node:process';
import readline from 'node:readline';
import {
  npmAuthTokenKey,
  npmCommand,
  npmRegistryUrl,
} from './runtime-config.mjs';
import { log } from './logging.mjs';
import { captureCommand, runCommand } from './process-runner.mjs';

async function setNpmUserConfigValue(key, value, cwd) {
  const result = await runCommand({
    scope: 'npm-auth',
    description: `set npm config ${key}`,
    command: npmCommand,
    args: ['config', 'set', '--location=user', `${key}=${value}`],
    cwd,
    throwOnError: false,
  });

  return result.code;
}

async function testNpmUserAuthentication(cwd) {
  const result = await captureCommand(npmCommand, ['whoami', '--registry', npmRegistryUrl], {
    cwd,
    scope: 'npm-auth',
    throwOnError: false,
  });

  return result.code === 0;
}

async function promptHidden(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('[npm-auth] Unable to read an npm token interactively in a non-TTY session.');
  }

  return await new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    let value = '';

    const cleanup = () => {
      stdin.removeListener('data', onData);

      if (stdin.isTTY) {
        stdin.setRawMode(Boolean(wasRaw));
      }
    };

    const onData = (chunk) => {
      const text = String(chunk);

      if (text === '\u0003') {
        cleanup();
        process.stdout.write('\n');
        reject(new Error('[npm-auth] npm token entry cancelled.'));
        return;
      }

      if (text === '\r' || text === '\n') {
        cleanup();
        process.stdout.write('\n');
        resolve(value.trim());
        return;
      }

      if (text === '\u0008' || text === '\u007f') {
        value = value.slice(0, -1);
        return;
      }

      if (text.startsWith('\u001b')) {
        return;
      }

      value += text;
    };

    process.stdout.write(`${prompt}: `);
    readline.emitKeypressEvents(stdin);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

export async function ensureNpmUserAuthentication(cwd) {
  if (await testNpmUserAuthentication(cwd)) {
    log('npm-auth', 'OK', 'Existing npm authentication is valid.');
    return;
  }

  log('npm-auth', 'FAIL', 'npm authentication is missing or invalid.');

  const plainToken = await promptHidden('Enter your npm token');

  if (!plainToken) {
    throw new Error('[npm-auth] No npm token was provided. Aborting before npm install.');
  }

  let exitCode = await setNpmUserConfigValue(npmAuthTokenKey, plainToken, cwd);

  if (exitCode !== 0) {
    throw new Error('[npm-auth] Unable to store the npm token in the user .npmrc.');
  }

  if (!(await testNpmUserAuthentication(cwd))) {
    throw new Error('[npm-auth] The provided npm token is invalid. Aborting before npm install.');
  }

  log('npm-auth', 'OK', 'npm authentication stored successfully in the user profile.');
}
