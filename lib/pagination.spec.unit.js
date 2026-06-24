/**
 * @fileoverview Boundary tests for the pagination async iterator.
 * @module @centralping/ergo-fetch/lib/pagination.spec
 */

import {describe, it, mock} from 'node:test';
import assert from 'node:assert/strict';

import {createPaginator} from './pagination.js';

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

    it('throws TypeError when path does not start with /', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, 'items'), {
        name: 'TypeError',
        message: 'path must start with /'
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
        message: 'options.query must be a plain object'
      });
    });

    it('throws TypeError when options.query is an array', () => {
      const {client} = createMockClient([]);

      assert.throws(() => createPaginator(client, '/items', {query: []}), {
        name: 'TypeError',
        message: 'options.query must be a plain object'
      });
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
      assert.equal(calls[0].options.query.perPage, 10);
    });

    it('uses default page=1 and perPage=20', async () => {
      const {client, calls} = createMockClient([{status: 200, headers: {}, body: []}]);

      const paginator = createPaginator(client, '/items');

      for await (const _page of paginator) {
        void _page;
      }

      assert.equal(calls[0].options.query.page, 1);
      assert.equal(calls[0].options.query.perPage, 20);
    });

    it('follows rel="next" Link header for subsequent pages', async () => {
      const {client, calls} = createMockClient([
        {
          status: 200,
          headers: new Headers({link: '</items?page=2&perPage=5>; rel="next"'}),
          body: [{id: 1}],
          url: 'https://api.example.com/items?page=1&perPage=5'
        },
        {
          status: 200,
          headers: {},
          body: [{id: 2}],
          url: 'https://api.example.com/items?page=2&perPage=5'
        }
      ]);

      const paginator = createPaginator(client, '/items', {perPage: 5});
      const pages = [];

      for await (const page of paginator) {
        pages.push(page);
      }

      assert.equal(pages.length, 2);
      assert.equal(calls[1].path, '/items?page=2&perPage=5');
      assert.equal(calls[1].options.query, undefined);
    });

    it('terminates when no rel="next" link is present', async () => {
      const {client} = createMockClient([
        {
          status: 200,
          headers: new Headers({link: '</items?page=1&perPage=5>; rel="prev"'}),
          body: [{id: 3}],
          url: 'https://api.example.com/items?page=2&perPage=5'
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
            link: '</items?page=2&perPage=2>; rel="next"',
            'x-total-count': '5'
          }),
          body: [{id: 1}, {id: 2}],
          url: 'https://api.example.com/items?page=1&perPage=2'
        },
        {
          status: 200,
          headers: new Headers({
            link: '</items?page=3&perPage=2>; rel="next"',
            'x-total-count': '5'
          }),
          body: [{id: 3}, {id: 4}],
          url: 'https://api.example.com/items?page=2&perPage=2'
        },
        {
          status: 200,
          headers: new Headers({'x-total-count': '5'}),
          body: [{id: 5}],
          url: 'https://api.example.com/items?page=3&perPage=2'
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
      assert.equal(calls[0].options.query.perPage, 10);
      assert.equal(calls[0].options.query.status, 'active');
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
  });

  describe('maxPages', () => {
    it('stops after maxPages even when more pages are available', async () => {
      const {client} = createMockClient([
        {
          status: 200,
          headers: new Headers({link: '</items?page=2&perPage=5>; rel="next"'}),
          body: [{id: 1}],
          url: 'https://api.example.com/items?page=1&perPage=5'
        },
        {
          status: 200,
          headers: new Headers({link: '</items?page=3&perPage=5>; rel="next"'}),
          body: [{id: 2}],
          url: 'https://api.example.com/items?page=2&perPage=5'
        },
        {
          status: 200,
          headers: new Headers({link: '</items?page=4&perPage=5>; rel="next"'}),
          body: [{id: 3}],
          url: 'https://api.example.com/items?page=3&perPage=5'
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
      const {client, calls} = createMockClient([{status: 200, headers: {}, body: [{id: 1}]}]);

      const paginator = createPaginator(client, '/items', {signal: controller.signal});

      for await (const _page of paginator) {
        void _page;
      }

      assert.equal(calls[0].options.signal, controller.signal);
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
          headers: new Headers({link: '</items?page=2&perPage=5>; rel="next"'}),
          body: [{id: 1}],
          url: 'https://api.example.com/items?page=1&perPage=5'
        },
        {
          status: 200,
          headers: {},
          body: [{id: 2}],
          url: 'https://api.example.com/items?page=2&perPage=5'
        }
      ]);

      const paginator = createPaginator(client, '/items', {perPage: 5});

      for await (const _page of paginator) {
        void _page;
      }

      assert.equal(calls[1].path, '/items?page=2&perPage=5');
    });

    it('handles absolute next links', async () => {
      const {client, calls} = createMockClient([
        {
          status: 200,
          headers: new Headers({
            link: '<https://api.example.com/items?page=2&perPage=5>; rel="next"'
          }),
          body: [{id: 1}],
          url: 'https://api.example.com/items?page=1&perPage=5'
        },
        {
          status: 200,
          headers: {},
          body: [{id: 2}],
          url: 'https://api.example.com/items?page=2&perPage=5'
        }
      ]);

      const paginator = createPaginator(client, '/items', {perPage: 5});

      for await (const _page of paginator) {
        void _page;
      }

      assert.equal(calls[1].path, '/items?page=2&perPage=5');
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
