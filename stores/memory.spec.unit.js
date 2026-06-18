/**
 * @fileoverview Boundary tests for the in-memory cache store.
 * @module @centralping/ergo-fetch/stores/memory.spec
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';

import {createMemoryStore} from './memory.js';

describe('createMemoryStore', () => {
  describe('factory validation', () => {
    it('creates a store with default options', () => {
      const store = createMemoryStore();
      assert.equal(typeof store.get, 'function');
      assert.equal(typeof store.set, 'function');
      assert.equal(typeof store.delete, 'function');
      assert.equal(typeof store.clear, 'function');
    });

    it('accepts explicit maxEntries', () => {
      const store = createMemoryStore({maxEntries: 5});
      assert.equal(typeof store.get, 'function');
    });

    it('throws TypeError for maxEntries of zero', () => {
      assert.throws(() => createMemoryStore({maxEntries: 0}), {
        name: 'TypeError',
        message: /positive integer/
      });
    });

    it('throws TypeError for negative maxEntries', () => {
      assert.throws(() => createMemoryStore({maxEntries: -1}), {
        name: 'TypeError',
        message: /positive integer/
      });
    });

    it('throws TypeError for non-integer maxEntries', () => {
      assert.throws(() => createMemoryStore({maxEntries: 1.5}), {
        name: 'TypeError',
        message: /positive integer/
      });
    });

    it('throws TypeError for NaN maxEntries', () => {
      assert.throws(() => createMemoryStore({maxEntries: NaN}), {
        name: 'TypeError',
        message: /positive integer/
      });
    });

    it('throws TypeError for string maxEntries', () => {
      assert.throws(() => createMemoryStore({maxEntries: '10'}), {
        name: 'TypeError',
        message: /positive integer/
      });
    });

    it('returns a frozen object', () => {
      const store = createMemoryStore();
      assert.equal(Object.isFrozen(store), true);
    });

    it('returns a null-prototype object', () => {
      const store = createMemoryStore();
      assert.equal(Object.getPrototypeOf(store), null);
    });
  });

  describe('get', () => {
    let store;

    beforeEach(() => {
      store = createMemoryStore();
    });

    it('returns undefined for a missing key', async () => {
      const result = await store.get('missing');
      assert.equal(result, undefined);
    });

    it('returns the stored entry for an existing key', async () => {
      const entry = {etag: '"abc"', body: {id: 1}};
      await store.set('key', entry);
      const result = await store.get('key');
      assert.deepStrictEqual(result, entry);
    });

    it('returns a Promise', () => {
      const result = store.get('key');
      assert.equal(result instanceof Promise, true);
    });
  });

  describe('set', () => {
    let store;

    beforeEach(() => {
      store = createMemoryStore();
    });

    it('stores an entry retrievable by get', async () => {
      const entry = {etag: '"v1"', lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT', body: 'data'};
      await store.set('resource', entry);
      const result = await store.get('resource');
      assert.deepStrictEqual(result, entry);
    });

    it('overwrites an existing entry for the same key', async () => {
      await store.set('key', {etag: '"v1"'});
      await store.set('key', {etag: '"v2"'});
      const result = await store.get('key');
      assert.deepStrictEqual(result, {etag: '"v2"'});
    });

    it('stores entries with partial fields', async () => {
      await store.set('etag-only', {etag: '"abc"'});
      assert.deepStrictEqual(await store.get('etag-only'), {etag: '"abc"'});

      await store.set('lm-only', {lastModified: 'Thu, 01 Jan 2025 00:00:00 GMT'});
      assert.deepStrictEqual(await store.get('lm-only'), {
        lastModified: 'Thu, 01 Jan 2025 00:00:00 GMT'
      });

      await store.set('body-only', {body: [1, 2, 3]});
      assert.deepStrictEqual(await store.get('body-only'), {body: [1, 2, 3]});
    });

    it('returns a Promise that resolves to undefined', async () => {
      const result = await store.set('key', {etag: '"v1"'});
      assert.equal(result, undefined);
    });
  });

  describe('delete', () => {
    let store;

    beforeEach(() => {
      store = createMemoryStore();
    });

    it('returns true when deleting an existing entry', async () => {
      await store.set('key', {etag: '"v1"'});
      const result = await store.delete('key');
      assert.equal(result, true);
    });

    it('returns false when deleting a non-existent entry', async () => {
      const result = await store.delete('missing');
      assert.equal(result, false);
    });

    it('makes the entry unretrievable after deletion', async () => {
      await store.set('key', {etag: '"v1"'});
      await store.delete('key');
      const result = await store.get('key');
      assert.equal(result, undefined);
    });
  });

  describe('clear', () => {
    let store;

    beforeEach(() => {
      store = createMemoryStore();
    });

    it('removes all entries', async () => {
      await store.set('a', {etag: '"1"'});
      await store.set('b', {etag: '"2"'});
      await store.set('c', {etag: '"3"'});
      await store.clear();
      assert.equal(await store.get('a'), undefined);
      assert.equal(await store.get('b'), undefined);
      assert.equal(await store.get('c'), undefined);
    });

    it('returns a Promise that resolves to undefined', async () => {
      const result = await store.clear();
      assert.equal(result, undefined);
    });

    it('is safe to call on an empty store', async () => {
      await store.clear();
      assert.equal(await store.get('any'), undefined);
    });
  });

  describe('eviction', () => {
    it('evicts the oldest entry when maxEntries is exceeded', async () => {
      const store = createMemoryStore({maxEntries: 2});
      await store.set('first', {etag: '"1"'});
      await store.set('second', {etag: '"2"'});
      await store.set('third', {etag: '"3"'});

      assert.equal(await store.get('first'), undefined);
      assert.deepStrictEqual(await store.get('second'), {etag: '"2"'});
      assert.deepStrictEqual(await store.get('third'), {etag: '"3"'});
    });

    it('refreshes position when overwriting an existing key', async () => {
      const store = createMemoryStore({maxEntries: 2});
      await store.set('a', {etag: '"1"'});
      await store.set('b', {etag: '"2"'});
      await store.set('a', {etag: '"1-updated"'});
      await store.set('c', {etag: '"3"'});

      assert.equal(await store.get('b'), undefined);
      assert.deepStrictEqual(await store.get('a'), {etag: '"1-updated"'});
      assert.deepStrictEqual(await store.get('c'), {etag: '"3"'});
    });

    it('works with maxEntries of 1', async () => {
      const store = createMemoryStore({maxEntries: 1});
      await store.set('only', {etag: '"1"'});
      assert.deepStrictEqual(await store.get('only'), {etag: '"1"'});

      await store.set('replacement', {etag: '"2"'});
      assert.equal(await store.get('only'), undefined);
      assert.deepStrictEqual(await store.get('replacement'), {etag: '"2"'});
    });

    it('evicts multiple entries in FIFO order', async () => {
      const store = createMemoryStore({maxEntries: 3});
      await store.set('a', {body: 1});
      await store.set('b', {body: 2});
      await store.set('c', {body: 3});
      await store.set('d', {body: 4});
      await store.set('e', {body: 5});

      assert.equal(await store.get('a'), undefined);
      assert.equal(await store.get('b'), undefined);
      assert.deepStrictEqual(await store.get('c'), {body: 3});
      assert.deepStrictEqual(await store.get('d'), {body: 4});
      assert.deepStrictEqual(await store.get('e'), {body: 5});
    });
  });
});
