import { sleep } from './fs-utils.mjs';
import { log } from './logging.mjs';
import { captureCommand, runCommand } from './process-runner.mjs';
import { getManagedPorts } from './services.mjs';

async function getListeningPortsByPid() {
  const { outputText } = await captureCommand('netstat', ['-ano', '-p', 'tcp'], {
    scope: 'stop-services',
  });
  const portsByPid = new Map();

  for (const line of outputText.split(/\r?\n/)) {
    const tokens = line.trim().split(/\s+/);

    if (tokens.length < 5 || !tokens[0].toUpperCase().startsWith('TCP')) {
      continue;
    }

    if (tokens[3].toUpperCase() !== 'LISTENING') {
      continue;
    }

    const pid = Number.parseInt(tokens[4], 10);
    const portMatch = tokens[1].match(/:(\d+)$/);

    if (!Number.isInteger(pid) || !portMatch) {
      continue;
    }

    const port = Number.parseInt(portMatch[1], 10);

    if (!portsByPid.has(pid)) {
      portsByPid.set(pid, new Set());
    }

    portsByPid.get(pid).add(port);
  }

  return portsByPid;
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

async function getProcessName(pid) {
  const { outputText } = await captureCommand('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
    scope: 'stop-services',
    throwOnError: false,
  });
  const line = outputText.trim();

  if (!line || line.startsWith('INFO:')) {
    return null;
  }

  const [imageName] = parseCsvLine(line);
  return imageName || null;
}

export async function stopServices({ services = null, ports = null } = {}) {
  const portsByPid = await getListeningPortsByPid();
  const targetPorts = ports ?? (services ? getManagedPorts(services) : getManagedPorts());
  const targetPortSet = new Set(targetPorts);
  const killTargets = [];

  if (targetPortSet.size === 0) {
    log('stop-services', 'OK', 'No managed ports selected.');
    return;
  }

  for (const port of [...targetPortSet].sort((left, right) => left - right)) {
    const pid = [...portsByPid.entries()].find(([, servicePorts]) => servicePorts.has(port))?.[0] ?? null;

    if (pid === null) {
      log('stop-services', 'OK', `No process on port ${port}.`);
    }
  }

  for (const [pid, servicePorts] of portsByPid.entries()) {
    const matchingPorts = [...servicePorts].filter((port) => targetPortSet.has(port));

    if (matchingPorts.length > 0) {
      killTargets.push({ pid, ports: matchingPorts });
    }
  }

  if (killTargets.length === 0) {
    return;
  }

  for (const target of killTargets) {
    const processName = await getProcessName(target.pid);
    const portList = target.ports.sort((left, right) => left - right).join(', ');
    log('stop-services', 'START', `Stopping ${processName ?? 'process'} PID ${target.pid} on port(s) ${portList}.`);
    await runCommand({
      scope: 'stop-services',
      description: `taskkill PID ${target.pid}`,
      command: 'taskkill',
      args: ['/PID', String(target.pid), '/F'],
      throwOnError: false,
      outputMode: 'capture-on-fail',
      successOutputSummary: true,
    });
  }

  log('stop-services', 'START', 'Waiting for ports to be released.');
  await sleep(3000);
  log('stop-services', 'OK', 'Ports released wait completed.');
}
