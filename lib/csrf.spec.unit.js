/**
 * @fileoverview Boundary tests for the CSRF token interceptor.
 * @module @centralping/ergo-fetch/lib/csrf.spec
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';

import {createCsrfInterceptor} from './csrf.js';

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

describe('createCsrfInterceptor', () => {
  describe('factory validation', () => {
    it('returns a frozen null-prototype object', () => {
      const interceptor = createCsrfInterceptor();

      assert.equal(Object.getPrototypeOf(interceptor), null);
      assert.equal(Object.isFrozen(interceptor), true);
    });

    it('returns an object with request, response, getToken, and clearToken', () => {
      const interceptor = createCsrfInterceptor();

      assert.equal(typeof interceptor.request, 'function');
      assert.equal(typeof interceptor.response, 'function');
      assert.equal(typeof interceptor.getToken, 'function');
      assert.equal(typeof interceptor.clearToken, 'function');
    });

    it('throws TypeError for empty cookieName', () => {
      assert.throws(() => createCsrfInterceptor({cookieName: ''}), {
        name: 'TypeError',
        message: 'cookieName must be a non-empty string'
      });
    });

    it('throws TypeError for non-string cookieName', () => {
      assert.throws(() => createCsrfInterceptor({cookieName: 123}), {
        name: 'TypeError',
        message: 'cookieName must be a non-empty string'
      });
    });

    it('throws TypeError for empty headerName', () => {
      assert.throws(() => createCsrfInterceptor({headerName: ''}), {
        name: 'TypeError',
        message: 'headerName must be a non-empty string'
      });
    });

    it('throws TypeError for non-string headerName', () => {
      assert.throws(() => createCsrfInterceptor({headerName: null}), {
        name: 'TypeError',
        message: 'headerName must be a non-empty string'
      });
    });

    it('throws TypeError for non-array safeMethods', () => {
      assert.throws(() => createCsrfInterceptor({safeMethods: 'GET'}), {
        name: 'TypeError',
        message: 'safeMethods must be an array of strings'
      });
    });

    it('throws TypeError for safeMethods containing non-strings', () => {
      assert.throws(() => createCsrfInterceptor({safeMethods: ['GET', 123]}), {
        name: 'TypeError',
        message: 'safeMethods must contain only non-empty strings'
      });
    });

    it('throws TypeError for safeMethods containing empty strings', () => {
      assert.throws(() => createCsrfInterceptor({safeMethods: ['GET', '']}), {
        name: 'TypeError',
        message: 'safeMethods must contain only non-empty strings'
      });
    });

    it('starts with no token', () => {
      const interceptor = createCsrfInterceptor();

      assert.equal(interceptor.getToken(), undefined);
    });
  });

  describe('request', () => {
    let interceptor;

    beforeEach(() => {
      interceptor = createCsrfInterceptor();
      const ctx = createMockCtx();
      const res = new Response(null, {headers: {'x-csrf-token': 'test-token'}});
      interceptor.response(ctx, res);
    });

    it('attaches token to unsafe same-origin POST request', () => {
      const ctx = createMockCtx({method: 'POST'});

      interceptor.request(ctx);

      assert.equal(ctx.headers.get('x-csrf-token'), 'test-token');
    });

    it('attaches token to unsafe same-origin PUT request', () => {
      const ctx = createMockCtx({method: 'PUT'});

      interceptor.request(ctx);

      assert.equal(ctx.headers.get('x-csrf-token'), 'test-token');
    });

    it('attaches token to unsafe same-origin PATCH request', () => {
      const ctx = createMockCtx({method: 'PATCH'});

      interceptor.request(ctx);

      assert.equal(ctx.headers.get('x-csrf-token'), 'test-token');
    });

    it('attaches token to unsafe same-origin DELETE request', () => {
      const ctx = createMockCtx({method: 'DELETE'});

      interceptor.request(ctx);

      assert.equal(ctx.headers.get('x-csrf-token'), 'test-token');
    });

    it('does not attach token for GET requests', () => {
      const ctx = createMockCtx({method: 'GET'});

      interceptor.request(ctx);

      assert.equal(ctx.headers.has('x-csrf-token'), false);
    });

    it('does not attach token for HEAD requests', () => {
      const ctx = createMockCtx({method: 'HEAD'});

      interceptor.request(ctx);

      assert.equal(ctx.headers.has('x-csrf-token'), false);
    });

    it('does not attach token for OPTIONS requests', () => {
      const ctx = createMockCtx({method: 'OPTIONS'});

      interceptor.request(ctx);

      assert.equal(ctx.headers.has('x-csrf-token'), false);
    });

    it('does not attach token for cross-origin requests', () => {
      const ctx = createMockCtx({
        method: 'POST',
        url: 'https://evil.example.com/steal'
      });

      interceptor.request(ctx);

      assert.equal(ctx.headers.has('x-csrf-token'), false);
    });

    it('does not attach token when no token is stored', () => {
      const fresh = createCsrfInterceptor();
      const ctx = createMockCtx({method: 'POST'});

      fresh.request(ctx);

      assert.equal(ctx.headers.has('x-csrf-token'), false);
    });

    it('uses custom headerName', () => {
      const custom = createCsrfInterceptor({headerName: 'x-xsrf-token'});
      const getCtx = createMockCtx();
      const res = new Response(null, {headers: {'x-xsrf-token': 'custom-token'}});
      custom.response(getCtx, res);

      const ctx = createMockCtx({method: 'POST'});
      custom.request(ctx);

      assert.equal(ctx.headers.get('x-xsrf-token'), 'custom-token');
    });

    it('respects custom safeMethods', () => {
      const custom = createCsrfInterceptor({safeMethods: ['GET']});
      const getCtx = createMockCtx();
      const res = new Response(null, {headers: {'x-csrf-token': 'tok'}});
      custom.response(getCtx, res);

      const ctx = createMockCtx({method: 'HEAD'});
      custom.request(ctx);

      assert.equal(ctx.headers.get('x-csrf-token'), 'tok');
    });

    it('treats same port as same origin', () => {
      const ctx = createMockCtx({
        method: 'POST',
        url: 'https://api.example.com:443/resource',
        baseUrl: 'https://api.example.com'
      });

      interceptor.request(ctx);

      assert.equal(ctx.headers.get('x-csrf-token'), 'test-token');
    });

    it('treats different ports as cross-origin', () => {
      const ctx = createMockCtx({
        method: 'POST',
        url: 'https://api.example.com:8443/resource',
        baseUrl: 'https://api.example.com'
      });

      interceptor.request(ctx);

      assert.equal(ctx.headers.has('x-csrf-token'), false);
    });
  });

  describe('response', () => {
    it('extracts token from response header', () => {
      const interceptor = createCsrfInterceptor();
      const ctx = createMockCtx();
      const res = new Response(null, {headers: {'x-csrf-token': 'header-token'}});

      interceptor.response(ctx, res);

      assert.equal(interceptor.getToken(), 'header-token');
    });

    it('does not extract token from unsafe-method responses', () => {
      const interceptor = createCsrfInterceptor();
      const ctx = createMockCtx({method: 'POST'});
      const res = new Response(null, {headers: {'x-csrf-token': 'should-not-store'}});

      interceptor.response(ctx, res);

      assert.equal(interceptor.getToken(), undefined);
    });

    it('does not extract token from cross-origin responses', () => {
      const interceptor = createCsrfInterceptor();
      const ctx = createMockCtx({url: 'https://evil.example.com/data'});
      const res = new Response(null, {headers: {'x-csrf-token': 'attacker-token'}});

      interceptor.response(ctx, res);

      assert.equal(interceptor.getToken(), undefined);
    });

    it('does not extract token from different-port responses', () => {
      const interceptor = createCsrfInterceptor();
      const ctx = createMockCtx({url: 'https://api.example.com:8443/data'});
      const res = new Response(null, {headers: {'x-csrf-token': 'wrong-port-token'}});

      interceptor.response(ctx, res);

      assert.equal(interceptor.getToken(), undefined);
    });

    it('does not extract token when response redirected cross-origin', () => {
      const interceptor = createCsrfInterceptor();
      const ctx = createMockCtx();
      const res = Response.redirect('https://evil.example.com/stolen', 302);

      Object.defineProperty(res, 'url', {value: 'https://evil.example.com/stolen'});
      Object.defineProperty(res, 'headers', {
        value: new Headers({'x-csrf-token': 'redirect-token'})
      });

      interceptor.response(ctx, res);

      assert.equal(interceptor.getToken(), undefined);
    });

    it('extracts token when response URL is same-origin', () => {
      const interceptor = createCsrfInterceptor();
      const ctx = createMockCtx();
      const res = new Response(null, {headers: {'x-csrf-token': 'legit-token'}});

      Object.defineProperty(res, 'url', {value: 'https://api.example.com/other'});

      interceptor.response(ctx, res);

      assert.equal(interceptor.getToken(), 'legit-token');
    });

    it('extracts token from Set-Cookie via getSetCookie', () => {
      const interceptor = createCsrfInterceptor();
      const ctx = createMockCtx();
      const res = new Response(null);
      const originalGet = res.headers.get.bind(res.headers);
      const cookies = ['__csrf=cookie-token; Path=/; HttpOnly'];

      Object.defineProperty(res.headers, 'getSetCookie', {
        value: () => cookies,
        configurable: true
      });
      Object.defineProperty(res.headers, 'get', {
        value: name => {
          if (name === 'x-csrf-token') return null;
          return originalGet(name);
        },
        configurable: true
      });

      interceptor.response(ctx, res);

      assert.equal(interceptor.getToken(), 'cookie-token');
    });

    it('does not extract when getSetCookie returns non-matching cookies', () => {
      const interceptor = createCsrfInterceptor();
      const ctx = createMockCtx();
      const res = new Response(null);

      Object.defineProperty(res.headers, 'getSetCookie', {
        value: () => ['session=abc; Path=/; HttpOnly', 'other=xyz; Path=/'],
        configurable: true
      });
      Object.defineProperty(res.headers, 'get', {
        value: () => null,
        configurable: true
      });

      interceptor.response(ctx, res);

      assert.equal(interceptor.getToken(), undefined);
    });

    it('extracts token from Set-Cookie fallback (comma-split)', () => {
      const interceptor = createCsrfInterceptor();
      const ctx = createMockCtx();
      const res = new Response(null);

      Object.defineProperty(res.headers, 'getSetCookie', {value: undefined});
      Object.defineProperty(res.headers, 'get', {
        value: name => {
          if (name === 'x-csrf-token') return null;
          if (name === 'set-cookie') return 'session=abc; Path=/,__csrf=fallback-token; Path=/';
          return null;
        }
      });

      interceptor.response(ctx, res);

      assert.equal(interceptor.getToken(), 'fallback-token');
    });

    it('prioritizes response header over Set-Cookie', () => {
      const interceptor = createCsrfInterceptor();
      const ctx = createMockCtx();
      const res = new Response(null, {headers: {'x-csrf-token': 'header-wins'}});

      Object.defineProperty(res.headers, 'getSetCookie', {
        value: () => ['__csrf=cookie-loses; Path=/'],
        configurable: true
      });

      interceptor.response(ctx, res);

      assert.equal(interceptor.getToken(), 'header-wins');
    });

    it('uses custom cookieName for extraction', () => {
      const interceptor = createCsrfInterceptor({cookieName: '_xsrf'});
      const ctx = createMockCtx();
      const res = new Response(null);

      Object.defineProperty(res.headers, 'get', {
        value: name => {
          if (name === 'x-csrf-token') return null;
          if (name === 'set-cookie') return '_xsrf=custom-cookie; Path=/';
          return null;
        }
      });
      Object.defineProperty(res.headers, 'getSetCookie', {value: undefined});

      interceptor.response(ctx, res);

      assert.equal(interceptor.getToken(), 'custom-cookie');
    });

    it('does not extract when no matching cookie is found', () => {
      const interceptor = createCsrfInterceptor();
      const ctx = createMockCtx();
      const res = new Response(null);

      Object.defineProperty(res.headers, 'get', {
        value: name => {
          if (name === 'x-csrf-token') return null;
          if (name === 'set-cookie') return 'session=abc; Path=/';
          return null;
        }
      });
      Object.defineProperty(res.headers, 'getSetCookie', {value: undefined});

      interceptor.response(ctx, res);

      assert.equal(interceptor.getToken(), undefined);
    });

    it('ignores Set-Cookie values without an equals sign', () => {
      const interceptor = createCsrfInterceptor();
      const ctx = createMockCtx();
      const res = new Response(null);

      Object.defineProperty(res.headers, 'get', {
        value: name => {
          if (name === 'x-csrf-token') return null;
          if (name === 'set-cookie') return 'malformed-no-equals';
          return null;
        }
      });
      Object.defineProperty(res.headers, 'getSetCookie', {value: undefined});

      interceptor.response(ctx, res);

      assert.equal(interceptor.getToken(), undefined);
    });

    it('does not extract when set-cookie header is absent in fallback path', () => {
      const interceptor = createCsrfInterceptor();
      const ctx = createMockCtx();
      const res = new Response(null);

      Object.defineProperty(res.headers, 'get', {
        value: () => null
      });
      Object.defineProperty(res.headers, 'getSetCookie', {value: undefined});

      interceptor.response(ctx, res);

      assert.equal(interceptor.getToken(), undefined);
    });

    it('updates token on subsequent responses', () => {
      const interceptor = createCsrfInterceptor();
      const ctx1 = createMockCtx();
      const res1 = new Response(null, {headers: {'x-csrf-token': 'first'}});
      interceptor.response(ctx1, res1);

      const ctx2 = createMockCtx();
      const res2 = new Response(null, {headers: {'x-csrf-token': 'second'}});
      interceptor.response(ctx2, res2);

      assert.equal(interceptor.getToken(), 'second');
    });
  });

  describe('getToken / clearToken', () => {
    it('getToken returns current token', () => {
      const interceptor = createCsrfInterceptor();
      const ctx = createMockCtx();
      const res = new Response(null, {headers: {'x-csrf-token': 'stored'}});

      interceptor.response(ctx, res);

      assert.equal(interceptor.getToken(), 'stored');
    });

    it('clearToken removes stored token', () => {
      const interceptor = createCsrfInterceptor();
      const ctx = createMockCtx();
      const res = new Response(null, {headers: {'x-csrf-token': 'to-clear'}});

      interceptor.response(ctx, res);
      interceptor.clearToken();

      assert.equal(interceptor.getToken(), undefined);
    });

    it('request does not attach after clearToken', () => {
      const interceptor = createCsrfInterceptor();
      const getCtx = createMockCtx();
      const res = new Response(null, {headers: {'x-csrf-token': 'will-clear'}});
      interceptor.response(getCtx, res);
      interceptor.clearToken();

      const ctx = createMockCtx({method: 'POST'});
      interceptor.request(ctx);

      assert.equal(ctx.headers.has('x-csrf-token'), false);
    });
  });

  describe('instance isolation', () => {
    it('tokens are not shared between instances', () => {
      const interceptor1 = createCsrfInterceptor();
      const interceptor2 = createCsrfInterceptor();

      const ctx = createMockCtx();
      const res = new Response(null, {headers: {'x-csrf-token': 'instance-1-only'}});
      interceptor1.response(ctx, res);

      assert.equal(interceptor1.getToken(), 'instance-1-only');
      assert.equal(interceptor2.getToken(), undefined);
    });
  });
});
