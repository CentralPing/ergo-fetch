/**
 * @fileoverview Boundary tests for the pagination async iterator.
 * @module @centralping/ergo-fetch/lib/pagination.spec
 */

import {describe, it, mock} from 'node:test';
import assert from 'node:assert/strict';

import {createPaginator} from './pagination.js';
import {createQueryBuilder} from './query-builder.js';

/**
 * Creates a mock client with a programmable get method.
 *
 * @param {Array<{status: number, headers: Headers | object, body: *, url?: string}>} responses -
 *   Ordered list of responses to return on successive get() calls.
 * @returns {{client: object, calls: Array<{path: string, options: object}>}} - Mock client and call log.
 */
function createMockClient(responses) {
  const calls = [];
  let callIndex = 0;

  const client = Object.create(null);
  client.get = mock.fn(function get(path, options) {
    calls.push({path, options});
    const resp = responses[callIndex++];
    if (!resp) throw new Error('No more mock responses configured');

    const headers = resp.headers instanceof Headers ? resp.headers : new Headers(resp.headers);
    const raw = Object.create(null);
    raw.url = resp.url ?? `https://api.example.com${path}`;

    return Promise.resolve(
      Object.freeze({
        status: resp.status,
        headers,
        body: resp.body,
        raw: Object.freeze(raw)
      })
    );
  });

  return {client, calls};
}

describe('createPaginator', () => {
  describe('input validation', () => {
    it('throws TypeError when client is null', () => {
      assert.throws(() => createPaginator(null, '/items'), {
        name: 'TypeError',
        message: 'client must be a non-null object'
      });
    });

    it('throws TypeError when client is undefined', () => {
      assert.throws(() => createPaginator(undefined, '/items'), {
        name: 'TypeError',
        message: 'client must be a non-null object'
      });
    });

    it('throws TypeError when client is a primitive', () => {
      assert.throws(() => createPaginator('string', '/items'), {
        name: 'TypeError',
        message: 'client must be a non-null object'
      });
    });

    it('throws TypeError when client.get is not a function', () => {
      assert.throws(() => createPaginator({}, '/items'), {
        name: 'TypeError',
        message: 'client.get must be a function'
      });
    });

    it('throws TypeError when path is not a string', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, 42), {
        name: 'TypeError',
        message: 'path must be a string'
      });
    });

    it('includes "path" label in path-absolute error message', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, 'items'), {
        name: 'TypeError',
        message: /^path must be/
      });
    });

    it('throws TypeError when path does not start with /', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, 'items'), {
        name: 'TypeError',
        message: /RFC 3986/
      });
    });

    it('throws TypeError when path is a network-path reference (//host)', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '//api.example.com/items'), {
        name: 'TypeError',
        message: /RFC 3986/
      });
    });

    it('throws TypeError when path contains backslash', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/\\evil'), {
        name: 'TypeError',
        message: /RFC 3986/
      });
    });

    it('throws TypeError when path contains control characters', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/\t/evil'), {
        name: 'TypeError',
        message: /RFC 3986/
      });
    });

    it('throws TypeError when path contains non-ASCII', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/artícles'), {
        name: 'TypeError',
        message: /RFC 3986/
      });
    });

    it('throws TypeError when options is a string', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', 'invalid'), {
        name: 'TypeError',
        message: 'options must be a plain object'
      });
    });

    it('throws TypeError when options is an array', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', []), {
        name: 'TypeError',
        message: 'options must be a plain object'
      });
    });

    it('throws TypeError when options is null', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', null), {
        name: 'TypeError',
        message: 'options must be a plain object'
      });
    });

    it('accepts undefined options', () => {
      const {client} = createMockClient([]);

      assert.doesNotThrow(() => createPaginator(client, '/items', undefined));
    });

    it('throws TypeError when options.query is a string', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {query: 'invalid'}), {
        name: 'TypeError',
        message: 'options.query must be a plain object or QueryBuilder'
      });
    });

    it('throws TypeError when options.query is an array', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {query: []}), {
        name: 'TypeError',
        message: 'options.query must be a plain object or QueryBuilder'
      });
    });

    it('throws TypeError when QueryBuilder includes page[...] parameters', () => {
      const {client} = createMockClient([]);
      const query = createQueryBuilder().page({number: 1, size: 10});

      assert.throws(() => createPaginator(client, '/items', {query}), {
        name: 'TypeError',
        message:
          'options.query must not include JSON:API page[...] parameters when using paginate(); use paginator page/perPage/limit options instead'
      });
    });

    it('throws TypeError when options.query includes flat page for offset strategy', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {query: {page: 2}}), {
        name: 'TypeError',
        message:
          'options.query must not include page, per_page, or limit when using paginate() offset strategy; use paginator page/perPage options instead'
      });
    });

    it('throws TypeError when options.query includes per_page for offset strategy', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {query: {per_page: 10}}), {
        name: 'TypeError',
        message:
          'options.query must not include page, per_page, or limit when using paginate() offset strategy; use paginator page/perPage options instead'
      });
    });

    it('throws TypeError when options.query includes limit for offset strategy', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {query: {limit: 10}}), {
        name: 'TypeError',
        message:
          'options.query must not include page, per_page, or limit when using paginate() offset strategy; use paginator page/perPage options instead'
      });
    });

    it('throws TypeError when options.query includes limit for cursor strategy', () => {
      const {client} = createMockClient([]);

      assert.throws(
        () => createPaginator(client, '/items', {strategy: 'cursor', query: {limit: 10}}),
        {
          name: 'TypeError',
          message:
            'options.query must not include limit, page, or per_page when using paginate() cursor strategy; use paginator limit option instead'
        }
      );
    });

    it('throws TypeError when options.query includes page for cursor strategy', () => {
      const {client} = createMockClient([]);

      assert.throws(
        () => createPaginator(client, '/items', {strategy: 'cursor', query: {page: 1}}),
        {
          name: 'TypeError',
          message:
            'options.query must not include limit, page, or per_page when using paginate() cursor strategy; use paginator limit option instead'
        }
      );
    });

    it('throws TypeError when options.headers is a string', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {headers: 'invalid'}), {
        name: 'TypeError',
        message: 'options.headers must be a Headers instance or a plain object'
      });
    });

    it('throws TypeError when options.headers is an array', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {headers: []}), {
        name: 'TypeError',
        message: 'options.headers must be a Headers instance or a plain object'
      });
    });

    it('accepts Headers instance for options.headers', () => {
      const {client} = createMockClient([]);

      assert.doesNotThrow(() => createPaginator(client, '/items', {headers: new Headers()}));
    });

    it('accepts plain object for options.headers', () => {
      const {client} = createMockClient([]);

      assert.doesNotThrow(() =>
        createPaginator(client, '/items', {headers: {'x-custom': 'value'}})
      );
    });

    it('throws TypeError when options.signal is not an AbortSignal', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {signal: {}}), {
        name: 'TypeError',
        message: 'options.signal must be an AbortSignal'
      });
    });

    it('throws TypeError when options.signal is a string', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {signal: 'abort'}), {
        name: 'TypeError',
        message: 'options.signal must be an AbortSignal'
      });
    });

    it('accepts AbortSignal for options.signal', () => {
      const {client} = createMockClient([]);
      const controller = new AbortController();

      assert.doesNotThrow(() => createPaginator(client, '/items', {signal: controller.signal}));
    });

    it('throws TypeError for invalid strategy', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {strategy: 'invalid'}), {
        name: 'TypeError',
        message: /options\.strategy must be 'offset' or 'cursor'/
      });
    });

    it('throws TypeError when page is not a positive integer', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {page: 0}), {
        name: 'TypeError',
        message: 'options.page must be a positive integer'
      });
    });

    it('throws TypeError when page is negative', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {page: -1}), {
        name: 'TypeError',
        message: 'options.page must be a positive integer'
      });
    });

    it('throws TypeError when page is a float', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {page: 1.5}), {
        name: 'TypeError',
        message: 'options.page must be a positive integer'
      });
    });

    it('throws TypeError when perPage is not a positive integer', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {perPage: 0}), {
        name: 'TypeError',
        message: 'options.perPage must be a positive integer'
      });
    });

    it('throws TypeError when perPage is negative', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {perPage: -5}), {
        name: 'TypeError',
        message: 'options.perPage must be a positive integer'
      });
    });

    it('throws TypeError when limit is not a positive integer (cursor strategy)', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {strategy: 'cursor', limit: 0}), {
        name: 'TypeError',
        message: 'options.limit must be a positive integer'
      });
    });

    it('throws TypeError when limit is a float (cursor strategy)', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {strategy: 'cursor', limit: 2.5}), {
        name: 'TypeError',
        message: 'options.limit must be a positive integer'
      });
    });

    it('throws TypeError when maxPages is zero', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {maxPages: 0}), {
        name: 'TypeError',
        message: 'options.maxPages must be a positive integer or Infinity'
      });
    });

    it('throws TypeError when maxPages is negative', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {maxPages: -1}), {
        name: 'TypeError',
        message: 'options.maxPages must be a positive integer or Infinity'
      });
    });

    it('throws TypeError when maxPages is NaN', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {maxPages: NaN}), {
        name: 'TypeError',
        message: 'options.maxPages must be a positive integer or Infinity'
      });
    });

    it('throws TypeError when maxPages is a float', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {maxPages: 1.5}), {
        name: 'TypeError',
        message: 'options.maxPages must be a positive integer or Infinity'
      });
    });

    it('accepts Infinity for maxPages', () => {
      const {client} = createMockClient([]);

      assert.doesNotThrow(() => createPaginator(client, '/items', {maxPages: Infinity}));
    });

    it('accepts valid offset options', () => {
      const {client} = createMockClient([]);

      assert.doesNotThrow(() => createPaginator(client, '/items', {page: 1, perPage: 50}));
    });

    it('accepts valid cursor options', () => {
      const {client} = createMockClient([]);

      assert.doesNotThrow(() => createPaginator(client, '/items', {strategy: 'cursor', limit: 25}));
    });
  });

  describe('returned iterable', () => {
    it('returns a frozen object', () => {
      const {client} = createMockClient([]);
      const paginator = createPaginator(client, '/items');

      assert.equal(Object.isFrozen(paginator), true);
    });

    it('returns a null-prototype object', () => {
      const {client} = createMockClient([]);
      const paginator = createPaginator(client, '/items');

      assert.equal(Object.getPrototypeOf(paginator), null);
    });

    it('implements Symbol.asyncIterator', () => {
      const {client} = createMockClient([]);
      const paginator = createPaginator(client, '/items');

      assert.equal(typeof paginator[Symbol.asyncIterator], 'function');
    });

    it('produces an async iterator from Symbol.asyncIterator', () => {
      const {client} = createMockClient([{status: 200, headers: {}, body: []}]);
      const paginator = createPaginator(client, '/items');
      const iterator = paginator[Symbol.asyncIterator]();

      assert.equal(typeof iterator.next, 'function');
      assert.equal(typeof iterator.return, 'function');
    });
  });

  describe('offset strategy', () => {
    it('sends page and perPage query params on initial request', async () => {
      const {client, calls} = createMockClient([{status: 200, headers: {}, body: [{id: 1}]}]);

      const paginator = createPaginator(client, '/items', {page: 2, perPage: 10});

      for await (const _page of paginator) {
        void _page;
      }

      assert.equal(calls.length, 1);
      assert.equal(calls[0].options.query.page, 2);
      assert.equal(calls[0].options.query.per_page, 10);
    });

    it('uses default page=1 and per_page=20', async () => {
      const {client, calls} = createMockClient([{status: 200, headers: {}, body: []}]);

      const paginator = createPaginator(client, '/items');

      for await (const _page of paginator) {
        void _page;
      }

      assert.equal(calls[0].options.query.page, 1);
      assert.equal(calls[0].options.query.per_page, 20);
    });

    it('follows rel="next" Link header for subsequent pages', async () => {
      const {client, calls} = createMockClient([
        {
          status: 200,
          headers: new Headers({link: '</items?page=2&per_page=5>; rel="next"'}),
          body: [{id: 1}],
          url: 'https://api.example.com/items?page=1&per_page=5'
        },
        {
          status: 200,
          headers: {},
          body: [{id: 2}],
          url: 'https://api.example.com/items?page=2&per_page=5'
        }
      ]);

      const paginator = createPaginator(client, '/items', {perPage: 5});
      const pages = [];

      for await (const page of paginator) {
        pages.push(page);
      }

      assert.equal(pages.length, 2);
      assert.equal(calls[1].path, '/items?page=2&per_page=5');
      assert.equal(calls[1].options.query, undefined);
    });

    it('terminates when no rel="next" link is present', async () => {
      const {client} = createMockClient([
        {
          status: 200,
          headers: new Headers({link: '</items?page=1&per_page=5>; rel="prev"'}),
          body: [{id: 3}],
          url: 'https://api.example.com/items?page=2&per_page=5'
        }
      ]);

      const paginator = createPaginator(client, '/items', {page: 2, perPage: 5});
      const pages = [];

      for await (const page of paginator) {
        pages.push(page);
      }

      assert.equal(pages.length, 1);
      assert.equal(pages[0].done, true);
    });

    it('traverses multiple pages until termination', async () => {
      const {client} = createMockClient([
        {
          status: 200,
          headers: new Headers({
            link: '</items?page=2&per_page=2>; rel="next"',
            'x-total-count': '5'
          }),
          body: [{id: 1}, {id: 2}],
          url: 'https://api.example.com/items?page=1&per_page=2'
        },
        {
          status: 200,
          headers: new Headers({
            link: '</items?page=3&per_page=2>; rel="next"',
            'x-total-count': '5'
          }),
          body: [{id: 3}, {id: 4}],
          url: 'https://api.example.com/items?page=2&per_page=2'
        },
        {
          status: 200,
          headers: new Headers({'x-total-count': '5'}),
          body: [{id: 5}],
          url: 'https://api.example.com/items?page=3&per_page=2'
        }
      ]);

      const paginator = createPaginator(client, '/items', {perPage: 2});
      const pages = [];

      for await (const page of paginator) {
        pages.push(page);
      }

      assert.equal(pages.length, 3);
      assert.equal(pages[0].done, false);
      assert.equal(pages[1].done, false);
      assert.equal(pages[2].done, true);
      assert.deepEqual(pages[0].data, [{id: 1}, {id: 2}]);
      assert.deepEqual(pages[2].data, [{id: 5}]);
    });

    it('merges extra query params with pagination params on initial request', async () => {
      const {client, calls} = createMockClient([{status: 200, headers: {}, body: []}]);

      const paginator = createPaginator(client, '/items', {
        perPage: 10,
        query: {status: 'active', sort: 'name'}
      });

      for await (const _page of paginator) {
        void _page;
      }

      assert.equal(calls[0].options.query.page, 1);
      assert.equal(calls[0].options.query.per_page, 10);
      assert.equal(calls[0].options.query.status, 'active');
      assert.equal(calls[0].options.query.sort, 'name');
    });

    it('merges QueryBuilder query params with pagination params on initial request', async () => {
      const {client, calls} = createMockClient([{status: 200, headers: {}, body: []}]);

      const query = createQueryBuilder().filter({published: true}).sort(['name']);

      const paginator = createPaginator(client, '/items', {perPage: 10, query});

      for await (const _page of paginator) {
        void _page;
      }

      assert.equal(calls[0].options.query.page, 1);
      assert.equal(calls[0].options.query.per_page, 10);
      assert.equal(calls[0].options.query['filter[published]'], 'true');
      assert.equal(calls[0].options.query.sort, 'name');
    });
  });

  describe('cursor strategy', () => {
    it('sends limit query param on initial request', async () => {
      const {client, calls} = createMockClient([{status: 200, headers: {}, body: [{id: 1}]}]);

      const paginator = createPaginator(client, '/items', {strategy: 'cursor', limit: 15});

      for await (const _page of paginator) {
        void _page;
      }

      assert.equal(calls.length, 1);
      assert.equal(calls[0].options.query.limit, 15);
      assert.equal(calls[0].options.query.page, undefined);
    });

    it('follows cursor-based rel="next" links', async () => {
      const {client, calls} = createMockClient([
        {
          status: 200,
          headers: new Headers({
            link: '</items?cursor=abc123&limit=10>; rel="next"'
          }),
          body: [{id: 1}],
          url: 'https://api.example.com/items?limit=10'
        },
        {
          status: 200,
          headers: new Headers({
            link: '</items?cursor=def456&limit=10>; rel="next"'
          }),
          body: [{id: 2}],
          url: 'https://api.example.com/items?cursor=abc123&limit=10'
        },
        {
          status: 200,
          headers: {},
          body: [{id: 3}],
          url: 'https://api.example.com/items?cursor=def456&limit=10'
        }
      ]);

      const paginator = createPaginator(client, '/items', {strategy: 'cursor', limit: 10});
      const pages = [];

      for await (const page of paginator) {
        pages.push(page);
      }

      assert.equal(pages.length, 3);
      assert.equal(calls[1].path, '/items?cursor=abc123&limit=10');
      assert.equal(calls[2].path, '/items?cursor=def456&limit=10');
    });

    it('merges extra query params with limit on initial request', async () => {
      const {client, calls} = createMockClient([{status: 200, headers: {}, body: []}]);

      const paginator = createPaginator(client, '/items', {
        strategy: 'cursor',
        limit: 25,
        query: {filter: 'active'}
      });

      for await (const _page of paginator) {
        void _page;
      }

      assert.equal(calls[0].options.query.limit, 25);
      assert.equal(calls[0].options.query.filter, 'active');
    });

    it('meta.page is iteration counter starting at 1 for cursor strategy', async () => {
      const {client} = createMockClient([
        {
          status: 200,
          headers: new Headers({link: '</items?cursor=abc&limit=10>; rel="next"'}),
          body: [{id: 1}],
          url: 'https://api.example.com/items?limit=10'
        },
        {
          status: 200,
          headers: {},
          body: [{id: 2}],
          url: 'https://api.example.com/items?cursor=abc&limit=10'
        }
      ]);

      const paginator = createPaginator(client, '/items', {strategy: 'cursor', limit: 10});
      const pages = [];

      for await (const page of paginator) {
        pages.push(page);
      }

      assert.equal(pages[0].meta.page, 1);
      assert.equal(pages[1].meta.page, 2);
    });
  });

  describe('maxPages', () => {
    it('stops after maxPages even when more pages are available', async () => {
      const {client} = createMockClient([
        {
          status: 200,
          headers: new Headers({link: '</items?page=2&per_page=5>; rel="next"'}),
          body: [{id: 1}],
          url: 'https://api.example.com/items?page=1&per_page=5'
        },
        {
          status: 200,
          headers: new Headers({link: '</items?page=3&per_page=5>; rel="next"'}),
          body: [{id: 2}],
          url: 'https://api.example.com/items?page=2&per_page=5'
        },
        {
          status: 200,
          headers: new Headers({link: '</items?page=4&per_page=5>; rel="next"'}),
          body: [{id: 3}],
          url: 'https://api.example.com/items?page=3&per_page=5'
        }
      ]);

      const paginator = createPaginator(client, '/items', {perPage: 5, maxPages: 2});
      const pages = [];

      for await (const page of paginator) {
        pages.push(page);
      }

      assert.equal(pages.length, 2);
      assert.equal(pages[1].done, true);
    });

    it('marks the maxPages-limited page as done', async () => {
      const {client} = createMockClient([
        {
          status: 200,
          headers: new Headers({link: '</items?page=2>; rel="next"'}),
          body: [{id: 1}],
          url: 'https://api.example.com/items?page=1'
        }
      ]);

      const paginator = createPaginator(client, '/items', {maxPages: 1});
      const pages = [];

      for await (const page of paginator) {
        pages.push(page);
      }

      assert.equal(pages.length, 1);
      assert.equal(pages[0].done, true);
    });
  });

  describe('page object shape', () => {
    it('returns frozen page objects', async () => {
      const {client} = createMockClient([{status: 200, headers: {}, body: [{id: 1}]}]);

      const paginator = createPaginator(client, '/items');

      for await (const page of paginator) {
        assert.equal(Object.isFrozen(page), true);
      }
    });

    it('returns null-prototype page objects', async () => {
      const {client} = createMockClient([{status: 200, headers: {}, body: [{id: 1}]}]);

      const paginator = createPaginator(client, '/items');

      for await (const page of paginator) {
        assert.equal(Object.getPrototypeOf(page), null);
      }
    });

    it('returns frozen meta objects', async () => {
      const {client} = createMockClient([{status: 200, headers: {}, body: [{id: 1}]}]);

      const paginator = createPaginator(client, '/items');

      for await (const page of paginator) {
        assert.equal(Object.isFrozen(page.meta), true);
      }
    });

    it('returns null-prototype meta objects', async () => {
      const {client} = createMockClient([{status: 200, headers: {}, body: [{id: 1}]}]);

      const paginator = createPaginator(client, '/items');

      for await (const page of paginator) {
        assert.equal(Object.getPrototypeOf(page.meta), null);
      }
    });

    it('includes page number in meta starting at 1', async () => {
      const {client} = createMockClient([
        {
          status: 200,
          headers: new Headers({link: '</items?page=2>; rel="next"'}),
          body: [{id: 1}],
          url: 'https://api.example.com/items?page=1'
        },
        {
          status: 200,
          headers: {},
          body: [{id: 2}],
          url: 'https://api.example.com/items?page=2'
        }
      ]);

      const paginator = createPaginator(client, '/items');
      const pages = [];

      for await (const page of paginator) {
        pages.push(page);
      }

      assert.equal(pages[0].meta.page, 1);
      assert.equal(pages[1].meta.page, 2);
    });

    it('meta.page reflects starting page when options.page > 1', async () => {
      const {client} = createMockClient([
        {
          status: 200,
          headers: new Headers({link: '</items?page=4&per_page=10>; rel="next"'}),
          body: [{id: 21}],
          url: 'https://api.example.com/items?page=3&per_page=10'
        },
        {
          status: 200,
          headers: new Headers({link: '</items?page=5&per_page=10>; rel="next"'}),
          body: [{id: 31}],
          url: 'https://api.example.com/items?page=4&per_page=10'
        },
        {
          status: 200,
          headers: {},
          body: [{id: 41}],
          url: 'https://api.example.com/items?page=5&per_page=10'
        }
      ]);

      const paginator = createPaginator(client, '/items', {page: 3, perPage: 10});
      const pages = [];

      for await (const page of paginator) {
        pages.push(page);
      }

      assert.equal(pages[0].meta.page, 3);
      assert.equal(pages[1].meta.page, 4);
      assert.equal(pages[2].meta.page, 5);
    });

    it('includes data from response body', async () => {
      const {client} = createMockClient([{status: 200, headers: {}, body: [{id: 1}, {id: 2}]}]);

      const paginator = createPaginator(client, '/items');

      for await (const page of paginator) {
        assert.deepEqual(page.data, [{id: 1}, {id: 2}]);
      }
    });

    it('includes links Map from Link header', async () => {
      const {client} = createMockClient([
        {
          status: 200,
          headers: new Headers({
            link: '</items?page=2>; rel="next", </items?page=1>; rel="first"'
          }),
          body: [],
          url: 'https://api.example.com/items?page=1'
        }
      ]);

      const paginator = createPaginator(client, '/items', {maxPages: 1});

      for await (const page of paginator) {
        assert.equal(page.links instanceof Map, true);
        assert.equal(page.links.has('next'), true);
        assert.equal(page.links.has('first'), true);
      }
    });

    it('includes empty links Map when no Link header present', async () => {
      const {client} = createMockClient([{status: 200, headers: {}, body: []}]);

      const paginator = createPaginator(client, '/items');

      for await (const page of paginator) {
        assert.equal(page.links instanceof Map, true);
        assert.equal(page.links.size, 0);
      }
    });
  });

  describe('X-Total-Count header', () => {
    it('parses X-Total-Count into meta.total', async () => {
      const {client} = createMockClient([
        {
          status: 200,
          headers: new Headers({'x-total-count': '42'}),
          body: [{id: 1}]
        }
      ]);

      const paginator = createPaginator(client, '/items');

      for await (const page of paginator) {
        assert.equal(page.meta.total, 42);
      }
    });

    it('meta.total is undefined when X-Total-Count header is absent', async () => {
      const {client} = createMockClient([{status: 200, headers: {}, body: [{id: 1}]}]);

      const paginator = createPaginator(client, '/items');

      for await (const page of paginator) {
        assert.equal(page.meta.total, undefined);
      }
    });

    it('ignores non-numeric X-Total-Count values', async () => {
      const {client} = createMockClient([
        {
          status: 200,
          headers: new Headers({'x-total-count': 'not-a-number'}),
          body: [{id: 1}]
        }
      ]);

      const paginator = createPaginator(client, '/items');

      for await (const page of paginator) {
        assert.equal(page.meta.total, undefined);
      }
    });

    it('ignores negative X-Total-Count values', async () => {
      const {client} = createMockClient([
        {
          status: 200,
          headers: new Headers({'x-total-count': '-5'}),
          body: [{id: 1}]
        }
      ]);

      const paginator = createPaginator(client, '/items');

      for await (const page of paginator) {
        assert.equal(page.meta.total, undefined);
      }
    });

    it('handles X-Total-Count of zero', async () => {
      const {client} = createMockClient([
        {
          status: 200,
          headers: new Headers({'x-total-count': '0'}),
          body: []
        }
      ]);

      const paginator = createPaginator(client, '/items');

      for await (const page of paginator) {
        assert.equal(page.meta.total, 0);
      }
    });

    it('ignores empty X-Total-Count values', async () => {
      const {client} = createMockClient([
        {
          status: 200,
          headers: new Headers({'x-total-count': ''}),
          body: [{id: 1}]
        }
      ]);

      const paginator = createPaginator(client, '/items');

      for await (const page of paginator) {
        assert.equal(page.meta.total, undefined);
      }
    });

    it('ignores fractional X-Total-Count values', async () => {
      const {client} = createMockClient([
        {
          status: 200,
          headers: new Headers({'x-total-count': '42.5'}),
          body: [{id: 1}]
        }
      ]);

      const paginator = createPaginator(client, '/items');

      for await (const page of paginator) {
        assert.equal(page.meta.total, undefined);
      }
    });
  });

  describe('headers and signal passthrough', () => {
    it('passes headers to each request', async () => {
      const {client, calls} = createMockClient([
        {
          status: 200,
          headers: new Headers({link: '</items?page=2>; rel="next"'}),
          body: [{id: 1}],
          url: 'https://api.example.com/items?page=1'
        },
        {
          status: 200,
          headers: {},
          body: [{id: 2}],
          url: 'https://api.example.com/items?page=2'
        }
      ]);

      const customHeaders = {'x-custom': 'value'};
      const paginator = createPaginator(client, '/items', {headers: customHeaders});

      for await (const _page of paginator) {
        void _page;
      }

      assert.equal(calls[0].options.headers, customHeaders);
      assert.equal(calls[1].options.headers, customHeaders);
    });

    it('passes signal to each request', async () => {
      const controller = new AbortController();
      const {client, calls} = createMockClient([
        {
          status: 200,
          headers: new Headers({link: '</items?page=2>; rel="next"'}),
          body: [{id: 1}],
          url: 'https://api.example.com/items?page=1'
        },
        {
          status: 200,
          headers: {},
          body: [{id: 2}],
          url: 'https://api.example.com/items?page=2'
        }
      ]);

      const paginator = createPaginator(client, '/items', {signal: controller.signal});

      for await (const _page of paginator) {
        void _page;
      }

      assert.equal(calls[0].options.signal, controller.signal);
      assert.equal(calls[1].options.signal, controller.signal);
    });
  });

  describe('error propagation', () => {
    it('propagates client errors through the iterator', async () => {
      const client = Object.create(null);
      client.get = mock.fn(() => Promise.reject(new Error('Network failure')));

      const paginator = createPaginator(client, '/items');

      await assert.rejects(
        async () => {
          for await (const _page of paginator) {
            void _page;
          }
        },
        {message: 'Network failure'}
      );
    });

    it('propagates client errors raised on a subsequent page', async () => {
      let callIndex = 0;
      const client = Object.create(null);
      client.get = mock.fn(function get() {
        if (callIndex++ === 0) {
          const raw = Object.create(null);
          raw.url = 'https://api.example.com/items?page=1';
          return Promise.resolve(
            Object.freeze({
              status: 200,
              headers: new Headers({link: '</items?page=2>; rel="next"'}),
              body: [{id: 1}],
              raw: Object.freeze(raw)
            })
          );
        }
        return Promise.reject(new Error('Network failure on page 2'));
      });

      const paginator = createPaginator(client, '/items');
      const pages = [];

      await assert.rejects(
        async () => {
          for await (const page of paginator) {
            pages.push(page);
          }
        },
        {message: 'Network failure on page 2'}
      );

      assert.equal(pages.length, 1);
      assert.equal(client.get.mock.callCount(), 2);
    });
  });

  describe('empty responses', () => {
    it('yields a single page with empty data when first response has no items', async () => {
      const {client} = createMockClient([
        {status: 200, headers: new Headers({'x-total-count': '0'}), body: []}
      ]);

      const paginator = createPaginator(client, '/items');
      const pages = [];

      for await (const page of paginator) {
        pages.push(page);
      }

      assert.equal(pages.length, 1);
      assert.deepEqual(pages[0].data, []);
      assert.equal(pages[0].done, true);
      assert.equal(pages[0].meta.total, 0);
    });
  });

  describe('relative Link header URIs', () => {
    it('resolves relative next links against the request URL', async () => {
      const {client, calls} = createMockClient([
        {
          status: 200,
          headers: new Headers({link: '</items?page=2&per_page=5>; rel="next"'}),
          body: [{id: 1}],
          url: 'https://api.example.com/items?page=1&per_page=5'
        },
        {
          status: 200,
          headers: {},
          body: [{id: 2}],
          url: 'https://api.example.com/items?page=2&per_page=5'
        }
      ]);

      const paginator = createPaginator(client, '/items', {perPage: 5});

      for await (const _page of paginator) {
        void _page;
      }

      assert.equal(calls[1].path, '/items?page=2&per_page=5');
    });

    it('handles absolute next links', async () => {
      const {client, calls} = createMockClient([
        {
          status: 200,
          headers: new Headers({
            link: '<https://api.example.com/items?page=2&per_page=5>; rel="next"'
          }),
          body: [{id: 1}],
          url: 'https://api.example.com/items?page=1&per_page=5'
        },
        {
          status: 200,
          headers: {},
          body: [{id: 2}],
          url: 'https://api.example.com/items?page=2&per_page=5'
        }
      ]);

      const paginator = createPaginator(client, '/items', {perPage: 5});

      for await (const _page of paginator) {
        void _page;
      }

      assert.equal(calls[1].path, '/items?page=2&per_page=5');
    });

    it('normalizes cross-origin absolute next links to pathname+search (same-origin confinement)', async () => {
      const {client, calls} = createMockClient([
        {
          status: 200,
          headers: new Headers({
            link: '<https://other.example/items?page=2&per_page=5>; rel="next"'
          }),
          body: [{id: 1}],
          url: 'https://api.example.com/items?page=1&per_page=5'
        },
        {
          status: 200,
          headers: {},
          body: [{id: 2}],
          url: 'https://api.example.com/items?page=2&per_page=5'
        }
      ]);

      const paginator = createPaginator(client, '/items', {perPage: 5});
      const pages = [];

      for await (const page of paginator) {
        pages.push(page);
      }

      assert.equal(pages.length, 2);
      assert.equal(calls[1].path, '/items?page=2&per_page=5');
    });

    it('falls back to relative href directly when URL construction fails', async () => {
      const calls = [];
      let callIndex = 0;
      const responses = [
        {
          status: 200,
          headers: new Headers({link: '</items?page=2>; rel="next"'}),
          body: [{id: 1}]
        },
        {
          status: 200,
          headers: {},
          body: [{id: 2}]
        }
      ];

      const client = Object.create(null);
      client.get = mock.fn(function get(path, options) {
        calls.push({path, options});
        const resp = responses[callIndex++];
        const headers = resp.headers instanceof Headers ? resp.headers : new Headers(resp.headers);
        const raw = Object.create(null);
        return Promise.resolve(
          Object.freeze({status: resp.status, headers, body: resp.body, raw: Object.freeze(raw)})
        );
      });

      const paginator = createPaginator(client, '/items');
      const pages = [];

      for await (const page of paginator) {
        pages.push(page);
      }

      assert.equal(pages.length, 2);
      assert.equal(calls[1].path, '/items?page=2');
    });

    it('terminates gracefully when next href is non-absolute and non-relative', async () => {
      const calls = [];
      let callIndex = 0;
      const responses = [
        {
          status: 200,
          headers: new Headers({link: '<not-a-valid-url>; rel="next"'}),
          body: [{id: 1}]
        }
      ];

      const client = Object.create(null);
      client.get = mock.fn(function get(path, options) {
        calls.push({path, options});
        const resp = responses[callIndex++];
        const headers = resp.headers instanceof Headers ? resp.headers : new Headers(resp.headers);
        const raw = Object.create(null);
        return Promise.resolve(
          Object.freeze({status: resp.status, headers, body: resp.body, raw: Object.freeze(raw)})
        );
      });

      const paginator = createPaginator(client, '/items');
      const pages = [];

      for await (const page of paginator) {
        pages.push(page);
      }

      assert.equal(pages.length, 1);
      assert.equal(pages[0].done, true);
      assert.equal(client.get.mock.callCount(), 1);
    });

    it('rejects backslash in next links', async () => {
      const calls = [];
      let callIndex = 0;
      const responses = [
        {
          status: 200,
          headers: new Headers({link: '</\\evil.com/items?page=2>; rel="next"'}),
          body: [{id: 1}]
        }
      ];

      const client = Object.create(null);
      client.get = mock.fn(function get(path, options) {
        calls.push({path, options});
        const resp = responses[callIndex++];
        const headers = resp.headers instanceof Headers ? resp.headers : new Headers(resp.headers);
        const raw = Object.create(null);
        return Promise.resolve(
          Object.freeze({status: resp.status, headers, body: resp.body, raw: Object.freeze(raw)})
        );
      });

      const paginator = createPaginator(client, '/items');
      const pages = [];

      for await (const page of paginator) {
        pages.push(page);
      }

      assert.equal(pages.length, 1);
      assert.equal(pages[0].done, true);
      assert.equal(client.get.mock.callCount(), 1);
    });

    it('rejects control characters in next links', async () => {
      const calls = [];
      let callIndex = 0;
      const responses = [
        {
          status: 200,
          headers: new Headers({link: '</\t/evil.com/items>; rel="next"'}),
          body: [{id: 1}]
        }
      ];

      const client = Object.create(null);
      client.get = mock.fn(function get(path, options) {
        calls.push({path, options});
        const resp = responses[callIndex++];
        const headers = resp.headers instanceof Headers ? resp.headers : new Headers(resp.headers);
        const raw = Object.create(null);
        return Promise.resolve(
          Object.freeze({status: resp.status, headers, body: resp.body, raw: Object.freeze(raw)})
        );
      });

      const paginator = createPaginator(client, '/items');
      const pages = [];

      for await (const page of paginator) {
        pages.push(page);
      }

      assert.equal(pages.length, 1);
      assert.equal(pages[0].done, true);
      assert.equal(client.get.mock.callCount(), 1);
    });

    it('rejects network-path references (//host/path) in next links', async () => {
      const calls = [];
      let callIndex = 0;
      const responses = [
        {
          status: 200,
          headers: new Headers({link: '<//evil.com/items?page=2>; rel="next"'}),
          body: [{id: 1}]
        }
      ];

      const client = Object.create(null);
      client.get = mock.fn(function get(path, options) {
        calls.push({path, options});
        const resp = responses[callIndex++];
        const headers = resp.headers instanceof Headers ? resp.headers : new Headers(resp.headers);
        const raw = Object.create(null);
        return Promise.resolve(
          Object.freeze({status: resp.status, headers, body: resp.body, raw: Object.freeze(raw)})
        );
      });

      const paginator = createPaginator(client, '/items');
      const pages = [];

      for await (const page of paginator) {
        pages.push(page);
      }

      assert.equal(pages.length, 1);
      assert.equal(pages[0].done, true);
      assert.equal(client.get.mock.callCount(), 1);
    });
  });

  describe('iterator reusability', () => {
    it('does not fetch until the consumer advances the iterator', async () => {
      const {client} = createMockClient([
        {status: 200, headers: {}, body: [{id: 1}]},
        {status: 200, headers: {}, body: [{id: 2}]}
      ]);

      const paginator = createPaginator(client, '/items');
      const iterator = paginator[Symbol.asyncIterator]();

      assert.equal(client.get.mock.callCount(), 0);

      await iterator.next();

      assert.equal(client.get.mock.callCount(), 1);
    });

    it('produces independent iterators on multiple calls to Symbol.asyncIterator', async () => {
      const {client} = createMockClient([
        {status: 200, headers: {}, body: [{id: 1}]},
        {status: 200, headers: {}, body: [{id: 1}]}
      ]);

      const paginator = createPaginator(client, '/items');

      const pages1 = [];
      for await (const page of paginator) {
        pages1.push(page);
      }

      const pages2 = [];
      for await (const page of paginator) {
        pages2.push(page);
      }

      assert.equal(pages1.length, 1);
      assert.equal(pages2.length, 1);
      assert.equal(client.get.mock.callCount(), 2);
    });

    it('isolates query state across iterators when client mutates options.query', async () => {
      let callIndex = 0;
      const querySnapshots = [];
      const responses = [
        {status: 200, headers: {}, body: [{id: 1}]},
        {status: 200, headers: {}, body: [{id: 1}]}
      ];

      const client = Object.create(null);
      client.get = mock.fn(function get(path, options) {
        querySnapshots.push({...options.query});
        if (options.query) options.query.mutated = true;
        const resp = responses[callIndex++];
        const headers = resp.headers instanceof Headers ? resp.headers : new Headers(resp.headers);
        const raw = Object.create(null);
        raw.url = `https://api.example.com${path}`;
        return Promise.resolve(
          Object.freeze({status: resp.status, headers, body: resp.body, raw: Object.freeze(raw)})
        );
      });

      const paginator = createPaginator(client, '/items');

      for await (const _page of paginator) {
        void _page;
      }

      for await (const _page of paginator) {
        void _page;
      }

      assert.equal(querySnapshots[0].mutated, undefined);
      assert.equal(querySnapshots[1].mutated, undefined);
    });
  });

  describe('for await...of break', () => {
    it('stops fetching when consumer breaks out of loop', async () => {
      const {client} = createMockClient([
        {
          status: 200,
          headers: new Headers({link: '</items?page=2>; rel="next"'}),
          body: [{id: 1}],
          url: 'https://api.example.com/items?page=1'
        },
        {
          status: 200,
          headers: new Headers({link: '</items?page=3>; rel="next"'}),
          body: [{id: 2}],
          url: 'https://api.example.com/items?page=2'
        },
        {
          status: 200,
          headers: {},
          body: [{id: 3}],
          url: 'https://api.example.com/items?page=3'
        }
      ]);

      const paginator = createPaginator(client, '/items');
      const pages = [];

      for await (const page of paginator) {
        pages.push(page);
        if (pages.length === 1) break;
      }

      assert.equal(pages.length, 1);
      assert.equal(client.get.mock.callCount(), 1);
    });
  });
});
