/**
 * @fileoverview Boundary tests for the RFC 9110 header name assertion utility.
 * @module @centralping/ergo-fetch/lib/assert-header-name.spec
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {assertValidHeaderName, HEADER_NAME_RE} from './assert-header-name.js';

describe('assertValidHeaderName', () => {
  describe('valid header names', () => {
    it('accepts standard lowercase header names', () => {
      assert.doesNotThrow(() => assertValidHeaderName('x-request-id'));
      assert.doesNotThrow(() => assertValidHeaderName('content-type'));
      assert.doesNotThrow(() => assertValidHeaderName('accept'));
    });

    it('accepts mixed-case header names', () => {
      assert.doesNotThrow(() => assertValidHeaderName('X-Request-ID'));
      assert.doesNotThrow(() => assertValidHeaderName('Content-Type'));
    });

    it('accepts names with digits', () => {
      assert.doesNotThrow(() => assertValidHeaderName('x-ratelimit-remaining'));
      assert.doesNotThrow(() => assertValidHeaderName('h2'));
    });

    it('accepts names with all tchar special characters', () => {
      assert.doesNotThrow(() => assertValidHeaderName("!#$%&'*+.^_`|~"));
    });

    it('accepts single-character names', () => {
      assert.doesNotThrow(() => assertValidHeaderName('x'));
      assert.doesNotThrow(() => assertValidHeaderName('!'));
    });
  });

  describe('invalid header names', () => {
    it('rejects empty string', () => {
      assert.throws(() => assertValidHeaderName(''), {
        name: 'TypeError',
        message: 'headerName must be a valid HTTP token (RFC 9110 Section 5.6.2)'
      });
    });

    it('rejects strings with spaces', () => {
      assert.throws(() => assertValidHeaderName('bad header'), {
        name: 'TypeError',
        message: 'headerName must be a valid HTTP token (RFC 9110 Section 5.6.2)'
      });
    });

    it('rejects strings with colons', () => {
      assert.throws(() => assertValidHeaderName('x:custom'), {
        name: 'TypeError',
        message: 'headerName must be a valid HTTP token (RFC 9110 Section 5.6.2)'
      });
    });

    it('rejects strings with control characters', () => {
      assert.throws(() => assertValidHeaderName('x\x00name'), {
        name: 'TypeError',
        message: 'headerName must be a valid HTTP token (RFC 9110 Section 5.6.2)'
      });
      assert.throws(() => assertValidHeaderName('x\tname'), {
        name: 'TypeError',
        message: 'headerName must be a valid HTTP token (RFC 9110 Section 5.6.2)'
      });
    });

    it('rejects strings with parentheses', () => {
      assert.throws(() => assertValidHeaderName('x(name)'), {
        name: 'TypeError',
        message: 'headerName must be a valid HTTP token (RFC 9110 Section 5.6.2)'
      });
    });

    it('rejects strings with slashes', () => {
      assert.throws(() => assertValidHeaderName('x/name'), {
        name: 'TypeError',
        message: 'headerName must be a valid HTTP token (RFC 9110 Section 5.6.2)'
      });
    });

    it('rejects strings with only whitespace', () => {
      assert.throws(() => assertValidHeaderName('   '), {
        name: 'TypeError',
        message: 'headerName must be a valid HTTP token (RFC 9110 Section 5.6.2)'
      });
    });
  });

  describe('non-string types', () => {
    it('rejects null', () => {
      assert.throws(() => assertValidHeaderName(null), {
        name: 'TypeError',
        message: 'headerName must be a valid HTTP token (RFC 9110 Section 5.6.2)'
      });
    });

    it('rejects number', () => {
      assert.throws(() => assertValidHeaderName(123), {
        name: 'TypeError',
        message: 'headerName must be a valid HTTP token (RFC 9110 Section 5.6.2)'
      });
    });

    it('rejects boolean', () => {
      assert.throws(() => assertValidHeaderName(true), {
        name: 'TypeError',
        message: 'headerName must be a valid HTTP token (RFC 9110 Section 5.6.2)'
      });
    });

    it('rejects undefined', () => {
      assert.throws(() => assertValidHeaderName(undefined), {
        name: 'TypeError',
        message: 'headerName must be a valid HTTP token (RFC 9110 Section 5.6.2)'
      });
    });
  });

  describe('HEADER_NAME_RE', () => {
    it('is exported as a RegExp', () => {
      assert.ok(HEADER_NAME_RE instanceof RegExp);
    });

    it('matches the full RFC 9110 tchar set', () => {
      assert.ok(
        HEADER_NAME_RE.test(
          "!#$%&'*+-.^_`|~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
        )
      );
    });

    it('does not match empty string', () => {
      assert.equal(HEADER_NAME_RE.test(''), false);
    });

    it('does not match characters outside tchar', () => {
      assert.equal(HEADER_NAME_RE.test(' '), false);
      assert.equal(HEADER_NAME_RE.test(':'), false);
      assert.equal(HEADER_NAME_RE.test('/'), false);
      assert.equal(HEADER_NAME_RE.test('@'), false);
      assert.equal(HEADER_NAME_RE.test('['), false);
      assert.equal(HEADER_NAME_RE.test('"'), false);
    });
  });
});
