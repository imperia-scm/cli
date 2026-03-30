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
  const usageText = stripAnsi(buildUsageText(createCommandRegistry().commandDefinitions));

  assert.match(usageText, /^=+/m);
  assert.match(usageText, /^imperiascm-cli$/m);
  assert.match(usageText, /Workspace orchestration for local development services/);
  assert.match(usageText, /Quick Start/);
  assert.match(usageText, /imp init/);
  assert.match(usageText, /imp launch-services/);
  assert.match(usageText, /imp run-service <service>/);
  assert.match(usageText, /init/);
  assert.match(usageText, /sync-repository/);
  assert.match(usageText, /launch-services/);
  assert.match(usageText, /run-service/);
  assert.match(usageText, /prepare-workspace/);
  assert.match(usageText, /build-solution/);
  assert.doesNotMatch(usageText, /select-services-to-launch/);
  assert.doesNotMatch(usageText, /prepare-services-to-launch/);
  assert.doesNotMatch(usageText, /\blaunch-service\b/);
  assert.doesNotMatch(usageText, /run-service-exec/);
  assert.doesNotMatch(usageText, /refresh-all/);
  assert.doesNotMatch(usageText, /\brebuild\b/);
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
    startSession('prepare-workspace');
    recordStatus('OK');
    recordStatus('SKIP');
    finishSession('ok');
  });

  const output = stripAnsi(stdout);

  assert.match(output, /\[\+\] prepare-workspace finished in /);
  assert.match(output, /1 ok \| 1 skipped \| 0 failed/);
});

test('renderError uses the FAIL badge style', async () => {
  const { stderr } = await captureProcessOutput(() => renderError(new Error('boom')));

  assert.match(stripAnsi(stderr), /\[x\] boom/);
});
