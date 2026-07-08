/**
 * @fileoverview Contract tests for offset-based pagination against a real ergo-router server.
 * @module test/contracts/pagination-offset.spec
 */

import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';

import {createClient} from '../../index.js';
import {createTestServer} from '../fixtures/server.js';
import {startServer} from '../helpers/setup-server.js';

describe('[Contract] Pagination — Offset Strategy', () => {
  let baseUrl, close;

  before(async () => {
    const server = createTestServer();
    ({baseUrl, close} = await startServer(server.handle()));
  });

  after(() => close());

  it('traverses all pages and terminates on last page', async () => {
    const client = createClient({baseUrl, retry: false});
    const pages = [];

    for await (const page of client.paginate('/paginated', {perPage: 10})) {
      pages.push(page);
    }

    assert.equal(pages.length, 3);
    assert.equal(pages[0].data.length, 10);
    assert.equal(pages[1].data.length, 10);
    assert.equal(pages[2].data.length, 5);
    assert.equal(pages[0].done, false);
    assert.equal(pages[1].done, false);
    assert.equal(pages[2].done, true);
  });

  it('reports total from X-Total-Count header', async () => {
    const client = createClient({baseUrl, retry: false});

    for await (const page of client.paginate('/paginated', {perPage: 10})) {
      assert.equal(page.meta.total, 25);
      break;
    }
  });

  it('tracks page numbers in meta', async () => {
    const client = createClient({baseUrl, retry: false});
    const pageNumbers = [];

    for await (const page of client.paginate('/paginated', {perPage: 10})) {
      pageNumbers.push(page.meta.page);
    }

    assert.deepEqual(pageNumbers, [1, 2, 3]);
  });

  it('paginateAll collects all items into a flattened array', async () => {
    const client = createClient({baseUrl, retry: false});
    const items = await client.paginateAll('/paginated', {perPage: 10});

    assert.equal(items.length, 25);
    assert.equal(items[0].id, 1);
    assert.equal(items[24].id, 25);
  });

  it('maxPages limits traversal', async () => {
    const client = createClient({baseUrl, retry: false});
    const pages = [];

    for await (const page of client.paginate('/paginated', {perPage: 10, maxPages: 2})) {
      pages.push(page);
    }

    assert.equal(pages.length, 2);
    assert.equal(pages[1].done, true);
  });

  it('single-page collection terminates immediately', async () => {
    const client = createClient({baseUrl, retry: false});
    const pages = [];

    for await (const page of client.paginate('/paginated', {perPage: 25})) {
      pages.push(page);
    }

    assert.equal(pages.length, 1);
    assert.equal(pages[0].done, true);
    assert.equal(pages[0].data.length, 25);
  });

  it('preserves item ordering across pages', async () => {
    const client = createClient({baseUrl, retry: false});
    const allIds = [];

    for await (const page of client.paginate('/paginated', {perPage: 10})) {
      for (const item of page.data) {
        allIds.push(item.id);
      }
    }

    const expected = Array.from({length: 25}, (_, i) => i + 1);
    assert.deepEqual(allIds, expected);
  });
});
