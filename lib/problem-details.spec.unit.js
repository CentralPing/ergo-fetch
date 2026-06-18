/**
 * @fileoverview Boundary tests for RFC 9457 Problem Details module.
 * @module @centralping/ergo-fetch/lib/problem-details.spec
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
  ProblemDetailsError,
  isProblemResponse,
  parseProblemDetails,
  isRetryable,
  isValidation,
  isAuth
} from './problem-details.js';

/**
 * Creates a minimal mock Response for testing.
 *
 * @param {object} options - Response options.
 * @param {number} [options.status] - HTTP status code.
 * @param {string} [options.statusText] - HTTP status text.
 * @param {object} [options.headers] - Response headers.
 * @param {*} [options.body] - Response body (will be JSON-serialized).
 * @returns {Response} - Mock Response object.
 */
function mockResponse({status = 200, statusText = 'OK', headers = {}, body = null} = {}) {
  const responseHeaders = new Headers(headers);
  return new Response(body != null ? JSON.stringify(body) : null, {
    status,
    statusText,
    headers: responseHeaders
  });
}

describe('ProblemDetailsError', () => {
  it('constructs with all standard fields', () => {
    const err = new ProblemDetailsError({
      type: 'https://example.com/not-found',
      title: 'Not Found',
      status: 404,
      detail: 'The resource was not found.',
      instance: 'urn:uuid:abc-123'
    });

    assert.equal(err.name, 'ProblemDetailsError');
    assert.equal(err.type, 'https://example.com/not-found');
    assert.equal(err.title, 'Not Found');
    assert.equal(err.status, 404);
    assert.equal(err.detail, 'The resource was not found.');
    assert.equal(err.instance, 'urn:uuid:abc-123');
    assert.equal(err.extensions, undefined);
  });

  it('is an instance of Error', () => {
    const err = new ProblemDetailsError({title: 'Test'});
    assert.equal(err instanceof Error, true);
  });

  it('uses title as the error message', () => {
    const err = new ProblemDetailsError({title: 'Bad Request'});
    assert.equal(err.message, 'Bad Request');
  });

  it('falls back to detail when title is absent', () => {
    const err = new ProblemDetailsError({detail: 'Something went wrong'});
    assert.equal(err.message, 'Something went wrong');
  });

  it('uses default message when both title and detail are absent', () => {
    const err = new ProblemDetailsError({status: 500});
    assert.equal(err.message, 'Problem Details Error');
  });

  it('sets undefined for absent standard fields', () => {
    const err = new ProblemDetailsError({});
    assert.equal(err.type, undefined);
    assert.equal(err.title, undefined);
    assert.equal(err.status, undefined);
    assert.equal(err.detail, undefined);
    assert.equal(err.instance, undefined);
    assert.equal(err.extensions, undefined);
  });

  it('extracts extension members into a null-prototype object', () => {
    const err = new ProblemDetailsError({
      type: 'https://example.com/validation',
      title: 'Validation Error',
      status: 422,
      errors: [{field: 'name', message: 'required'}],
      traceId: 'abc-123'
    });

    assert.notEqual(err.extensions, undefined);
    assert.equal(Object.getPrototypeOf(err.extensions), null);
    assert.deepStrictEqual(err.extensions.errors, [{field: 'name', message: 'required'}]);
    assert.equal(err.extensions.traceId, 'abc-123');
  });

  it('does not treat standard fields as extensions', () => {
    const err = new ProblemDetailsError({
      type: 'about:blank',
      title: 'Error',
      status: 400,
      detail: 'Bad input',
      instance: '/requests/123'
    });

    assert.equal(err.extensions, undefined);
  });

  it('has a stack trace', () => {
    const err = new ProblemDetailsError({title: 'Test'});
    assert.equal(typeof err.stack, 'string');
    assert.ok(err.stack.includes('ProblemDetailsError'));
  });
});

describe('isProblemResponse', () => {
  it('returns true for application/problem+json', () => {
    const res = mockResponse({
      headers: {'content-type': 'application/problem+json'}
    });
    assert.equal(isProblemResponse(res), true);
  });

  it('returns true for application/problem+json with charset parameter', () => {
    const res = mockResponse({
      headers: {'content-type': 'application/problem+json; charset=utf-8'}
    });
    assert.equal(isProblemResponse(res), true);
  });

  it('returns true for uppercase content-type', () => {
    const res = mockResponse({
      headers: {'content-type': 'Application/Problem+JSON'}
    });
    assert.equal(isProblemResponse(res), true);
  });

  it('returns true for mixed-case content-type', () => {
    const res = mockResponse({
      headers: {'content-type': 'APPLICATION/PROBLEM+JSON; charset=UTF-8'}
    });
    assert.equal(isProblemResponse(res), true);
  });

  it('returns false for application/json', () => {
    const res = mockResponse({
      headers: {'content-type': 'application/json'}
    });
    assert.equal(isProblemResponse(res), false);
  });

  it('returns false for text/plain', () => {
    const res = mockResponse({
      headers: {'content-type': 'text/plain'}
    });
    assert.equal(isProblemResponse(res), false);
  });

  it('returns false when content-type is absent', () => {
    const res = mockResponse({headers: {}});
    assert.equal(isProblemResponse(res), false);
  });

  it('returns false for empty content-type', () => {
    const res = mockResponse({
      headers: {'content-type': ''}
    });
    assert.equal(isProblemResponse(res), false);
  });

  it('returns false for partial match', () => {
    const res = mockResponse({
      headers: {'content-type': 'application/problem'}
    });
    assert.equal(isProblemResponse(res), false);
  });
});

describe('parseProblemDetails', () => {
  it('parses a full Problem Details body', async () => {
    const res = mockResponse({
      status: 404,
      statusText: 'Not Found',
      headers: {'content-type': 'application/problem+json'},
      body: {
        type: 'https://example.com/not-found',
        title: 'Not Found',
        status: 404,
        detail: 'User 42 does not exist.',
        instance: '/users/42'
      }
    });

    const err = await parseProblemDetails(res);
    assert.equal(err instanceof ProblemDetailsError, true);
    assert.equal(err.type, 'https://example.com/not-found');
    assert.equal(err.title, 'Not Found');
    assert.equal(err.status, 404);
    assert.equal(err.detail, 'User 42 does not exist.');
    assert.equal(err.instance, '/users/42');
  });

  it('parses extension members', async () => {
    const res = mockResponse({
      status: 422,
      headers: {'content-type': 'application/problem+json'},
      body: {
        type: 'https://example.com/validation',
        title: 'Validation Error',
        status: 422,
        errors: [{field: 'email', message: 'invalid format'}]
      }
    });

    const err = await parseProblemDetails(res);
    assert.notEqual(err.extensions, undefined);
    assert.deepStrictEqual(err.extensions.errors, [{field: 'email', message: 'invalid format'}]);
  });

  it('falls back to response.status when body lacks status', async () => {
    const res = mockResponse({
      status: 503,
      statusText: 'Service Unavailable',
      headers: {'content-type': 'application/problem+json'},
      body: {title: 'Temporarily unavailable'}
    });

    const err = await parseProblemDetails(res);
    assert.equal(err.status, 503);
  });

  it('prefers body status over response status', async () => {
    const res = mockResponse({
      status: 500,
      headers: {'content-type': 'application/problem+json'},
      body: {status: 503, title: 'Service Unavailable'}
    });

    const err = await parseProblemDetails(res);
    assert.equal(err.status, 503);
  });

  it('handles unparseable JSON body gracefully', async () => {
    const responseHeaders = new Headers({'content-type': 'application/problem+json'});
    const res = new Response('not valid json', {
      status: 500,
      statusText: 'Internal Server Error',
      headers: responseHeaders
    });

    const err = await parseProblemDetails(res);
    assert.equal(err instanceof ProblemDetailsError, true);
    assert.equal(err.status, 500);
    assert.equal(err.title, 'Internal Server Error');
  });

  it('handles empty body gracefully', async () => {
    const res = new Response(null, {
      status: 502,
      statusText: 'Bad Gateway',
      headers: new Headers({'content-type': 'application/problem+json'})
    });

    const err = await parseProblemDetails(res);
    assert.equal(err instanceof ProblemDetailsError, true);
    assert.equal(err.status, 502);
  });

  it('handles minimal body (only status)', async () => {
    const res = mockResponse({
      status: 429,
      headers: {'content-type': 'application/problem+json'},
      body: {status: 429}
    });

    const err = await parseProblemDetails(res);
    assert.equal(err.status, 429);
    assert.equal(err.type, undefined);
    assert.equal(err.title, undefined);
    assert.equal(err.detail, undefined);
    assert.equal(err.instance, undefined);
  });
});

describe('isRetryable', () => {
  it('returns true for 429 Too Many Requests', () => {
    const err = new ProblemDetailsError({status: 429, title: 'Too Many Requests'});
    assert.equal(isRetryable(err), true);
  });

  it('returns true for 500 Internal Server Error', () => {
    const err = new ProblemDetailsError({status: 500, title: 'Internal Server Error'});
    assert.equal(isRetryable(err), true);
  });

  it('returns true for 502 Bad Gateway', () => {
    const err = new ProblemDetailsError({status: 502, title: 'Bad Gateway'});
    assert.equal(isRetryable(err), true);
  });

  it('returns true for 503 Service Unavailable', () => {
    const err = new ProblemDetailsError({status: 503, title: 'Service Unavailable'});
    assert.equal(isRetryable(err), true);
  });

  it('returns true for 504 Gateway Timeout', () => {
    const err = new ProblemDetailsError({status: 504, title: 'Gateway Timeout'});
    assert.equal(isRetryable(err), true);
  });

  it('returns false for 400 Bad Request', () => {
    const err = new ProblemDetailsError({status: 400, title: 'Bad Request'});
    assert.equal(isRetryable(err), false);
  });

  it('returns false for 401 Unauthorized', () => {
    const err = new ProblemDetailsError({status: 401, title: 'Unauthorized'});
    assert.equal(isRetryable(err), false);
  });

  it('returns false for 404 Not Found', () => {
    const err = new ProblemDetailsError({status: 404, title: 'Not Found'});
    assert.equal(isRetryable(err), false);
  });

  it('returns true for network errors (TypeError)', () => {
    const err = new TypeError('Failed to fetch');
    assert.equal(isRetryable(err), true);
  });

  it('returns false for generic errors', () => {
    const err = new Error('something broke');
    assert.equal(isRetryable(err), false);
  });

  it('returns false for non-Error objects', () => {
    assert.equal(isRetryable({status: 429}), false);
  });
});

describe('isValidation', () => {
  it('returns true for 400 Bad Request', () => {
    const err = new ProblemDetailsError({status: 400, title: 'Bad Request'});
    assert.equal(isValidation(err), true);
  });

  it('returns true for 422 Unprocessable Entity', () => {
    const err = new ProblemDetailsError({status: 422, title: 'Unprocessable Entity'});
    assert.equal(isValidation(err), true);
  });

  it('returns false for 404 Not Found', () => {
    const err = new ProblemDetailsError({status: 404, title: 'Not Found'});
    assert.equal(isValidation(err), false);
  });

  it('returns false for 500 Internal Server Error', () => {
    const err = new ProblemDetailsError({status: 500, title: 'Internal Server Error'});
    assert.equal(isValidation(err), false);
  });

  it('returns false for generic errors', () => {
    const err = new Error('validation failed');
    assert.equal(isValidation(err), false);
  });

  it('returns false for TypeError', () => {
    const err = new TypeError('cannot read property');
    assert.equal(isValidation(err), false);
  });

  it('returns false for non-Error objects', () => {
    assert.equal(isValidation({status: 400}), false);
  });
});

describe('isAuth', () => {
  it('returns true for 401 Unauthorized', () => {
    const err = new ProblemDetailsError({status: 401, title: 'Unauthorized'});
    assert.equal(isAuth(err), true);
  });

  it('returns true for 403 Forbidden', () => {
    const err = new ProblemDetailsError({status: 403, title: 'Forbidden'});
    assert.equal(isAuth(err), true);
  });

  it('returns false for 400 Bad Request', () => {
    const err = new ProblemDetailsError({status: 400, title: 'Bad Request'});
    assert.equal(isAuth(err), false);
  });

  it('returns false for 404 Not Found', () => {
    const err = new ProblemDetailsError({status: 404, title: 'Not Found'});
    assert.equal(isAuth(err), false);
  });

  it('returns false for 500 Internal Server Error', () => {
    const err = new ProblemDetailsError({status: 500, title: 'Internal Server Error'});
    assert.equal(isAuth(err), false);
  });

  it('returns false for generic errors', () => {
    const err = new Error('unauthorized');
    assert.equal(isAuth(err), false);
  });

  it('returns false for TypeError', () => {
    const err = new TypeError('auth failed');
    assert.equal(isAuth(err), false);
  });

  it('returns false for non-Error objects', () => {
    assert.equal(isAuth({status: 401}), false);
  });
});
