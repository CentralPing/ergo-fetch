/**
 * @fileoverview Boundary tests for the Prefer header interceptor.
 * @module @centralping/ergo-fetch/lib/prefer.spec
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {createPreferInterceptor} from './prefer.js';

/**
 * Creates a minimal mock request context.
 *
 * @param {object} [overrides] - Properties to override on the context.
 * @returns {object} - Mock context object.
 */
function createMockCtx(overrides = {}) {
  return {
    method: 'GET',
    url: 'https://api.example.com/resource',
    headers: new Headers(),
    baseUrl: 'https://api.example.com',
    ...overrides
  };
}

describe('createPreferInterceptor', () => {
  describe('factory validation', () => {
    it('throws TypeError for null preferences', () => {
      assert.throws(() => createPreferInterceptor(null), {
        name: 'TypeError',
        message: 'preferences must be a non-empty string or a non-null object'
      });
    });

    it('throws TypeError for undefined preferences', () => {
      assert.throws(() => createPreferInterceptor(undefined), {
        name: 'TypeError',
        message: 'preferences must be a non-empty string or a non-null object'
      });
    });

    it('throws TypeError for numeric preferences', () => {
      assert.throws(() => createPreferInterceptor(42), {
        name: 'TypeError',
        message: 'preferences must be a non-empty string or a non-null object'
      });
    });

    it('throws TypeError for boolean preferences', () => {
      assert.throws(() => createPreferInterceptor(true), {
        name: 'TypeError',
        message: 'preferences must be a non-empty string or a non-null object'
      });
    });

    it('throws TypeError for empty string preferences', () => {
      assert.throws(() => createPreferInterceptor(''), {
        name: 'TypeError',
        message: 'preferences string must not be empty'
      });
    });

    it('throws TypeError for whitespace-only string preferences', () => {
      assert.throws(() => createPreferInterceptor('   '), {
        name: 'TypeError',
        message: 'preferences string must not be empty'
      });
    });

    it('throws TypeError for tab/newline-only string preferences', () => {
      assert.throws(() => createPreferInterceptor('\t\n'), {
        name: 'TypeError',
        message: 'preferences string must not be empty'
      });
    });

    it('throws TypeError for array preferences', () => {
      assert.throws(() => createPreferInterceptor(['return=representation']), {
        name: 'TypeError',
        message: 'preferences must be a non-empty string or a non-null object'
      });
    });

    it('throws TypeError for empty object preferences', () => {
      assert.throws(() => createPreferInterceptor({}), {
        name: 'TypeError',
        message: 'preferences object must not be empty'
      });
    });

    it('returns a frozen null-prototype object', () => {
      const interceptor = createPreferInterceptor('return=representation');

      assert.equal(Object.getPrototypeOf(interceptor), null);
      assert.equal(Object.isFrozen(interceptor), true);
    });

    it('returns an object with request and response methods', () => {
      const interceptor = createPreferInterceptor('return=representation');

      assert.equal(typeof interceptor.request, 'function');
      assert.equal(typeof interceptor.response, 'function');
    });

    it('accepts a string preference', () => {
      const interceptor = createPreferInterceptor('return=representation');
      const ctx = createMockCtx();

      interceptor.request(ctx);

      assert.equal(ctx.headers.get('prefer'), 'return=representation');
    });

    it('accepts an object preference', () => {
      const interceptor = createPreferInterceptor({return: 'representation'});
      const ctx = createMockCtx();

      interceptor.request(ctx);

      assert.equal(ctx.headers.get('prefer'), 'return=representation');
    });
  });

  describe('request', () => {
    it('sets Prefer header from string', () => {
      const interceptor = createPreferInterceptor('return=minimal');
      const ctx = createMockCtx();

      interceptor.request(ctx);

      assert.equal(ctx.headers.get('prefer'), 'return=minimal');
    });

    it('sets Prefer header from object with multiple preferences', () => {
      const interceptor = createPreferInterceptor({return: 'representation', wait: '10'});
      const ctx = createMockCtx();

      interceptor.request(ctx);

      assert.equal(ctx.headers.get('prefer'), 'return=representation, wait=10');
    });

    it('handles boolean true values as bare tokens', () => {
      const interceptor = createPreferInterceptor({'respond-async': true, wait: '30'});
      const ctx = createMockCtx();

      interceptor.request(ctx);

      assert.equal(ctx.headers.get('prefer'), 'respond-async, wait=30');
    });

    it('handles object with single bare-token preference', () => {
      const interceptor = createPreferInterceptor({'respond-async': true});
      const ctx = createMockCtx();

      interceptor.request(ctx);

      assert.equal(ctx.headers.get('prefer'), 'respond-async');
    });

    it('uses pre-computed value on every request', () => {
      const interceptor = createPreferInterceptor('return=representation');
      const ctx1 = createMockCtx();
      const ctx2 = createMockCtx();

      interceptor.request(ctx1);
      interceptor.request(ctx2);

      assert.equal(ctx1.headers.get('prefer'), 'return=representation');
      assert.equal(ctx2.headers.get('prefer'), 'return=representation');
    });
  });

  describe('response', () => {
    it('parses Preference-Applied header into array', () => {
      const interceptor = createPreferInterceptor('return=representation');
      const ctx = createMockCtx();
      const res = new Response(null, {headers: {'preference-applied': 'return'}});

      interceptor.response(ctx, res);

      assert.deepStrictEqual(ctx.preferencesApplied, ['return']);
    });

    it('parses multiple applied preferences', () => {
      const interceptor = createPreferInterceptor({return: 'representation', wait: '10'});
      const ctx = createMockCtx();
      const res = new Response(null, {headers: {'preference-applied': 'return, wait'}});

      interceptor.response(ctx, res);

      assert.deepStrictEqual(ctx.preferencesApplied, ['return', 'wait']);
    });

    it('strips values from preference-applied tokens', () => {
      const interceptor = createPreferInterceptor('return=representation');
      const ctx = createMockCtx();
      const res = new Response(null, {
        headers: {'preference-applied': 'return=representation'}
      });

      interceptor.response(ctx, res);

      assert.deepStrictEqual(ctx.preferencesApplied, ['return']);
    });

    it('does not set preferencesApplied when header is absent', () => {
      const interceptor = createPreferInterceptor('return=representation');
      const ctx = createMockCtx();
      const res = new Response(null);

      interceptor.response(ctx, res);

      assert.equal(ctx.preferencesApplied, undefined);
    });

    it('handles whitespace in Preference-Applied values', () => {
      const interceptor = createPreferInterceptor('return=representation');
      const ctx = createMockCtx();
      const res = new Response(null, {
        headers: {'preference-applied': '  return  ,  wait  '}
      });

      interceptor.response(ctx, res);

      assert.deepStrictEqual(ctx.preferencesApplied, ['return', 'wait']);
    });
  });
});
