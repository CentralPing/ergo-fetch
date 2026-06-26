/**
 * @fileoverview Boundary tests for the JSON:API query builder.
 * @module @centralping/ergo-fetch/lib/query-builder.spec
 */

import {describe, it, mock} from 'node:test';
import assert from 'node:assert/strict';

import {createQueryBuilder, isQueryBuilder} from './query-builder.js';

describe('createQueryBuilder', () => {
  describe('factory validation', () => {
    it('creates a builder with no arguments', () => {
      const builder = createQueryBuilder();

      assert.equal(typeof builder, 'object');
    });

    it('creates a builder with a valid base path', () => {
      const builder = createQueryBuilder('/articles');

      assert.equal(builder.path, '/articles');
    });

    it('throws TypeError when basePath is a number', () => {
      assert.throws(() => createQueryBuilder(42), {
        name: 'TypeError',
        message: 'basePath must be a string'
      });
    });

    it('throws TypeError when basePath is a boolean', () => {
      assert.throws(() => createQueryBuilder(true), {
        name: 'TypeError',
        message: 'basePath must be a string'
      });
    });

    it('throws TypeError when basePath is an object', () => {
      assert.throws(() => createQueryBuilder({}), {
        name: 'TypeError',
        message: 'basePath must be a string'
      });
    });

    it('throws TypeError when basePath does not start with /', () => {
      assert.throws(() => createQueryBuilder('articles'), {
        name: 'TypeError',
        message: 'basePath must start with /'
      });
    });

    it('throws TypeError when basePath is an empty string', () => {
      assert.throws(() => createQueryBuilder(''), {
        name: 'TypeError',
        message: 'basePath must start with /'
      });
    });

    it('accepts undefined basePath explicitly', () => {
      const builder = createQueryBuilder(undefined);

      assert.equal(builder.path, undefined);
    });
  });

  describe('builder shape', () => {
    it('returns a frozen object', () => {
      const builder = createQueryBuilder('/articles');

      assert.equal(Object.isFrozen(builder), true);
    });

    it('returns a null-prototype object', () => {
      const builder = createQueryBuilder('/articles');

      assert.equal(Object.getPrototypeOf(builder), null);
    });

    it('has the query builder symbol set to true', () => {
      const builder = createQueryBuilder('/articles');

      assert.equal(builder[Symbol.for('ergo-fetch:query-builder')], true);
    });

    it('exposes all builder methods', () => {
      const builder = createQueryBuilder('/articles');

      assert.equal(typeof builder.fields, 'function');
      assert.equal(typeof builder.include, 'function');
      assert.equal(typeof builder.filter, 'function');
      assert.equal(typeof builder.sort, 'function');
      assert.equal(typeof builder.page, 'function');
      assert.equal(typeof builder.param, 'function');
      assert.equal(typeof builder.toString, 'function');
      assert.equal(typeof builder.fetch, 'function');
    });
  });

  describe('immutability', () => {
    it('fields() returns a new builder instance', () => {
      const original = createQueryBuilder('/articles');
      const modified = original.fields('articles', ['title']);

      assert.notEqual(original, modified);
    });

    it('include() returns a new builder instance', () => {
      const original = createQueryBuilder('/articles');
      const modified = original.include(['author']);

      assert.notEqual(original, modified);
    });

    it('filter() returns a new builder instance', () => {
      const original = createQueryBuilder('/articles');
      const modified = original.filter({published: true});

      assert.notEqual(original, modified);
    });

    it('sort() returns a new builder instance', () => {
      const original = createQueryBuilder('/articles');
      const modified = original.sort(['-createdAt']);

      assert.notEqual(original, modified);
    });

    it('page() returns a new builder instance', () => {
      const original = createQueryBuilder('/articles');
      const modified = original.page({number: 1, size: 10});

      assert.notEqual(original, modified);
    });

    it('param() returns a new builder instance', () => {
      const original = createQueryBuilder('/articles');
      const modified = original.param('camelCase', 'value');

      assert.notEqual(original, modified);
    });

    it('original builder is unchanged after fields()', () => {
      const original = createQueryBuilder('/articles');
      original.fields('articles', ['title']);

      assert.equal(original.toString(), '');
    });

    it('original builder is unchanged after filter()', () => {
      const original = createQueryBuilder('/articles');
      original.filter({published: true});

      assert.equal(original.toString(), '');
    });

    it('original builder is unchanged after include()', () => {
      const original = createQueryBuilder('/articles');
      original.include(['author']);

      assert.equal(original.toString(), '');
    });

    it('original builder is unchanged after sort()', () => {
      const original = createQueryBuilder('/articles');
      original.sort(['-createdAt']);

      assert.equal(original.toString(), '');
    });

    it('original builder is unchanged after page()', () => {
      const original = createQueryBuilder('/articles');
      original.page({number: 1, size: 10});

      assert.equal(original.toString(), '');
    });

    it('original builder is unchanged after param()', () => {
      const original = createQueryBuilder('/articles');
      original.param('camelCase', 'value');

      assert.equal(original.toString(), '');
    });

    it('branches from the same builder are independent', () => {
      const base = createQueryBuilder('/articles').fields('articles', ['title']);
      const branch1 = base.filter({published: true});
      const branch2 = base.filter({draft: true});

      assert.equal(branch1.toString().includes('published'), true);
      assert.equal(branch1.toString().includes('draft'), false);
      assert.equal(branch2.toString().includes('draft'), true);
      assert.equal(branch2.toString().includes('published'), false);
    });

    it('returned builders from each method are frozen', () => {
      const builder = createQueryBuilder('/articles');

      assert.equal(Object.isFrozen(builder.fields('articles', ['title'])), true);
      assert.equal(Object.isFrozen(builder.include(['author'])), true);
      assert.equal(Object.isFrozen(builder.filter({published: true})), true);
      assert.equal(Object.isFrozen(builder.sort(['-createdAt'])), true);
      assert.equal(Object.isFrozen(builder.page({number: 1, size: 10})), true);
      assert.equal(Object.isFrozen(builder.param('camelCase', 'value')), true);
    });

    it('returned builders from each method are null-prototype', () => {
      const builder = createQueryBuilder('/articles');

      assert.equal(Object.getPrototypeOf(builder.fields('articles', ['title'])), null);
      assert.equal(Object.getPrototypeOf(builder.include(['author'])), null);
      assert.equal(Object.getPrototypeOf(builder.filter({published: true})), null);
      assert.equal(Object.getPrototypeOf(builder.sort(['-createdAt'])), null);
      assert.equal(Object.getPrototypeOf(builder.page({number: 1, size: 10})), null);
      assert.equal(Object.getPrototypeOf(builder.param('camelCase', 'value')), null);
    });
  });

  describe('fields()', () => {
    it('serializes a single fieldset', () => {
      const q = createQueryBuilder().fields('articles', ['title', 'body']);

      assert.equal(q.toString(), 'fields[articles]=title,body');
    });

    it('serializes multiple fieldsets', () => {
      const q = createQueryBuilder()
        .fields('articles', ['title', 'body'])
        .fields('authors', ['name', 'avatar']);

      assert.equal(q.toString(), 'fields[articles]=title,body&fields[authors]=name,avatar');
    });

    it('replaces fieldset for the same type', () => {
      const q = createQueryBuilder()
        .fields('articles', ['title'])
        .fields('articles', ['body', 'createdAt']);

      assert.equal(q.toString(), 'fields[articles]=body,createdAt');
    });

    it('URI-encodes field names with special characters', () => {
      const q = createQueryBuilder().fields('articles', ['field name']);

      assert.equal(q.toString(), 'fields[articles]=field%20name');
    });

    it('URI-encodes type names with special characters', () => {
      const q = createQueryBuilder().fields('my type', ['title']);

      assert.equal(q.toString(), 'fields[my%20type]=title');
    });

    it('throws TypeError when type is not a string', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.fields(42, ['title']), {
        name: 'TypeError',
        message: 'fields() type must be a non-empty string'
      });
    });

    it('throws TypeError when type is an empty string', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.fields('', ['title']), {
        name: 'TypeError',
        message: 'fields() type must be a non-empty string'
      });
    });

    it('throws TypeError when fieldNames is not an array', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.fields('articles', 'title'), {
        name: 'TypeError',
        message: 'fields() fieldNames must be an array'
      });
    });

    it('throws TypeError when fieldNames is empty', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.fields('articles', []), {
        name: 'TypeError',
        message: 'fields() fieldNames must not be empty'
      });
    });

    it('throws TypeError when a fieldName element is not a string', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.fields('articles', [42]), {
        name: 'TypeError',
        message: 'fields() fieldNames[0] must be a non-empty string'
      });
    });

    it('throws TypeError when a fieldName element is an empty string', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.fields('articles', ['']), {
        name: 'TypeError',
        message: 'fields() fieldNames[0] must be a non-empty string'
      });
    });

    it('throws TypeError when a later fieldName element is invalid', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.fields('articles', ['title', 42]), {
        name: 'TypeError',
        message: 'fields() fieldNames[1] must be a non-empty string'
      });
    });
  });

  describe('include()', () => {
    it('serializes include paths', () => {
      const q = createQueryBuilder().include(['author', 'comments', 'comments.author']);

      assert.equal(q.toString(), 'include=author,comments,comments.author');
    });

    it('replaces previous includes', () => {
      const q = createQueryBuilder().include(['author']).include(['comments']);

      assert.equal(q.toString(), 'include=comments');
    });

    it('URI-encodes paths with special characters', () => {
      const q = createQueryBuilder().include(['path with spaces']);

      assert.equal(q.toString(), 'include=path%20with%20spaces');
    });

    it('throws TypeError when paths is not an array', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.include('author'), {
        name: 'TypeError',
        message: 'include() paths must be an array'
      });
    });

    it('throws TypeError when paths is empty', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.include([]), {
        name: 'TypeError',
        message: 'include() paths must not be empty'
      });
    });

    it('throws TypeError when a path element is not a string', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.include([42]), {
        name: 'TypeError',
        message: 'include() paths[0] must be a non-empty string'
      });
    });

    it('throws TypeError when a path element is an empty string', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.include(['']), {
        name: 'TypeError',
        message: 'include() paths[0] must be a non-empty string'
      });
    });
  });

  describe('filter()', () => {
    it('serializes filter criteria', () => {
      const q = createQueryBuilder().filter({published: true, category: 'tech'});

      assert.equal(q.toString(), 'filter[published]=true&filter[category]=tech');
    });

    it('serializes numeric filter values', () => {
      const q = createQueryBuilder().filter({minAge: 18});

      assert.equal(q.toString(), 'filter[minAge]=18');
    });

    it('serializes boolean filter values', () => {
      const q = createQueryBuilder().filter({active: false});

      assert.equal(q.toString(), 'filter[active]=false');
    });

    it('merges filter criteria across calls', () => {
      const q = createQueryBuilder().filter({published: true}).filter({category: 'tech'});

      assert.equal(q.toString(), 'filter[published]=true&filter[category]=tech');
    });

    it('overwrites same-key filter criteria', () => {
      const q = createQueryBuilder().filter({status: 'draft'}).filter({status: 'published'});

      assert.equal(q.toString(), 'filter[status]=published');
    });

    it('URI-encodes filter keys and values', () => {
      const q = createQueryBuilder().filter({'my key': 'my value'});

      assert.equal(q.toString(), 'filter[my%20key]=my%20value');
    });

    it('throws TypeError when criteria is null', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.filter(null), {
        name: 'TypeError',
        message: 'filter() criteria must be a non-null object'
      });
    });

    it('throws TypeError when criteria is a string', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.filter('invalid'), {
        name: 'TypeError',
        message: 'filter() criteria must be a non-null object'
      });
    });

    it('throws TypeError when criteria is an array', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.filter([]), {
        name: 'TypeError',
        message: 'filter() criteria must be a non-null object'
      });
    });

    it('throws TypeError when criteria is empty', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.filter({}), {
        name: 'TypeError',
        message: 'filter() criteria must not be empty'
      });
    });

    it('throws TypeError when a filter value is an object', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.filter({nested: {}}), {
        name: 'TypeError',
        message: /filter\(\) criteria\['nested'\] must be a string, number, or boolean/
      });
    });

    it('throws TypeError when a filter value is an array', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.filter({tags: [1, 2]}), {
        name: 'TypeError',
        message: /filter\(\) criteria\['tags'\] must be a string, number, or boolean/
      });
    });

    it('throws TypeError when a filter value is null', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.filter({status: null}), {
        name: 'TypeError',
        message: /filter\(\) criteria\['status'\] must be a string, number, or boolean/
      });
    });

    it('throws TypeError when a filter value is undefined', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.filter({status: undefined}), {
        name: 'TypeError',
        message: /filter\(\) criteria\['status'\] must be a string, number, or boolean/
      });
    });

    it('throws TypeError when a filter key is an empty string', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.filter({'': 'value'}), {
        name: 'TypeError',
        message: 'filter() criteria keys must be non-empty strings'
      });
    });
  });

  describe('sort()', () => {
    it('serializes sort fields', () => {
      const q = createQueryBuilder().sort(['-createdAt', 'title']);

      assert.equal(q.toString(), 'sort=-createdAt,title');
    });

    it('replaces previous sort', () => {
      const q = createQueryBuilder().sort(['-createdAt']).sort(['title']);

      assert.equal(q.toString(), 'sort=title');
    });

    it('preserves descending prefix', () => {
      const q = createQueryBuilder().sort(['-updatedAt']);

      assert.equal(q.toString(), 'sort=-updatedAt');
    });

    it('throws TypeError when fields is not an array', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.sort('title'), {
        name: 'TypeError',
        message: 'sort() fields must be an array'
      });
    });

    it('throws TypeError when fields is empty', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.sort([]), {
        name: 'TypeError',
        message: 'sort() fields must not be empty'
      });
    });

    it('throws TypeError when a field element is not a string', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.sort([42]), {
        name: 'TypeError',
        message: 'sort() fields[0] must be a non-empty string'
      });
    });

    it('throws TypeError when a field element is an empty string', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.sort(['']), {
        name: 'TypeError',
        message: 'sort() fields[0] must be a non-empty string'
      });
    });
  });

  describe('page()', () => {
    it('serializes page-number strategy', () => {
      const q = createQueryBuilder().page({number: 2, size: 10});

      assert.equal(q.toString(), 'page[number]=2&page[size]=10');
    });

    it('serializes offset/limit strategy', () => {
      const q = createQueryBuilder().page({offset: 20, limit: 10});

      assert.equal(q.toString(), 'page[offset]=20&page[limit]=10');
    });

    it('serializes cursor strategy', () => {
      const q = createQueryBuilder().page({cursor: 'abc123'});

      assert.equal(q.toString(), 'page[cursor]=abc123');
    });

    it('replaces previous page params', () => {
      const q = createQueryBuilder().page({number: 1, size: 10}).page({number: 2, size: 10});

      assert.equal(q.toString(), 'page[number]=2&page[size]=10');
    });

    it('allows changing strategy across calls (replacement semantics)', () => {
      const q = createQueryBuilder().page({number: 1, size: 10}).page({cursor: 'xyz'});

      assert.equal(q.toString(), 'page[cursor]=xyz');
    });

    it('accepts custom page params not in any strategy group', () => {
      const q = createQueryBuilder().page({after: 'cursor-value', size: 25});

      const qs = q.toString();
      assert.equal(qs.includes('page[after]=cursor-value'), true);
      assert.equal(qs.includes('page[size]=25'), true);
    });

    it('throws TypeError when params is null', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.page(null), {
        name: 'TypeError',
        message: 'page() params must be a non-null object'
      });
    });

    it('throws TypeError when params is a string', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.page('invalid'), {
        name: 'TypeError',
        message: 'page() params must be a non-null object'
      });
    });

    it('throws TypeError when params is an array', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.page([]), {
        name: 'TypeError',
        message: 'page() params must be a non-null object'
      });
    });

    it('throws TypeError when params is empty', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.page({}), {
        name: 'TypeError',
        message: 'page() params must not be empty'
      });
    });

    it('throws TypeError when mixing number and cursor strategies', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.page({number: 1, cursor: 'abc'}), {
        name: 'TypeError',
        message: /mixes pagination strategies/
      });
    });

    it('throws TypeError when mixing offset and cursor strategies', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.page({offset: 0, cursor: 'abc'}), {
        name: 'TypeError',
        message: /mixes pagination strategies/
      });
    });

    it('throws TypeError when mixing number and offset strategies', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.page({number: 1, offset: 0}), {
        name: 'TypeError',
        message: /mixes pagination strategies/
      });
    });

    it('throws TypeError when a page value is an object', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.page({number: {}}), {
        name: 'TypeError',
        message: /page\(\) params\['number'\] must be a string, number, or boolean/
      });
    });

    it('throws TypeError when a page key is an empty string', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.page({'': 1}), {
        name: 'TypeError',
        message: 'page() params keys must be non-empty strings'
      });
    });
  });

  describe('param()', () => {
    it('serializes a custom parameter', () => {
      const q = createQueryBuilder().param('camelCase', 'value');

      assert.equal(q.toString(), 'camelCase=value');
    });

    it('serializes a custom parameter with hyphen', () => {
      const q = createQueryBuilder().param('x-custom', 'value');

      assert.equal(q.toString(), 'x-custom=value');
    });

    it('serializes a custom parameter with uppercase', () => {
      const q = createQueryBuilder().param('UPPER', 42);

      assert.equal(q.toString(), 'UPPER=42');
    });

    it('serializes a boolean parameter value', () => {
      const q = createQueryBuilder().param('Flag', true);

      assert.equal(q.toString(), 'Flag=true');
    });

    it('accumulates custom parameters', () => {
      const q = createQueryBuilder().param('camelCase', 'a').param('x-custom', 'b');

      assert.equal(q.toString(), 'camelCase=a&x-custom=b');
    });

    it('overwrites same-key custom parameters', () => {
      const q = createQueryBuilder().param('camelCase', 'old').param('camelCase', 'new');

      assert.equal(q.toString(), 'camelCase=new');
    });

    it('URI-encodes custom parameter keys and values', () => {
      const q = createQueryBuilder().param('my Param', 'special value');

      assert.equal(q.toString(), 'my%20Param=special%20value');
    });

    it('throws TypeError when key is in the reserved namespace (all lowercase)', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.param('lowercase', 'value'), {
        name: 'TypeError',
        message: /reserved namespace/
      });
    });

    it('throws TypeError for single-char lowercase key', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.param('a', 'value'), {
        name: 'TypeError',
        message: /reserved namespace/
      });
    });

    it('throws TypeError for "filter" as a custom param key', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.param('filter', 'value'), {
        name: 'TypeError',
        message: /reserved namespace/
      });
    });

    it('throws TypeError for "sort" as a custom param key', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.param('sort', 'value'), {
        name: 'TypeError',
        message: /reserved namespace/
      });
    });

    it('throws TypeError for "include" as a custom param key', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.param('include', 'value'), {
        name: 'TypeError',
        message: /reserved namespace/
      });
    });

    it('throws TypeError for "page" as a custom param key', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.param('page', 'value'), {
        name: 'TypeError',
        message: /reserved namespace/
      });
    });

    it('throws TypeError for "fields" as a custom param key', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.param('fields', 'value'), {
        name: 'TypeError',
        message: /reserved namespace/
      });
    });

    it('throws TypeError when key is not a string', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.param(42, 'value'), {
        name: 'TypeError',
        message: 'param() key must be a non-empty string'
      });
    });

    it('throws TypeError when key is an empty string', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.param('', 'value'), {
        name: 'TypeError',
        message: 'param() key must be a non-empty string'
      });
    });

    it('throws TypeError when value is an object', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.param('camelCase', {}), {
        name: 'TypeError',
        message: /param\(\) value must be a string, number, or boolean/
      });
    });

    it('throws TypeError when value is null', () => {
      const builder = createQueryBuilder();

      assert.throws(() => builder.param('camelCase', null), {
        name: 'TypeError',
        message: /param\(\) value must be a string, number, or boolean/
      });
    });
  });

  describe('toString()', () => {
    it('returns empty string for empty builder', () => {
      const q = createQueryBuilder();

      assert.equal(q.toString(), '');
    });

    it('returns empty string for builder with only a path', () => {
      const q = createQueryBuilder('/articles');

      assert.equal(q.toString(), '');
    });

    it('serializes a full query', () => {
      const q = createQueryBuilder('/articles')
        .fields('articles', ['title', 'body', 'createdAt'])
        .fields('authors', ['name', 'avatar'])
        .include(['author', 'comments', 'comments.author'])
        .filter({published: true, category: 'tech'})
        .sort(['-createdAt', 'title'])
        .page({number: 2, size: 10});

      const qs = q.toString();
      assert.equal(qs.includes('fields[articles]=title,body,createdAt'), true);
      assert.equal(qs.includes('fields[authors]=name,avatar'), true);
      assert.equal(qs.includes('include=author,comments,comments.author'), true);
      assert.equal(qs.includes('filter[published]=true'), true);
      assert.equal(qs.includes('filter[category]=tech'), true);
      assert.equal(qs.includes('sort=-createdAt,title'), true);
      assert.equal(qs.includes('page[number]=2'), true);
      assert.equal(qs.includes('page[size]=10'), true);
    });

    it('produces deterministic output for the same operations', () => {
      const q1 = createQueryBuilder().fields('articles', ['title']).filter({published: true});

      const q2 = createQueryBuilder().fields('articles', ['title']).filter({published: true});

      assert.equal(q1.toString(), q2.toString());
    });

    it('orders parameters: fields, include, filter, sort, page, custom', () => {
      const q = createQueryBuilder()
        .param('Custom', 'last')
        .page({number: 1, size: 10})
        .sort(['-createdAt'])
        .filter({published: true})
        .include(['author'])
        .fields('articles', ['title']);

      const qs = q.toString();
      const fieldsIdx = qs.indexOf('fields[');
      const includeIdx = qs.indexOf('include=');
      const filterIdx = qs.indexOf('filter[');
      const sortIdx = qs.indexOf('sort=');
      const pageIdx = qs.indexOf('page[');
      const customIdx = qs.indexOf('Custom=');

      assert.equal(fieldsIdx < includeIdx, true);
      assert.equal(includeIdx < filterIdx, true);
      assert.equal(filterIdx < sortIdx, true);
      assert.equal(sortIdx < pageIdx, true);
      assert.equal(pageIdx < customIdx, true);
    });

    it('joins parameters with &', () => {
      const q = createQueryBuilder().fields('articles', ['title']).include(['author']);

      assert.equal(q.toString(), 'fields[articles]=title&include=author');
    });

    it('does not include a leading ?', () => {
      const q = createQueryBuilder().fields('articles', ['title']);

      assert.equal(q.toString().startsWith('?'), false);
    });
  });

  describe('path property', () => {
    it('returns the base path', () => {
      const q = createQueryBuilder('/articles');

      assert.equal(q.path, '/articles');
    });

    it('returns undefined when no base path is set', () => {
      const q = createQueryBuilder();

      assert.equal(q.path, undefined);
    });

    it('preserves path through builder chains', () => {
      const q = createQueryBuilder('/articles')
        .fields('articles', ['title'])
        .filter({published: true});

      assert.equal(q.path, '/articles');
    });
  });

  describe('fetch()', () => {
    it('calls client.get() with path and query string', async () => {
      const client = Object.create(null);
      client.get = mock.fn(function get() {
        return Promise.resolve({status: 200, body: []});
      });

      const q = createQueryBuilder('/articles').fields('articles', ['title']);
      await q.fetch(client);

      assert.equal(client.get.mock.callCount(), 1);
      const [path] = client.get.mock.calls[0].arguments;
      assert.equal(path, '/articles?fields[articles]=title');
    });

    it('calls client.get() with path only when no params', async () => {
      const client = Object.create(null);
      client.get = mock.fn(function get() {
        return Promise.resolve({status: 200, body: []});
      });

      const q = createQueryBuilder('/articles');
      await q.fetch(client);

      const [path] = client.get.mock.calls[0].arguments;
      assert.equal(path, '/articles');
    });

    it('returns the client response', async () => {
      const expected = {status: 200, body: [{id: 1}]};
      const client = Object.create(null);
      client.get = mock.fn(function get() {
        return Promise.resolve(expected);
      });

      const q = createQueryBuilder('/articles');
      const result = await q.fetch(client);

      assert.equal(result, expected);
    });

    it('throws TypeError when client is null', () => {
      const q = createQueryBuilder('/articles');

      assert.throws(() => q.fetch(null), {
        name: 'TypeError',
        message: 'fetch() client must be a non-null object'
      });
    });

    it('throws TypeError when client is undefined', () => {
      const q = createQueryBuilder('/articles');

      assert.throws(() => q.fetch(undefined), {
        name: 'TypeError',
        message: 'fetch() client must be a non-null object'
      });
    });

    it('throws TypeError when client is a string', () => {
      const q = createQueryBuilder('/articles');

      assert.throws(() => q.fetch('not-a-client'), {
        name: 'TypeError',
        message: 'fetch() client must be a non-null object'
      });
    });

    it('throws TypeError when client.get is not a function', () => {
      const q = createQueryBuilder('/articles');

      assert.throws(() => q.fetch({}), {
        name: 'TypeError',
        message: 'fetch() client.get must be a function'
      });
    });

    it('throws TypeError when no base path is set', () => {
      const client = Object.create(null);
      client.get = mock.fn();

      const q = createQueryBuilder();

      assert.throws(() => q.fetch(client), {
        name: 'TypeError',
        message: /requires a base path/
      });
    });
  });

  describe('method chaining', () => {
    it('produces correct output for a typical JSON:API query', () => {
      const q = createQueryBuilder('/articles')
        .fields('articles', ['title', 'body', 'createdAt'])
        .fields('authors', ['name', 'avatar'])
        .include(['author', 'comments', 'comments.author'])
        .filter({published: true, category: 'tech'})
        .sort(['-createdAt', 'title'])
        .page({number: 2, size: 10});

      const expected =
        'fields[articles]=title,body,createdAt' +
        '&fields[authors]=name,avatar' +
        '&include=author,comments,comments.author' +
        '&filter[published]=true' +
        '&filter[category]=tech' +
        '&sort=-createdAt,title' +
        '&page[number]=2' +
        '&page[size]=10';

      assert.equal(q.toString(), expected);
    });

    it('supports building page variants from a common base', () => {
      const base = createQueryBuilder('/articles')
        .fields('articles', ['title'])
        .sort(['-createdAt']);

      const page1 = base.page({number: 1, size: 10});
      const page2 = base.page({number: 2, size: 10});

      assert.equal(page1.toString().includes('page[number]=1'), true);
      assert.equal(page2.toString().includes('page[number]=2'), true);
      assert.equal(page1.toString().includes('fields[articles]=title'), true);
      assert.equal(page2.toString().includes('fields[articles]=title'), true);
    });

    it('supports combining custom params with standard params', () => {
      const q = createQueryBuilder('/articles')
        .filter({published: true})
        .param('camelCase', 'value');

      const qs = q.toString();
      assert.equal(qs.includes('filter[published]=true'), true);
      assert.equal(qs.includes('camelCase=value'), true);
    });
  });
});

describe('isQueryBuilder', () => {
  it('returns true for a query builder', () => {
    const builder = createQueryBuilder('/articles');

    assert.equal(isQueryBuilder(builder), true);
  });

  it('returns true for a chained query builder', () => {
    const builder = createQueryBuilder('/articles').fields('articles', ['title']);

    assert.equal(isQueryBuilder(builder), true);
  });

  it('returns false for null', () => {
    assert.equal(isQueryBuilder(null), false);
  });

  it('returns false for undefined', () => {
    assert.equal(isQueryBuilder(undefined), false);
  });

  it('returns false for a string', () => {
    assert.equal(isQueryBuilder('not-a-builder'), false);
  });

  it('returns false for a number', () => {
    assert.equal(isQueryBuilder(42), false);
  });

  it('returns false for a plain object', () => {
    assert.equal(isQueryBuilder({}), false);
  });

  it('returns false for an object with the symbol set to false', () => {
    const fake = {[Symbol.for('ergo-fetch:query-builder')]: false};

    assert.equal(isQueryBuilder(fake), false);
  });

  it('returns true for an object with the symbol set to true', () => {
    const duckTyped = {[Symbol.for('ergo-fetch:query-builder')]: true};

    assert.equal(isQueryBuilder(duckTyped), true);
  });
});
