/**
 * @fileoverview Boundary tests for the RFC 3986 path-absolute validator.
 * @module @centralping/ergo-fetch/lib/assert-path-absolute.spec
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {isPathAbsolute, assertPathAbsolute} from './assert-path-absolute.js';

describe('isPathAbsolute', () => {
  describe('valid paths', () => {
    it('accepts root path', () => {
      assert.equal(isPathAbsolute('/'), true);
    });

    it('accepts simple path', () => {
      assert.equal(isPathAbsolute('/articles'), true);
    });

    it('accepts multi-segment path', () => {
      assert.equal(isPathAbsolute('/api/v2/articles'), true);
    });

    it('accepts path with unreserved characters (dash, dot, underscore, tilde)', () => {
      assert.equal(isPathAbsolute('/a-b.c_d~e'), true);
    });

    it('accepts path with sub-delimiters', () => {
      assert.equal(isPathAbsolute("/a!$&'()*+,;=b"), true);
    });

    it('accepts path with colon and at-sign (pchar)', () => {
      assert.equal(isPathAbsolute('/user:admin@host'), true);
    });

    it('accepts path with valid percent-encoding (uppercase hex)', () => {
      assert.equal(isPathAbsolute('/articles/%E4%B8%AD%E6%96%87'), true);
    });

    it('accepts path with valid percent-encoding (lowercase hex)', () => {
      assert.equal(isPathAbsolute('/articles/%2f%7e'), true);
    });

    it('accepts path with :key-style parameters', () => {
      assert.equal(isPathAbsolute('/users/:id'), true);
    });

    it('accepts path with mixed digits and letters', () => {
      assert.equal(isPathAbsolute('/v2/items/42'), true);
    });
  });

  describe('invalid paths', () => {
    it('rejects empty string', () => {
      assert.equal(isPathAbsolute(''), false);
    });

    it('rejects path not starting with /', () => {
      assert.equal(isPathAbsolute('articles'), false);
    });

    it('rejects protocol-relative path (authority escape)', () => {
      assert.equal(isPathAbsolute('//evil.example/articles'), false);
    });

    it('rejects backslash (authority escape)', () => {
      assert.equal(isPathAbsolute('/\\evil.example/articles'), false);
    });

    it('rejects tab (control character)', () => {
      assert.equal(isPathAbsolute('/\t/evil.example'), false);
    });

    it('rejects newline (control character)', () => {
      assert.equal(isPathAbsolute('/\n/evil.example'), false);
    });

    it('rejects carriage return (control character)', () => {
      assert.equal(isPathAbsolute('/\r/evil.example'), false);
    });

    it('rejects null byte (control character)', () => {
      assert.equal(isPathAbsolute('/\0articles'), false);
    });

    it('rejects space', () => {
      assert.equal(isPathAbsolute('/evil path'), false);
    });

    it('rejects non-ASCII without percent-encoding', () => {
      assert.equal(isPathAbsolute('/artícles'), false);
    });

    it('rejects query delimiter', () => {
      assert.equal(isPathAbsolute('/articles?stale=true'), false);
    });

    it('rejects fragment delimiter', () => {
      assert.equal(isPathAbsolute('/articles#section'), false);
    });

    it('rejects square brackets', () => {
      assert.equal(isPathAbsolute('/articles[0]'), false);
    });

    it('rejects curly braces', () => {
      assert.equal(isPathAbsolute('/articles/{id}'), false);
    });

    it('rejects pipe', () => {
      assert.equal(isPathAbsolute('/a|b'), false);
    });

    it('rejects caret', () => {
      assert.equal(isPathAbsolute('/a^b'), false);
    });

    it('rejects trailing percent sign', () => {
      assert.equal(isPathAbsolute('/articles%'), false);
    });

    it('rejects incomplete percent-encoding (one hex digit)', () => {
      assert.equal(isPathAbsolute('/articles%2'), false);
    });

    it('rejects invalid first hex digit in percent-encoding', () => {
      assert.equal(isPathAbsolute('/articles%ZZ'), false);
    });

    it('rejects invalid second hex digit in percent-encoding', () => {
      assert.equal(isPathAbsolute('/articles%2G'), false);
    });

    it('rejects non-string input (number)', () => {
      assert.equal(isPathAbsolute(42), false);
    });

    it('rejects non-string input (null)', () => {
      assert.equal(isPathAbsolute(null), false);
    });

    it('rejects non-string input (undefined)', () => {
      assert.equal(isPathAbsolute(undefined), false);
    });

    it('rejects non-string input (boolean)', () => {
      assert.equal(isPathAbsolute(true), false);
    });
  });
});

describe('assertPathAbsolute', () => {
  it('does not throw for a valid path-absolute', () => {
    assert.doesNotThrow(() => assertPathAbsolute('/articles', 'path'));
  });

  it('does not throw for root path', () => {
    assert.doesNotThrow(() => assertPathAbsolute('/', 'path'));
  });

  it('throws TypeError for path not starting with /', () => {
    assert.throws(() => assertPathAbsolute('articles', 'path'), {
      name: 'TypeError',
      message: /RFC 3986/
    });
  });

  it('throws TypeError for protocol-relative path', () => {
    assert.throws(() => assertPathAbsolute('//evil.example', 'path'), {
      name: 'TypeError',
      message: /RFC 3986/
    });
  });

  it('throws TypeError for backslash', () => {
    assert.throws(() => assertPathAbsolute('/\\evil', 'path'), {
      name: 'TypeError',
      message: /RFC 3986/
    });
  });

  it('throws TypeError for control characters', () => {
    assert.throws(() => assertPathAbsolute('/\t/evil', 'path'), {
      name: 'TypeError',
      message: /RFC 3986/
    });
  });

  it('throws TypeError for non-ASCII', () => {
    assert.throws(() => assertPathAbsolute('/artícles', 'path'), {
      name: 'TypeError',
      message: /RFC 3986/
    });
  });

  it('throws TypeError for space', () => {
    assert.throws(() => assertPathAbsolute('/evil path', 'path'), {
      name: 'TypeError',
      message: /RFC 3986/
    });
  });

  it('includes the label in the error message', () => {
    assert.throws(() => assertPathAbsolute('bad', 'basePath'), {
      name: 'TypeError',
      message: /^basePath must be/
    });
  });

  it('throws TypeError for non-string input', () => {
    assert.throws(() => assertPathAbsolute(42, 'path'), {
      name: 'TypeError',
      message: /RFC 3986/
    });
  });

  it('throws TypeError for empty string', () => {
    assert.throws(() => assertPathAbsolute('', 'path'), {
      name: 'TypeError',
      message: /RFC 3986/
    });
  });
});
