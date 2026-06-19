/**
 * @fileoverview Contract tests for conditional request interceptor against a real ergo-router server.
 * @module test/contracts/conditional.spec
 */

import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';

import {createClient} from '../../index.js';
import {createTestServer} from '../fixtures/server.js';
import {startServer} from '../helpers/setup-server.js';

describe('[Contract] Conditional Requests — ETag / Last-Modified', () => {
  let baseUrl, close, client;

  before(async () => {
    const server = createTestServer();
    ({baseUrl, close} = await startServer(server.handle()));
    client = createClient({baseUrl, retry: false});
  });

  after(() => close());

  it('first GET /resource returns full body with ETag and Last-Modified', async () => {
    const res = await client.get('/resource');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {id: 1, name: 'Test Resource', version: 1});
    assert.ok(res.headers.get('etag'), 'ETag header should be present');
    assert.ok(res.headers.get('last-modified'), 'Last-Modified header should be present');
  });

  it('second GET /resource returns cached body transparently on 304', async () => {
    const freshClient = createClient({baseUrl, retry: false});

    const first = await freshClient.get('/resource');
    assert.equal(first.status, 200);

    const second = await freshClient.get('/resource');

    assert.equal(second.status, 304);
    assert.deepEqual(second.body, first.body);
  });

  it('PUT /resource with matching If-Match succeeds', async () => {
    await client.get('/resource');

    const res = await client.put('/resource', {
      body: {name: 'Updated Resource'}
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Updated Resource');
    assert.ok(res.headers.get('etag'), 'Updated ETag should be present');
  });

  it('PUT /resource with stale If-Match returns 412', async () => {
    const writerA = createClient({baseUrl, retry: false});
    const writerB = createClient({baseUrl, retry: false});

    await writerA.get('/resource');
    await writerB.get('/resource');

    await writerA.put('/resource', {body: {name: 'Writer A Update'}});

    await assert.rejects(() => writerB.put('/resource', {body: {name: 'Writer B Stale'}}), {
      name: 'ProblemDetailsError',
      status: 412,
      detail: 'ETag mismatch'
    });
  });
});
