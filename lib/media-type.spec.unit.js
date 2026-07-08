/**
 * @fileoverview Boundary tests for the media-type parsing and JSON detection utilities.
 * @module @centralping/ergo-fetch/lib/media-type.spec
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {parseMediaType, isJsonMediaType} from './media-type.js';

describe('parseMediaType', () => {
  describe('valid media types', () => {
    it('returns normalized type/subtype for simple types', () => {
      assert.equal(parseMediaType('application/json'), 'application/json');
      assert.equal(parseMediaType('text/plain'), 'text/plain');
      assert.equal(parseMediaType('text/html'), 'text/html');
    });

    it('strips parameters after semicolon', () => {
      assert.equal(parseMediaType('application/json; charset=utf-8'), 'application/json');
      assert.equal(parseMediaType('text/html; charset=utf-8; boundary=something'), 'text/html');
    });

    it('normalizes to lowercase', () => {
      assert.equal(parseMediaType('Application/JSON'), 'application/json');
      assert.equal(parseMediaType('TEXT/PLAIN'), 'text/plain');
      assert.equal(parseMediaType('Application/VND.API+JSON'), 'application/vnd.api+json');
    });

    it('trims leading and trailing whitespace', () => {
      assert.equal(parseMediaType('  application/json  '), 'application/json');
      assert.equal(parseMediaType('\tapplication/json\t'), 'application/json');
    });

    it('handles whitespace around semicolon', () => {
      assert.equal(parseMediaType('application/json ; charset=utf-8'), 'application/json');
      assert.equal(parseMediaType('  application/json  ; charset=utf-8'), 'application/json');
    });

    it('handles structured syntax suffix types', () => {
      assert.equal(parseMediaType('application/vnd.api+json'), 'application/vnd.api+json');
      assert.equal(parseMediaType('application/problem+json'), 'application/problem+json');
      assert.equal(parseMediaType('application/merge-patch+json'), 'application/merge-patch+json');
    });
  });

  describe('absent or empty input', () => {
    it('returns undefined for null', () => {
      assert.equal(parseMediaType(null), undefined);
    });

    it('returns undefined for undefined', () => {
      assert.equal(parseMediaType(undefined), undefined);
    });

    it('returns undefined for empty string', () => {
      assert.equal(parseMediaType(''), undefined);
    });
  });
});

describe('isJsonMediaType', () => {
  describe('true cases', () => {
    it('matches application/json exactly', () => {
      assert.equal(isJsonMediaType('application/json'), true);
    });

    it('matches application/json with parameters', () => {
      assert.equal(isJsonMediaType('application/json; charset=utf-8'), true);
    });

    it('matches application/json case-insensitively', () => {
      assert.equal(isJsonMediaType('Application/JSON'), true);
      assert.equal(isJsonMediaType('APPLICATION/JSON'), true);
    });

    it('matches +json structured syntax suffix types', () => {
      assert.equal(isJsonMediaType('application/vnd.api+json'), true);
      assert.equal(isJsonMediaType('application/merge-patch+json'), true);
      assert.equal(isJsonMediaType('application/problem+json'), true);
      assert.equal(isJsonMediaType('application/hal+json'), true);
    });

    it('matches +json suffix with parameters', () => {
      assert.equal(isJsonMediaType('application/vnd.api+json; ext=value'), true);
    });

    it('matches +json suffix case-insensitively', () => {
      assert.equal(isJsonMediaType('Application/VND.API+JSON'), true);
    });
  });

  describe('false cases', () => {
    it('rejects non-JSON media types', () => {
      assert.equal(isJsonMediaType('text/plain'), false);
      assert.equal(isJsonMediaType('text/html'), false);
      assert.equal(isJsonMediaType('application/xml'), false);
      assert.equal(isJsonMediaType('application/octet-stream'), false);
    });

    it('rejects types with json only in parameters (not type/subtype)', () => {
      assert.equal(isJsonMediaType('text/plain; format=json'), false);
      assert.equal(isJsonMediaType('text/plain; charset=json-callback'), false);
    });

    it('rejects types containing json as a substring in the subtype', () => {
      assert.equal(isJsonMediaType('application/notjson'), false);
      assert.equal(isJsonMediaType('application/jsonl'), false);
    });

    it('rejects null, undefined, empty string', () => {
      assert.equal(isJsonMediaType(null), false);
      assert.equal(isJsonMediaType(undefined), false);
      assert.equal(isJsonMediaType(''), false);
    });
  });
});
