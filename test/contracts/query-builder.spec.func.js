/**
 * @fileoverview Contract tests for query builder output against a real ergo-router server.
 * @module test/contracts/query-builder.spec
 */

import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';

import {createClient, createQueryBuilder} from '../../index.js';
import {createTestServer} from '../fixtures/server.js';
import {startServer} from '../helpers/setup-server.js';

describe('[Contract] Query Builder — Server-Side Parameter Validation', () => {
  let baseUrl, close;

  before(async () => {
    const server = createTestServer();
    ({baseUrl, close} = await startServer(server.handle()));
  });

  after(() => close());

  it('server receives fields, include, filter, sort, and page params', async () => {
    const client = createClient({baseUrl, retry: false});
    const query = createQueryBuilder()
      .fields('articles', ['title', 'body'])
      .include(['author'])
      .filter({published: true})
      .sort(['-createdAt'])
      .page({number: 1, size: 10});

    const res = await client.get('/jsonapi', {query});

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.query.fields.articles, ['title', 'body']);
    assert.deepEqual(res.body.query.include, ['author']);
    assert.equal(res.body.query.filter.published, 'true');
    assert.deepEqual(res.body.query.sort, ['-createdAt']);
    assert.equal(res.body.query.page.number, '1');
    assert.equal(res.body.query.page.size, '10');
  });

  it('query() convenience method produces valid request', async () => {
    const client = createClient({baseUrl, retry: false});
    const query = client
      .query('/jsonapi')
      .fields('users', ['name', 'email'])
      .page({offset: 0, limit: 20});

    const res = await query.fetch(client);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.query.fields.users, ['name', 'email']);
    assert.equal(res.body.query.page.offset, 0);
    assert.equal(res.body.query.page.limit, '20');
  });

  it('custom parameter arrives at server', async () => {
    const client = createClient({baseUrl, retry: false});
    const query = createQueryBuilder().filter({status: 'active'}).param('camelCase', 'value');

    const res = await client.get('/jsonapi', {query});

    assert.equal(res.status, 200);
    assert.equal(res.body.query.filter.status, 'active');
    assert.equal(res.body.query.camelCase, 'value');
  });

  it('multiple field types arrive correctly', async () => {
    const client = createClient({baseUrl, retry: false});
    const query = createQueryBuilder()
      .fields('articles', ['title', 'body', 'createdAt'])
      .fields('authors', ['name', 'avatar']);

    const res = await client.get('/jsonapi', {query});

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.query.fields.articles, ['title', 'body', 'createdAt']);
    assert.deepEqual(res.body.query.fields.authors, ['name', 'avatar']);
  });

  it('empty builder produces no query parameters', async () => {
    const client = createClient({baseUrl, retry: false});
    const query = createQueryBuilder();

    const res = await client.get('/jsonapi', {query});

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.query, {});
  });
});
