/**
 * @fileoverview Boundary tests for the conditional request interceptor.
 * @module @centralping/ergo-fetch/lib/conditional.spec
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';

import {createConditionalInterceptor} from './conditional.js';
import {createMemoryStore} from '../stores/memory.js';

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
 * Creates a mock Response with a JSON body and configurable headers/status.
 *
 * @param {*} body - Response body (will be JSON.stringify'd if object).
 * @param {object} [init] - Response init options.
 * @returns {Response} - Mock response.
 */
function createJsonResponse(body, init = {}) {
  const headers = {'content-type': 'application/json', ...init.headers};
  return new Response(JSON.stringify(body), {...init, headers});
}

describe('createConditionalInterceptor', () => {
  describe('factory validation', () => {
    it('returns a frozen null-prototype object', () => {
      const interceptor = createConditionalInterceptor();

      assert.equal(Object.getPrototypeOf(interceptor), null);
      assert.equal(Object.isFrozen(interceptor), true);
    });

    it('returns an object with request, response, and getStore', () => {
      const interceptor = createConditionalInterceptor();

      assert.equal(typeof interceptor.request, 'function');
      assert.equal(typeof interceptor.response, 'function');
      assert.equal(typeof interceptor.getStore, 'function');
    });

    it('creates a default memory store when none is provided', () => {
      const interceptor = createConditionalInterceptor();
      const store = interceptor.getStore();

      assert.equal(typeof store.get, 'function');
      assert.equal(typeof store.set, 'function');
      assert.equal(typeof store.delete, 'function');
      assert.equal(typeof store.clear, 'function');
    });

    it('accepts a custom store', () => {
      const store = createMemoryStore({maxEntries: 10});
      const interceptor = createConditionalInterceptor({store});

      assert.equal(interceptor.getStore(), store);
    });

    it('throws TypeError for non-array methods.read', () => {
      assert.throws(() => createConditionalInterceptor({methods: {read: 'GET'}}), {
        name: 'TypeError',
        message: 'methods.read must be an array of strings'
      });
    });

    it('throws TypeError for methods.read containing non-strings', () => {
      assert.throws(() => createConditionalInterceptor({methods: {read: ['GET', 123]}}), {
        name: 'TypeError',
        message: 'methods.read must contain only non-empty strings'
      });
    });

    it('throws TypeError for methods.read containing empty strings', () => {
      assert.throws(() => createConditionalInterceptor({methods: {read: ['GET', '']}}), {
        name: 'TypeError',
        message: 'methods.read must contain only non-empty strings'
      });
    });

    it('throws TypeError for non-array methods.write', () => {
      assert.throws(() => createConditionalInterceptor({methods: {write: 'PUT'}}), {
        name: 'TypeError',
        message: 'methods.write must be an array of strings'
      });
    });

    it('throws TypeError for methods.write containing non-strings', () => {
      assert.throws(() => createConditionalInterceptor({methods: {write: [42]}}), {
        name: 'TypeError',
        message: 'methods.write must contain only non-empty strings'
      });
    });

    it('throws TypeError for non-object store', () => {
      assert.throws(() => createConditionalInterceptor({store: 'bad'}), {
        name: 'TypeError',
        message: 'store must be a CacheStore object'
      });
    });

    it('uses default store when store is null', () => {
      const interceptor = createConditionalInterceptor({store: null});
      const store = interceptor.getStore();

      assert.equal(typeof store.get, 'function');
    });

    it('throws TypeError for store missing get', () => {
      assert.throws(
        () =>
          createConditionalInterceptor({
            store: {set() {}, delete() {}, clear() {}}
          }),
        {name: 'TypeError', message: 'store.get must be a function'}
      );
    });

    it('throws TypeError for store missing set', () => {
      assert.throws(
        () =>
          createConditionalInterceptor({
            store: {get() {}, delete() {}, clear() {}}
          }),
        {name: 'TypeError', message: 'store.set must be a function'}
      );
    });

    it('throws TypeError for store missing delete', () => {
      assert.throws(
        () =>
          createConditionalInterceptor({
            store: {get() {}, set() {}, clear() {}}
          }),
        {name: 'TypeError', message: 'store.delete must be a function'}
      );
    });

    it('throws TypeError for store missing clear', () => {
      assert.throws(
        () =>
          createConditionalInterceptor({
            store: {get() {}, set() {}, delete() {}}
          }),
        {name: 'TypeError', message: 'store.clear must be a function'}
      );
    });

    it('accepts custom read and write methods', () => {
      const interceptor = createConditionalInterceptor({
        methods: {read: ['GET'], write: ['PUT']}
      });

      assert.equal(typeof interceptor.request, 'function');
    });
  });

  describe('request', () => {
    let interceptor;
    let store;

    beforeEach(() => {
      store = createMemoryStore();
      interceptor = createConditionalInterceptor({store});
    });

    it('does nothing when cache is empty', async () => {
      const ctx = createMockCtx();
      await interceptor.request(ctx);

      assert.equal(ctx.headers.has('if-none-match'), false);
      assert.equal(ctx.headers.has('if-modified-since'), false);
      assert.equal(ctx.headers.has('if-match'), false);
    });

    it('sets If-None-Match for cached GET with ETag', async () => {
      await store.set('https://api.example.com/resource', {etag: '"abc123"'});
      const ctx = createMockCtx();

      await interceptor.request(ctx);

      assert.equal(ctx.headers.get('if-none-match'), '"abc123"');
    });

    it('sets If-Modified-Since for cached GET with Last-Modified', async () => {
      const lastModified = 'Wed, 01 Jan 2025 00:00:00 GMT';
      await store.set('https://api.example.com/resource', {lastModified});
      const ctx = createMockCtx();

      await interceptor.request(ctx);

      assert.equal(ctx.headers.get('if-modified-since'), lastModified);
    });

    it('sets both headers when both validators are cached', async () => {
      const lastModified = 'Wed, 01 Jan 2025 00:00:00 GMT';
      await store.set('https://api.example.com/resource', {
        etag: '"v2"',
        lastModified
      });
      const ctx = createMockCtx();

      await interceptor.request(ctx);

      assert.equal(ctx.headers.get('if-none-match'), '"v2"');
      assert.equal(ctx.headers.get('if-modified-since'), lastModified);
    });

    it('sets If-None-Match with weak ETag for GET', async () => {
      await store.set('https://api.example.com/resource', {etag: 'W/"weak"'});
      const ctx = createMockCtx();

      await interceptor.request(ctx);

      assert.equal(ctx.headers.get('if-none-match'), 'W/"weak"');
    });

    it('sets If-None-Match for HEAD requests', async () => {
      await store.set('https://api.example.com/resource', {etag: '"head-tag"'});
      const ctx = createMockCtx({method: 'HEAD'});

      await interceptor.request(ctx);

      assert.equal(ctx.headers.get('if-none-match'), '"head-tag"');
    });

    it('sets If-Match for PUT with strong ETag', async () => {
      await store.set('https://api.example.com/resource', {etag: '"strong"'});
      const ctx = createMockCtx({method: 'PUT'});

      await interceptor.request(ctx);

      assert.equal(ctx.headers.get('if-match'), '"strong"');
    });

    it('sets If-Match for PATCH with strong ETag', async () => {
      await store.set('https://api.example.com/resource', {etag: '"strong"'});
      const ctx = createMockCtx({method: 'PATCH'});

      await interceptor.request(ctx);

      assert.equal(ctx.headers.get('if-match'), '"strong"');
    });

    it('sets If-Match for DELETE with strong ETag', async () => {
      await store.set('https://api.example.com/resource', {etag: '"strong"'});
      const ctx = createMockCtx({method: 'DELETE'});

      await interceptor.request(ctx);

      assert.equal(ctx.headers.get('if-match'), '"strong"');
    });

    it('does not set If-Match for weak ETag on write', async () => {
      await store.set('https://api.example.com/resource', {etag: 'W/"weak"'});
      const ctx = createMockCtx({method: 'PUT'});

      await interceptor.request(ctx);

      assert.equal(ctx.headers.has('if-match'), false);
    });

    it('does not set headers for non-read non-write methods', async () => {
      await store.set('https://api.example.com/resource', {etag: '"abc"'});
      const ctx = createMockCtx({method: 'POST'});

      await interceptor.request(ctx);

      assert.equal(ctx.headers.has('if-none-match'), false);
      assert.equal(ctx.headers.has('if-match'), false);
    });

    it('respects custom read methods', async () => {
      const custom = createConditionalInterceptor({
        store,
        methods: {read: ['PROPFIND']}
      });
      await store.set('https://api.example.com/resource', {etag: '"tag"'});

      const getCtx = createMockCtx({method: 'GET'});
      await custom.request(getCtx);
      assert.equal(getCtx.headers.has('if-none-match'), false);

      const propCtx = createMockCtx({method: 'PROPFIND'});
      await custom.request(propCtx);
      assert.equal(propCtx.headers.get('if-none-match'), '"tag"');
    });

    it('respects custom write methods', async () => {
      const custom = createConditionalInterceptor({
        store,
        methods: {write: ['POST']}
      });
      await store.set('https://api.example.com/resource', {etag: '"tag"'});

      const putCtx = createMockCtx({method: 'PUT'});
      await custom.request(putCtx);
      assert.equal(putCtx.headers.has('if-match'), false);

      const postCtx = createMockCtx({method: 'POST'});
      await custom.request(postCtx);
      assert.equal(postCtx.headers.get('if-match'), '"tag"');
    });
  });

  describe('response — caching', () => {
    let interceptor;
    let store;

    beforeEach(() => {
      store = createMemoryStore();
      interceptor = createConditionalInterceptor({store});
    });

    it('caches ETag from successful GET response', async () => {
      const ctx = createMockCtx();
      const res = createJsonResponse({id: 1}, {headers: {etag: '"v1"'}});

      await interceptor.response(ctx, res);

      const entry = await store.get(ctx.url);
      assert.equal(entry.etag, '"v1"');
    });

    it('caches Last-Modified from successful GET response', async () => {
      const lastModified = 'Thu, 01 Jan 2025 00:00:00 GMT';
      const ctx = createMockCtx();
      const res = createJsonResponse(
        {id: 1},
        {
          headers: {'last-modified': lastModified}
        }
      );

      await interceptor.response(ctx, res);

      const entry = await store.get(ctx.url);
      assert.equal(entry.lastModified, lastModified);
    });

    it('caches JSON body from successful GET response', async () => {
      const body = {id: 1, name: 'test'};
      const ctx = createMockCtx();
      const res = createJsonResponse(body, {headers: {etag: '"v1"'}});

      await interceptor.response(ctx, res);

      const entry = await store.get(ctx.url);
      assert.deepStrictEqual(entry.body, body);
    });

    it('caches text body from non-JSON GET response', async () => {
      const ctx = createMockCtx();
      const res = new Response('plain text', {
        headers: {'content-type': 'text/plain', etag: '"v1"'}
      });

      await interceptor.response(ctx, res);

      const entry = await store.get(ctx.url);
      assert.equal(entry.body, 'plain text');
    });

    it('does not cache when no validators are present', async () => {
      const ctx = createMockCtx();
      const res = createJsonResponse({id: 1});

      await interceptor.response(ctx, res);

      const entry = await store.get(ctx.url);
      assert.equal(entry, undefined);
    });

    it('does not cache for non-ok responses', async () => {
      const ctx = createMockCtx();
      const res = new Response('error', {
        status: 500,
        headers: {etag: '"err"'}
      });

      await interceptor.response(ctx, res);

      const entry = await store.get(ctx.url);
      assert.equal(entry, undefined);
    });

    it('does not cache for non-read methods', async () => {
      const ctx = createMockCtx({method: 'POST'});
      const res = createJsonResponse({id: 1}, {headers: {etag: '"v1"'}});

      await interceptor.response(ctx, res);

      const entry = await store.get(ctx.url);
      assert.equal(entry, undefined);
    });

    it('HEAD response stores validators without body', async () => {
      const ctx = createMockCtx({method: 'HEAD'});
      const res = new Response(null, {
        headers: {etag: '"head-tag"', 'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT'}
      });

      await interceptor.response(ctx, res);

      const entry = await store.get(ctx.url);
      assert.equal(entry.etag, '"head-tag"');
      assert.equal(entry.lastModified, 'Wed, 01 Jan 2025 00:00:00 GMT');
      assert.equal(entry.body, undefined);
    });

    it('HEAD response preserves existing cached body', async () => {
      const getCtx = createMockCtx();
      const getRes = createJsonResponse({id: 1}, {headers: {etag: '"v1"'}});
      await interceptor.response(getCtx, getRes);

      const headCtx = createMockCtx({method: 'HEAD'});
      const headRes = new Response(null, {headers: {etag: '"v2"'}});
      await interceptor.response(headCtx, headRes);

      const entry = await store.get(getCtx.url);
      assert.equal(entry.etag, '"v2"');
      assert.deepStrictEqual(entry.body, {id: 1});
    });

    it('overwrites cache on subsequent successful GETs', async () => {
      const ctx1 = createMockCtx();
      const res1 = createJsonResponse({v: 1}, {headers: {etag: '"v1"'}});
      await interceptor.response(ctx1, res1);

      const ctx2 = createMockCtx();
      const res2 = createJsonResponse({v: 2}, {headers: {etag: '"v2"'}});
      await interceptor.response(ctx2, res2);

      const entry = await store.get(ctx1.url);
      assert.equal(entry.etag, '"v2"');
      assert.deepStrictEqual(entry.body, {v: 2});
    });

    it('caches weak ETags for read validation', async () => {
      const ctx = createMockCtx();
      const res = createJsonResponse({id: 1}, {headers: {etag: 'W/"weak"'}});

      await interceptor.response(ctx, res);

      const entry = await store.get(ctx.url);
      assert.equal(entry.etag, 'W/"weak"');
    });

    it('stores etag as undefined when header is absent', async () => {
      const ctx = createMockCtx();
      const res = new Response('text', {
        headers: {'content-type': 'text/plain', 'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT'}
      });

      await interceptor.response(ctx, res);

      const entry = await store.get(ctx.url);
      assert.equal(entry.etag, undefined);
      assert.equal(entry.lastModified, 'Wed, 01 Jan 2025 00:00:00 GMT');
    });
  });

  describe('response — 304 handling', () => {
    let interceptor;
    let store;

    beforeEach(() => {
      store = createMemoryStore();
      interceptor = createConditionalInterceptor({store});
    });

    it('returns cached body on 304 for GET', async () => {
      await store.set('https://api.example.com/resource', {
        etag: '"v1"',
        body: {id: 1, name: 'cached'}
      });

      const ctx = createMockCtx();
      const res = new Response(null, {status: 304});

      const result = await interceptor.response(ctx, res);

      assert.deepStrictEqual(result, {body: {id: 1, name: 'cached'}});
    });

    it('returns cached body on 304 for HEAD', async () => {
      await store.set('https://api.example.com/resource', {
        etag: '"v1"',
        body: {id: 1}
      });

      const ctx = createMockCtx({method: 'HEAD'});
      const res = new Response(null, {status: 304});

      const result = await interceptor.response(ctx, res);

      assert.deepStrictEqual(result, {body: {id: 1}});
    });

    it('returns undefined on 304 when no cached body exists', async () => {
      await store.set('https://api.example.com/resource', {etag: '"v1"'});

      const ctx = createMockCtx();
      const res = new Response(null, {status: 304});

      const result = await interceptor.response(ctx, res);

      assert.equal(result, undefined);
    });

    it('returns undefined on 304 when no cache entry exists', async () => {
      const ctx = createMockCtx();
      const res = new Response(null, {status: 304});

      const result = await interceptor.response(ctx, res);

      assert.equal(result, undefined);
    });

    it('does not return body on 304 for non-read methods', async () => {
      await store.set('https://api.example.com/resource', {
        etag: '"v1"',
        body: {id: 1}
      });

      const ctx = createMockCtx({method: 'POST'});
      const res = new Response(null, {status: 304});

      const result = await interceptor.response(ctx, res);

      assert.equal(result, undefined);
    });
  });

  describe('response — write invalidation', () => {
    let interceptor;
    let store;

    beforeEach(async () => {
      store = createMemoryStore();
      interceptor = createConditionalInterceptor({store});
      await store.set('https://api.example.com/resource', {
        etag: '"v1"',
        body: {id: 1}
      });
    });

    it('deletes cache entry on successful PUT', async () => {
      const ctx = createMockCtx({method: 'PUT'});
      const res = new Response(null, {status: 200});

      await interceptor.response(ctx, res);

      assert.equal(await store.get(ctx.url), undefined);
    });

    it('deletes cache entry on successful PATCH', async () => {
      const ctx = createMockCtx({method: 'PATCH'});
      const res = new Response(null, {status: 200});

      await interceptor.response(ctx, res);

      assert.equal(await store.get(ctx.url), undefined);
    });

    it('deletes cache entry on successful DELETE', async () => {
      const ctx = createMockCtx({method: 'DELETE'});
      const res = new Response(null, {status: 200});

      await interceptor.response(ctx, res);

      assert.equal(await store.get(ctx.url), undefined);
    });

    it('deletes cache entry on 204 No Content', async () => {
      const ctx = createMockCtx({method: 'PUT'});
      const res = new Response(null, {status: 204});

      await interceptor.response(ctx, res);

      assert.equal(await store.get(ctx.url), undefined);
    });

    it('preserves cache entry on failed write (412)', async () => {
      const ctx = createMockCtx({method: 'PUT'});
      const res = new Response(null, {status: 412});

      await interceptor.response(ctx, res);

      const entry = await store.get(ctx.url);
      assert.notEqual(entry, undefined);
      assert.equal(entry.etag, '"v1"');
    });

    it('preserves cache entry on failed write (409)', async () => {
      const ctx = createMockCtx({method: 'PUT'});
      const res = new Response(null, {status: 409});

      await interceptor.response(ctx, res);

      const entry = await store.get(ctx.url);
      assert.notEqual(entry, undefined);
    });
  });

  describe('end-to-end flow', () => {
    it('caches on GET, attaches headers on subsequent GET, returns body on 304', async () => {
      const store = createMemoryStore();
      const interceptor = createConditionalInterceptor({store});

      const ctx1 = createMockCtx();
      const res1 = createJsonResponse(
        {id: 1},
        {
          headers: {etag: '"v1"', 'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT'}
        }
      );
      await interceptor.response(ctx1, res1);

      const ctx2 = createMockCtx();
      await interceptor.request(ctx2);
      assert.equal(ctx2.headers.get('if-none-match'), '"v1"');
      assert.equal(ctx2.headers.get('if-modified-since'), 'Wed, 01 Jan 2025 00:00:00 GMT');

      const res2 = new Response(null, {status: 304});
      const result = await interceptor.response(ctx2, res2);
      assert.deepStrictEqual(result, {body: {id: 1}});
    });

    it('caches on GET, attaches If-Match on PUT, invalidates on success', async () => {
      const store = createMemoryStore();
      const interceptor = createConditionalInterceptor({store});

      const getCtx = createMockCtx();
      const getRes = createJsonResponse({id: 1}, {headers: {etag: '"v1"'}});
      await interceptor.response(getCtx, getRes);

      const putCtx = createMockCtx({method: 'PUT'});
      await interceptor.request(putCtx);
      assert.equal(putCtx.headers.get('if-match'), '"v1"');

      const putRes = new Response(null, {status: 200});
      await interceptor.response(putCtx, putRes);

      assert.equal(await store.get(getCtx.url), undefined);
    });
  });

  describe('instance isolation', () => {
    it('different instances do not share cache', async () => {
      const interceptor1 = createConditionalInterceptor();
      const interceptor2 = createConditionalInterceptor();

      const ctx = createMockCtx();
      const res = createJsonResponse({id: 1}, {headers: {etag: '"v1"'}});
      await interceptor1.response(ctx, res);

      const ctx2 = createMockCtx();
      await interceptor2.request(ctx2);
      assert.equal(ctx2.headers.has('if-none-match'), false);
    });
  });
});
