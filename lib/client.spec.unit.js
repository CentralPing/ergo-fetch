/**
 * @fileoverview Boundary tests for the core client pipeline.
 * @module @centralping/ergo-fetch/lib/client.spec
 */

import {describe, it, mock, afterEach} from 'node:test';
import assert from 'node:assert/strict';

import {createClient} from './client.js';
import {ProblemDetailsError} from './problem-details.js';
import {createQueryBuilder} from './query-builder.js';

/**
 * Creates a mock fetch implementation that returns a configurable Response.
 *
 * @param {object} [responseOptions] - Response options.
 * @param {number} [responseOptions.status] - HTTP status code (default: 200).
 * @param {object} [responseOptions.headers] - Response headers.
 * @param {string | null} [responseOptions.body] - Response body string (default: '{}').
 * @returns {Function} - The mock function reference (for assertions).
 */
function mockFetch(responseOptions = {}) {
  const {status = 200, headers = {}, body = '{}'} = responseOptions;
  const defaultHeaders = {'content-type': 'application/json', ...headers};

  return mock.method(globalThis, 'fetch', async function mockedFetch() {
    return new Response(body, {status, headers: defaultHeaders});
  });
}

/**
 * Creates a mock fetch that returns different responses on successive calls.
 *
 * @param {Array<object>} responses - Array of response options (same shape as mockFetch).
 * @returns {Function} - The mock function reference.
 */
function mockFetchSequence(responses) {
  let callIndex = 0;

  return mock.method(globalThis, 'fetch', async function mockedFetch() {
    const opts = responses[Math.min(callIndex++, responses.length - 1)];
    const {status = 200, headers = {}, body = '{}'} = opts;
    const defaultHeaders = {'content-type': 'application/json', ...headers};
    return new Response(body, {status, headers: defaultHeaders});
  });
}

afterEach(() => {
  mock.restoreAll();
});

describe('createClient', () => {
  describe('config validation', () => {
    it('throws TypeError when config is null', () => {
      assert.throws(() => createClient(null), {
        name: 'TypeError',
        message: 'config must be a non-null object'
      });
    });

    it('throws TypeError when config is undefined', () => {
      assert.throws(() => createClient(undefined), {
        name: 'TypeError',
        message: 'config must be a non-null object'
      });
    });

    it('throws TypeError when config is a string', () => {
      assert.throws(() => createClient('https://api.example.com'), {
        name: 'TypeError',
        message: 'config must be a non-null object'
      });
    });

    it('throws TypeError when config is an array', () => {
      assert.throws(() => createClient([]), {
        name: 'TypeError',
        message: 'config must be a non-null object'
      });
    });

    it('throws TypeError when baseUrl is missing', () => {
      assert.throws(() => createClient({}), {
        name: 'TypeError',
        message: 'config.baseUrl must be a non-empty string'
      });
    });

    it('throws TypeError when baseUrl is empty string', () => {
      assert.throws(() => createClient({baseUrl: ''}), {
        name: 'TypeError',
        message: 'config.baseUrl must be a non-empty string'
      });
    });

    it('throws TypeError when baseUrl is not a string', () => {
      assert.throws(() => createClient({baseUrl: 123}), {
        name: 'TypeError',
        message: 'config.baseUrl must be a non-empty string'
      });
    });

    it('throws TypeError when baseUrl is an invalid URL', () => {
      assert.throws(() => createClient({baseUrl: 'not-a-url'}), {
        name: 'TypeError'
      });
    });

    it('throws TypeError when timeout is zero', () => {
      assert.throws(() => createClient({baseUrl: 'https://api.example.com', timeout: 0}), {
        name: 'TypeError',
        message: 'config.timeout must be a positive finite number'
      });
    });

    it('throws TypeError when timeout is negative', () => {
      assert.throws(() => createClient({baseUrl: 'https://api.example.com', timeout: -1}), {
        name: 'TypeError',
        message: 'config.timeout must be a positive finite number'
      });
    });

    it('throws TypeError when timeout is Infinity', () => {
      assert.throws(() => createClient({baseUrl: 'https://api.example.com', timeout: Infinity}), {
        name: 'TypeError',
        message: 'config.timeout must be a positive finite number'
      });
    });

    it('throws TypeError when timeout is NaN', () => {
      assert.throws(() => createClient({baseUrl: 'https://api.example.com', timeout: NaN}), {
        name: 'TypeError',
        message: 'config.timeout must be a positive finite number'
      });
    });

    it('throws TypeError when timeout is a string', () => {
      assert.throws(() => createClient({baseUrl: 'https://api.example.com', timeout: '5000'}), {
        name: 'TypeError',
        message: 'config.timeout must be a positive finite number'
      });
    });

    it('accepts valid config without throwing', () => {
      assert.doesNotThrow(() => createClient({baseUrl: 'https://api.example.com', timeout: 5000}));
    });
  });

  describe('client instance shape', () => {
    it('returns a frozen null-prototype object', () => {
      const client = createClient({baseUrl: 'https://api.example.com'});

      assert.equal(Object.getPrototypeOf(client), null);
      assert.equal(Object.isFrozen(client), true);
    });

    it('has all HTTP method helpers and request', () => {
      const client = createClient({baseUrl: 'https://api.example.com'});

      assert.equal(typeof client.get, 'function');
      assert.equal(typeof client.post, 'function');
      assert.equal(typeof client.put, 'function');
      assert.equal(typeof client.patch, 'function');
      assert.equal(typeof client.delete, 'function');
      assert.equal(typeof client.head, 'function');
      assert.equal(typeof client.request, 'function');
    });

    it('method helpers have named function expressions', () => {
      const client = createClient({baseUrl: 'https://api.example.com'});

      assert.equal(client.get.name, 'get');
      assert.equal(client.post.name, 'post');
      assert.equal(client.put.name, 'put');
      assert.equal(client.patch.name, 'patch');
      assert.equal(client.delete.name, 'del');
      assert.equal(client.head.name, 'head');
    });
  });

  describe('request validation', () => {
    it('throws TypeError when path is not a string', async () => {
      const client = createClient({baseUrl: 'https://api.example.com'});

      await assert.rejects(client.get(123), {
        name: 'TypeError',
        message: 'path must be a string'
      });
    });

    it('throws TypeError when path does not start with /', async () => {
      const client = createClient({baseUrl: 'https://api.example.com'});

      await assert.rejects(client.get('resource'), {
        name: 'TypeError',
        message: 'path must start with /'
      });
    });

    it('throws TypeError for body on GET', async () => {
      const client = createClient({baseUrl: 'https://api.example.com'});

      await assert.rejects(client.get('/test', {body: {a: 1}}), {
        name: 'TypeError',
        message: 'Request body is not allowed for GET requests'
      });
    });

    it('throws TypeError for body on HEAD', async () => {
      const client = createClient({baseUrl: 'https://api.example.com'});

      await assert.rejects(client.head('/test', {body: {a: 1}}), {
        name: 'TypeError',
        message: 'Request body is not allowed for HEAD requests'
      });
    });

    it('allows body on POST', async () => {
      mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await assert.doesNotReject(client.post('/test', {body: {a: 1}}));
    });

    it('allows body on PUT', async () => {
      mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await assert.doesNotReject(client.put('/test', {body: {a: 1}}));
    });

    it('allows body on PATCH', async () => {
      mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await assert.doesNotReject(client.patch('/test', {body: {a: 1}}));
    });

    it('allows body on DELETE', async () => {
      mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await assert.doesNotReject(client.delete('/test', {body: {a: 1}}));
    });

    it('throws TypeError when signal is not an AbortSignal', async () => {
      const client = createClient({baseUrl: 'https://api.example.com'});

      await assert.rejects(client.get('/test', {signal: false}), {
        name: 'TypeError',
        message: 'options.signal must be an AbortSignal'
      });
    });

    it('throws TypeError when signal is a plain object', async () => {
      const client = createClient({baseUrl: 'https://api.example.com'});

      await assert.rejects(client.get('/test', {signal: {}}), {
        name: 'TypeError',
        message: 'options.signal must be an AbortSignal'
      });
    });
  });

  describe('URL building', () => {
    it('resolves path against baseUrl', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.get('/users');

      const [calledUrl] = fetchRef.mock.calls[0].arguments;
      assert.equal(calledUrl, 'https://api.example.com/users');
    });

    it('normalizes baseUrl trailing slash', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com/'});

      await client.get('/users');

      const [calledUrl] = fetchRef.mock.calls[0].arguments;
      assert.equal(calledUrl, 'https://api.example.com/users');
    });

    it('substitutes path parameters', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.get('/users/:id', {params: {id: 42}});

      const [calledUrl] = fetchRef.mock.calls[0].arguments;
      assert.equal(calledUrl, 'https://api.example.com/users/42');
    });

    it('URI-encodes path parameter values', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.get('/search/:term', {params: {term: 'hello world'}});

      const [calledUrl] = fetchRef.mock.calls[0].arguments;
      assert.equal(calledUrl, 'https://api.example.com/search/hello%20world');
    });

    it('substitutes multiple path parameters', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.get('/users/:userId/posts/:postId', {
        params: {userId: 1, postId: 99}
      });

      const [calledUrl] = fetchRef.mock.calls[0].arguments;
      assert.equal(calledUrl, 'https://api.example.com/users/1/posts/99');
    });

    it('appends query parameters', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.get('/users', {query: {page: 2, limit: 10}});

      const [calledUrl] = fetchRef.mock.calls[0].arguments;
      const url = new URL(calledUrl);
      assert.equal(url.searchParams.get('page'), '2');
      assert.equal(url.searchParams.get('limit'), '10');
    });

    it('handles array query parameters', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.get('/users', {query: {tag: ['a', 'b']}});

      const [calledUrl] = fetchRef.mock.calls[0].arguments;
      const url = new URL(calledUrl);
      assert.deepEqual(url.searchParams.getAll('tag'), ['a', 'b']);
    });

    it('skips null and undefined query values', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.get('/users', {query: {a: 1, b: null, c: undefined}});

      const [calledUrl] = fetchRef.mock.calls[0].arguments;
      const url = new URL(calledUrl);
      assert.equal(url.searchParams.get('a'), '1');
      assert.equal(url.searchParams.has('b'), false);
      assert.equal(url.searchParams.has('c'), false);
    });

    it('combines path params and query params', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.get('/users/:id/posts', {
        params: {id: 42},
        query: {sort: 'date'}
      });

      const [calledUrl] = fetchRef.mock.calls[0].arguments;
      const url = new URL(calledUrl);
      assert.equal(url.pathname, '/users/42/posts');
      assert.equal(url.searchParams.get('sort'), 'date');
    });
  });

  describe('body serialization', () => {
    it('JSON-serializes plain objects and sets content-type', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.post('/data', {body: {name: 'test'}});

      const [, init] = fetchRef.mock.calls[0].arguments;
      assert.equal(init.body, '{"name":"test"}');
      assert.equal(init.headers.get('content-type'), 'application/json');
    });

    it('JSON-serializes arrays', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.post('/data', {body: [1, 2, 3]});

      const [, init] = fetchRef.mock.calls[0].arguments;
      assert.equal(init.body, '[1,2,3]');
    });

    it('passes string body through unchanged', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.post('/data', {body: 'raw text'});

      const [, init] = fetchRef.mock.calls[0].arguments;
      assert.equal(init.body, 'raw text');
      assert.notEqual(init.headers.get('content-type'), 'application/json');
    });

    it('passes URLSearchParams through unchanged', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});
      const params = new URLSearchParams({a: '1'});

      await client.post('/data', {body: params});

      const [, init] = fetchRef.mock.calls[0].arguments;
      assert.ok(init.body instanceof URLSearchParams);
    });

    it('passes Blob through unchanged', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});
      const blob = new Blob(['data'], {type: 'text/plain'});

      await client.post('/data', {body: blob});

      const [, init] = fetchRef.mock.calls[0].arguments;
      assert.ok(init.body instanceof Blob);
    });

    it('passes ArrayBuffer through unchanged', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});
      const buffer = new ArrayBuffer(8);

      await client.post('/data', {body: buffer});

      const [, init] = fetchRef.mock.calls[0].arguments;
      assert.ok(init.body instanceof ArrayBuffer);
    });

    it('passes TypedArray through unchanged', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});
      const arr = new Uint8Array([1, 2, 3]);

      await client.post('/data', {body: arr});

      const [, init] = fetchRef.mock.calls[0].arguments;
      assert.ok(ArrayBuffer.isView(init.body));
    });

    it('sends undefined body when none provided', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.get('/data');

      const [, init] = fetchRef.mock.calls[0].arguments;
      assert.equal(init.body, undefined);
    });

    it('does not override user-provided content-type for JSON body', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.post('/data', {
        body: {name: 'test'},
        headers: {'content-type': 'application/vnd.api+json'}
      });

      const [, init] = fetchRef.mock.calls[0].arguments;
      assert.equal(init.headers.get('content-type'), 'application/vnd.api+json');
    });
  });

  describe('headers', () => {
    it('includes default headers on every request', async () => {
      const fetchRef = mockFetch();
      const client = createClient({
        baseUrl: 'https://api.example.com',
        headers: {accept: 'application/json'}
      });

      await client.get('/test');

      const [, init] = fetchRef.mock.calls[0].arguments;
      assert.equal(init.headers.get('accept'), 'application/json');
    });

    it('per-request headers override defaults', async () => {
      const fetchRef = mockFetch();
      const client = createClient({
        baseUrl: 'https://api.example.com',
        headers: {accept: 'text/html'}
      });

      await client.get('/test', {headers: {accept: 'application/json'}});

      const [, init] = fetchRef.mock.calls[0].arguments;
      assert.equal(init.headers.get('accept'), 'application/json');
    });

    it('per-request headers merge with defaults', async () => {
      const fetchRef = mockFetch();
      const client = createClient({
        baseUrl: 'https://api.example.com',
        headers: {'x-custom': 'default'}
      });

      await client.get('/test', {headers: {'x-other': 'request'}});

      const [, init] = fetchRef.mock.calls[0].arguments;
      assert.equal(init.headers.get('x-custom'), 'default');
      assert.equal(init.headers.get('x-other'), 'request');
    });

    it('accepts Headers instance as per-request headers', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.get('/test', {headers: new Headers({accept: 'text/xml'})});

      const [, init] = fetchRef.mock.calls[0].arguments;
      assert.equal(init.headers.get('accept'), 'text/xml');
    });
  });

  describe('response parsing', () => {
    it('auto-parses JSON body for application/json', async () => {
      mockFetch({body: '{"name":"test"}', headers: {'content-type': 'application/json'}});
      const client = createClient({baseUrl: 'https://api.example.com'});

      const res = await client.get('/test');

      assert.deepEqual(res.body, {name: 'test'});
    });

    it('auto-parses JSON body for +json content types', async () => {
      mockFetch({
        body: '{"data":[1]}',
        headers: {'content-type': 'application/vnd.api+json'}
      });
      const client = createClient({baseUrl: 'https://api.example.com'});

      const res = await client.get('/test');

      assert.deepEqual(res.body, {data: [1]});
    });

    it('returns text for non-JSON content types', async () => {
      mockFetch({body: 'hello', headers: {'content-type': 'text/plain'}});
      const client = createClient({baseUrl: 'https://api.example.com'});

      const res = await client.get('/test');

      assert.equal(res.body, 'hello');
    });

    it('returns text when no content-type header', async () => {
      mock.method(globalThis, 'fetch', async () => {
        return new Response('data', {status: 200});
      });
      const client = createClient({baseUrl: 'https://api.example.com'});

      const res = await client.get('/test');

      assert.equal(res.body, 'data');
    });

    it('returns undefined body for 204 No Content', async () => {
      mockFetch({status: 204, body: null});
      const client = createClient({baseUrl: 'https://api.example.com'});

      const res = await client.get('/test');

      assert.equal(res.body, undefined);
      assert.equal(res.status, 204);
    });

    it('returns undefined body for HEAD requests', async () => {
      mockFetch({body: null});
      const client = createClient({baseUrl: 'https://api.example.com'});

      const res = await client.head('/test');

      assert.equal(res.body, undefined);
    });
  });

  describe('response shape', () => {
    it('returns a frozen null-prototype object', async () => {
      mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      const res = await client.get('/test');

      assert.equal(Object.getPrototypeOf(res), null);
      assert.equal(Object.isFrozen(res), true);
    });

    it('includes status', async () => {
      mockFetch({status: 201});
      const client = createClient({baseUrl: 'https://api.example.com'});

      const res = await client.get('/test');

      assert.equal(res.status, 201);
    });

    it('includes headers', async () => {
      mockFetch({headers: {'x-custom': 'value', 'content-type': 'application/json'}});
      const client = createClient({baseUrl: 'https://api.example.com'});

      const res = await client.get('/test');

      assert.ok(res.headers instanceof Headers);
      assert.equal(res.headers.get('x-custom'), 'value');
    });

    it('includes raw Response', async () => {
      mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      const res = await client.get('/test');

      assert.ok(res.raw instanceof Response);
    });

    it('includes rateLimit state when rate-limit interceptor is enabled', async () => {
      mockFetch({
        headers: {
          'content-type': 'application/json',
          'x-ratelimit-limit': '100',
          'x-ratelimit-remaining': '99'
        }
      });
      const client = createClient({baseUrl: 'https://api.example.com'});

      const res = await client.get('/test');

      assert.notEqual(res.rateLimit, undefined);
      assert.equal(res.rateLimit.limit, 100);
      assert.equal(res.rateLimit.remaining, 99);
    });

    it('rateLimit is undefined when rate-limit interceptor is disabled', async () => {
      mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com', rateLimit: false});

      const res = await client.get('/test');

      assert.equal(res.rateLimit, undefined);
    });
  });

  describe('error handling', () => {
    it('throws ProblemDetailsError for 400 status', async () => {
      mockFetch({status: 400, headers: {'content-type': 'text/plain'}});
      const client = createClient({baseUrl: 'https://api.example.com', retry: false});

      await assert.rejects(client.get('/test'), err => {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(err.status, 400);
        return true;
      });
    });

    it('throws ProblemDetailsError for 404 status', async () => {
      mockFetch({status: 404, headers: {'content-type': 'text/plain'}});
      const client = createClient({baseUrl: 'https://api.example.com', retry: false});

      await assert.rejects(client.get('/test'), err => {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(err.status, 404);
        return true;
      });
    });

    it('throws ProblemDetailsError for 500 status', async () => {
      mockFetch({status: 500, headers: {'content-type': 'text/plain'}});
      const client = createClient({baseUrl: 'https://api.example.com', retry: false});

      await assert.rejects(client.get('/test'), err => {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(err.status, 500);
        return true;
      });
    });

    it('parses problem+json response body', async () => {
      mockFetch({
        status: 422,
        body: JSON.stringify({
          type: 'https://example.com/validation',
          title: 'Validation Error',
          status: 422,
          detail: 'Name is required'
        }),
        headers: {'content-type': 'application/problem+json'}
      });
      const client = createClient({baseUrl: 'https://api.example.com', retry: false});

      await assert.rejects(client.get('/test'), err => {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(err.status, 422);
        assert.equal(err.title, 'Validation Error');
        assert.equal(err.detail, 'Name is required');
        assert.equal(err.type, 'https://example.com/validation');
        return true;
      });
    });

    it('retries network errors (TypeError) and recovers', async () => {
      let callCount = 0;
      mock.method(globalThis, 'fetch', async () => {
        callCount++;
        if (callCount === 1) throw new TypeError('fetch failed');
        return new Response('{"ok":true}', {
          status: 200,
          headers: {'content-type': 'application/json'}
        });
      });
      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: {maxAttempts: 3, baseDelay: 0, jitter: 'none'}
      });

      const res = await client.get('/test');

      assert.equal(callCount, 2);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, {ok: true});
    });

    it('propagates TypeError after retry budget exhaustion', async () => {
      const fetchRef = mock.method(globalThis, 'fetch', async () => {
        throw new TypeError('fetch failed');
      });
      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: {maxAttempts: 2, baseDelay: 0, jitter: 'none'}
      });

      await assert.rejects(client.get('/test'), {
        name: 'TypeError',
        message: 'fetch failed'
      });

      assert.equal(fetchRef.mock.calls.length, 2);
    });

    it('propagates TypeError immediately when retry disabled via options', async () => {
      const fetchRef = mock.method(globalThis, 'fetch', async () => {
        throw new TypeError('fetch failed');
      });
      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: {maxAttempts: 3, baseDelay: 0}
      });

      await assert.rejects(client.get('/test', {retry: false}), {
        name: 'TypeError',
        message: 'fetch failed'
      });

      assert.equal(fetchRef.mock.calls.length, 1);
    });

    it('propagates TypeError immediately when retry interceptor disabled at config', async () => {
      const fetchRef = mock.method(globalThis, 'fetch', async () => {
        throw new TypeError('fetch failed');
      });
      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: false
      });

      await assert.rejects(client.get('/test'), {
        name: 'TypeError',
        message: 'fetch failed'
      });

      assert.equal(fetchRef.mock.calls.length, 1);
    });

    it('does not retry AbortError (DOMException)', async () => {
      const fetchRef = mock.method(globalThis, 'fetch', async () => {
        throw new DOMException('The operation was aborted', 'AbortError');
      });
      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: {maxAttempts: 3, baseDelay: 0}
      });

      await assert.rejects(client.get('/test'), {
        name: 'AbortError'
      });

      assert.equal(fetchRef.mock.calls.length, 1);
    });

    it('does not retry TimeoutError (DOMException)', async () => {
      const fetchRef = mock.method(globalThis, 'fetch', async () => {
        throw new DOMException('The operation timed out', 'TimeoutError');
      });
      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: {maxAttempts: 3, baseDelay: 0}
      });

      await assert.rejects(client.get('/test'), {
        name: 'TimeoutError'
      });

      assert.equal(fetchRef.mock.calls.length, 1);
    });

    it('shares retry budget between network errors and HTTP status retries', async () => {
      let callCount = 0;
      mock.method(globalThis, 'fetch', async () => {
        callCount++;
        if (callCount === 1) throw new TypeError('fetch failed');
        if (callCount === 2) {
          return new Response(null, {
            status: 503,
            headers: {'content-type': 'text/plain'}
          });
        }
        return new Response('{"ok":true}', {
          status: 200,
          headers: {'content-type': 'application/json'}
        });
      });
      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: {maxAttempts: 3, baseDelay: 0, jitter: 'none'}
      });

      const res = await client.get('/test');

      assert.equal(callCount, 3);
      assert.equal(res.status, 200);
    });

    it('retries network errors for non-idempotent methods (POST)', async () => {
      let callCount = 0;
      mock.method(globalThis, 'fetch', async () => {
        callCount++;
        if (callCount === 1) throw new TypeError('fetch failed');
        return new Response('{"ok":true}', {
          status: 200,
          headers: {'content-type': 'application/json'}
        });
      });
      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: {maxAttempts: 3, baseDelay: 0, jitter: 'none'}
      });

      const res = await client.post('/test', {body: {data: 1}});

      assert.equal(callCount, 2);
      assert.equal(res.status, 200);
    });

    it('does not throw for 2xx status', async () => {
      mockFetch({status: 200});
      const client = createClient({baseUrl: 'https://api.example.com'});

      await assert.doesNotReject(client.get('/test'));
    });

    it('does not throw for 201 status', async () => {
      mockFetch({status: 201});
      const client = createClient({baseUrl: 'https://api.example.com'});

      await assert.doesNotReject(client.post('/test', {body: {}}));
    });

    it('does not throw for 204 status', async () => {
      mockFetch({status: 204, body: null});
      const client = createClient({baseUrl: 'https://api.example.com'});

      await assert.doesNotReject(client.delete('/test'));
    });
  });

  describe('timeout and abort', () => {
    it('passes an AbortSignal to fetch', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.get('/test');

      const [, init] = fetchRef.mock.calls[0].arguments;
      assert.ok(init.signal instanceof AbortSignal);
    });

    it('accepts a custom user signal', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});
      const controller = new AbortController();

      await client.get('/test', {signal: controller.signal});

      const [, init] = fetchRef.mock.calls[0].arguments;
      assert.ok(init.signal instanceof AbortSignal);
    });

    it('propagates abort errors from user signal', async () => {
      const controller = new AbortController();
      controller.abort(new Error('user cancelled'));

      mock.method(globalThis, 'fetch', async (url, init) => {
        init.signal.throwIfAborted();
        return new Response('{}', {status: 200, headers: {'content-type': 'application/json'}});
      });

      const client = createClient({baseUrl: 'https://api.example.com'});

      await assert.rejects(client.get('/test', {signal: controller.signal}));
    });

    it('creates a fresh AbortSignal per retry attempt', async () => {
      const signals = [];
      mock.method(globalThis, 'fetch', async (url, init) => {
        signals.push(init.signal);
        if (signals.length === 1) {
          return new Response('', {
            status: 503,
            headers: {'content-type': 'text/plain', 'retry-after': '0'}
          });
        }
        return new Response('{}', {status: 200, headers: {'content-type': 'application/json'}});
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: {maxAttempts: 2, baseDelay: 0, jitter: 'none'}
      });

      await client.get('/test');

      assert.equal(signals.length, 2);
      assert.notEqual(signals[0], signals[1], 'each attempt must get a distinct signal');
      assert.equal(signals[1].aborted, false, 'second signal must not be pre-aborted');
    });

    it('user abort during retry delay propagates immediately', async () => {
      const controller = new AbortController();

      mock.method(globalThis, 'fetch', async () => {
        return new Response('', {
          status: 503,
          headers: {'content-type': 'text/plain', 'retry-after': '60'}
        });
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: {maxAttempts: 2, baseDelay: 0, jitter: 'none'}
      });

      const start = Date.now();
      const promise = client.get('/test', {signal: controller.signal});

      setTimeout(() => controller.abort(new Error('user cancelled')), 50);

      await assert.rejects(promise, {message: 'user cancelled'});
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 5000, `abort should propagate quickly, took ${elapsed}ms`);
    });

    it('rejects immediately when user signal is already aborted before retry sleep', async () => {
      const controller = new AbortController();

      let callCount = 0;
      mock.method(globalThis, 'fetch', async () => {
        callCount++;
        if (callCount === 1) {
          controller.abort(new Error('user cancelled'));
          return new Response('', {
            status: 503,
            headers: {'content-type': 'text/plain', 'retry-after': '60'}
          });
        }
        return new Response('{}', {status: 200, headers: {'content-type': 'application/json'}});
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: {maxAttempts: 2, baseDelay: 0, jitter: 'none'}
      });

      await assert.rejects(client.get('/test', {signal: controller.signal}), {
        message: 'user cancelled'
      });
      assert.equal(callCount, 1, 'should not attempt a second fetch');
    });

    it('per-attempt timeout gives full window after retry delay', async () => {
      const signals = [];
      mock.method(globalThis, 'fetch', async (url, init) => {
        signals.push(init.signal);
        if (signals.length === 1) {
          return new Response('', {
            status: 503,
            headers: {'content-type': 'text/plain', 'retry-after': '1'}
          });
        }
        return new Response('{}', {status: 200, headers: {'content-type': 'application/json'}});
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        timeout: 500,
        retry: {maxAttempts: 2, baseDelay: 0, jitter: 'none'}
      });

      const res = await client.get('/test');

      assert.equal(res.status, 200);
      assert.equal(signals.length, 2);
      assert.equal(signals[1].aborted, false, 'second attempt signal should have full timeout');
    });
  });

  describe('interceptor pipeline', () => {
    it('sends method as uppercase', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.request('get', '/test');

      const [, init] = fetchRef.mock.calls[0].arguments;
      assert.equal(init.method, 'GET');
    });

    it('retries on retryable status (503)', async () => {
      const fetchRef = mockFetchSequence([
        {status: 503, headers: {'content-type': 'text/plain'}},
        {status: 200, body: '{"ok":true}'}
      ]);
      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: {maxAttempts: 2, baseDelay: 0, jitter: 'none'}
      });

      const res = await client.get('/test');

      assert.equal(fetchRef.mock.calls.length, 2);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, {ok: true});
    });

    it('retries on 429 with delay from Retry-After', async () => {
      const fetchRef = mockFetchSequence([
        {status: 429, headers: {'content-type': 'text/plain', 'retry-after': '0'}},
        {status: 200, body: '{"ok":true}'}
      ]);
      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: {maxAttempts: 2, baseDelay: 0, jitter: 'none'}
      });

      const res = await client.get('/test');

      assert.equal(fetchRef.mock.calls.length, 2);
      assert.equal(res.status, 200);
    });

    it('throws after retry budget is exhausted', async () => {
      mockFetch({status: 503, headers: {'content-type': 'text/plain'}});
      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: {maxAttempts: 2, baseDelay: 0, jitter: 'none'}
      });

      await assert.rejects(client.get('/test'), err => {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(err.status, 503);
        return true;
      });
    });

    it('does not retry non-retryable status (404)', async () => {
      const fetchRef = mockFetch({status: 404, headers: {'content-type': 'text/plain'}});
      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: {maxAttempts: 3, baseDelay: 0}
      });

      await assert.rejects(client.get('/test'));

      assert.equal(fetchRef.mock.calls.length, 1);
    });

    it('does not retry 500 for non-idempotent methods without idempotent flag', async () => {
      const fetchRef = mockFetch({status: 500, headers: {'content-type': 'text/plain'}});
      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: {maxAttempts: 3, baseDelay: 0, jitter: 'none'}
      });

      await assert.rejects(client.post('/test', {body: {}}));

      assert.equal(fetchRef.mock.calls.length, 1);
    });

    it('retries 500 for POST when idempotent flag is set', async () => {
      const fetchRef = mockFetchSequence([
        {status: 500, headers: {'content-type': 'text/plain'}},
        {status: 200, body: '{"ok":true}'}
      ]);
      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: {maxAttempts: 2, baseDelay: 0, jitter: 'none'}
      });

      const res = await client.post('/test', {body: {}, idempotent: true});

      assert.equal(fetchRef.mock.calls.length, 2);
      assert.equal(res.status, 200);
    });

    it('uses fresh headers on each retry attempt', async () => {
      const fetchRef = mockFetchSequence([
        {status: 503, headers: {'content-type': 'text/plain'}},
        {status: 200, body: '{}'}
      ]);
      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: {maxAttempts: 2, baseDelay: 0, jitter: 'none'},
        headers: {'x-default': 'value'}
      });

      await client.get('/test');

      const headers1 = fetchRef.mock.calls[0].arguments[1].headers;
      const headers2 = fetchRef.mock.calls[1].arguments[1].headers;
      assert.equal(headers1.get('x-default'), 'value');
      assert.equal(headers2.get('x-default'), 'value');
      assert.notEqual(headers1, headers2);
    });
  });

  describe('per-request overrides', () => {
    it('disables retry when options.retry is false', async () => {
      const fetchRef = mockFetch({status: 503, headers: {'content-type': 'text/plain'}});
      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: {maxAttempts: 3, baseDelay: 0}
      });

      await assert.rejects(client.get('/test', {retry: false}));

      assert.equal(fetchRef.mock.calls.length, 1);
    });

    it('disables conditional headers when options.conditional is false', async () => {
      const fetchRef = mockFetch({
        headers: {
          'content-type': 'application/json',
          etag: '"abc123"'
        }
      });
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.get('/test');
      await client.get('/test', {conditional: false});

      const headers2 = fetchRef.mock.calls[1].arguments[1].headers;
      assert.equal(headers2.has('if-none-match'), false);
    });

    it('sets idempotent flag on context for retry decisions', async () => {
      const fetchRef = mockFetchSequence([
        {status: 500, headers: {'content-type': 'text/plain'}},
        {status: 200, body: '{"ok":true}'}
      ]);
      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: {maxAttempts: 2, baseDelay: 0, jitter: 'none'}
      });

      await client.post('/test', {body: {}, idempotent: true});

      assert.equal(fetchRef.mock.calls.length, 2);
    });
  });

  describe('interceptor configuration', () => {
    it('disables request-id interceptor with requestId: false', async () => {
      mockFetch({
        headers: {'content-type': 'application/json', 'x-request-id': 'server-id'}
      });
      const client = createClient({
        baseUrl: 'https://api.example.com',
        requestId: false
      });

      const res = await client.get('/test');

      assert.equal(res.requestId, undefined);
    });

    it('generates request IDs with requestId: {generate: true}', async () => {
      const fetchRef = mockFetch();
      const client = createClient({
        baseUrl: 'https://api.example.com',
        requestId: {generate: true}
      });

      await client.get('/test');

      const headers = fetchRef.mock.calls[0].arguments[1].headers;
      const requestId = headers.get('x-request-id');
      assert.ok(requestId, 'should have generated a request ID');
      assert.match(requestId, /^[0-9a-f-]{36}$/);
    });

    it('disables CSRF interceptor with csrf: false', async () => {
      const fetchRef = mockFetch({
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': 'token123'
        }
      });
      const client = createClient({
        baseUrl: 'https://api.example.com',
        csrf: false
      });

      await client.get('/test');
      await client.post('/test', {body: {}});

      const postHeaders = fetchRef.mock.calls[1].arguments[1].headers;
      assert.equal(postHeaders.has('x-csrf-token'), false);
    });

    it('disables conditional interceptor with conditional: false', async () => {
      const fetchRef = mockFetch({
        headers: {
          'content-type': 'application/json',
          etag: '"abc"'
        }
      });
      const client = createClient({
        baseUrl: 'https://api.example.com',
        conditional: false
      });

      await client.get('/test');
      await client.get('/test');

      const headers2 = fetchRef.mock.calls[1].arguments[1].headers;
      assert.equal(headers2.has('if-none-match'), false);
    });

    it('disables retry interceptor with retry: false', async () => {
      const fetchRef = mockFetch({status: 503, headers: {'content-type': 'text/plain'}});
      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: false
      });

      await assert.rejects(client.get('/test'));

      assert.equal(fetchRef.mock.calls.length, 1);
    });

    it('enables prefer interceptor with a preferences object', async () => {
      const fetchRef = mockFetch();
      const client = createClient({
        baseUrl: 'https://api.example.com',
        prefer: {return: 'representation'}
      });

      await client.get('/test');

      const headers = fetchRef.mock.calls[0].arguments[1].headers;
      assert.equal(headers.get('prefer'), 'return=representation');
    });

    it('enables prefer interceptor with a string', async () => {
      const fetchRef = mockFetch();
      const client = createClient({
        baseUrl: 'https://api.example.com',
        prefer: 'return=minimal'
      });

      await client.get('/test');

      const headers = fetchRef.mock.calls[0].arguments[1].headers;
      assert.equal(headers.get('prefer'), 'return=minimal');
    });

    it('disables rate-limit interceptor with rateLimit: false', async () => {
      mockFetch({
        headers: {
          'content-type': 'application/json',
          'x-ratelimit-limit': '100'
        }
      });
      const client = createClient({
        baseUrl: 'https://api.example.com',
        rateLimit: false
      });

      const res = await client.get('/test');

      assert.equal(res.rateLimit, undefined);
    });
  });

  describe('HTTP method helpers', () => {
    it('get() sends GET request', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.get('/test');

      assert.equal(fetchRef.mock.calls[0].arguments[1].method, 'GET');
    });

    it('post() sends POST request', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.post('/test', {body: {}});

      assert.equal(fetchRef.mock.calls[0].arguments[1].method, 'POST');
    });

    it('put() sends PUT request', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.put('/test', {body: {}});

      assert.equal(fetchRef.mock.calls[0].arguments[1].method, 'PUT');
    });

    it('patch() sends PATCH request', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.patch('/test', {body: {}});

      assert.equal(fetchRef.mock.calls[0].arguments[1].method, 'PATCH');
    });

    it('delete() sends DELETE request', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.delete('/test');

      assert.equal(fetchRef.mock.calls[0].arguments[1].method, 'DELETE');
    });

    it('head() sends HEAD request', async () => {
      const fetchRef = mockFetch({body: null});
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.head('/test');

      assert.equal(fetchRef.mock.calls[0].arguments[1].method, 'HEAD');
    });

    it('request() sends custom method', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.request('OPTIONS', '/test');

      assert.equal(fetchRef.mock.calls[0].arguments[1].method, 'OPTIONS');
    });
  });

  describe('proactive rate-limit delay', () => {
    it('delays request when remaining is below threshold', async () => {
      let callCount = 0;
      mock.method(globalThis, 'fetch', async () => {
        callCount++;
        if (callCount === 1) {
          return new Response('{}', {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'x-ratelimit-limit': '100',
              'x-ratelimit-remaining': '1',
              'x-ratelimit-reset': String((Date.now() + 50) / 1000)
            }
          });
        }
        return new Response('{}', {
          status: 200,
          headers: {'content-type': 'application/json'}
        });
      });

      const client = createClient({
        baseUrl: 'https://api.example.com',
        rateLimit: {proactive: true, threshold: 5}
      });

      await client.get('/test');
      await client.get('/test');

      assert.equal(callCount, 2);
    });
  });

  describe('retry delay', () => {
    it('applies delay from Retry-After before retrying', async () => {
      const fetchRef = mockFetchSequence([
        {status: 503, headers: {'content-type': 'text/plain', 'retry-after': '0'}},
        {status: 200, body: '{"ok":true}'}
      ]);
      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: {maxAttempts: 2, baseDelay: 0, jitter: 'none'}
      });

      const res = await client.get('/test');

      assert.equal(fetchRef.mock.calls.length, 2);
      assert.equal(res.status, 200);
    });

    it('applies computed backoff delay when retrying', async () => {
      const fetchRef = mockFetchSequence([
        {status: 503, headers: {'content-type': 'text/plain'}},
        {status: 200, body: '{"ok":true}'}
      ]);
      const client = createClient({
        baseUrl: 'https://api.example.com',
        retry: {maxAttempts: 2, baseDelay: 1, jitter: 'none'}
      });

      const res = await client.get('/test');

      assert.equal(fetchRef.mock.calls.length, 2);
      assert.equal(res.status, 200);
    });
  });

  describe('request-id capture', () => {
    it('captures X-Request-Id from response', async () => {
      mockFetch({
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'req-abc-123'
        }
      });
      const client = createClient({baseUrl: 'https://api.example.com'});

      const res = await client.get('/test');

      assert.equal(res.requestId, 'req-abc-123');
    });

    it('requestId is undefined when response has no X-Request-Id', async () => {
      mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      const res = await client.get('/test');

      assert.equal(res.requestId, undefined);
    });
  });

  describe('conditional request integration', () => {
    it('caches ETag and sends If-None-Match on subsequent requests', async () => {
      const fetchRef = mockFetchSequence([
        {
          status: 200,
          body: '{"data":"first"}',
          headers: {'content-type': 'application/json', etag: '"v1"'}
        },
        {
          status: 304,
          body: null,
          headers: {'content-type': 'application/json'}
        }
      ]);
      const client = createClient({baseUrl: 'https://api.example.com'});

      const res1 = await client.get('/resource');
      assert.deepEqual(res1.body, {data: 'first'});

      const res2 = await client.get('/resource');
      assert.deepEqual(res2.body, {data: 'first'});
      assert.equal(res2.status, 304);

      const headers2 = fetchRef.mock.calls[1].arguments[1].headers;
      assert.equal(headers2.get('if-none-match'), '"v1"');
    });
  });

  describe('client.paginate()', () => {
    it('exists and is a named function', () => {
      const client = createClient({baseUrl: 'https://api.example.com'});

      assert.equal(typeof client.paginate, 'function');
      assert.equal(client.paginate.name, 'paginate');
    });

    it('returns an async iterable', () => {
      mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      const result = client.paginate('/items');

      assert.equal(typeof result[Symbol.asyncIterator], 'function');
    });

    it('traverses pages via Link header rel="next"', async () => {
      let callCount = 0;
      mock.method(globalThis, 'fetch', async () => {
        callCount++;
        if (callCount === 1) {
          return new Response('[1,2]', {
            status: 200,
            headers: {
              'content-type': 'application/json',
              link: '</items?page=2&perPage=2>; rel="next"',
              'x-total-count': '4'
            }
          });
        }
        return new Response('[3,4]', {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-total-count': '4'
          }
        });
      });
      const client = createClient({baseUrl: 'https://api.example.com'});
      const pages = [];

      for await (const page of client.paginate('/items', {perPage: 2})) {
        pages.push(page);
      }

      assert.equal(pages.length, 2);
      assert.deepEqual(pages[0].data, [1, 2]);
      assert.deepEqual(pages[1].data, [3, 4]);
      assert.equal(pages[0].meta.total, 4);
      assert.equal(pages[1].done, true);
      assert.equal(callCount, 2);
      assert.ok(
        globalThis.fetch.mock.calls[1].arguments[0].includes('/items?page=2'),
        'second fetch should follow Link header next URL'
      );
    });
  });

  describe('client.paginateAll()', () => {
    it('exists and is a named function', () => {
      const client = createClient({baseUrl: 'https://api.example.com'});

      assert.equal(typeof client.paginateAll, 'function');
      assert.equal(client.paginateAll.name, 'paginateAll');
    });

    it('collects and flattens array data from all pages', async () => {
      let callCount = 0;
      mock.method(globalThis, 'fetch', async () => {
        callCount++;
        if (callCount === 1) {
          return new Response('[1,2]', {
            status: 200,
            headers: {
              'content-type': 'application/json',
              link: '</items?page=2&perPage=2>; rel="next"'
            }
          });
        }
        return new Response('[3,4]', {
          status: 200,
          headers: {'content-type': 'application/json'}
        });
      });
      const client = createClient({baseUrl: 'https://api.example.com'});

      const all = await client.paginateAll('/items', {perPage: 2});

      assert.deepEqual(all, [1, 2, 3, 4]);
      assert.equal(callCount, 2);
      assert.ok(
        globalThis.fetch.mock.calls[1].arguments[0].includes('/items?page=2'),
        'second fetch should follow Link header next URL'
      );
    });

    it('handles non-array page data by appending individual items', async () => {
      mock.method(globalThis, 'fetch', async () => {
        return new Response('{"id":1}', {
          status: 200,
          headers: {'content-type': 'application/json'}
        });
      });
      const client = createClient({baseUrl: 'https://api.example.com'});

      const all = await client.paginateAll('/item');

      assert.deepEqual(all, [{id: 1}]);
    });

    it('skips undefined page data', async () => {
      mock.method(globalThis, 'fetch', async () => {
        return new Response(null, {
          status: 204,
          headers: {'content-type': 'application/json'}
        });
      });
      const client = createClient({baseUrl: 'https://api.example.com'});

      const all = await client.paginateAll('/empty');

      assert.deepEqual(all, []);
    });
  });

  describe('client.query()', () => {
    it('exists and is a named function', () => {
      const client = createClient({baseUrl: 'https://api.example.com'});

      assert.equal(typeof client.query, 'function');
      assert.equal(client.query.name, 'query');
    });

    it('returns a query builder with the given path', () => {
      const client = createClient({baseUrl: 'https://api.example.com'});

      const builder = client.query('/articles');

      assert.equal(builder.path, '/articles');
      assert.equal(typeof builder.fields, 'function');
      assert.equal(typeof builder.include, 'function');
      assert.equal(typeof builder.filter, 'function');
      assert.equal(typeof builder.sort, 'function');
      assert.equal(typeof builder.page, 'function');
      assert.equal(typeof builder.toString, 'function');
    });

    it('returns a query builder without a path', () => {
      const client = createClient({baseUrl: 'https://api.example.com'});

      const builder = client.query();

      assert.equal(builder.path, undefined);
    });
  });

  describe('QueryBuilder as options.query', () => {
    it('serializes QueryBuilder to query string in URL', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});
      const qb = createQueryBuilder().fields('articles', ['title', 'body']);

      await client.get('/articles', {query: qb});

      const [calledUrl] = fetchRef.mock.calls[0].arguments;
      const url = new URL(calledUrl);
      assert.equal(url.searchParams.get('fields[articles]'), 'title,body');
    });

    it('plain object query still works as before', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.get('/users', {query: {page: 1, limit: 10}});

      const [calledUrl] = fetchRef.mock.calls[0].arguments;
      const url = new URL(calledUrl);
      assert.equal(url.searchParams.get('page'), '1');
      assert.equal(url.searchParams.get('limit'), '10');
    });
  });

  describe('idempotency interceptor integration', () => {
    it('is disabled by default (no Idempotency-Key header)', async () => {
      const fetchRef = mockFetch();
      const client = createClient({baseUrl: 'https://api.example.com'});

      await client.post('/orders', {body: {item: 'test'}});

      const headers = fetchRef.mock.calls[0].arguments[1].headers;
      assert.equal(headers.has('idempotency-key'), false);
    });

    it('generates Idempotency-Key when enabled with true', async () => {
      const fetchRef = mockFetch();
      const client = createClient({
        baseUrl: 'https://api.example.com',
        idempotency: true
      });

      await client.post('/orders', {body: {item: 'test'}});

      const headers = fetchRef.mock.calls[0].arguments[1].headers;
      const key = headers.get('idempotency-key');
      assert.ok(key, 'should have generated an idempotency key');
      assert.match(key, /^[0-9a-f-]{36}$/);
    });

    it('generates Idempotency-Key when enabled with options object', async () => {
      const fetchRef = mockFetch();
      const client = createClient({
        baseUrl: 'https://api.example.com',
        idempotency: {methods: ['POST', 'PUT']}
      });

      await client.put('/orders/1', {body: {item: 'test'}});

      const headers = fetchRef.mock.calls[0].arguments[1].headers;
      assert.ok(headers.has('idempotency-key'));
    });

    it('does not generate key for GET requests', async () => {
      const fetchRef = mockFetch();
      const client = createClient({
        baseUrl: 'https://api.example.com',
        idempotency: true
      });

      await client.get('/orders');

      const headers = fetchRef.mock.calls[0].arguments[1].headers;
      assert.equal(headers.has('idempotency-key'), false);
    });

    it('passes through explicit idempotencyKey from request options', async () => {
      const fetchRef = mockFetch();
      const client = createClient({
        baseUrl: 'https://api.example.com',
        idempotency: true
      });

      await client.post('/orders', {
        body: {item: 'test'},
        idempotencyKey: 'my-explicit-key-123'
      });

      const headers = fetchRef.mock.calls[0].arguments[1].headers;
      assert.equal(headers.get('idempotency-key'), 'my-explicit-key-123');
    });

    it('reuses key across retries', async () => {
      const keys = [];
      mock.method(globalThis, 'fetch', async (url, init) => {
        keys.push(init.headers.get('idempotency-key'));
        if (keys.length === 1) {
          return new Response(null, {
            status: 503,
            headers: {'content-type': 'text/plain'}
          });
        }
        return new Response('{"ok":true}', {
          status: 200,
          headers: {'content-type': 'application/json'}
        });
      });
      const client = createClient({
        baseUrl: 'https://api.example.com',
        idempotency: true,
        retry: {maxAttempts: 2, baseDelay: 0, jitter: 'none'}
      });

      await client.post('/orders', {body: {item: 'test'}, idempotent: true});

      assert.equal(keys.length, 2);
      assert.ok(keys[0]);
      assert.equal(keys[0], keys[1], 'same key must be reused on retry');
    });
  });

  describe('client instance shape (Phase 2 methods)', () => {
    it('includes paginate, paginateAll, and query methods', () => {
      const client = createClient({baseUrl: 'https://api.example.com'});

      assert.equal(typeof client.paginate, 'function');
      assert.equal(typeof client.paginateAll, 'function');
      assert.equal(typeof client.query, 'function');
    });

    it('all methods are on a frozen null-prototype object', () => {
      const client = createClient({baseUrl: 'https://api.example.com'});

      assert.equal(Object.getPrototypeOf(client), null);
      assert.equal(Object.isFrozen(client), true);
      assert.ok(Object.keys(client).includes('paginate'));
      assert.ok(Object.keys(client).includes('paginateAll'));
      assert.ok(Object.keys(client).includes('query'));
    });
  });
});
