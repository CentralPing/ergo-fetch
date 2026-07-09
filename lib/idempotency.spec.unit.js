/**
 * @fileoverview Boundary tests for the idempotency interceptor.
 * @module @centralping/ergo-fetch/lib/idempotency.spec
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';

import {createIdempotencyInterceptor} from './idempotency.js';
import {idempotencyHeaderValue} from '../test/helpers/idempotency-header.js';

/**
 * Creates a minimal mock request context.
 *
 * @param {object} [overrides] - Properties to override on the context.
 * @returns {object} - Mock context object.
 */
function createMockCtx(overrides = {}) {
  return {
    method: 'POST',
    url: 'https://api.example.com/orders',
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

describe('createIdempotencyInterceptor', () => {
  describe('factory validation', () => {
    it('returns a frozen null-prototype object', () => {
      const interceptor = createIdempotencyInterceptor();

      assert.equal(Object.getPrototypeOf(interceptor), null);
      assert.equal(Object.isFrozen(interceptor), true);
    });

    it('returns an object with request and response methods', () => {
      const interceptor = createIdempotencyInterceptor();

      assert.equal(typeof interceptor.request, 'function');
      assert.equal(typeof interceptor.response, 'function');
    });

    it('accepts valid options without throwing', () => {
      assert.doesNotThrow(() =>
        createIdempotencyInterceptor({
          headerName: 'x-idempotency-key',
          methods: ['POST', 'PUT'],
          generator: () => 'test-key',
          ttl: 60_000
        })
      );
    });

    it('accepts undefined options', () => {
      assert.doesNotThrow(() => createIdempotencyInterceptor());
      assert.doesNotThrow(() => createIdempotencyInterceptor(undefined));
    });

    it('throws TypeError when options is a number', () => {
      assert.throws(() => createIdempotencyInterceptor(1), {
        name: 'TypeError',
        message: 'options must be an object'
      });
    });

    it('throws TypeError when options is a string', () => {
      assert.throws(() => createIdempotencyInterceptor('test'), {
        name: 'TypeError',
        message: 'options must be an object'
      });
    });

    it('throws TypeError when options is a boolean', () => {
      assert.throws(() => createIdempotencyInterceptor(true), {
        name: 'TypeError',
        message: 'options must be an object'
      });
    });

    it('throws TypeError when options is null', () => {
      assert.throws(() => createIdempotencyInterceptor(null), {
        name: 'TypeError',
        message: 'options must be an object'
      });
    });

    it('throws TypeError when options is an array', () => {
      assert.throws(() => createIdempotencyInterceptor([]), {
        name: 'TypeError',
        message: 'options must be an object'
      });
    });

    it('throws TypeError for invalid headerName (non-token)', () => {
      assert.throws(() => createIdempotencyInterceptor({headerName: 'bad header'}), {
        name: 'TypeError',
        message: 'headerName must be a valid HTTP token (RFC 9110 Section 5.6.2)'
      });
    });

    it('throws TypeError for empty headerName', () => {
      assert.throws(() => createIdempotencyInterceptor({headerName: ''}), {
        name: 'TypeError',
        message: 'headerName must be a valid HTTP token (RFC 9110 Section 5.6.2)'
      });
    });

    it('throws TypeError when methods is not an array', () => {
      assert.throws(() => createIdempotencyInterceptor({methods: 'POST'}), {
        name: 'TypeError',
        message: 'methods must be an array of strings'
      });
    });

    it('throws TypeError when methods contains non-string', () => {
      assert.throws(() => createIdempotencyInterceptor({methods: [123]}), {
        name: 'TypeError',
        message: 'methods must contain only non-empty strings'
      });
    });

    it('throws TypeError when methods contains empty string', () => {
      assert.throws(() => createIdempotencyInterceptor({methods: ['']}), {
        name: 'TypeError',
        message: 'methods must contain only non-empty strings'
      });
    });

    it('throws TypeError when generator is not a function', () => {
      assert.throws(() => createIdempotencyInterceptor({generator: 'uuid'}), {
        name: 'TypeError',
        message: 'generator must be a function'
      });
    });

    it('throws TypeError when ttl is not a number', () => {
      assert.throws(() => createIdempotencyInterceptor({ttl: '5000'}), {
        name: 'TypeError',
        message: 'ttl must be a positive finite number'
      });
    });

    it('throws TypeError when ttl is zero', () => {
      assert.throws(() => createIdempotencyInterceptor({ttl: 0}), {
        name: 'TypeError',
        message: 'ttl must be a positive finite number'
      });
    });

    it('throws TypeError when ttl is negative', () => {
      assert.throws(() => createIdempotencyInterceptor({ttl: -1}), {
        name: 'TypeError',
        message: 'ttl must be a positive finite number'
      });
    });

    it('throws TypeError when ttl is Infinity', () => {
      assert.throws(() => createIdempotencyInterceptor({ttl: Infinity}), {
        name: 'TypeError',
        message: 'ttl must be a positive finite number'
      });
    });

    it('throws TypeError when ttl is NaN', () => {
      assert.throws(() => createIdempotencyInterceptor({ttl: NaN}), {
        name: 'TypeError',
        message: 'ttl must be a positive finite number'
      });
    });
  });

  describe('request — key generation', () => {
    let interceptor;

    beforeEach(() => {
      interceptor = createIdempotencyInterceptor();
    });

    it('generates a key for POST requests', async () => {
      const ctx = createMockCtx();
      await interceptor.request(ctx);

      assert.ok(ctx.headers.has('idempotency-key'));
      assert.ok(idempotencyHeaderValue(ctx.headers).length > 0);
    });

    it('generates a UUID-formatted key by default', async () => {
      const ctx = createMockCtx();
      await interceptor.request(ctx);

      const key = idempotencyHeaderValue(ctx.headers);
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      assert.match(key, uuidRe);
      assert.equal(ctx.headers.get('idempotency-key'), `"${key}"`);
    });

    it('does not generate a key for GET requests', async () => {
      const ctx = createMockCtx({method: 'GET'});
      await interceptor.request(ctx);

      assert.equal(ctx.headers.has('idempotency-key'), false);
    });

    it('does not generate a key for HEAD requests', async () => {
      const ctx = createMockCtx({method: 'HEAD'});
      await interceptor.request(ctx);

      assert.equal(ctx.headers.has('idempotency-key'), false);
    });

    it('does not generate a key for DELETE requests with default methods', async () => {
      const ctx = createMockCtx({method: 'DELETE'});
      await interceptor.request(ctx);

      assert.equal(ctx.headers.has('idempotency-key'), false);
    });

    it('generates keys for configured methods', async () => {
      const idem = createIdempotencyInterceptor({methods: ['POST', 'PUT', 'PATCH']});

      const post = createMockCtx({method: 'POST'});
      const put = createMockCtx({method: 'PUT'});
      const patch = createMockCtx({method: 'PATCH'});

      await idem.request(post);
      await idem.request(put);
      await idem.request(patch);

      assert.ok(post.headers.has('idempotency-key'));
      assert.ok(put.headers.has('idempotency-key'));
      assert.ok(patch.headers.has('idempotency-key'));
    });

    it('normalizes configured methods to uppercase', async () => {
      const idem = createIdempotencyInterceptor({methods: ['post', 'put']});

      const post = createMockCtx({method: 'POST'});
      const put = createMockCtx({method: 'PUT'});

      await idem.request(post);
      await idem.request(put);

      assert.ok(post.headers.has('idempotency-key'));
      assert.ok(put.headers.has('idempotency-key'));
    });

    it('generates unique keys for different requests', async () => {
      const ctx1 = createMockCtx();
      const ctx2 = createMockCtx();

      await interceptor.request(ctx1);
      await interceptor.request(ctx2);

      assert.notEqual(idempotencyHeaderValue(ctx1.headers), idempotencyHeaderValue(ctx2.headers));
    });
  });

  describe('request — custom header name', () => {
    it('uses the configured header name', async () => {
      const interceptor = createIdempotencyInterceptor({headerName: 'x-idempotency-key'});
      const ctx = createMockCtx();
      await interceptor.request(ctx);

      assert.ok(ctx.headers.has('x-idempotency-key'));
      assert.equal(ctx.headers.has('idempotency-key'), false);
    });
  });

  describe('request — custom generator', () => {
    it('uses the custom generator function', async () => {
      let callCount = 0;
      const interceptor = createIdempotencyInterceptor({
        generator: () => `custom-key-${++callCount}`
      });

      const ctx = createMockCtx();
      await interceptor.request(ctx);

      assert.equal(idempotencyHeaderValue(ctx.headers), 'custom-key-1');
      assert.equal(callCount, 1);
    });

    it('throws TypeError when generator returns empty string', async () => {
      const interceptor = createIdempotencyInterceptor({generator: () => ''});
      const ctx = createMockCtx();
      await assert.rejects(() => interceptor.request(ctx), {
        name: 'TypeError',
        message: 'generator must return a non-empty string'
      });
    });

    it('throws TypeError when generator returns non-string', async () => {
      const interceptor = createIdempotencyInterceptor({generator: () => 123});
      const ctx = createMockCtx();
      await assert.rejects(() => interceptor.request(ctx), {
        name: 'TypeError',
        message: 'generator must return a non-empty string'
      });
    });
  });

  describe('request — RFC 8941 wire format', () => {
    let interceptor;

    beforeEach(() => {
      interceptor = createIdempotencyInterceptor();
    });

    it('sets Idempotency-Key header as a quoted sf-string', async () => {
      const ctx = createMockCtx({idempotencyKey: 'my-explicit-key'});
      await interceptor.request(ctx);

      assert.equal(ctx.headers.get('idempotency-key'), '"my-explicit-key"');
    });

    it('escapes DQUOTE and backslash in the wire header value', async () => {
      const ctx = createMockCtx({idempotencyKey: 'a"b\\c'});
      await interceptor.request(ctx);

      assert.equal(ctx.headers.get('idempotency-key'), '"a\\"b\\\\c"');
    });

    it('throws TypeError for CTL characters in explicit key', async () => {
      const ctx = createMockCtx({idempotencyKey: 'bad\nkey'});

      await assert.rejects(() => interceptor.request(ctx), {
        name: 'TypeError',
        message: 'idempotency key must be an RFC 8941 sf-string value (visible ASCII)'
      });
    });

    it('throws TypeError for DEL character in explicit key', async () => {
      const ctx = createMockCtx({idempotencyKey: 'bad\x7fkey'});

      await assert.rejects(() => interceptor.request(ctx), {
        name: 'TypeError',
        message: 'idempotency key must be an RFC 8941 sf-string value (visible ASCII)'
      });
    });

    it('throws TypeError for invalid characters from custom generator', async () => {
      const invalid = createIdempotencyInterceptor({generator: () => 'bad\tkey'});
      const ctx = createMockCtx();

      await assert.rejects(() => invalid.request(ctx), {
        name: 'TypeError',
        message: 'idempotency key must be an RFC 8941 sf-string value (visible ASCII)'
      });
    });

    it('does not store invalid generator key in ctx before charset validation', async () => {
      let calls = 0;
      const interceptor = createIdempotencyInterceptor({
        generator: () => {
          calls++;
          return calls === 1 ? 'bad\nkey' : 'valid-key';
        }
      });
      const ctx = createMockCtx();

      await assert.rejects(() => interceptor.request(ctx), {
        name: 'TypeError',
        message: 'idempotency key must be an RFC 8941 sf-string value (visible ASCII)'
      });

      await interceptor.request(ctx);

      assert.equal(calls, 2);
      assert.equal(idempotencyHeaderValue(ctx.headers), 'valid-key');
    });
  });

  describe('request — per-request control', () => {
    let interceptor;

    beforeEach(() => {
      interceptor = createIdempotencyInterceptor();
    });

    it('skips key generation when ctx.idempotent is false', async () => {
      const ctx = createMockCtx({idempotent: false});
      await interceptor.request(ctx);

      assert.equal(ctx.headers.has('idempotency-key'), false);
    });

    it('uses explicit key from ctx.idempotencyKey', async () => {
      const ctx = createMockCtx({idempotencyKey: 'my-explicit-key'});
      await interceptor.request(ctx);

      assert.equal(idempotencyHeaderValue(ctx.headers), 'my-explicit-key');
    });

    it('explicit key works for non-configured methods', async () => {
      const ctx = createMockCtx({method: 'PUT', idempotencyKey: 'explicit-put-key'});
      await interceptor.request(ctx);

      assert.equal(idempotencyHeaderValue(ctx.headers), 'explicit-put-key');
    });

    it('idempotent: false takes precedence over explicit key', async () => {
      const ctx = createMockCtx({idempotent: false, idempotencyKey: 'should-not-use'});
      await interceptor.request(ctx);

      assert.equal(ctx.headers.has('idempotency-key'), false);
    });

    it('idempotent: true alone does not force eligibility for non-configured methods', async () => {
      const ctx = createMockCtx({method: 'GET', idempotent: true});
      await interceptor.request(ctx);

      assert.equal(ctx.headers.has('idempotency-key'), false);
    });

    it('null idempotencyKey is treated as absent (not as explicit key)', async () => {
      const ctx = createMockCtx({method: 'GET', idempotencyKey: null});
      await interceptor.request(ctx);

      assert.equal(ctx.headers.has('idempotency-key'), false);
    });

    it('throws TypeError for empty string idempotencyKey', async () => {
      const ctx = createMockCtx({idempotencyKey: ''});
      await assert.rejects(() => interceptor.request(ctx), {
        name: 'TypeError',
        message: 'idempotencyKey must be a non-empty string'
      });
    });

    it('throws TypeError for non-string idempotencyKey', async () => {
      const ctx = createMockCtx({idempotencyKey: 123});
      await assert.rejects(() => interceptor.request(ctx), {
        name: 'TypeError',
        message: 'idempotencyKey must be a non-empty string'
      });
    });
  });

  describe('request — retry reuse', () => {
    let interceptor;

    beforeEach(() => {
      interceptor = createIdempotencyInterceptor();
    });

    it('reuses the same key on subsequent calls for the same context', async () => {
      const ctx = createMockCtx();
      await interceptor.request(ctx);
      const firstKey = idempotencyHeaderValue(ctx.headers);

      ctx.headers = new Headers();
      await interceptor.request(ctx);
      const secondKey = idempotencyHeaderValue(ctx.headers);

      assert.equal(firstKey, secondKey);
    });

    it('does not regenerate key even after headers are rebuilt', async () => {
      const ctx = createMockCtx();
      await interceptor.request(ctx);
      const key = idempotencyHeaderValue(ctx.headers);

      ctx.headers = new Headers();
      ctx.headers.set('x-other', 'value');
      await interceptor.request(ctx);

      assert.equal(idempotencyHeaderValue(ctx.headers), key);
    });

    it('different contexts get different keys', async () => {
      const ctx1 = createMockCtx();
      const ctx2 = createMockCtx();

      await interceptor.request(ctx1);
      await interceptor.request(ctx2);

      assert.notEqual(idempotencyHeaderValue(ctx1.headers), idempotencyHeaderValue(ctx2.headers));
    });
  });

  describe('request — body fingerprinting', () => {
    it('throws on fingerprint mismatch for explicit key reuse (key still active)', async () => {
      const interceptor = createIdempotencyInterceptor();

      const ctx1 = createMockCtx({
        idempotencyKey: 'shared-key',
        body: JSON.stringify({order: 'A'})
      });
      await interceptor.request(ctx1);

      const ctx2 = createMockCtx({
        idempotencyKey: 'shared-key',
        body: JSON.stringify({order: 'B'})
      });

      await assert.rejects(() => interceptor.request(ctx2), {
        name: 'TypeError',
        message: /fingerprint mismatch/
      });
    });

    it('allows same explicit key with identical body', async () => {
      const interceptor = createIdempotencyInterceptor();
      const body = JSON.stringify({order: 'A'});

      const ctx1 = createMockCtx({idempotencyKey: 'reuse-key', body});
      await interceptor.request(ctx1);

      const ctx2 = createMockCtx({idempotencyKey: 'reuse-key', body});
      await assert.doesNotReject(() => interceptor.request(ctx2));
    });

    it('skips fingerprint check when body is undefined', async () => {
      const interceptor = createIdempotencyInterceptor();

      const ctx1 = createMockCtx({idempotencyKey: 'no-body-key'});
      await interceptor.request(ctx1);

      const ctx2 = createMockCtx({idempotencyKey: 'no-body-key'});
      await assert.doesNotReject(() => interceptor.request(ctx2));
    });

    it('throws on fingerprint mismatch when first request has body and second is bodiless', async () => {
      const interceptor = createIdempotencyInterceptor();

      const ctx1 = createMockCtx({
        idempotencyKey: 'body-to-nobody',
        body: JSON.stringify({order: 'A'})
      });
      await interceptor.request(ctx1);

      const ctx2 = createMockCtx({idempotencyKey: 'body-to-nobody'});

      await assert.rejects(() => interceptor.request(ctx2), {
        name: 'TypeError',
        message: /fingerprint mismatch/
      });

      assert.equal(ctx2.headers.has('idempotency-key'), false);
    });

    it('throws on fingerprint mismatch when first request is bodiless and second has body', async () => {
      const interceptor = createIdempotencyInterceptor();

      const ctx1 = createMockCtx({idempotencyKey: 'nobody-to-body'});
      await interceptor.request(ctx1);

      const ctx2 = createMockCtx({
        idempotencyKey: 'nobody-to-body',
        body: JSON.stringify({order: 'B'})
      });

      await assert.rejects(() => interceptor.request(ctx2), {
        name: 'TypeError',
        message: /fingerprint mismatch/
      });

      assert.equal(ctx2.headers.has('idempotency-key'), false);
    });
  });

  describe('response — key lifecycle', () => {
    let interceptor;

    beforeEach(() => {
      interceptor = createIdempotencyInterceptor();
    });

    it('clears registry on 200', async () => {
      const ctx = createMockCtx({
        idempotencyKey: 'success-key',
        body: JSON.stringify({data: 1})
      });
      await interceptor.request(ctx);
      interceptor.response(ctx, createMockResponse({status: 200}));

      const ctx2 = createMockCtx({
        idempotencyKey: 'success-key',
        body: JSON.stringify({data: 2})
      });
      await assert.doesNotReject(() => interceptor.request(ctx2));
    });

    it('clears registry on 201', async () => {
      const ctx = createMockCtx({
        idempotencyKey: 'created-key',
        body: JSON.stringify({data: 1})
      });
      await interceptor.request(ctx);
      interceptor.response(ctx, createMockResponse({status: 201}));

      const ctx2 = createMockCtx({
        idempotencyKey: 'created-key',
        body: JSON.stringify({data: 2})
      });
      await assert.doesNotReject(() => interceptor.request(ctx2));
    });

    it('clears registry on 204', async () => {
      const ctx = createMockCtx({
        idempotencyKey: 'no-content-key',
        body: JSON.stringify({data: 1})
      });
      await interceptor.request(ctx);
      interceptor.response(ctx, createMockResponse({status: 204}));

      const ctx2 = createMockCtx({
        idempotencyKey: 'no-content-key',
        body: JSON.stringify({data: 2})
      });
      await assert.doesNotReject(() => interceptor.request(ctx2));
    });

    it('preserves registry on 500 (retryable)', async () => {
      const ctx = createMockCtx({
        idempotencyKey: 'retry-key',
        body: JSON.stringify({data: 1})
      });
      await interceptor.request(ctx);
      interceptor.response(ctx, createMockResponse({status: 500}));

      const ctx2 = createMockCtx({
        idempotencyKey: 'retry-key',
        body: JSON.stringify({data: 2})
      });
      await assert.rejects(() => interceptor.request(ctx2), {
        message: /fingerprint mismatch/
      });
    });

    it('preserves registry on 429 (retryable)', async () => {
      const ctx = createMockCtx({
        idempotencyKey: 'rate-limited-key',
        body: JSON.stringify({data: 1})
      });
      await interceptor.request(ctx);
      interceptor.response(ctx, createMockResponse({status: 429}));

      const ctx2 = createMockCtx({
        idempotencyKey: 'rate-limited-key',
        body: JSON.stringify({data: 2})
      });
      await assert.rejects(() => interceptor.request(ctx2), {
        message: /fingerprint mismatch/
      });
    });

    it('preserves registry on 409 (non-retryable)', async () => {
      const ctx = createMockCtx({
        idempotencyKey: 'conflict-key',
        body: JSON.stringify({data: 1})
      });
      await interceptor.request(ctx);
      interceptor.response(ctx, createMockResponse({status: 409}));

      const ctx2 = createMockCtx({
        idempotencyKey: 'conflict-key',
        body: JSON.stringify({data: 2})
      });
      await assert.rejects(() => interceptor.request(ctx2), {
        message: /fingerprint mismatch/
      });
    });

    it('returns void (no retry signal) on all statuses', async () => {
      const ctx = createMockCtx();
      await interceptor.request(ctx);

      assert.equal(interceptor.response(ctx, createMockResponse({status: 200})), undefined);

      const ctx2 = createMockCtx();
      await interceptor.request(ctx2);

      assert.equal(interceptor.response(ctx2, createMockResponse({status: 500})), undefined);

      const ctx3 = createMockCtx();
      await interceptor.request(ctx3);

      assert.equal(interceptor.response(ctx3, createMockResponse({status: 409})), undefined);
    });

    it('reattaches preserved key on retry after non-2xx response', async () => {
      const ctx = createMockCtx({body: JSON.stringify({data: 1})});

      await interceptor.request(ctx);
      const firstKey = idempotencyHeaderValue(ctx.headers);
      interceptor.response(ctx, createMockResponse({status: 500}));

      ctx.headers = new Headers();
      await interceptor.request(ctx);

      assert.equal(idempotencyHeaderValue(ctx.headers), firstKey);
    });

    it('does nothing when ctx has no stored key', () => {
      const ctx = createMockCtx({method: 'GET'});
      const result = interceptor.response(ctx, createMockResponse({status: 200}));

      assert.equal(result, undefined);
    });
  });

  describe('TTL expiration', () => {
    it('evicts expired entries on next request', async t => {
      t.mock.timers.enable({apis: ['Date']});
      const interceptor = createIdempotencyInterceptor({ttl: 1});
      const body = JSON.stringify({data: 'original'});

      const ctx1 = createMockCtx({idempotencyKey: 'ttl-key', body});
      await interceptor.request(ctx1);

      t.mock.timers.tick(5);

      const ctx2 = createMockCtx({
        idempotencyKey: 'ttl-key',
        body: JSON.stringify({data: 'different'})
      });
      await assert.doesNotReject(() => interceptor.request(ctx2));
    });

    it('does not evict entries within TTL', async () => {
      const interceptor = createIdempotencyInterceptor({ttl: 60_000});
      const body = JSON.stringify({data: 'original'});

      const ctx1 = createMockCtx({idempotencyKey: 'fresh-key', body});
      await interceptor.request(ctx1);

      const ctx2 = createMockCtx({
        idempotencyKey: 'fresh-key',
        body: JSON.stringify({data: 'different'})
      });
      await assert.rejects(() => interceptor.request(ctx2), {
        message: /fingerprint mismatch/
      });
    });
  });

  describe('instance isolation', () => {
    it('different instances do not share key state', async () => {
      const idem1 = createIdempotencyInterceptor();
      const idem2 = createIdempotencyInterceptor();

      const ctx = createMockCtx();
      await idem1.request(ctx);
      const key1 = idempotencyHeaderValue(ctx.headers);

      ctx.headers = new Headers();
      await idem2.request(ctx);
      const key2 = idempotencyHeaderValue(ctx.headers);

      assert.notEqual(key1, key2);
    });

    it('different instances do not share registry', async () => {
      const idem1 = createIdempotencyInterceptor();
      const idem2 = createIdempotencyInterceptor();

      const ctx1 = createMockCtx({
        idempotencyKey: 'shared-key',
        body: JSON.stringify({data: 'A'})
      });
      await idem1.request(ctx1);

      const ctx2 = createMockCtx({
        idempotencyKey: 'shared-key',
        body: JSON.stringify({data: 'B'})
      });
      await assert.doesNotReject(() => idem2.request(ctx2));
    });
  });

  describe('edge cases', () => {
    it('handles empty body string', async () => {
      const interceptor = createIdempotencyInterceptor();
      const ctx1 = createMockCtx({idempotencyKey: 'empty-body-key', body: ''});
      await interceptor.request(ctx1);

      assert.ok(ctx1.headers.has('idempotency-key'));

      const ctx2 = createMockCtx({idempotencyKey: 'empty-body-key', body: 'non-empty'});
      await assert.rejects(() => interceptor.request(ctx2), {
        name: 'TypeError',
        message: /fingerprint mismatch/
      });
    });

    it('handles very large body for fingerprinting', async () => {
      const interceptor = createIdempotencyInterceptor();
      const largeBody = 'x'.repeat(100_000);
      const ctx1 = createMockCtx({idempotencyKey: 'large-body-key', body: largeBody});
      await interceptor.request(ctx1);

      assert.ok(ctx1.headers.has('idempotency-key'));

      const ctx2 = createMockCtx({idempotencyKey: 'large-body-key', body: 'y'.repeat(100_000)});
      await assert.rejects(() => interceptor.request(ctx2), {
        name: 'TypeError',
        message: /fingerprint mismatch/
      });
    });

    it('request function is named for stack traces', () => {
      const interceptor = createIdempotencyInterceptor();
      assert.equal(interceptor.request.name, 'request');
    });

    it('response function is named for stack traces', () => {
      const interceptor = createIdempotencyInterceptor();
      assert.equal(interceptor.response.name, 'response');
    });
  });

  describe('maxEntries — factory validation', () => {
    it('accepts undefined maxEntries (uses default)', () => {
      assert.doesNotThrow(() => createIdempotencyInterceptor());
      assert.doesNotThrow(() => createIdempotencyInterceptor({}));
    });

    it('accepts a positive integer', () => {
      assert.doesNotThrow(() => createIdempotencyInterceptor({maxEntries: 1}));
      assert.doesNotThrow(() => createIdempotencyInterceptor({maxEntries: 100}));
      assert.doesNotThrow(() => createIdempotencyInterceptor({maxEntries: 5000}));
    });

    it('throws TypeError for zero', () => {
      assert.throws(() => createIdempotencyInterceptor({maxEntries: 0}), {
        name: 'TypeError',
        message: /maxEntries must be a positive integer/
      });
    });

    it('throws TypeError for negative integer', () => {
      assert.throws(() => createIdempotencyInterceptor({maxEntries: -1}), {
        name: 'TypeError',
        message: /maxEntries must be a positive integer/
      });
    });

    it('throws TypeError for non-integer (float)', () => {
      assert.throws(() => createIdempotencyInterceptor({maxEntries: 1.5}), {
        name: 'TypeError',
        message: /maxEntries must be a positive integer/
      });
    });

    it('throws TypeError for NaN', () => {
      assert.throws(() => createIdempotencyInterceptor({maxEntries: NaN}), {
        name: 'TypeError',
        message: /maxEntries must be a positive integer/
      });
    });

    it('throws TypeError for Infinity', () => {
      assert.throws(() => createIdempotencyInterceptor({maxEntries: Infinity}), {
        name: 'TypeError',
        message: /maxEntries must be a positive integer/
      });
    });

    it('throws TypeError for string', () => {
      assert.throws(() => createIdempotencyInterceptor({maxEntries: '10'}), {
        name: 'TypeError',
        message: /maxEntries must be a positive integer/
      });
    });
  });

  describe('maxEntries — FIFO eviction', () => {
    it('evicts the oldest entry when capacity is exceeded', async () => {
      const interceptor = createIdempotencyInterceptor({maxEntries: 2});

      const ctx1 = createMockCtx({
        idempotencyKey: 'key-1',
        body: JSON.stringify({v: 1})
      });
      await interceptor.request(ctx1);

      const ctx2 = createMockCtx({
        idempotencyKey: 'key-2',
        body: JSON.stringify({v: 2})
      });
      await interceptor.request(ctx2);

      const ctx3 = createMockCtx({idempotencyKey: 'key-3'});
      await interceptor.request(ctx3);

      assert.equal(idempotencyHeaderValue(ctx1.headers), 'key-1');
      assert.equal(idempotencyHeaderValue(ctx2.headers), 'key-2');
      assert.equal(idempotencyHeaderValue(ctx3.headers), 'key-3');

      const reuseSurvived = createMockCtx({
        idempotencyKey: 'key-2',
        body: JSON.stringify({v: 99})
      });
      await assert.rejects(() => interceptor.request(reuseSurvived), {
        message: /fingerprint mismatch/
      });

      const reuseEvicted = createMockCtx({
        idempotencyKey: 'key-1',
        body: JSON.stringify({v: 99})
      });
      await assert.doesNotReject(() => interceptor.request(reuseEvicted));
    });

    it('oldest evicted entry no longer triggers fingerprint mismatch', async () => {
      const interceptor = createIdempotencyInterceptor({maxEntries: 2});

      const ctx1 = createMockCtx({
        idempotencyKey: 'evict-me',
        body: JSON.stringify({order: 'A'})
      });
      await interceptor.request(ctx1);

      const ctx2 = createMockCtx({idempotencyKey: 'stay-1'});
      await interceptor.request(ctx2);

      const ctx3 = createMockCtx({idempotencyKey: 'stay-2'});
      await interceptor.request(ctx3);

      const ctx4 = createMockCtx({
        idempotencyKey: 'evict-me',
        body: JSON.stringify({order: 'B'})
      });
      await assert.doesNotReject(() => interceptor.request(ctx4));
    });

    it('refreshes position for reused explicit key (not evicted prematurely)', async () => {
      const interceptor = createIdempotencyInterceptor({maxEntries: 2});

      const ctx1 = createMockCtx({idempotencyKey: 'refreshed-key', body: JSON.stringify({x: 1})});
      await interceptor.request(ctx1);

      const ctx2 = createMockCtx({idempotencyKey: 'other-key'});
      await interceptor.request(ctx2);

      const ctx3 = createMockCtx({idempotencyKey: 'refreshed-key', body: JSON.stringify({x: 1})});
      await interceptor.request(ctx3);

      const ctx4 = createMockCtx({idempotencyKey: 'new-key'});
      await interceptor.request(ctx4);

      const ctx5 = createMockCtx({
        idempotencyKey: 'refreshed-key',
        body: JSON.stringify({x: 2})
      });
      await assert.rejects(() => interceptor.request(ctx5), {
        message: /fingerprint mismatch/
      });
    });

    it('works with maxEntries: 1', async () => {
      const interceptor = createIdempotencyInterceptor({maxEntries: 1});

      const ctx1 = createMockCtx({
        idempotencyKey: 'only-one',
        body: JSON.stringify({v: 1})
      });
      await interceptor.request(ctx1);
      assert.equal(idempotencyHeaderValue(ctx1.headers), 'only-one');

      const ctx2 = createMockCtx({idempotencyKey: 'second-entry'});
      await interceptor.request(ctx2);

      const reuseEvicted = createMockCtx({
        idempotencyKey: 'only-one',
        body: JSON.stringify({v: 99})
      });
      await assert.doesNotReject(() => interceptor.request(reuseEvicted));
    });

    it('evicts in FIFO order across multiple evictions', async () => {
      const interceptor = createIdempotencyInterceptor({maxEntries: 2});

      const ctx1 = createMockCtx({
        idempotencyKey: 'first',
        body: JSON.stringify({v: 1})
      });
      await interceptor.request(ctx1);

      const ctx2 = createMockCtx({
        idempotencyKey: 'second',
        body: JSON.stringify({v: 2})
      });
      await interceptor.request(ctx2);

      const ctx3 = createMockCtx({idempotencyKey: 'third'});
      await interceptor.request(ctx3);

      const reuse1 = createMockCtx({
        idempotencyKey: 'first',
        body: JSON.stringify({v: 99})
      });
      await assert.doesNotReject(() => interceptor.request(reuse1));

      const reuse2 = createMockCtx({
        idempotencyKey: 'second',
        body: JSON.stringify({v: 99})
      });
      await assert.doesNotReject(() => interceptor.request(reuse2));
    });

    it('TTL eviction frees space before capacity check', async t => {
      t.mock.timers.enable({apis: ['Date']});
      const interceptor = createIdempotencyInterceptor({maxEntries: 2, ttl: 10});

      const ctx1 = createMockCtx({
        idempotencyKey: 'entry-a',
        body: JSON.stringify({x: 1})
      });
      await interceptor.request(ctx1);

      const ctx2 = createMockCtx({
        idempotencyKey: 'entry-b',
        body: JSON.stringify({x: 2})
      });
      await interceptor.request(ctx2);

      t.mock.timers.tick(11);

      const ctx3 = createMockCtx({idempotencyKey: 'entry-c'});
      await interceptor.request(ctx3);

      const reuseB = createMockCtx({
        idempotencyKey: 'entry-b',
        body: JSON.stringify({x: 99})
      });
      await assert.doesNotReject(() => interceptor.request(reuseB));
    });
  });
});
