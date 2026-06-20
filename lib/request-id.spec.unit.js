/**
 * @fileoverview Boundary tests for the request-ID interceptor.
 * @module @centralping/ergo-fetch/lib/request-id.spec
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {createRequestIdInterceptor} from './request-id.js';

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
    baseUrl: 'https://api.example.com',
    ...overrides
  };
}

describe('createRequestIdInterceptor', () => {
  describe('factory', () => {
    it('returns a frozen null-prototype object', () => {
      const interceptor = createRequestIdInterceptor();

      assert.equal(Object.getPrototypeOf(interceptor), null);
      assert.equal(Object.isFrozen(interceptor), true);
    });

    it('returns an object with request and response methods', () => {
      const interceptor = createRequestIdInterceptor();

      assert.equal(typeof interceptor.request, 'function');
      assert.equal(typeof interceptor.response, 'function');
    });

    it('throws TypeError for empty headerName', () => {
      assert.throws(() => createRequestIdInterceptor({headerName: ''}), {
        name: 'TypeError',
        message: 'headerName must be a valid HTTP token (RFC 9110 Section 5.6.2)'
      });
    });

    it('throws TypeError for non-string headerName', () => {
      assert.throws(() => createRequestIdInterceptor({headerName: 123}), {
        name: 'TypeError',
        message: 'headerName must be a valid HTTP token (RFC 9110 Section 5.6.2)'
      });
    });

    it('throws TypeError for headerName with spaces', () => {
      assert.throws(() => createRequestIdInterceptor({headerName: 'bad header'}), {
        name: 'TypeError',
        message: 'headerName must be a valid HTTP token (RFC 9110 Section 5.6.2)'
      });
    });

    it('throws TypeError for headerName with colons', () => {
      assert.throws(() => createRequestIdInterceptor({headerName: 'x:custom'}), {
        name: 'TypeError',
        message: 'headerName must be a valid HTTP token (RFC 9110 Section 5.6.2)'
      });
    });

    it('throws TypeError for non-boolean generate', () => {
      assert.throws(() => createRequestIdInterceptor({generate: 'true'}), {
        name: 'TypeError',
        message: 'generate must be a boolean'
      });
    });

    it('throws TypeError for numeric generate', () => {
      assert.throws(() => createRequestIdInterceptor({generate: 1}), {
        name: 'TypeError',
        message: 'generate must be a boolean'
      });
    });

    it('accepts custom headerName option', () => {
      const interceptor = createRequestIdInterceptor({headerName: 'x-correlation-id'});
      const ctx = createMockCtx();
      const res = new Response(null, {headers: {'x-correlation-id': 'abc-123'}});

      interceptor.response(ctx, res);

      assert.equal(ctx.requestId, 'abc-123');
    });

    it('defaults generate to false', () => {
      const interceptor = createRequestIdInterceptor();
      const ctx = createMockCtx();

      interceptor.request(ctx);

      assert.equal(ctx.headers.has('x-request-id'), false);
    });

    it('throws TypeError when options is a number', () => {
      assert.throws(() => createRequestIdInterceptor(1), {
        name: 'TypeError',
        message: 'options must be an object'
      });
    });

    it('throws TypeError when options is a string', () => {
      assert.throws(() => createRequestIdInterceptor('test'), {
        name: 'TypeError',
        message: 'options must be an object'
      });
    });

    it('throws TypeError when options is a boolean', () => {
      assert.throws(() => createRequestIdInterceptor(true), {
        name: 'TypeError',
        message: 'options must be an object'
      });
    });

    it('throws TypeError when options is null', () => {
      assert.throws(() => createRequestIdInterceptor(null), {
        name: 'TypeError',
        message: 'options must be an object'
      });
    });

    it('throws TypeError when options is an array', () => {
      assert.throws(() => createRequestIdInterceptor([]), {
        name: 'TypeError',
        message: 'options must be an object'
      });
    });
  });

  describe('request', () => {
    it('generates a UUID when generate is true', () => {
      const interceptor = createRequestIdInterceptor({generate: true});
      const ctx = createMockCtx();

      interceptor.request(ctx);

      const value = ctx.headers.get('x-request-id');
      assert.ok(value);
      assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('does not overwrite an existing header', () => {
      const interceptor = createRequestIdInterceptor({generate: true});
      const ctx = createMockCtx({headers: new Headers({'x-request-id': 'user-provided'})});

      interceptor.request(ctx);

      assert.equal(ctx.headers.get('x-request-id'), 'user-provided');
    });

    it('does nothing when generate is false', () => {
      const interceptor = createRequestIdInterceptor({generate: false});
      const ctx = createMockCtx();

      interceptor.request(ctx);

      assert.equal(ctx.headers.has('x-request-id'), false);
    });

    it('uses custom headerName for generation', () => {
      const interceptor = createRequestIdInterceptor({
        headerName: 'x-trace-id',
        generate: true
      });
      const ctx = createMockCtx();

      interceptor.request(ctx);

      assert.ok(ctx.headers.get('x-trace-id'));
      assert.equal(ctx.headers.has('x-request-id'), false);
    });

    it('generates unique IDs across calls', () => {
      const interceptor = createRequestIdInterceptor({generate: true});
      const ctx1 = createMockCtx();
      const ctx2 = createMockCtx();

      interceptor.request(ctx1);
      interceptor.request(ctx2);

      assert.notEqual(ctx1.headers.get('x-request-id'), ctx2.headers.get('x-request-id'));
    });
  });

  describe('response', () => {
    it('captures request ID from response header', () => {
      const interceptor = createRequestIdInterceptor();
      const ctx = createMockCtx();
      const res = new Response(null, {headers: {'x-request-id': 'server-id-123'}});

      interceptor.response(ctx, res);

      assert.equal(ctx.requestId, 'server-id-123');
    });

    it('does not set requestId when header is absent', () => {
      const interceptor = createRequestIdInterceptor();
      const ctx = createMockCtx();
      const res = new Response(null);

      interceptor.response(ctx, res);

      assert.equal(ctx.requestId, undefined);
    });

    it('uses custom headerName for capture', () => {
      const interceptor = createRequestIdInterceptor({headerName: 'x-correlation-id'});
      const ctx = createMockCtx();
      const res = new Response(null, {headers: {'x-correlation-id': 'corr-456'}});

      interceptor.response(ctx, res);

      assert.equal(ctx.requestId, 'corr-456');
    });

    it('handles case-insensitive header lookup', () => {
      const interceptor = createRequestIdInterceptor({headerName: 'X-Request-ID'});
      const ctx = createMockCtx();
      const res = new Response(null, {headers: {'x-request-id': 'case-test'}});

      interceptor.response(ctx, res);

      assert.equal(ctx.requestId, 'case-test');
    });
  });
});
