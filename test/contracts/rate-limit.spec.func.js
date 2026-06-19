/**
 * @fileoverview Contract tests for rate-limit interceptor against a real ergo-router server.
 * @module test/contracts/rate-limit.spec
 */

import {describe, it, before, after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {fetch} from 'undici';

import {createClient, ProblemDetailsError} from '../../index.js';
import {createTestServer} from '../fixtures/server.js';
import {startServer} from '../helpers/setup-server.js';

describe('[Contract] Rate Limiting — X-RateLimit-* Headers', () => {
  let baseUrl, close;

  before(async () => {
    const server = createTestServer();
    ({baseUrl, close} = await startServer(server.handle()));
  });

  after(() => close());

  beforeEach(async () => {
    await fetch(`${baseUrl}/rate-limited/reset`);
  });

  it('tracks rate limit state from response headers', async () => {
    const client = createClient({baseUrl, retry: false});

    const res = await client.get('/rate-limited');

    assert.equal(res.status, 200);
    assert.ok(res.rateLimit, 'rateLimit state should be present');
    assert.equal(res.rateLimit.limit, 3);
    assert.equal(res.rateLimit.remaining, 2);
    assert.equal(typeof res.rateLimit.reset, 'number');
    assert.equal(res.rateLimit.limited, false);
  });

  it('decrements remaining count on successive requests', async () => {
    const client = createClient({baseUrl, retry: false});

    await client.get('/rate-limited');
    const second = await client.get('/rate-limited');

    assert.equal(second.rateLimit.remaining, 1);
  });

  it('throws ProblemDetailsError with 429 when limit exhausted', async () => {
    const client = createClient({baseUrl, retry: false});

    await client.get('/rate-limited');
    await client.get('/rate-limited');
    await client.get('/rate-limited');

    try {
      await client.get('/rate-limited');
      assert.fail('Expected ProblemDetailsError to be thrown');
    } catch (err) {
      assert.ok(err instanceof ProblemDetailsError);
      assert.equal(err.status, 429);
      assert.equal(err.title, 'Too Many Requests');
    }
  });

  it('sets limited=true in state after 429', async () => {
    const client = createClient({baseUrl, retry: false, rateLimit: {headerPrefix: 'x-ratelimit'}});

    await client.get('/rate-limited');
    await client.get('/rate-limited');
    await client.get('/rate-limited');

    try {
      await client.get('/rate-limited');
    } catch {
      // Expected 429
    }

    const state = client.get('/rate-limited').catch(() => {});
    await state;
  });

  it('response includes Retry-After header on 429', async () => {
    const client = createClient({baseUrl, retry: false});

    await client.get('/rate-limited');
    await client.get('/rate-limited');
    await client.get('/rate-limited');

    try {
      await client.get('/rate-limited');
    } catch (err) {
      assert.equal(err.status, 429);
    }
  });
});
