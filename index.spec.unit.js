/**
 * @fileoverview Public API surface tests for the barrel entry point.
 * @module @centralping/ergo-fetch/index.spec
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import * as api from './index.js';

describe('@centralping/ergo-fetch public exports', () => {
  const expectedExports = [
    'createClient',
    'ProblemDetailsError',
    'isProblemResponse',
    'parseProblemDetails',
    'isRetryable',
    'isValidation',
    'isAuth',
    'createMemoryStore',
    'createWebStorageStore',
    'createRequestIdInterceptor',
    'createPreferInterceptor',
    'createCsrfInterceptor',
    'createConditionalInterceptor',
    'createRateLimitInterceptor',
    'parseRetryAfter',
    'createRetryInterceptor',
    'parseMediaType',
    'isJsonMediaType',
    'createIdempotencyInterceptor',
    'parseLinkHeader',
    'createPaginator',
    'createQueryBuilder',
    'isQueryBuilder'
  ];

  for (const name of expectedExports) {
    it(`exports ${name}`, () => {
      assert.notEqual(api[name], undefined, `${name} should be exported`);
    });
  }

  it('does not export unexpected symbols', () => {
    const actual = Object.keys(api).sort();
    const expected = [...expectedExports].sort();

    assert.deepStrictEqual(actual, expected);
  });
});
