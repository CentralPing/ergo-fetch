/**
 * @fileoverview Contract tests for pagination retry when a page request returns 429.
 * @module test/contracts/pagination-retry.spec
 */

import {describe, it, before, after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {fetch} from 'undici';

import {createClient} from '../../index.js';
import {createTestServer} from '../fixtures/server.js';
import {startServer} from '../helpers/setup-server.js';

describe('[Contract] Pagination — Retry on 429', () => {
  let baseUrl, close;

  before(async () => {
    const server = createTestServer();
    ({baseUrl, close} = await startServer(server.handle()));
  });

  after(() => close());

  beforeEach(async () => {
    const res = await fetch(`${baseUrl}/paginated-rate-limited/reset`);
    assert.equal(res.status, 204);
  });

  it('retries a 429 mid-traversal and completes pagination', async () => {
    const client = createClient({
      baseUrl,
      retry: {maxAttempts: 3, baseDelay: 0, jitter: 'none'}
    });

    const pages = [];

    for await (const page of client.paginate('/paginated-rate-limited', {perPage: 10})) {
      pages.push(page);
    }

    assert.equal(pages.length, 3);
    assert.equal(pages[0].data.length, 10);
    assert.equal(pages[1].data.length, 10);
    assert.equal(pages[2].data.length, 5);
    assert.equal(pages[2].done, true);
  });

  it('collects all items via paginateAll after a mid-traversal 429', async () => {
    const client = createClient({
      baseUrl,
      retry: {maxAttempts: 3, baseDelay: 0, jitter: 'none'}
    });

    const items = await client.paginateAll('/paginated-rate-limited', {perPage: 10});

    assert.equal(items.length, 25);
    assert.equal(items[0].id, 1);
    assert.equal(items[24].id, 25);
  });
});
