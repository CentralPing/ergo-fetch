/**
 * @fileoverview Boundary tests for the rate limit interceptor and Retry-After parser.
 * @module @centralping/ergo-fetch/lib/rate-limit.spec
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';

import {createRateLimitInterceptor, parseRetryAfter} from './rate-limit.js';

/**
 * Creates a minimal mock request context.
 *
 * @param {object} [overrides] - Properties to override on the context.
 * @returns {object} - Mock context object.
 */
function createMockCtx(overrides = {}) {
  return {
    method: 'GET',
    url: 'https://api.example.com/resource',
    headers: new Headers(),
    ...overrides
  };
}

/**
 * Creates a mock Response with rate limit headers.
 *
 * @param {object} [options] - Response options.
 * @param {number} [options.status] - HTTP status code (default: 200).
 * @param {object} [options.headers] - Response headers.
 * @returns {Response} - Mock response.
 */
function createRateLimitResponse(options = {}) {
  const {status = 200, headers = {}} = options;
  return new Response(null, {status, headers});
}

describe('parseRetryAfter', () => {
  it('parses integer seconds', () => {
    assert.equal(parseRetryAfter('120'), 120_000);
  });

  it('parses zero seconds', () => {
    assert.equal(parseRetryAfter('0'), 0);
  });

  it('returns undefined for fractional seconds', () => {
    assert.equal(parseRetryAfter('1.5'), undefined);
  });

  it('returns undefined for scientific notation', () => {
    assert.equal(parseRetryAfter('3e5'), undefined);
  });

  it('parses HTTP-date', () => {
    const futureDate = new Date(Date.now() + 60_000).toUTCString();
    const delay = parseRetryAfter(futureDate);

    assert.equal(typeof delay, 'number');
    assert.ok(delay > 50_000 && delay <= 60_000);
  });

  it('returns 0 for HTTP-date in the past', () => {
    assert.equal(parseRetryAfter('Wed, 01 Jan 2020 00:00:00 GMT'), 0);
  });

  it('returns undefined for null', () => {
    assert.equal(parseRetryAfter(null), undefined);
  });

  it('returns undefined for undefined', () => {
    assert.equal(parseRetryAfter(undefined), undefined);
  });

  it('returns undefined for empty string', () => {
    assert.equal(parseRetryAfter(''), undefined);
  });

  it('returns undefined for whitespace-only string', () => {
    assert.equal(parseRetryAfter('   '), undefined);
  });

  it('returns undefined for non-numeric non-date string', () => {
    assert.equal(parseRetryAfter('not-a-value'), undefined);
  });

  it('returns undefined for negative number', () => {
    assert.equal(parseRetryAfter('-5'), undefined);
  });

  it('trims whitespace around integer value', () => {
    assert.equal(parseRetryAfter('  60  '), 60_000);
  });

  it('returns undefined for overflow digit string', () => {
    assert.equal(parseRetryAfter('9'.repeat(310)), undefined);
  });

  it('returns undefined when seconds are finite but delay overflows', () => {
    assert.equal(parseRetryAfter('1' + '0'.repeat(306)), undefined);
  });
});

describe('createRateLimitInterceptor', () => {
  describe('factory validation', () => {
    it('returns a frozen null-prototype object', () => {
      const interceptor = createRateLimitInterceptor();

      assert.equal(Object.getPrototypeOf(interceptor), null);
      assert.equal(Object.isFrozen(interceptor), true);
    });

    it('returns an object with request, response, and getState', () => {
      const interceptor = createRateLimitInterceptor();

      assert.equal(typeof interceptor.request, 'function');
      assert.equal(typeof interceptor.response, 'function');
      assert.equal(typeof interceptor.getState, 'function');
    });

    it('initial state has undefined fields and limited=false', () => {
      const interceptor = createRateLimitInterceptor();
      const state = interceptor.getState();

      assert.equal(state.limit, undefined);
      assert.equal(state.remaining, undefined);
      assert.equal(state.reset, undefined);
      assert.equal(state.limited, false);
    });

    it('throws TypeError for non-boolean proactive', () => {
      assert.throws(() => createRateLimitInterceptor({proactive: 'yes'}), {
        name: 'TypeError',
        message: 'proactive must be a boolean'
      });
    });

    it('throws TypeError for non-integer threshold', () => {
      assert.throws(() => createRateLimitInterceptor({threshold: 1.5}), {
        name: 'TypeError',
        message: 'threshold must be a positive integer'
      });
    });

    it('throws TypeError for zero threshold', () => {
      assert.throws(() => createRateLimitInterceptor({threshold: 0}), {
        name: 'TypeError',
        message: 'threshold must be a positive integer'
      });
    });

    it('throws TypeError for negative threshold', () => {
      assert.throws(() => createRateLimitInterceptor({threshold: -1}), {
        name: 'TypeError',
        message: 'threshold must be a positive integer'
      });
    });

    it('throws TypeError for empty headerPrefix', () => {
      assert.throws(() => createRateLimitInterceptor({headerPrefix: ''}), {
        name: 'TypeError',
        message: 'headerPrefix must be a non-empty string'
      });
    });

    it('throws TypeError for non-string headerPrefix', () => {
      assert.throws(() => createRateLimitInterceptor({headerPrefix: 123}), {
        name: 'TypeError',
        message: 'headerPrefix must be a non-empty string'
      });
    });

    it('throws TypeError for whitespace-only headerPrefix', () => {
      assert.throws(() => createRateLimitInterceptor({headerPrefix: '   '}), {
        name: 'TypeError',
        message: 'headerPrefix must be a non-empty string'
      });
    });
  });

  describe('response — header parsing', () => {
    let interceptor;

    beforeEach(() => {
      interceptor = createRateLimitInterceptor();
    });

    it('parses X-RateLimit-Limit header', () => {
      const ctx = createMockCtx();
      const res = createRateLimitResponse({
        headers: {'x-ratelimit-limit': '100'}
      });

      interceptor.response(ctx, res);

      assert.equal(interceptor.getState().limit, 100);
    });

    it('parses X-RateLimit-Remaining header', () => {
      const ctx = createMockCtx();
      const res = createRateLimitResponse({
        headers: {'x-ratelimit-remaining': '42'}
      });

      interceptor.response(ctx, res);

      assert.equal(interceptor.getState().remaining, 42);
    });

    it('parses X-RateLimit-Reset header', () => {
      const ctx = createMockCtx();
      const res = createRateLimitResponse({
        headers: {'x-ratelimit-reset': '1750000000'}
      });

      interceptor.response(ctx, res);

      assert.equal(interceptor.getState().reset, 1750000000);
    });

    it('parses all three headers in one response', () => {
      const ctx = createMockCtx();
      const res = createRateLimitResponse({
        headers: {
          'x-ratelimit-limit': '100',
          'x-ratelimit-remaining': '50',
          'x-ratelimit-reset': '1750000000'
        }
      });

      interceptor.response(ctx, res);

      const state = interceptor.getState();
      assert.equal(state.limit, 100);
      assert.equal(state.remaining, 50);
      assert.equal(state.reset, 1750000000);
    });

    it('handles remaining=0', () => {
      const ctx = createMockCtx();
      const res = createRateLimitResponse({
        headers: {'x-ratelimit-remaining': '0'}
      });

      interceptor.response(ctx, res);

      assert.equal(interceptor.getState().remaining, 0);
    });

    it('ignores non-numeric header values', () => {
      const ctx = createMockCtx();
      const res = createRateLimitResponse({
        headers: {
          'x-ratelimit-limit': 'abc',
          'x-ratelimit-remaining': '',
          'x-ratelimit-reset': 'NaN'
        }
      });

      interceptor.response(ctx, res);

      const state = interceptor.getState();
      assert.equal(state.limit, undefined);
      assert.equal(state.remaining, undefined);
      assert.equal(state.reset, undefined);
    });

    it('updates state on each response', () => {
      const ctx1 = createMockCtx();
      const res1 = createRateLimitResponse({
        headers: {'x-ratelimit-remaining': '50'}
      });
      interceptor.response(ctx1, res1);
      assert.equal(interceptor.getState().remaining, 50);

      const ctx2 = createMockCtx();
      const res2 = createRateLimitResponse({
        headers: {'x-ratelimit-remaining': '49'}
      });
      interceptor.response(ctx2, res2);
      assert.equal(interceptor.getState().remaining, 49);
    });

    it('uses custom headerPrefix', () => {
      const custom = createRateLimitInterceptor({headerPrefix: 'ratelimit'});
      const ctx = createMockCtx();
      const res = createRateLimitResponse({
        headers: {
          'ratelimit-limit': '200',
          'ratelimit-remaining': '150',
          'ratelimit-reset': '1750000000'
        }
      });

      custom.response(ctx, res);

      const state = custom.getState();
      assert.equal(state.limit, 200);
      assert.equal(state.remaining, 150);
    });

    it('trims whitespace from custom headerPrefix', () => {
      const custom = createRateLimitInterceptor({headerPrefix: '  ratelimit  '});
      const ctx = createMockCtx();
      const res = createRateLimitResponse({
        headers: {
          'ratelimit-limit': '100',
          'ratelimit-remaining': '75'
        }
      });

      custom.response(ctx, res);

      const state = custom.getState();
      assert.equal(state.limit, 100);
      assert.equal(state.remaining, 75);
    });

    it('retains previous state for headers not present in new response', () => {
      const ctx1 = createMockCtx();
      const res1 = createRateLimitResponse({
        headers: {
          'x-ratelimit-limit': '100',
          'x-ratelimit-remaining': '50'
        }
      });
      interceptor.response(ctx1, res1);

      const ctx2 = createMockCtx();
      const res2 = createRateLimitResponse({
        headers: {'x-ratelimit-remaining': '49'}
      });
      interceptor.response(ctx2, res2);

      const state = interceptor.getState();
      assert.equal(state.limit, 100);
      assert.equal(state.remaining, 49);
    });
  });

  describe('response — 429 handling', () => {
    let interceptor;

    beforeEach(() => {
      interceptor = createRateLimitInterceptor();
    });

    it('returns retry signal on 429 with Retry-After seconds', () => {
      const ctx = createMockCtx();
      const res = createRateLimitResponse({
        status: 429,
        headers: {'retry-after': '30'}
      });

      const result = interceptor.response(ctx, res);

      assert.deepStrictEqual(result, {retry: true, delay: 30_000});
    });

    it('returns retry signal on 429 with Retry-After HTTP-date', () => {
      const futureDate = new Date(Date.now() + 60_000).toUTCString();
      const ctx = createMockCtx();
      const res = createRateLimitResponse({
        status: 429,
        headers: {'retry-after': futureDate}
      });

      const result = interceptor.response(ctx, res);

      assert.equal(result.retry, true);
      assert.equal(typeof result.delay, 'number');
      assert.ok(result.delay > 50_000);
    });

    it('computes delay from Reset header when no Retry-After', () => {
      const resetEpoch = Math.floor(Date.now() / 1000) + 60;
      const ctx = createMockCtx();
      const res = createRateLimitResponse({
        status: 429,
        headers: {'x-ratelimit-reset': String(resetEpoch)}
      });

      const result = interceptor.response(ctx, res);

      assert.equal(result.retry, true);
      assert.equal(typeof result.delay, 'number');
      assert.ok(result.delay > 50_000);
    });

    it('sets limited=true on 429', () => {
      const ctx = createMockCtx();
      const res = createRateLimitResponse({
        status: 429,
        headers: {'retry-after': '10'}
      });

      interceptor.response(ctx, res);

      assert.equal(interceptor.getState().limited, true);
    });

    it('returns retry with undefined delay when no Retry-After and no Reset', () => {
      const ctx = createMockCtx();
      const res = createRateLimitResponse({status: 429});

      const result = interceptor.response(ctx, res);

      assert.deepStrictEqual(result, {retry: true, delay: undefined});
    });

    it('still parses rate limit headers on 429', () => {
      const ctx = createMockCtx();
      const res = createRateLimitResponse({
        status: 429,
        headers: {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-limit': '100',
          'retry-after': '30'
        }
      });

      interceptor.response(ctx, res);

      const state = interceptor.getState();
      assert.equal(state.remaining, 0);
      assert.equal(state.limit, 100);
    });

    it('prefers Retry-After over Reset for delay computation', () => {
      const resetEpoch = Math.floor(Date.now() / 1000) + 300;
      const ctx = createMockCtx();
      const res = createRateLimitResponse({
        status: 429,
        headers: {
          'retry-after': '10',
          'x-ratelimit-reset': String(resetEpoch)
        }
      });

      const result = interceptor.response(ctx, res);

      assert.equal(result.delay, 10_000);
    });
  });

  describe('response — non-429', () => {
    it('does not return retry signal for non-429 responses', () => {
      const interceptor = createRateLimitInterceptor();
      const ctx = createMockCtx();
      const res = createRateLimitResponse({
        status: 200,
        headers: {'x-ratelimit-remaining': '50'}
      });

      const result = interceptor.response(ctx, res);

      assert.equal(result, undefined);
    });

    it('sets limited=false for non-429 responses', () => {
      const interceptor = createRateLimitInterceptor();

      const ctx1 = createMockCtx();
      const res1 = createRateLimitResponse({
        status: 429,
        headers: {'retry-after': '10'}
      });
      interceptor.response(ctx1, res1);
      assert.equal(interceptor.getState().limited, true);

      const ctx2 = createMockCtx();
      const res2 = createRateLimitResponse({status: 200});
      interceptor.response(ctx2, res2);
      assert.equal(interceptor.getState().limited, false);
    });
  });

  describe('request — proactive throttling', () => {
    it('does nothing when proactive=false (default)', () => {
      const interceptor = createRateLimitInterceptor();
      const ctx1 = createMockCtx();
      const res = createRateLimitResponse({
        headers: {
          'x-ratelimit-remaining': '2',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60)
        }
      });
      interceptor.response(ctx1, res);

      const ctx2 = createMockCtx();
      interceptor.request(ctx2);
      assert.equal(ctx2.rateLimitDelay, undefined);
    });

    it('does nothing when remaining >= threshold', () => {
      const interceptor = createRateLimitInterceptor({proactive: true, threshold: 5});
      const ctx1 = createMockCtx();
      const res = createRateLimitResponse({
        headers: {
          'x-ratelimit-remaining': '10',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60)
        }
      });
      interceptor.response(ctx1, res);

      const ctx2 = createMockCtx();
      interceptor.request(ctx2);
      assert.equal(ctx2.rateLimitDelay, undefined);
    });

    it('does nothing when no state exists', () => {
      const interceptor = createRateLimitInterceptor({proactive: true});
      const ctx = createMockCtx();

      interceptor.request(ctx);

      assert.equal(ctx.rateLimitDelay, undefined);
    });

    it('does nothing when reset is undefined', () => {
      const interceptor = createRateLimitInterceptor({proactive: true, threshold: 5});
      const ctx1 = createMockCtx();
      const res = createRateLimitResponse({
        headers: {'x-ratelimit-remaining': '2'}
      });
      interceptor.response(ctx1, res);

      const ctx2 = createMockCtx();
      interceptor.request(ctx2);
      assert.equal(ctx2.rateLimitDelay, undefined);
    });

    it('sets rateLimitDelay on context when remaining < threshold', () => {
      const interceptor = createRateLimitInterceptor({proactive: true, threshold: 5});
      const resetEpoch = Math.floor(Date.now() / 1000) + 60;
      const ctx1 = createMockCtx();
      const res = createRateLimitResponse({
        headers: {
          'x-ratelimit-remaining': '2',
          'x-ratelimit-reset': String(resetEpoch)
        }
      });
      interceptor.response(ctx1, res);

      const ctx2 = createMockCtx();
      interceptor.request(ctx2);

      assert.equal(typeof ctx2.rateLimitDelay, 'number');
      assert.ok(ctx2.rateLimitDelay > 50_000);
    });

    it('does not set delay when reset is in the past', () => {
      const interceptor = createRateLimitInterceptor({proactive: true, threshold: 5});
      const pastReset = Math.floor(Date.now() / 1000) - 60;
      const ctx1 = createMockCtx();
      const res = createRateLimitResponse({
        headers: {
          'x-ratelimit-remaining': '2',
          'x-ratelimit-reset': String(pastReset)
        }
      });
      interceptor.response(ctx1, res);

      const ctx2 = createMockCtx();
      interceptor.request(ctx2);
      assert.equal(ctx2.rateLimitDelay, undefined);
    });
  });

  describe('getState', () => {
    it('returns a defensive copy', () => {
      const interceptor = createRateLimitInterceptor();
      const ctx = createMockCtx();
      const res = createRateLimitResponse({
        headers: {'x-ratelimit-remaining': '50'}
      });
      interceptor.response(ctx, res);

      const state = interceptor.getState();
      state.remaining = 999;

      assert.equal(interceptor.getState().remaining, 50);
    });

    it('reflects latest state after response', () => {
      const interceptor = createRateLimitInterceptor();

      const ctx1 = createMockCtx();
      const res1 = createRateLimitResponse({
        headers: {
          'x-ratelimit-limit': '100',
          'x-ratelimit-remaining': '50',
          'x-ratelimit-reset': '1750000000'
        }
      });
      interceptor.response(ctx1, res1);

      const state = interceptor.getState();
      assert.equal(state.limit, 100);
      assert.equal(state.remaining, 50);
      assert.equal(state.reset, 1750000000);
      assert.equal(state.limited, false);
    });
  });

  describe('instance isolation', () => {
    it('different instances do not share state', () => {
      const interceptor1 = createRateLimitInterceptor();
      const interceptor2 = createRateLimitInterceptor();

      const ctx = createMockCtx();
      const res = createRateLimitResponse({
        headers: {'x-ratelimit-remaining': '42'}
      });
      interceptor1.response(ctx, res);

      assert.equal(interceptor1.getState().remaining, 42);
      assert.equal(interceptor2.getState().remaining, undefined);
    });
  });
});
