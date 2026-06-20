/**
 * @fileoverview Contract tests for CSRF interceptor against a real ergo-router server.
 * @module test/contracts/csrf.spec
 */

import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';

import {createClient} from '../../index.js';
import {createTestServer} from '../fixtures/server.js';
import {startServer} from '../helpers/setup-server.js';

describe('[Contract] CSRF Token Lifecycle', () => {
  let baseUrl, close;

  before(async () => {
    const server = createTestServer();
    ({baseUrl, close} = await startServer(server.handle()));
  });

  after(() => close());

  it('POST without CSRF token returns 403', async () => {
    const client = createClient({baseUrl, retry: false, csrf: false});

    await assert.rejects(() => client.post('/csrf-protected', {body: {data: 'test'}}), {
      name: 'ProblemDetailsError',
      status: 403,
      detail: 'Invalid or missing CSRF token'
    });
  });

  it('GET /csrf-token extracts token from Set-Cookie, POST succeeds with it', async () => {
    const client = createClient({baseUrl, retry: false});

    await client.get('/csrf-token');

    const res = await client.post('/csrf-protected', {body: {data: 'test'}});

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it('CSRF token persists across multiple requests on the same client', async () => {
    const client = createClient({baseUrl, retry: false});

    await client.get('/csrf-token');

    const first = await client.post('/csrf-protected', {body: {first: true}});
    assert.equal(first.status, 200);

    const second = await client.post('/csrf-protected', {body: {second: true}});
    assert.equal(second.status, 200);
  });

  it('separate client instances have independent CSRF tokens', async () => {
    const clientA = createClient({baseUrl, retry: false});
    const clientB = createClient({baseUrl, retry: false});

    await clientA.get('/csrf-token');

    const resA = await clientA.post('/csrf-protected', {body: {}});
    assert.equal(resA.status, 200);

    await assert.rejects(() => clientB.post('/csrf-protected', {body: {}}), {
      name: 'ProblemDetailsError',
      status: 403,
      detail: 'Invalid or missing CSRF token'
    });
  });
});
