/**
 * @fileoverview Contract tests for idempotency-key lifecycle against a real ergo-router server.
 * @module test/contracts/idempotency.spec
 */

import {describe, it, before, after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {fetch} from 'undici';

import {createClient} from '../../index.js';
import {createTestServer} from '../fixtures/server.js';
import {startServer} from '../helpers/setup-server.js';

describe('[Contract] Idempotency — Key Generation and Replay', () => {
  let baseUrl, close;

  before(async () => {
    const server = createTestServer();
    ({baseUrl, close} = await startServer(server.handle()));
  });

  after(() => close());

  beforeEach(async () => {
    const res = await fetch(`${baseUrl}/idempotent/reset`);
    assert.equal(res.status, 204);
  });

  it('POST with auto-generated key returns 201', async () => {
    const client = createClient({baseUrl, idempotency: true, retry: false, csrf: false});

    const res = await client.post('/idempotent', {body: {item: 'test'}});

    assert.equal(res.status, 201);
    assert.equal(res.body.created, true);
    assert.ok(res.body.key, 'Server should receive the idempotency key');
  });

  it('POST with explicit key returns 201 with the provided key', async () => {
    const client = createClient({baseUrl, idempotency: true, retry: false, csrf: false});

    const res = await client.post('/idempotent', {
      body: {item: 'test'},
      idempotencyKey: 'my-explicit-key-123'
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.key, 'my-explicit-key-123');
  });

  it('retries preserve idempotency key across attempts', async () => {
    const client = createClient({
      baseUrl,
      idempotency: true,
      csrf: false,
      retry: {maxAttempts: 3, baseDelay: 0, jitter: 'none'}
    });

    const res = await client.post('/idempotent-retry', {body: {item: 'retry-test'}});

    assert.equal(res.status, 201);
    assert.equal(res.body.retried, true);
    assert.ok(res.body.key, 'Should have preserved the key across retry');
  });

  it('POST without key when server requires it returns 400', async () => {
    const client = createClient({baseUrl, idempotency: false, retry: false, csrf: false});

    await assert.rejects(() => client.post('/idempotent', {body: {item: 'no-key'}}), {
      name: 'ProblemDetailsError',
      status: 400
    });
  });
});
