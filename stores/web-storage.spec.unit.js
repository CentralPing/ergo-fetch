/**
 * @fileoverview Boundary tests for the Web Storage cache store.
 * @module @centralping/ergo-fetch/stores/web-storage.spec
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';

import {createWebStorageStore} from './web-storage.js';

/**
 * Creates a null-prototype CacheEntry for test assertions.
 * Web storage store returns null-prototype objects (deserialized external data),
 * so test expectations must match.
 *
 * @param {object} props - Entry properties.
 * @returns {object} - Null-prototype object with the given properties.
 */
function entry(props) {
  const obj = Object.create(null);
  for (const [key, value] of Object.entries(props)) {
    obj[key] = value;
  }
  return obj;
}

/**
 * Creates a Map-backed mock that implements the Web Storage interface.
 * Used because Node.js does not provide a native localStorage/sessionStorage.
 *
 * @param {object} [options] - Mock configuration.
 * @param {number} [options.quota] - Maximum total bytes before QuotaExceededError.
 * @param {boolean} [options.throwOnAccess] - Throw SecurityError on any operation.
 * @returns {Storage} - Mock storage instance.
 */
function createMockStorage(options) {
  const throwOnAccess = options?.throwOnAccess ?? false;
  const quota = options?.quota ?? Infinity;
  const map = new Map();

  function checkSecurity() {
    if (throwOnAccess) {
      const err = new DOMException('Access denied', 'SecurityError');
      throw err;
    }
  }

  function totalSize() {
    let size = 0;
    for (const [k, v] of map) {
      size += k.length + v.length;
    }
    return size;
  }

  return {
    get length() {
      checkSecurity();
      return map.size;
    },

    key(index) {
      checkSecurity();
      const keys = [...map.keys()];
      return keys[index] ?? null;
    },

    getItem(key) {
      checkSecurity();
      return map.get(key) ?? null;
    },

    setItem(key, value) {
      checkSecurity();
      const str = String(value);
      const existingSize = map.has(key) ? key.length + map.get(key).length : 0;
      const newSize = totalSize() - existingSize + key.length + str.length;
      if (newSize > quota) {
        const err = new DOMException('Quota exceeded', 'QuotaExceededError');
        throw err;
      }
      map.set(key, str);
    },

    removeItem(key) {
      checkSecurity();
      map.delete(key);
    },

    clear() {
      checkSecurity();
      map.clear();
    }
  };
}

describe('createWebStorageStore', () => {
  describe('factory validation', () => {
    it('creates a store with default options', () => {
      const storage = createMockStorage();
      const store = createWebStorageStore({storage});
      assert.equal(typeof store.get, 'function');
      assert.equal(typeof store.set, 'function');
      assert.equal(typeof store.delete, 'function');
      assert.equal(typeof store.clear, 'function');
    });

    it('accepts explicit maxEntries', () => {
      const storage = createMockStorage();
      const store = createWebStorageStore({storage, maxEntries: 5});
      assert.equal(typeof store.get, 'function');
    });

    it('accepts explicit prefix', () => {
      const storage = createMockStorage();
      const store = createWebStorageStore({storage, prefix: 'custom:'});
      assert.equal(typeof store.get, 'function');
    });

    it('throws TypeError for maxEntries of zero', () => {
      const storage = createMockStorage();
      assert.throws(() => createWebStorageStore({storage, maxEntries: 0}), {
        name: 'TypeError',
        message: /positive integer/
      });
    });

    it('throws TypeError for negative maxEntries', () => {
      const storage = createMockStorage();
      assert.throws(() => createWebStorageStore({storage, maxEntries: -1}), {
        name: 'TypeError',
        message: /positive integer/
      });
    });

    it('throws TypeError for non-integer maxEntries', () => {
      const storage = createMockStorage();
      assert.throws(() => createWebStorageStore({storage, maxEntries: 1.5}), {
        name: 'TypeError',
        message: /positive integer/
      });
    });

    it('throws TypeError for NaN maxEntries', () => {
      const storage = createMockStorage();
      assert.throws(() => createWebStorageStore({storage, maxEntries: NaN}), {
        name: 'TypeError',
        message: /positive integer/
      });
    });

    it('throws TypeError for non-string prefix', () => {
      const storage = createMockStorage();
      assert.throws(() => createWebStorageStore({storage, prefix: 123}), {
        name: 'TypeError',
        message: /prefix must be a string/
      });
    });

    it('throws TypeError for non-object storage', () => {
      assert.throws(() => createWebStorageStore({storage: 'bad'}), {
        name: 'TypeError',
        message: /storage must be an object/
      });
    });

    it('throws TypeError for null storage', () => {
      assert.throws(() => createWebStorageStore({storage: null}), {
        name: 'TypeError',
        message: /storage must be an object/
      });
    });

    it('returns a frozen object', () => {
      const storage = createMockStorage();
      const store = createWebStorageStore({storage});
      assert.equal(Object.isFrozen(store), true);
    });

    it('returns a null-prototype object', () => {
      const storage = createMockStorage();
      const store = createWebStorageStore({storage});
      assert.equal(Object.getPrototypeOf(store), null);
    });
  });

  describe('SecurityError fallback', () => {
    it('returns a no-op store when storage throws SecurityError', () => {
      const storage = createMockStorage({throwOnAccess: true});
      const store = createWebStorageStore({storage});
      assert.equal(Object.isFrozen(store), true);
      assert.equal(Object.getPrototypeOf(store), null);
    });

    it('get returns undefined on SecurityError store', async () => {
      const storage = createMockStorage({throwOnAccess: true});
      const store = createWebStorageStore({storage});
      const result = await store.get('key');
      assert.equal(result, undefined);
    });

    it('set resolves on SecurityError store', async () => {
      const storage = createMockStorage({throwOnAccess: true});
      const store = createWebStorageStore({storage});
      const result = await store.set('key', {etag: '"v1"'});
      assert.equal(result, undefined);
    });

    it('delete returns false on SecurityError store', async () => {
      const storage = createMockStorage({throwOnAccess: true});
      const store = createWebStorageStore({storage});
      const result = await store.delete('key');
      assert.equal(result, false);
    });

    it('clear resolves on SecurityError store', async () => {
      const storage = createMockStorage({throwOnAccess: true});
      const store = createWebStorageStore({storage});
      const result = await store.clear();
      assert.equal(result, undefined);
    });
  });

  describe('get', () => {
    let storage;
    let store;

    beforeEach(() => {
      storage = createMockStorage();
      store = createWebStorageStore({storage});
    });

    it('returns undefined for a missing key', async () => {
      const result = await store.get('missing');
      assert.equal(result, undefined);
    });

    it('returns the stored entry for an existing key', async () => {
      await store.set('key', {etag: '"abc"', body: {id: 1}});
      const result = await store.get('key');
      assert.deepStrictEqual(result, entry({etag: '"abc"', body: {id: 1}}));
    });

    it('returns a null-prototype entry', async () => {
      await store.set('key', {etag: '"v1"'});
      const result = await store.get('key');
      assert.equal(Object.getPrototypeOf(result), null);
    });

    it('returns a Promise', () => {
      const result = store.get('key');
      assert.equal(result instanceof Promise, true);
    });

    it('returns undefined for corrupted storage values', async () => {
      storage.setItem('ergo-fetch:corrupt', 'not-json{{{');
      const result = await store.get('corrupt');
      assert.equal(result, undefined);
    });

    it('removes corrupted entries from storage', async () => {
      storage.setItem('ergo-fetch:corrupt', 'not-json{{{');
      await store.get('corrupt');
      assert.equal(storage.getItem('ergo-fetch:corrupt'), null);
    });

    it('returns undefined for non-object stored values', async () => {
      storage.setItem('ergo-fetch:scalar', JSON.stringify(42));
      const result = await store.get('scalar');
      assert.equal(result, undefined);
    });
  });

  describe('set', () => {
    let storage;
    let store;

    beforeEach(() => {
      storage = createMockStorage();
      store = createWebStorageStore({storage});
    });

    it('stores an entry retrievable by get', async () => {
      const input = {etag: '"v1"', lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT', body: 'data'};
      await store.set('resource', input);
      const result = await store.get('resource');
      assert.deepStrictEqual(
        result,
        entry({etag: '"v1"', lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT', body: 'data'})
      );
    });

    it('overwrites an existing entry for the same key', async () => {
      await store.set('key', {etag: '"v1"'});
      await store.set('key', {etag: '"v2"'});
      const result = await store.get('key');
      assert.deepStrictEqual(result, entry({etag: '"v2"'}));
    });

    it('stores entries with partial fields', async () => {
      await store.set('etag-only', {etag: '"abc"'});
      assert.deepStrictEqual(await store.get('etag-only'), entry({etag: '"abc"'}));

      await store.set('lm-only', {lastModified: 'Thu, 01 Jan 2025 00:00:00 GMT'});
      assert.deepStrictEqual(
        await store.get('lm-only'),
        entry({lastModified: 'Thu, 01 Jan 2025 00:00:00 GMT'})
      );

      await store.set('body-only', {body: [1, 2, 3]});
      assert.deepStrictEqual(await store.get('body-only'), entry({body: [1, 2, 3]}));
    });

    it('returns a Promise that resolves to undefined', async () => {
      const result = await store.set('key', {etag: '"v1"'});
      assert.equal(result, undefined);
    });

    it('uses the configured prefix for storage keys', async () => {
      const customStore = createWebStorageStore({storage, prefix: 'test:'});
      await customStore.set('url', {etag: '"v1"'});
      assert.notEqual(storage.getItem('test:url'), null);
      assert.equal(storage.getItem('ergo-fetch:url'), null);
    });

    it('stores a timestamp alongside the entry', async () => {
      await store.set('key', {etag: '"v1"'});
      const raw = JSON.parse(storage.getItem('ergo-fetch:key'));
      assert.equal(typeof raw.timestamp, 'number');
      assert.ok(raw.timestamp > 0);
    });
  });

  describe('delete', () => {
    let storage;
    let store;

    beforeEach(() => {
      storage = createMockStorage();
      store = createWebStorageStore({storage});
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

    it('removes the entry from the underlying storage', async () => {
      await store.set('key', {etag: '"v1"'});
      await store.delete('key');
      assert.equal(storage.getItem('ergo-fetch:key'), null);
    });
  });

  describe('clear', () => {
    let storage;
    let store;

    beforeEach(() => {
      storage = createMockStorage();
      store = createWebStorageStore({storage});
    });

    it('removes all entries with the matching prefix', async () => {
      await store.set('a', {etag: '"1"'});
      await store.set('b', {etag: '"2"'});
      await store.set('c', {etag: '"3"'});
      await store.clear();
      assert.equal(await store.get('a'), undefined);
      assert.equal(await store.get('b'), undefined);
      assert.equal(await store.get('c'), undefined);
    });

    it('does not remove entries with a different prefix', async () => {
      storage.setItem('other:key', 'value');
      await store.set('a', {etag: '"1"'});
      await store.clear();
      assert.equal(storage.getItem('other:key'), 'value');
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

  describe('LRU eviction', () => {
    it('evicts the oldest entry when maxEntries is exceeded', async () => {
      const storage = createMockStorage();
      const store = createWebStorageStore({storage, maxEntries: 2});

      await store.set('first', {etag: '"1"'});
      await store.set('second', {etag: '"2"'});
      await store.set('third', {etag: '"3"'});

      assert.equal(await store.get('first'), undefined);
      assert.deepStrictEqual(await store.get('second'), entry({etag: '"2"'}));
      assert.deepStrictEqual(await store.get('third'), entry({etag: '"3"'}));
    });

    it('does not evict when overwriting an existing key', async () => {
      const storage = createMockStorage();
      const store = createWebStorageStore({storage, maxEntries: 2});

      await store.set('a', {etag: '"1"'});
      await store.set('b', {etag: '"2"'});
      await store.set('a', {etag: '"1-updated"'});

      assert.deepStrictEqual(await store.get('a'), entry({etag: '"1-updated"'}));
      assert.deepStrictEqual(await store.get('b'), entry({etag: '"2"'}));
    });

    it('works with maxEntries of 1', async () => {
      const storage = createMockStorage();
      const store = createWebStorageStore({storage, maxEntries: 1});

      await store.set('only', {etag: '"1"'});
      assert.deepStrictEqual(await store.get('only'), entry({etag: '"1"'}));

      await store.set('replacement', {etag: '"2"'});
      assert.equal(await store.get('only'), undefined);
      assert.deepStrictEqual(await store.get('replacement'), entry({etag: '"2"'}));
    });

    it('evicts entries in LRU order (oldest timestamp first)', async () => {
      const storage = createMockStorage();
      const store = createWebStorageStore({storage, maxEntries: 3});

      await store.set('a', {body: 1});
      await store.set('b', {body: 2});
      await store.set('c', {body: 3});
      await store.set('d', {body: 4});
      await store.set('e', {body: 5});

      assert.equal(await store.get('a'), undefined);
      assert.equal(await store.get('b'), undefined);
      assert.deepStrictEqual(await store.get('c'), entry({body: 3}));
      assert.deepStrictEqual(await store.get('d'), entry({body: 4}));
      assert.deepStrictEqual(await store.get('e'), entry({body: 5}));
    });

    it('only counts entries with the matching prefix', async () => {
      const storage = createMockStorage();
      storage.setItem('other:unrelated', 'data');
      const store = createWebStorageStore({storage, maxEntries: 2});

      await store.set('a', {etag: '"1"'});
      await store.set('b', {etag: '"2"'});

      assert.deepStrictEqual(await store.get('a'), entry({etag: '"1"'}));
      assert.deepStrictEqual(await store.get('b'), entry({etag: '"2"'}));
      assert.equal(storage.getItem('other:unrelated'), 'data');
    });
  });

  describe('QuotaExceededError recovery', () => {
    it('evicts entries to free space on QuotaExceededError', async () => {
      const storage = createMockStorage({quota: 300});
      const store = createWebStorageStore({storage, maxEntries: 50});

      await store.set('small1', {body: 'x'});
      await store.set('small2', {body: 'y'});
      await store.set('large', {body: 'z'.repeat(100)});

      const result = await store.get('large');
      assert.notEqual(result, undefined);
      assert.ok(result.body.startsWith('z'));
    });

    it('silently drops the entry when eviction cannot free enough space', async () => {
      const storage = createMockStorage({quota: 50});
      const store = createWebStorageStore({storage, maxEntries: 50});

      await store.set('huge', {body: 'x'.repeat(500)});

      const result = await store.get('huge');
      assert.equal(result, undefined);
    });
  });

  describe('namespace isolation', () => {
    it('two stores with different prefixes do not interfere', async () => {
      const storage = createMockStorage();
      const store1 = createWebStorageStore({storage, prefix: 'ns1:'});
      const store2 = createWebStorageStore({storage, prefix: 'ns2:'});

      await store1.set('key', {etag: '"from-store1"'});
      await store2.set('key', {etag: '"from-store2"'});

      assert.deepStrictEqual(await store1.get('key'), entry({etag: '"from-store1"'}));
      assert.deepStrictEqual(await store2.get('key'), entry({etag: '"from-store2"'}));
    });

    it('clear on one store does not affect the other', async () => {
      const storage = createMockStorage();
      const store1 = createWebStorageStore({storage, prefix: 'ns1:'});
      const store2 = createWebStorageStore({storage, prefix: 'ns2:'});

      await store1.set('key', {etag: '"v1"'});
      await store2.set('key', {etag: '"v2"'});
      await store1.clear();

      assert.equal(await store1.get('key'), undefined);
      assert.deepStrictEqual(await store2.get('key'), entry({etag: '"v2"'}));
    });

    it('eviction on one store does not evict from the other', async () => {
      const storage = createMockStorage();
      const store1 = createWebStorageStore({storage, prefix: 'ns1:', maxEntries: 1});
      const store2 = createWebStorageStore({storage, prefix: 'ns2:'});

      await store2.set('preserved', {etag: '"keep"'});
      await store1.set('a', {etag: '"1"'});
      await store1.set('b', {etag: '"2"'});

      assert.deepStrictEqual(await store2.get('preserved'), entry({etag: '"keep"'}));
    });
  });

  describe('serialization round-trip', () => {
    it('preserves string body values', async () => {
      const storage = createMockStorage();
      const store = createWebStorageStore({storage});
      await store.set('key', {body: 'hello world'});
      const result = await store.get('key');
      assert.equal(result.body, 'hello world');
    });

    it('preserves object body values', async () => {
      const storage = createMockStorage();
      const store = createWebStorageStore({storage});
      await store.set('key', {body: {name: 'test', items: [1, 2, 3]}});
      const result = await store.get('key');
      assert.deepStrictEqual(result.body, {name: 'test', items: [1, 2, 3]});
    });

    it('preserves array body values', async () => {
      const storage = createMockStorage();
      const store = createWebStorageStore({storage});
      await store.set('key', {body: [{id: 1}, {id: 2}]});
      const result = await store.get('key');
      assert.deepStrictEqual(result.body, [{id: 1}, {id: 2}]);
    });

    it('preserves null body values', async () => {
      const storage = createMockStorage();
      const store = createWebStorageStore({storage});
      await store.set('key', {body: null});
      const result = await store.get('key');
      assert.equal(result.body, null);
    });

    it('preserves numeric body values', async () => {
      const storage = createMockStorage();
      const store = createWebStorageStore({storage});
      await store.set('key', {body: 42});
      const result = await store.get('key');
      assert.equal(result.body, 42);
    });

    it('preserves boolean body values', async () => {
      const storage = createMockStorage();
      const store = createWebStorageStore({storage});
      await store.set('key', {body: false});
      const result = await store.get('key');
      assert.equal(result.body, false);
    });

    it('preserves combined etag + lastModified + body', async () => {
      const storage = createMockStorage();
      const store = createWebStorageStore({storage});
      const input = {
        etag: '"W/123"',
        lastModified: 'Sat, 05 Jul 2026 00:00:00 GMT',
        body: {complex: true}
      };
      await store.set('key', input);
      const result = await store.get('key');
      assert.deepStrictEqual(
        result,
        entry({
          etag: '"W/123"',
          lastModified: 'Sat, 05 Jul 2026 00:00:00 GMT',
          body: {complex: true}
        })
      );
    });

    it('omits undefined fields from stored entry', async () => {
      const storage = createMockStorage();
      const store = createWebStorageStore({storage});
      await store.set('key', {etag: '"v1"'});
      const result = await store.get('key');
      assert.equal(Object.keys(result).length, 1);
      assert.equal(result.etag, '"v1"');
      assert.equal('body' in result, false);
      assert.equal('lastModified' in result, false);
    });
  });

  describe('runtime storage errors (post-probe)', () => {
    it('get returns undefined when backend throws after probe', async () => {
      const storage = createMockStorage();
      const store = createWebStorageStore({storage});
      await store.set('key', {etag: '"v1"'});

      const originalGetItem = storage.getItem.bind(storage);
      storage.getItem = () => {
        throw new DOMException('Disk error', 'UnknownError');
      };

      const result = await store.get('key');
      assert.equal(result, undefined);

      storage.getItem = originalGetItem;
    });

    it('delete returns false when storage throws after probe', async () => {
      const storage = createMockStorage();
      const store = createWebStorageStore({storage});
      await store.set('key', {etag: '"v1"'});

      const originalGetItem = storage.getItem.bind(storage);
      storage.getItem = () => {
        throw new DOMException('Disk error', 'UnknownError');
      };

      const result = await store.delete('key');
      assert.equal(result, false);

      storage.getItem = originalGetItem;
    });

    it('clear resolves when storage throws during enumeration', async () => {
      const storage = createMockStorage();
      const store = createWebStorageStore({storage});
      await store.set('key', {etag: '"v1"'});

      const originalLength = Object.getOwnPropertyDescriptor(storage, 'length');
      Object.defineProperty(storage, 'length', {
        get() {
          throw new DOMException('Disk error', 'UnknownError');
        },
        configurable: true
      });

      const result = await store.clear();
      assert.equal(result, undefined);

      if (originalLength) {
        Object.defineProperty(storage, 'length', originalLength);
      }
    });

    it('eviction removes malformed entries encountered during scan', async () => {
      const storage = createMockStorage();
      const store = createWebStorageStore({storage, maxEntries: 2});

      await store.set('good', {etag: '"v1"'});
      storage.setItem('ergo-fetch:corrupt', 'not-valid-json{{{');

      await store.set('new', {etag: '"v2"'});

      assert.equal(storage.getItem('ergo-fetch:corrupt'), null);
      assert.deepStrictEqual(await store.get('new'), entry({etag: '"v2"'}));
    });
  });
});
