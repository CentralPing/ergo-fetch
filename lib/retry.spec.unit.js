/**
 * @fileoverview Boundary tests for the retry interceptor.
 * @module @centralping/ergo-fetch/lib/retry.spec
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';

import {createRetryInterceptor} from './retry.js';

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
 * Creates a mock Response with specified status and headers.
 *
 * @param {object} [options] - Response options.
 * @param {number} [options.status] - HTTP status code (default: 200).
 * @param {object} [options.headers] - Response headers.
 * @returns {Response} - Mock response.
 */
function createMockResponse(options = {}) {
  const {status = 200, headers = {}} = options;
  return new Response(null, {status, headers});
}

describe('createRetryInterceptor', () => {
  describe('factory validation', () => {
    it('returns a frozen null-prototype object', () => {
      const interceptor = createRetryInterceptor();

      assert.equal(Object.getPrototypeOf(interceptor), null);
      assert.equal(Object.isFrozen(interceptor), true);
    });

    it('returns an object with request, response, and error', () => {
      const interceptor = createRetryInterceptor();

      assert.equal(typeof interceptor.request, 'function');
      assert.equal(typeof interceptor.response, 'function');
      assert.equal(typeof interceptor.error, 'function');
    });

    it('accepts valid options without throwing', () => {
      assert.doesNotThrow(() =>
        createRetryInterceptor({
          maxAttempts: 5,
          maxDelay: 30_000,
          baseDelay: 500,
          backoff: 'linear',
          jitter: 'none'
        })
      );
    });

    it('throws TypeError for non-integer maxAttempts', () => {
      assert.throws(() => createRetryInterceptor({maxAttempts: 1.5}), {
        name: 'TypeError',
        message: 'maxAttempts must be a positive integer'
      });
    });

    it('throws TypeError for zero maxAttempts', () => {
      assert.throws(() => createRetryInterceptor({maxAttempts: 0}), {
        name: 'TypeError',
        message: 'maxAttempts must be a positive integer'
      });
    });

    it('throws TypeError for negative maxAttempts', () => {
      assert.throws(() => createRetryInterceptor({maxAttempts: -1}), {
        name: 'TypeError',
        message: 'maxAttempts must be a positive integer'
      });
    });

    it('throws TypeError for non-number maxDelay', () => {
      assert.throws(() => createRetryInterceptor({maxDelay: '1000'}), {
        name: 'TypeError',
        message: 'maxDelay must be a non-negative finite number'
      });
    });

    it('throws TypeError for negative maxDelay', () => {
      assert.throws(() => createRetryInterceptor({maxDelay: -1}), {
        name: 'TypeError',
        message: 'maxDelay must be a non-negative finite number'
      });
    });

    it('throws TypeError for Infinity maxDelay', () => {
      assert.throws(() => createRetryInterceptor({maxDelay: Infinity}), {
        name: 'TypeError',
        message: 'maxDelay must be a non-negative finite number'
      });
    });

    it('throws TypeError for NaN maxDelay', () => {
      assert.throws(() => createRetryInterceptor({maxDelay: NaN}), {
        name: 'TypeError',
        message: 'maxDelay must be a non-negative finite number'
      });
    });

    it('throws TypeError for non-number baseDelay', () => {
      assert.throws(() => createRetryInterceptor({baseDelay: '500'}), {
        name: 'TypeError',
        message: 'baseDelay must be a non-negative finite number'
      });
    });

    it('throws TypeError for negative baseDelay', () => {
      assert.throws(() => createRetryInterceptor({baseDelay: -1}), {
        name: 'TypeError',
        message: 'baseDelay must be a non-negative finite number'
      });
    });

    it('throws TypeError for invalid backoff strategy', () => {
      assert.throws(() => createRetryInterceptor({backoff: 'quadratic'}), {
        name: 'TypeError',
        message: "backoff must be 'exponential' or 'linear'"
      });
    });

    it('throws TypeError for invalid jitter strategy', () => {
      assert.throws(() => createRetryInterceptor({jitter: 'partial'}), {
        name: 'TypeError',
        message: "jitter must be 'full' or 'none'"
      });
    });

    it('accepts maxDelay of zero', () => {
      assert.doesNotThrow(() => createRetryInterceptor({maxDelay: 0}));
    });

    it('accepts baseDelay of zero', () => {
      assert.doesNotThrow(() => createRetryInterceptor({baseDelay: 0}));
    });

    it('accepts maxAttempts of one', () => {
      assert.doesNotThrow(() => createRetryInterceptor({maxAttempts: 1}));
    });

    it('throws TypeError when options is a number', () => {
      assert.throws(() => createRetryInterceptor(1), {
        name: 'TypeError',
        message: 'options must be an object'
      });
    });

    it('throws TypeError when options is a string', () => {
      assert.throws(() => createRetryInterceptor('test'), {
        name: 'TypeError',
        message: 'options must be an object'
      });
    });

    it('throws TypeError when options is a boolean', () => {
      assert.throws(() => createRetryInterceptor(true), {
        name: 'TypeError',
        message: 'options must be an object'
      });
    });

    it('throws TypeError when options is null', () => {
      assert.throws(() => createRetryInterceptor(null), {
        name: 'TypeError',
        message: 'options must be an object'
      });
    });

    it('throws TypeError when options is an array', () => {
      assert.throws(() => createRetryInterceptor([]), {
        name: 'TypeError',
        message: 'options must be an object'
      });
    });
  });

  describe('retry eligibility — always retryable', () => {
    let interceptor;

    beforeEach(() => {
      interceptor = createRetryInterceptor({jitter: 'none'});
    });

    it('retries 429 regardless of method', () => {
      const ctx = createMockCtx({method: 'POST'});
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 429}));

      assert.equal(result.retry, true);
      assert.equal(typeof result.delay, 'number');
    });

    it('retries 503 regardless of method', () => {
      const ctx = createMockCtx({method: 'POST'});
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 503}));

      assert.equal(result.retry, true);
      assert.equal(typeof result.delay, 'number');
    });
  });

  describe('retry eligibility — idempotent-only statuses', () => {
    let interceptor;

    beforeEach(() => {
      interceptor = createRetryInterceptor({jitter: 'none'});
    });

    it('retries 500 for GET', () => {
      const ctx = createMockCtx({method: 'GET'});
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 500}));

      assert.equal(result.retry, true);
    });

    it('retries 502 for HEAD', () => {
      const ctx = createMockCtx({method: 'HEAD'});
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 502}));

      assert.equal(result.retry, true);
    });

    it('retries 504 for OPTIONS', () => {
      const ctx = createMockCtx({method: 'OPTIONS'});
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 504}));

      assert.equal(result.retry, true);
    });

    it('retries 500 when ctx.idempotent is true', () => {
      const ctx = createMockCtx({method: 'POST', idempotent: true});
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 500}));

      assert.equal(result.retry, true);
    });

    it('does not retry 500 for POST without idempotent flag', () => {
      const ctx = createMockCtx({method: 'POST'});
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 500}));

      assert.equal(result, undefined);
    });

    it('retries 500 for PUT', () => {
      const ctx = createMockCtx({method: 'PUT'});
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 500}));

      assert.equal(result.retry, true);
    });

    it('retries 502 for PUT', () => {
      const ctx = createMockCtx({method: 'PUT'});
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 502}));

      assert.equal(result.retry, true);
    });

    it('retries 504 for PUT', () => {
      const ctx = createMockCtx({method: 'PUT'});
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 504}));

      assert.equal(result.retry, true);
    });

    it('retries 500 for DELETE', () => {
      const ctx = createMockCtx({method: 'DELETE'});
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 500}));

      assert.equal(result.retry, true);
    });

    it('retries 502 for DELETE', () => {
      const ctx = createMockCtx({method: 'DELETE'});
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 502}));

      assert.equal(result.retry, true);
    });

    it('retries 504 for DELETE', () => {
      const ctx = createMockCtx({method: 'DELETE'});
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 504}));

      assert.equal(result.retry, true);
    });

    it('does not retry 504 for PATCH without idempotent flag', () => {
      const ctx = createMockCtx({method: 'PATCH'});
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 504}));

      assert.equal(result, undefined);
    });
  });

  describe('retry eligibility — non-retryable statuses', () => {
    let interceptor;

    beforeEach(() => {
      interceptor = createRetryInterceptor({jitter: 'none'});
    });

    it('does not retry 200', () => {
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 200}));

      assert.equal(result, undefined);
    });

    it('does not retry 201', () => {
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 201}));

      assert.equal(result, undefined);
    });

    it('does not retry 301', () => {
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 301}));

      assert.equal(result, undefined);
    });

    it('does not retry 400', () => {
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 400}));

      assert.equal(result, undefined);
    });

    it('does not retry 401', () => {
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 401}));

      assert.equal(result, undefined);
    });

    it('does not retry 403', () => {
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 403}));

      assert.equal(result, undefined);
    });

    it('does not retry 404', () => {
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 404}));

      assert.equal(result, undefined);
    });

    it('does not retry 422', () => {
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 422}));

      assert.equal(result, undefined);
    });

    it('does not retry 501', () => {
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 501}));

      assert.equal(result, undefined);
    });
  });

  describe('attempt budget', () => {
    it('exhausts budget after maxAttempts - 1 retries (default 3)', () => {
      const interceptor = createRetryInterceptor({jitter: 'none'});
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const first = interceptor.response(ctx, createMockResponse({status: 503}));
      assert.equal(first.retry, true);

      const second = interceptor.response(ctx, createMockResponse({status: 503}));
      assert.equal(second.retry, true);

      const third = interceptor.response(ctx, createMockResponse({status: 503}));
      assert.equal(third, undefined);
    });

    it('allows only one retry with maxAttempts=2', () => {
      const interceptor = createRetryInterceptor({maxAttempts: 2, jitter: 'none'});
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const first = interceptor.response(ctx, createMockResponse({status: 503}));
      assert.equal(first.retry, true);

      const second = interceptor.response(ctx, createMockResponse({status: 503}));
      assert.equal(second, undefined);
    });

    it('never retries with maxAttempts=1', () => {
      const interceptor = createRetryInterceptor({maxAttempts: 1, jitter: 'none'});
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 503}));

      assert.equal(result, undefined);
    });

    it('allows 4 retries with maxAttempts=5', () => {
      const interceptor = createRetryInterceptor({maxAttempts: 5, jitter: 'none'});
      const ctx = createMockCtx();
      interceptor.request(ctx);

      for (let i = 0; i < 4; i++) {
        const result = interceptor.response(ctx, createMockResponse({status: 503}));
        assert.equal(result.retry, true, `retry ${i + 1} should be allowed`);
      }

      const exhausted = interceptor.response(ctx, createMockResponse({status: 503}));
      assert.equal(exhausted, undefined);
    });

    it('tracks attempts independently per context object', () => {
      const interceptor = createRetryInterceptor({maxAttempts: 2, jitter: 'none'});
      const ctx1 = createMockCtx();
      const ctx2 = createMockCtx();
      interceptor.request(ctx1);
      interceptor.request(ctx2);

      const r1 = interceptor.response(ctx1, createMockResponse({status: 503}));
      assert.equal(r1.retry, true);

      const r1b = interceptor.response(ctx1, createMockResponse({status: 503}));
      assert.equal(r1b, undefined);

      const r2 = interceptor.response(ctx2, createMockResponse({status: 503}));
      assert.equal(r2.retry, true);
    });
  });

  describe('backoff computation — exponential', () => {
    it('uses deterministic exponential delays with jitter=none', () => {
      const interceptor = createRetryInterceptor({
        maxAttempts: 4,
        baseDelay: 1000,
        maxDelay: 60_000,
        backoff: 'exponential',
        jitter: 'none'
      });
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const r0 = interceptor.response(ctx, createMockResponse({status: 503}));
      assert.equal(r0.delay, 1000);

      const r1 = interceptor.response(ctx, createMockResponse({status: 503}));
      assert.equal(r1.delay, 2000);

      const r2 = interceptor.response(ctx, createMockResponse({status: 503}));
      assert.equal(r2.delay, 4000);
    });

    it('caps delay at maxDelay', () => {
      const interceptor = createRetryInterceptor({
        maxAttempts: 4,
        baseDelay: 10_000,
        maxDelay: 15_000,
        backoff: 'exponential',
        jitter: 'none'
      });
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const r0 = interceptor.response(ctx, createMockResponse({status: 503}));
      assert.equal(r0.delay, 10_000);

      const r1 = interceptor.response(ctx, createMockResponse({status: 503}));
      assert.equal(r1.delay, 15_000);
    });

    it('applies full jitter (delay between 0 and computed max)', () => {
      const interceptor = createRetryInterceptor({
        maxAttempts: 4,
        baseDelay: 1000,
        backoff: 'exponential',
        jitter: 'full'
      });
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 503}));

      assert.equal(result.retry, true);
      assert.ok(result.delay >= 0);
      assert.ok(result.delay <= 1000);
    });

    it('produces varying delays with full jitter across calls', () => {
      const delays = [];

      for (let i = 0; i < 20; i++) {
        const interceptor = createRetryInterceptor({
          maxAttempts: 2,
          baseDelay: 10_000,
          backoff: 'exponential',
          jitter: 'full'
        });
        const ctx = createMockCtx();
        interceptor.request(ctx);

        const result = interceptor.response(ctx, createMockResponse({status: 503}));
        delays.push(result.delay);
      }

      const unique = new Set(delays);
      assert.ok(unique.size > 1, 'full jitter should produce varying delays');
    });
  });

  describe('backoff computation — linear', () => {
    it('uses linear delays with jitter=none', () => {
      const interceptor = createRetryInterceptor({
        maxAttempts: 4,
        baseDelay: 1000,
        maxDelay: 60_000,
        backoff: 'linear',
        jitter: 'none'
      });
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const r0 = interceptor.response(ctx, createMockResponse({status: 503}));
      assert.equal(r0.delay, 1000);

      const r1 = interceptor.response(ctx, createMockResponse({status: 503}));
      assert.equal(r1.delay, 2000);

      const r2 = interceptor.response(ctx, createMockResponse({status: 503}));
      assert.equal(r2.delay, 3000);
    });

    it('caps linear delay at maxDelay', () => {
      const interceptor = createRetryInterceptor({
        maxAttempts: 5,
        baseDelay: 5000,
        maxDelay: 12_000,
        backoff: 'linear',
        jitter: 'none'
      });
      const ctx = createMockCtx();
      interceptor.request(ctx);

      interceptor.response(ctx, createMockResponse({status: 503}));
      interceptor.response(ctx, createMockResponse({status: 503}));

      const r2 = interceptor.response(ctx, createMockResponse({status: 503}));
      assert.equal(r2.delay, 12_000);
    });
  });

  describe('Retry-After override', () => {
    it('uses Retry-After integer value instead of computed delay', () => {
      const interceptor = createRetryInterceptor({
        baseDelay: 1000,
        jitter: 'none'
      });
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const res = createMockResponse({
        status: 503,
        headers: {'retry-after': '30'}
      });
      const result = interceptor.response(ctx, res);

      assert.equal(result.retry, true);
      assert.equal(result.delay, 30_000);
    });

    it('uses Retry-After HTTP-date instead of computed delay', () => {
      const futureDate = new Date(Date.now() + 60_000).toUTCString();
      const interceptor = createRetryInterceptor({jitter: 'none'});
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const res = createMockResponse({
        status: 429,
        headers: {'retry-after': futureDate}
      });
      const result = interceptor.response(ctx, res);

      assert.equal(result.retry, true);
      assert.ok(result.delay > 50_000);
      assert.ok(result.delay <= 60_000);
    });

    it('falls back to computed delay when Retry-After is unparseable', () => {
      const interceptor = createRetryInterceptor({
        baseDelay: 1000,
        jitter: 'none'
      });
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const res = createMockResponse({
        status: 503,
        headers: {'retry-after': 'not-a-value'}
      });
      const result = interceptor.response(ctx, res);

      assert.equal(result.retry, true);
      assert.equal(result.delay, 1000);
    });

    it('falls back to computed delay when no Retry-After header', () => {
      const interceptor = createRetryInterceptor({
        baseDelay: 2000,
        jitter: 'none'
      });
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 503}));

      assert.equal(result.delay, 2000);
    });
  });

  describe('request — attempt initialization', () => {
    it('initializes attempt counter on first request call', () => {
      const interceptor = createRetryInterceptor({maxAttempts: 2, jitter: 'none'});
      const ctx = createMockCtx();

      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 503}));
      assert.equal(result.retry, true);
    });

    it('does not reset counter on subsequent request calls', () => {
      const interceptor = createRetryInterceptor({maxAttempts: 2, jitter: 'none'});
      const ctx = createMockCtx();

      interceptor.request(ctx);
      interceptor.response(ctx, createMockResponse({status: 503}));

      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 503}));
      assert.equal(result, undefined);
    });

    it('handles response without prior request call', () => {
      const interceptor = createRetryInterceptor({maxAttempts: 3, jitter: 'none'});
      const ctx = createMockCtx();

      const result = interceptor.response(ctx, createMockResponse({status: 503}));

      assert.equal(result.retry, true);
    });
  });

  describe('edge cases', () => {
    it('works with baseDelay=0 and jitter=none', () => {
      const interceptor = createRetryInterceptor({
        baseDelay: 0,
        jitter: 'none'
      });
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 503}));

      assert.equal(result.retry, true);
      assert.equal(result.delay, 0);
    });

    it('works with maxDelay=0', () => {
      const interceptor = createRetryInterceptor({
        baseDelay: 1000,
        maxDelay: 0,
        jitter: 'none'
      });
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 503}));

      assert.equal(result.retry, true);
      assert.equal(result.delay, 0);
    });

    it('idempotent=false on GET does not override method check', () => {
      const interceptor = createRetryInterceptor({jitter: 'none'});
      const ctx = createMockCtx({method: 'GET', idempotent: false});
      interceptor.request(ctx);

      const result = interceptor.response(ctx, createMockResponse({status: 500}));

      assert.equal(result.retry, true);
    });
  });

  describe('error — network error evaluation', () => {
    it('returns {retry: true, delay} for TypeError within budget', () => {
      const interceptor = createRetryInterceptor({jitter: 'none'});
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const result = interceptor.error(ctx, new TypeError('fetch failed'));

      assert.equal(result.retry, true);
      assert.equal(typeof result.delay, 'number');
    });

    it('returns undefined for TypeError when budget exhausted', () => {
      const interceptor = createRetryInterceptor({maxAttempts: 2, jitter: 'none'});
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const first = interceptor.error(ctx, new TypeError('fetch failed'));
      assert.equal(first.retry, true);

      const second = interceptor.error(ctx, new TypeError('fetch failed'));
      assert.equal(second, undefined);
    });

    it('returns undefined for non-TypeError errors', () => {
      const interceptor = createRetryInterceptor({jitter: 'none'});
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const result = interceptor.error(ctx, new Error('some other error'));

      assert.equal(result, undefined);
    });

    it('returns undefined for DOMException (AbortError)', () => {
      const interceptor = createRetryInterceptor({jitter: 'none'});
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const result = interceptor.error(ctx, new DOMException('aborted', 'AbortError'));

      assert.equal(result, undefined);
    });

    it('shares attempt counter with response()', () => {
      const interceptor = createRetryInterceptor({maxAttempts: 3, jitter: 'none'});
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const r1 = interceptor.error(ctx, new TypeError('fetch failed'));
      assert.equal(r1.retry, true);

      const r2 = interceptor.response(ctx, createMockResponse({status: 503}));
      assert.equal(r2.retry, true);

      const r3 = interceptor.error(ctx, new TypeError('fetch failed'));
      assert.equal(r3, undefined);
    });

    it('computes exponential backoff delays', () => {
      const interceptor = createRetryInterceptor({
        maxAttempts: 4,
        baseDelay: 1000,
        maxDelay: 60_000,
        backoff: 'exponential',
        jitter: 'none'
      });
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const r0 = interceptor.error(ctx, new TypeError('fetch failed'));
      assert.equal(r0.delay, 1000);

      const r1 = interceptor.error(ctx, new TypeError('fetch failed'));
      assert.equal(r1.delay, 2000);

      const r2 = interceptor.error(ctx, new TypeError('fetch failed'));
      assert.equal(r2.delay, 4000);
    });

    it('computes linear backoff delays', () => {
      const interceptor = createRetryInterceptor({
        maxAttempts: 4,
        baseDelay: 1000,
        maxDelay: 60_000,
        backoff: 'linear',
        jitter: 'none'
      });
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const r0 = interceptor.error(ctx, new TypeError('fetch failed'));
      assert.equal(r0.delay, 1000);

      const r1 = interceptor.error(ctx, new TypeError('fetch failed'));
      assert.equal(r1.delay, 2000);

      const r2 = interceptor.error(ctx, new TypeError('fetch failed'));
      assert.equal(r2.delay, 3000);
    });

    it('retries TypeError regardless of HTTP method (non-idempotent)', () => {
      const interceptor = createRetryInterceptor({jitter: 'none'});
      const ctx = createMockCtx({method: 'POST'});
      interceptor.request(ctx);

      const result = interceptor.error(ctx, new TypeError('fetch failed'));

      assert.equal(result.retry, true);
    });

    it('caps delay at maxDelay', () => {
      const interceptor = createRetryInterceptor({
        maxAttempts: 4,
        baseDelay: 10_000,
        maxDelay: 15_000,
        backoff: 'exponential',
        jitter: 'none'
      });
      const ctx = createMockCtx();
      interceptor.request(ctx);

      interceptor.error(ctx, new TypeError('fetch failed'));

      const r1 = interceptor.error(ctx, new TypeError('fetch failed'));
      assert.equal(r1.delay, 15_000);
    });

    it('never retries with maxAttempts=1', () => {
      const interceptor = createRetryInterceptor({maxAttempts: 1, jitter: 'none'});
      const ctx = createMockCtx();
      interceptor.request(ctx);

      const result = interceptor.error(ctx, new TypeError('fetch failed'));

      assert.equal(result, undefined);
    });

    it('handles error without prior request call', () => {
      const interceptor = createRetryInterceptor({maxAttempts: 3, jitter: 'none'});
      const ctx = createMockCtx();

      const result = interceptor.error(ctx, new TypeError('fetch failed'));

      assert.equal(result.retry, true);
    });
  });

  describe('instance isolation', () => {
    it('different instances do not share attempt state', () => {
      const interceptor1 = createRetryInterceptor({maxAttempts: 2, jitter: 'none'});
      const interceptor2 = createRetryInterceptor({maxAttempts: 2, jitter: 'none'});
      const ctx = createMockCtx();

      interceptor1.request(ctx);
      interceptor2.request(ctx);

      const r1 = interceptor1.response(ctx, createMockResponse({status: 503}));
      assert.equal(r1.retry, true);

      const r2 = interceptor2.response(ctx, createMockResponse({status: 503}));
      assert.equal(r2.retry, true);
    });
  });
});
