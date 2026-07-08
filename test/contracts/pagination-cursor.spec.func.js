/**
 * @fileoverview Contract tests for cursor-based pagination against a real ergo-router server.
 * @module test/contracts/pagination-cursor.spec
 */

import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';

import {createClient} from '../../index.js';
import {createTestServer} from '../fixtures/server.js';
import {startServer} from '../helpers/setup-server.js';

describe('[Contract] Pagination — Cursor Strategy', () => {
  let baseUrl, close;

  before(async () => {
    const server = createTestServer();
    ({baseUrl, close} = await startServer(server.handle()));
  });

  after(() => close());

  it('traverses all pages via cursor links and terminates', async () => {
    const client = createClient({baseUrl, retry: false});
    const pages = [];

    for await (const page of client.paginate('/paginated-cursor', {
      strategy: 'cursor',
      limit: 10
    })) {
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

  it('does not report total for cursor strategy', async () => {
    const client = createClient({baseUrl, retry: false});

    for await (const page of client.paginate('/paginated-cursor', {
      strategy: 'cursor',
      limit: 10
    })) {
      assert.equal(page.meta.total, undefined);
      break;
    }
  });

  it('paginateAll collects all items', async () => {
    const client = createClient({baseUrl, retry: false});
    const items = await client.paginateAll('/paginated-cursor', {strategy: 'cursor', limit: 10});

    assert.equal(items.length, 25);
    assert.equal(items[0].id, 1);
    assert.equal(items[24].id, 25);
  });

  it('terminates when no next cursor is provided', async () => {
    const client = createClient({baseUrl, retry: false});
    const pages = [];

    for await (const page of client.paginate('/paginated-cursor', {
      strategy: 'cursor',
      limit: 30
    })) {
      pages.push(page);
    }

    assert.equal(pages.length, 1);
    assert.equal(pages[0].done, true);
    assert.equal(pages[0].data.length, 25);
  });

  it('preserves item ordering across cursor pages', async () => {
    const client = createClient({baseUrl, retry: false});
    const allIds = [];

    for await (const page of client.paginate('/paginated-cursor', {
      strategy: 'cursor',
      limit: 7
    })) {
      for (const item of page.data) {
        allIds.push(item.id);
      }
    }

    const expected = Array.from({length: 25}, (_, i) => i + 1);
    assert.deepEqual(allIds, expected);
  });
});
