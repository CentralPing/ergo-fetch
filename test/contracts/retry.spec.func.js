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

    await assert.rejects(
      () => client.get('/error/404'),
      err => {
        assert.equal(err.name, 'ProblemDetailsError');
        assert.equal(err.status, 404);
        assert.equal(err.extensions?._callCount, 1, 'Should have made exactly 1 attempt');
        return true;
      }
    );
  });

  it('does not retry non-idempotent methods for 500', async () => {
    const client = createClient({
      baseUrl,
      csrf: false,
      retry: {maxAttempts: 3, baseDelay: 0, jitter: 'none'}
    });

    await assert.rejects(
      () => client.post('/error/500', {body: {}}),
      err => {
        assert.equal(err.name, 'ProblemDetailsError');
        assert.equal(err.status, 500);
        assert.equal(err.extensions?._callCount, 1, 'Should have made exactly 1 attempt');
        return true;
      }
    );
  });

  it('aborts on timeout before retry completes', async () => {
    const client = createClient({
      baseUrl,
      timeout: 50,
      retry: {maxAttempts: 3, baseDelay: 0, jitter: 'none'}
    });

    await assert.rejects(() => client.get('/timeout', {query: {ms: '10000'}}), {
      name: 'TimeoutError'
    });
  });

  it('succeeds on second attempt after Retry-After delay with per-attempt timeout', async () => {
    const resetRes = await fetch(`${baseUrl}/retry-after-delay/reset`);
    assert.equal(resetRes.status, 204);

    const client = createClient({
      baseUrl,
      timeout: 2000,
      retry: {maxAttempts: 2, baseDelay: 0, jitter: 'none'}
    });

    const res = await client.get('/retry-after-delay', {query: {seconds: '1'}});

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.retried, true);
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
