/**
 * @fileoverview Contract tests for RFC 9457 Problem Details parsing through the full client pipeline.
 * @module test/contracts/problem-details.spec
 */

import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';

import {createClient, ProblemDetailsError, isRetryable, isValidation, isAuth} from '../../index.js';
import {createTestServer} from '../fixtures/server.js';
import {startServer} from '../helpers/setup-server.js';

describe('[Contract] Problem Details — RFC 9457', () => {
  let baseUrl, close, client;

  before(async () => {
    const server = createTestServer();
    ({baseUrl, close} = await startServer(server.handle()));
    client = createClient({baseUrl, retry: false});
  });

  after(() => close());

  it('throws ProblemDetailsError for 4xx with problem+json content-type', async () => {
    try {
      await client.get('/error/422');
      assert.fail('Expected ProblemDetailsError to be thrown');
    } catch (err) {
      assert.ok(err instanceof ProblemDetailsError);
      assert.equal(err.status, 422);
      assert.equal(err.title, 'Unprocessable Content');
      assert.equal(err.type, 'https://httpstatuses.com/422');
      assert.equal(err.detail, 'Synthetic 422 error for testing');
      assert.equal(err.instance, '/error/422');
      assert.equal(err.name, 'ProblemDetailsError');
    }
  });

  it('throws ProblemDetailsError for 5xx with problem+json content-type', async () => {
    try {
      await client.get('/error/500');
      assert.fail('Expected ProblemDetailsError to be thrown');
    } catch (err) {
      assert.ok(err instanceof ProblemDetailsError);
      assert.equal(err.status, 500);
      assert.equal(err.title, 'Internal Server Error');
    }
  });

  it('preserves the type URI from the problem body', async () => {
    try {
      await client.get('/error/404');
      assert.fail('Expected ProblemDetailsError to be thrown');
    } catch (err) {
      assert.ok(err instanceof ProblemDetailsError);
      assert.equal(err.type, 'https://httpstatuses.com/404');
    }
  });

  it('preserves the instance URI from the problem body', async () => {
    try {
      await client.get('/error/403');
      assert.fail('Expected ProblemDetailsError to be thrown');
    } catch (err) {
      assert.ok(err instanceof ProblemDetailsError);
      assert.equal(err.instance, '/error/403');
    }
  });

  describe('classifiers', () => {
    it('isRetryable returns true for 429', async () => {
      try {
        await client.get('/error/429');
        assert.fail('Expected ProblemDetailsError to be thrown');
      } catch (err) {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(isRetryable(err), true);
      }
    });

    it('isRetryable returns true for 503', async () => {
      try {
        await client.get('/error/503');
        assert.fail('Expected ProblemDetailsError to be thrown');
      } catch (err) {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(isRetryable(err), true);
      }
    });

    it('isRetryable returns false for 404', async () => {
      try {
        await client.get('/error/404');
        assert.fail('Expected ProblemDetailsError to be thrown');
      } catch (err) {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(isRetryable(err), false);
      }
    });

    it('isValidation returns true for 400', async () => {
      try {
        await client.get('/error/400');
        assert.fail('Expected ProblemDetailsError to be thrown');
      } catch (err) {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(isValidation(err), true);
      }
    });

    it('isValidation returns true for 422', async () => {
      try {
        await client.get('/error/422');
        assert.fail('Expected ProblemDetailsError to be thrown');
      } catch (err) {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(isValidation(err), true);
      }
    });

    it('isAuth returns true for 401', async () => {
      try {
        await client.get('/error/401');
        assert.fail('Expected ProblemDetailsError to be thrown');
      } catch (err) {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(isAuth(err), true);
      }
    });

    it('isAuth returns true for 403', async () => {
      try {
        await client.get('/error/403');
        assert.fail('Expected ProblemDetailsError to be thrown');
      } catch (err) {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(isAuth(err), true);
      }
    });

    it('isAuth returns false for 422', async () => {
      try {
        await client.get('/error/422');
        assert.fail('Expected ProblemDetailsError to be thrown');
      } catch (err) {
        assert.ok(err instanceof ProblemDetailsError);
        assert.equal(isAuth(err), false);
      }
    });
  });
});
