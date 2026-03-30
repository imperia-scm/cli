import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readTextIfExists } from './fs-utils.mjs';
import { formatCommand, log } from './logging.mjs';
import { captureCommand, captureTrimmed, CommandError, runCommand } from './process-runner.mjs';

export async function getRepoFingerprint(targetRepoRoot) {
  const branch = await captureTrimmed('git', ['-C', targetRepoRoot, 'branch', '--show-current'], {
    cwd: targetRepoRoot,
    scope: 'git-fingerprint',
  });
  const head = await captureTrimmed('git', ['-C', targetRepoRoot, 'rev-parse', 'HEAD'], {
    cwd: targetRepoRoot,
    scope: 'git-fingerprint',
  });
  const { outputText: statusText } = await captureCommand('git', ['-C', targetRepoRoot, 'status', '--porcelain'], {
    cwd: targetRepoRoot,
    scope: 'git-fingerprint',
  });
  const statusHash = createHash('sha256').update(statusText, 'utf8').digest('hex').toUpperCase();

  return [branch, head, statusHash].join('\n');
}

function buildContainsOnlyTestFailures(outputText) {
  const errorLines = outputText.split(/\r?\n/).filter((line) => /:\s*error\s+[A-Za-z]+\d+:/.test(line));

  if (errorLines.length === 0) {
    return false;
  }

  const nonTestErrors = errorLines.filter((line) => !/[/\\](?:[^/\\]*\.)?Tests[/\\]/.test(line) && !/\.Tests\.csproj/.test(line) && !/[/\\]Tests\./.test(line));

  return nonTestErrors.length === 0;
}

export async function invokeTrackedBuild({ targetRepoRoot, stateFileName, solutionPath, taskLabel }) {
  const stateDir = path.join(targetRepoRoot, '.git', 'task-state');
  const stateFile = path.join(stateDir, stateFileName);

  await fs.mkdir(stateDir, { recursive: true });

  const fingerprint = await getRepoFingerprint(targetRepoRoot);
  const previousFingerprint = await readTextIfExists(stateFile);

  if (previousFingerprint === fingerprint) {
    log(taskLabel, 'SKIP', 'No git changes since last successful build.');
    return;
  }

  const result = await runCommand({
    scope: taskLabel,
    description: 'building solution',
    command: 'dotnet',
    args: ['build', solutionPath, '--no-incremental'],
    cwd: targetRepoRoot,
    collectOutput: true,
    throwOnError: false,
    outputMode: 'capture-on-fail',
    successOutputSummary: true,
  });

  if (result.code !== 0) {
    if (buildContainsOnlyTestFailures(result.outputText)) {
      const updatedFingerprint = await getRepoFingerprint(targetRepoRoot);
      await fs.writeFile(stateFile, updatedFingerprint, 'utf8');
      log(taskLabel, 'OK', 'Build failure only in test projects. Continuing startup.');
      return;
    }

    throw new CommandError(taskLabel, formatCommand('dotnet', ['build', solutionPath, '--no-incremental']), result.code, result.signal, result.outputText);
  }

  const updatedFingerprint = await getRepoFingerprint(targetRepoRoot);
  await fs.writeFile(stateFile, updatedFingerprint, 'utf8');
}

export async function syncRepository(targetRepoRoot, repoLabel) {
  await runCommand({
    scope: 'git-sync',
    description: `${repoLabel}: fetch origin`,
    command: 'git',
    args: ['-C', targetRepoRoot, 'fetch', 'origin'],
    cwd: targetRepoRoot,
    outputMode: 'capture-on-fail',
    successOutputSummary: true,
  });

  const local = await captureTrimmed('git', ['-C', targetRepoRoot, 'rev-parse', 'HEAD'], {
    cwd: targetRepoRoot,
    scope: 'git-sync',
  });
  const remote = await captureTrimmed('git', ['-C', targetRepoRoot, 'rev-parse', '@{u}'], {
    cwd: targetRepoRoot,
    scope: 'git-sync',
  });

  if (local === remote) {
    log('git-sync', 'OK', `${repoLabel}: already up to date.`);
    return;
  }

  log('git-sync', 'START', `${repoLabel}: changes detected, pulling.`);
  await runCommand({
    scope: 'git-sync',
    description: `${repoLabel}: pull --ff-only --autostash`,
    command: 'git',
    args: ['-C', targetRepoRoot, 'pull', '--ff-only', '--autostash'],
    cwd: targetRepoRoot,
    outputMode: 'capture-on-fail',
    successOutputSummary: true,
  });
}
