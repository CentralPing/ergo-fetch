/**
 * @fileoverview Contract tests for retry interceptor against a real ergo-router server.
 * @module test/contracts/retry.spec
 */

import {describe, it, before, after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {fetch} from 'undici';

import {createClient} from '../../index.js';
import {createTestServer} from '../fixtures/server.js';
import {startServer} from '../helpers/setup-server.js';

describe('[Contract] Retry — Transient Failure Recovery', () => {
  let baseUrl, close;

  before(async () => {
    const server = createTestServer();
    ({baseUrl, close} = await startServer(server.handle()));
  });

  after(() => close());

  beforeEach(async () => {
    const res = await fetch(`${baseUrl}/retry-once/reset`);
    assert.equal(res.status, 204);
  });

  it('retries 503 and succeeds on second attempt', async () => {
    const client = createClient({
      baseUrl,
      retry: {maxAttempts: 3, baseDelay: 0, jitter: 'none'}
    });

    const res = await client.get('/retry-once');

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.retried, true);
  });

  it('respects maxAttempts budget', async () => {
    const client = createClient({
      baseUrl,
      retry: {maxAttempts: 1, baseDelay: 0, jitter: 'none'}
    });

    const {rejects} = assert;
    await rejects(() => client.get('/retry-once'), {name: 'ProblemDetailsError', status: 503});
  });

  it('does not retry non-retryable status codes', async () => {
    const client = createClient({
      baseUrl,
      retry: {maxAttempts: 3, baseDelay: 0, jitter: 'none'}
    });

    const {rejects} = assert;
    await rejects(() => client.get('/error/404'), {name: 'ProblemDetailsError', status: 404});
  });

  it('does not retry non-idempotent methods for 500', async () => {
    const client = createClient({
      baseUrl,
      csrf: false,
      retry: {maxAttempts: 3, baseDelay: 0, jitter: 'none'}
    });

    const {rejects} = assert;
    await rejects(() => client.post('/error/500', {body: {}}), {
      name: 'ProblemDetailsError',
      status: 500
    });
  });

  it('aborts on timeout before retry completes', async () => {
    const client = createClient({
      baseUrl,
      timeout: 50,
      retry: {maxAttempts: 3, baseDelay: 0, jitter: 'none'}
    });

    await assert.rejects(
      () => client.get('/timeout', {query: {ms: '10000'}}),
      err => err.name === 'TimeoutError' || err.name === 'AbortError'
    );
  });

  it('retry with per-request retry disabled does not retry', async () => {
    const client = createClient({
      baseUrl,
      retry: {maxAttempts: 3, baseDelay: 0, jitter: 'none'}
    });

    const {rejects} = assert;
    await rejects(() => client.get('/retry-once', {retry: false}), {
      name: 'ProblemDetailsError',
      status: 503
    });
  });
});
