import assert from 'node:assert/strict';
import test from 'node:test';
import { createCommandRegistry } from '../lib/commands.mjs';
import {
  buildUsageText,
  finishSession,
  formatStatusBadge,
  recordStatus,
  renderError,
  startSession,
} from '../lib/terminal-ui.mjs';
import { clearTestRuntimeContext, captureProcessOutput, stripAnsi, useTestRuntimeContext } from './test-utils.mjs';

test('buildUsageText includes aligned command descriptions', (t) => {
  useTestRuntimeContext();
  t.after(clearTestRuntimeContext);
  const usageText = buildUsageText(createCommandRegistry().commandDefinitions);

  assert.match(usageText, /Run this workflow from VS Code tasks/);
  assert.match(usageText, /imp init/);
  assert.match(usageText, /init/);
  assert.match(usageText, /git-sync/);
  assert.match(usageText, /prepare/);
  assert.doesNotMatch(usageText, /refresh-all/);
});

test('formatStatusBadge uses the homogeneous badge map', () => {
  const statuses = {
    START: '[>]',
    STEP: '[*]',
    OK: '[+]',
    FAIL: '[x]',
    WARN: '[!]',
    SKIP: '[-]',
    INFO: '[i]',
    UNKNOWN: '[?]',
  };

  Object.entries(statuses).forEach(([status, badge]) => {
    assert.equal(stripAnsi(formatStatusBadge(status)), badge);
  });
});

test('finishSession uses the same badge style as regular status lines', async () => {
  const { stdout } = await captureProcessOutput(async () => {
    startSession('prepare');
    recordStatus('OK');
    recordStatus('SKIP');
    finishSession('ok');
  });

  const output = stripAnsi(stdout);

  assert.match(output, /\[\+\] prepare finished in /);
  assert.match(output, /1 ok \| 1 skipped \| 0 failed/);
});

test('renderError uses the FAIL badge style', async () => {
  const { stderr } = await captureProcessOutput(() => renderError(new Error('boom')));

  assert.match(stripAnsi(stderr), /\[x\] boom/);
});
