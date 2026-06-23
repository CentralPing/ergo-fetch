/**
 * @fileoverview Boundary tests for the RFC 8288 Link header parser.
 * @module @centralping/ergo-fetch/lib/link-header.spec
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {parseLinkHeader} from './link-header.js';

describe('parseLinkHeader', () => {
  describe('input validation', () => {
    it('returns empty Map for undefined', () => {
      const result = parseLinkHeader(undefined);

      assert.equal(result instanceof Map, true);
      assert.equal(result.size, 0);
    });

    it('returns empty Map for null', () => {
      const result = parseLinkHeader(null);

      assert.equal(result instanceof Map, true);
      assert.equal(result.size, 0);
    });

    it('returns empty Map for empty string', () => {
      const result = parseLinkHeader('');

      assert.equal(result instanceof Map, true);
      assert.equal(result.size, 0);
    });

    it('returns empty Map for non-string input (number)', () => {
      const result = parseLinkHeader(42);

      assert.equal(result instanceof Map, true);
      assert.equal(result.size, 0);
    });

    it('returns empty Map for non-string input (boolean)', () => {
      const result = parseLinkHeader(true);

      assert.equal(result instanceof Map, true);
      assert.equal(result.size, 0);
    });

    it('returns empty Map for non-string input (object)', () => {
      const result = parseLinkHeader({});

      assert.equal(result instanceof Map, true);
      assert.equal(result.size, 0);
    });

    it('returns a Map instance', () => {
      const result = parseLinkHeader('<https://example.com>; rel="next"');

      assert.equal(result instanceof Map, true);
    });

    it('throws TypeError for non-string requestUrl', () => {
      assert.throws(() => parseLinkHeader('<https://example.com>; rel="next"', 42), {
        name: 'TypeError'
      });
    });

    it('throws TypeError for empty string requestUrl', () => {
      assert.throws(() => parseLinkHeader('<https://example.com>; rel="next"', ''), {
        name: 'TypeError'
      });
    });

    it('throws TypeError for invalid requestUrl', () => {
      assert.throws(() => parseLinkHeader('<https://example.com>; rel="next"', 'not-a-url'), {
        name: 'TypeError'
      });
    });
  });

  describe('single link parsing', () => {
    it('parses a single link with rel', () => {
      const result = parseLinkHeader('<https://api.example.com/users?page=2>; rel="next"');

      assert.equal(result.size, 1);
      assert.equal(result.has('next'), true);

      const link = result.get('next');
      assert.equal(link.href, 'https://api.example.com/users?page=2');
      assert.equal(link.rel, 'next');
    });

    it('extracts href from angle brackets', () => {
      const result = parseLinkHeader('<https://example.com/path?q=1&r=2>; rel="self"');

      assert.equal(result.get('self').href, 'https://example.com/path?q=1&r=2');
    });

    it('link object is frozen', () => {
      const result = parseLinkHeader('<https://example.com>; rel="next"');
      const link = result.get('next');

      assert.equal(Object.isFrozen(link), true);
    });

    it('link object is null-prototype', () => {
      const result = parseLinkHeader('<https://example.com>; rel="next"');
      const link = result.get('next');

      assert.equal(Object.getPrototypeOf(link), null);
    });

    it('lowercases parameter names', () => {
      const result = parseLinkHeader('<https://example.com>; REL="next"; Type="text/html"');
      const link = result.get('next');

      assert.equal(link.type, 'text/html');
    });

    it('parses unquoted rel token value', () => {
      const result = parseLinkHeader('<https://example.com>; rel=next');

      assert.equal(result.size, 1);
      assert.equal(result.get('next').rel, 'next');
    });
  });

  describe('multiple links', () => {
    it('parses comma-separated links', () => {
      const header =
        '<https://api.example.com/users?page=2>; rel="next", ' +
        '<https://api.example.com/users?page=5>; rel="last"';
      const result = parseLinkHeader(header);

      assert.equal(result.size, 2);
      assert.equal(result.get('next').href, 'https://api.example.com/users?page=2');
      assert.equal(result.get('last').href, 'https://api.example.com/users?page=5');
    });

    it('handles whitespace between links', () => {
      const header =
        '  <https://example.com/1>; rel="first"  ,  <https://example.com/2>; rel="last"  ';
      const result = parseLinkHeader(header);

      assert.equal(result.size, 2);
      assert.equal(result.get('first').href, 'https://example.com/1');
      assert.equal(result.get('last').href, 'https://example.com/2');
    });

    it('parses three links', () => {
      const header =
        '<https://example.com/1>; rel="prev", ' +
        '<https://example.com/2>; rel="next", ' +
        '<https://example.com/3>; rel="last"';
      const result = parseLinkHeader(header);

      assert.equal(result.size, 3);
      assert.equal(result.has('prev'), true);
      assert.equal(result.has('next'), true);
      assert.equal(result.has('last'), true);
    });
  });

  describe('quoted-string parameters', () => {
    it('unquotes quoted parameter values', () => {
      const result = parseLinkHeader('<https://example.com>; rel="next"; title="Page 2"');
      const link = result.get('next');

      assert.equal(link.title, 'Page 2');
    });

    it('handles escaped characters in quoted strings', () => {
      const result = parseLinkHeader('<https://example.com>; rel="next"; title="foo\\bar"');
      const link = result.get('next');

      assert.equal(link.title, 'foobar');
    });

    it('handles escaped quotes in quoted strings', () => {
      const result = parseLinkHeader('<https://example.com>; rel="next"; title="say \\"hello\\""');
      const link = result.get('next');

      assert.equal(link.title, 'say "hello"');
    });

    it('handles escaped backslash in quoted strings', () => {
      const result = parseLinkHeader('<https://example.com>; rel="next"; title="back\\\\slash"');
      const link = result.get('next');

      assert.equal(link.title, 'back\\slash');
    });
  });

  describe('extension parameters', () => {
    it('includes type parameter', () => {
      const result = parseLinkHeader('<https://example.com>; rel="next"; type="application/json"');

      assert.equal(result.get('next').type, 'application/json');
    });

    it('includes title parameter', () => {
      const result = parseLinkHeader('<https://example.com>; rel="next"; title="Next Page"');

      assert.equal(result.get('next').title, 'Next Page');
    });

    it('includes hreflang parameter', () => {
      const result = parseLinkHeader('<https://example.com>; rel="alternate"; hreflang=en');

      assert.equal(result.get('alternate').hreflang, 'en');
    });

    it('includes custom extension parameters', () => {
      const result = parseLinkHeader('<https://example.com>; rel="next"; crossorigin="anonymous"');

      assert.equal(result.get('next').crossorigin, 'anonymous');
    });

    it('includes title* extended parameter raw value', () => {
      const result = parseLinkHeader(
        '<https://example.com>; rel="next"; title*=UTF-8\'en\'Next%20Page'
      );

      assert.equal(result.get('next')['title*'], "UTF-8'en'Next%20Page");
    });

    it('preserves multiple extension parameters', () => {
      const result = parseLinkHeader(
        '<https://example.com>; rel="next"; type="text/html"; title="Next"; hreflang=en'
      );
      const link = result.get('next');

      assert.equal(link.type, 'text/html');
      assert.equal(link.title, 'Next');
      assert.equal(link.hreflang, 'en');
    });

    it('preserves first occurrence of duplicate parameter', () => {
      const result = parseLinkHeader(
        '<https://example.com>; rel="next"; title="First"; title="Second"'
      );
      const link = result.get('next');

      assert.equal(link.title, 'First');
    });
  });

  describe('relative URI resolution', () => {
    it('resolves relative URI against requestUrl', () => {
      const result = parseLinkHeader(
        '</users?page=2>; rel="next"',
        'https://api.example.com/users?page=1'
      );

      assert.equal(result.get('next').href, 'https://api.example.com/users?page=2');
    });

    it('preserves absolute URIs when requestUrl provided', () => {
      const result = parseLinkHeader(
        '<https://other.example.com/data>; rel="next"',
        'https://api.example.com/'
      );

      assert.equal(result.get('next').href, 'https://other.example.com/data');
    });

    it('preserves raw URI when no requestUrl provided', () => {
      const result = parseLinkHeader('</users?page=2>; rel="next"');

      assert.equal(result.get('next').href, '/users?page=2');
    });

    it('resolves path-relative URIs', () => {
      const result = parseLinkHeader('<page2>; rel="next"', 'https://api.example.com/items/');

      assert.equal(result.get('next').href, 'https://api.example.com/items/page2');
    });

    it('handles invalid relative URI gracefully', () => {
      const result = parseLinkHeader(
        '<://not a valid uri>; rel="next"',
        'https://api.example.com/'
      );

      assert.equal(result.size, 1);
      assert.equal(typeof result.get('next').href, 'string');
    });
  });

  describe('multiple rel values', () => {
    it('creates separate Map entries for space-separated rels', () => {
      const result = parseLinkHeader('<https://example.com>; rel="start index"');

      assert.equal(result.size, 2);
      assert.equal(result.has('start'), true);
      assert.equal(result.has('index'), true);
    });

    it('each entry has correct individual rel value', () => {
      const result = parseLinkHeader('<https://example.com>; rel="start index"');

      assert.equal(result.get('start').rel, 'start');
      assert.equal(result.get('index').rel, 'index');
    });

    it('each entry shares the same href and params', () => {
      const result = parseLinkHeader('<https://example.com>; rel="start index"; title="Home"');

      assert.equal(result.get('start').href, 'https://example.com');
      assert.equal(result.get('index').href, 'https://example.com');
      assert.equal(result.get('start').title, 'Home');
      assert.equal(result.get('index').title, 'Home');
    });
  });

  describe('same-rel last-wins', () => {
    it('later link with same rel overwrites earlier', () => {
      const header = '<https://example.com/old>; rel="next", <https://example.com/new>; rel="next"';
      const result = parseLinkHeader(header);

      assert.equal(result.size, 1);
      assert.equal(result.get('next').href, 'https://example.com/new');
    });

    it('preserves other rels when one is overwritten', () => {
      const header =
        '<https://example.com/1>; rel="next", ' +
        '<https://example.com/2>; rel="last", ' +
        '<https://example.com/3>; rel="next"';
      const result = parseLinkHeader(header);

      assert.equal(result.size, 2);
      assert.equal(result.get('next').href, 'https://example.com/3');
      assert.equal(result.get('last').href, 'https://example.com/2');
    });
  });

  describe('malformed entries', () => {
    it('skips link missing opening angle bracket', () => {
      const header = 'https://example.com/bad; rel="bad", <https://example.com/good>; rel="next"';
      const result = parseLinkHeader(header);

      assert.equal(result.size, 1);
      assert.equal(result.has('next'), true);
    });

    it('skips link missing rel parameter', () => {
      const result = parseLinkHeader('<https://example.com>; type="text/html"');

      assert.equal(result.size, 0);
    });

    it('stops parsing at unclosed angle bracket', () => {
      const result = parseLinkHeader('<https://example.com/unclosed');

      assert.equal(result.size, 0);
    });

    it('continues parsing after malformed entry', () => {
      const header =
        'malformed, <https://example.com>; rel="next", also bad, ' +
        '<https://example.com/last>; rel="last"';
      const result = parseLinkHeader(header);

      assert.equal(result.size, 2);
      assert.equal(result.has('next'), true);
      assert.equal(result.has('last'), true);
    });

    it('handles empty segments between commas', () => {
      const header = ',, <https://example.com>; rel="next" ,,';
      const result = parseLinkHeader(header);

      assert.equal(result.size, 1);
      assert.equal(result.get('next').href, 'https://example.com');
    });

    it('handles unterminated quoted string in parameter value', () => {
      const result = parseLinkHeader('<https://example.com>; rel="next"; title="unterminated');
      const link = result.get('next');

      assert.equal(link.title, 'unterminated');
    });

    it('handles malformed entry without comma at end of string', () => {
      const header = 'not-a-link';
      const result = parseLinkHeader(header);

      assert.equal(result.size, 0);
    });

    it('preserves raw href when relative URI is truly unparseable', () => {
      const result = parseLinkHeader('<http://[invalid>; rel="next"', 'https://example.com/');

      assert.equal(result.size, 1);
      assert.equal(result.get('next').href, 'http://[invalid');
    });
  });

  describe('edge cases', () => {
    it('skips link with no parameters', () => {
      const result = parseLinkHeader('<https://example.com>');

      assert.equal(result.size, 0);
    });

    it('handles parameter with empty quoted value', () => {
      const result = parseLinkHeader('<https://example.com>; rel="next"; title=""');
      const link = result.get('next');

      assert.equal(link.title, '');
    });

    it('handles parameter without value', () => {
      const result = parseLinkHeader('<https://example.com>; rel="next"; anchor');
      const link = result.get('next');

      assert.equal(link.anchor, '');
    });

    it('handles excessive whitespace around semicolons', () => {
      const result = parseLinkHeader('<https://example.com>  ;  rel="next"  ;  title="test"');
      const link = result.get('next');

      assert.equal(link.href, 'https://example.com');
      assert.equal(link.title, 'test');
    });

    it('handles tab characters as whitespace', () => {
      const result = parseLinkHeader('<https://example.com>\t;\trel="next"');

      assert.equal(result.size, 1);
      assert.equal(result.get('next').href, 'https://example.com');
    });

    it('handles URI with query parameters containing commas', () => {
      const result = parseLinkHeader('<https://example.com/search?q=a,b>; rel="next"');

      assert.equal(result.get('next').href, 'https://example.com/search?q=a,b');
    });

    it('handles real-world GitHub pagination Link header', () => {
      const header =
        '<https://api.github.com/user/repos?page=3&per_page=10>; rel="next", ' +
        '<https://api.github.com/user/repos?page=50&per_page=10>; rel="last", ' +
        '<https://api.github.com/user/repos?page=1&per_page=10>; rel="first", ' +
        '<https://api.github.com/user/repos?page=1&per_page=10>; rel="prev"';
      const result = parseLinkHeader(header);

      assert.equal(result.size, 4);
      assert.equal(result.get('next').href, 'https://api.github.com/user/repos?page=3&per_page=10');
      assert.equal(
        result.get('last').href,
        'https://api.github.com/user/repos?page=50&per_page=10'
      );
      assert.equal(
        result.get('first').href,
        'https://api.github.com/user/repos?page=1&per_page=10'
      );
      assert.equal(result.get('prev').href, 'https://api.github.com/user/repos?page=1&per_page=10');
    });

    it('handles whitespace-only string', () => {
      const result = parseLinkHeader('   ');

      assert.equal(result.size, 0);
    });

    it('does not pollute link object via __proto__ parameter', () => {
      const result = parseLinkHeader('<https://example.com>; rel="next"; __proto__="malicious"');
      const link = result.get('next');

      assert.equal(Object.getPrototypeOf(link), null);
      assert.equal(link.__proto__, 'malicious');
      assert.equal(link.constructor, undefined);
    });

    it('does not pollute link object via constructor parameter', () => {
      const result = parseLinkHeader('<https://example.com>; rel="next"; constructor="malicious"');
      const link = result.get('next');

      assert.equal(link.constructor, 'malicious');
      assert.equal(Object.getPrototypeOf(link), null);
    });

    it('does not overwrite href with extension parameter', () => {
      const result = parseLinkHeader(
        '<https://example.com/real>; rel="next"; href="https://evil.com"'
      );
      const link = result.get('next');

      assert.equal(link.href, 'https://example.com/real');
    });
  });
});
