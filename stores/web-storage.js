/**
 * @fileoverview Web Storage cache store implementing the CacheStore interface.
 * @module @centralping/ergo-fetch/stores/web-storage
 */

/** @type {number} */
const DEFAULT_MAX_ENTRIES = 100;

/** @type {string} */
const DEFAULT_PREFIX = 'ergo-fetch:';

/**
 * @typedef {object} CacheEntry
 * @property {string} [etag] - ETag value for the cached resource.
 * @property {string} [lastModified] - Last-Modified value for the cached resource.
 * @property {*} [body] - Cached response body.
 */

/**
 * @typedef {object} StoredEntry
 * @property {string} [etag] - ETag value for the cached resource.
 * @property {string} [lastModified] - Last-Modified value for the cached resource.
 * @property {*} [body] - Cached response body.
 * @property {number} timestamp - Epoch milliseconds when the entry was stored.
 */

/**
 * @typedef {object} CacheStore
 * @property {(key: string) => Promise<CacheEntry | undefined>} get - Retrieves a cache entry.
 * @property {(key: string, entry: CacheEntry) => Promise<void>} set - Stores a cache entry.
 * @property {(key: string) => Promise<boolean>} delete - Removes a cache entry.
 * @property {() => Promise<void>} clear - Removes all cache entries.
 */

/**
 * @typedef {object} WebStorageStoreOptions
 * @property {Storage} [storage] - Web Storage backend (default: localStorage).
 * @property {string} [prefix] - Key prefix for namespacing (default: 'ergo-fetch:').
 * @property {number} [maxEntries] - Maximum entries before oldest-entry eviction (default: 100).
 */

/**
 * Collects all storage keys that match the given prefix.
 *
 * @param {Storage} storage - The Web Storage backend.
 * @param {string} prefix - The key prefix to match.
 * @returns {string[]} - Matching keys.
 */
function getPrefixedKeys(storage, prefix) {
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null && key.startsWith(prefix)) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Evicts the oldest entry (by timestamp) from storage among entries matching the prefix.
 *
 * @param {Storage} storage - The Web Storage backend.
 * @param {string} prefix - The key prefix to match.
 * @returns {boolean} - Whether an entry was evicted.
 */
function evictOldest(storage, prefix) {
  const keys = getPrefixedKeys(storage, prefix);
  if (keys.length === 0) return false;

  let oldestKey = keys[0];
  let oldestTimestamp = Infinity;

  for (const key of keys) {
    const raw = storage.getItem(key);
    if (raw === null) continue;

    try {
      const parsed = JSON.parse(raw);
      const ts = parsed.timestamp ?? Infinity;
      if (ts < oldestTimestamp) {
        oldestTimestamp = ts;
        oldestKey = key;
      }
    } catch {
      storage.removeItem(key);
      return true;
    }
  }

  storage.removeItem(oldestKey);
  return true;
}

/**
 * Deserializes a stored entry into a null-prototype CacheEntry.
 *
 * @param {string} raw - The raw JSON string from storage.
 * @returns {CacheEntry | undefined} - The deserialized entry, or undefined on failure.
 */
function deserializeEntry(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;

    const entry = Object.create(null);
    if (parsed.etag !== undefined) entry.etag = parsed.etag;
    if (parsed.lastModified !== undefined) entry.lastModified = parsed.lastModified;
    if (parsed.body !== undefined) entry.body = parsed.body;
    return entry;
  } catch {
    return undefined;
  }
}

/**
 * Creates a no-op cache store that silently ignores all operations.
 * Used as a fallback when the storage backend is unavailable (e.g., SecurityError
 * in private browsing mode).
 *
 * @returns {CacheStore} - A frozen no-op cache store.
 */
function createNoOpStore() {
  const store = Object.create(null);

  store.get = function get() {
    return Promise.resolve(undefined);
  };

  store.set = function set() {
    return Promise.resolve();
  };

  store.delete = function del() {
    return Promise.resolve(false);
  };

  store.clear = function clear() {
    return Promise.resolve();
  };

  return Object.freeze(store);
}

/**
 * Creates a CacheStore backed by the Web Storage API (localStorage or sessionStorage).
 *
 * Provides durable conditional request caching that survives page reloads.
 * When the store exceeds `maxEntries`, the oldest entry (by write timestamp)
 * is evicted before the new entry is stored.
 *
 * If the storage backend throws `SecurityError` (e.g., private browsing mode
 * blocks storage access), a no-op store is returned that silently ignores all
 * operations.
 *
 * @param {WebStorageStoreOptions} [options] - Store configuration.
 * @returns {CacheStore} - Async cache store instance.
 * @throws {TypeError} When maxEntries is not a positive integer or prefix is not a non-empty string.
 */
export function createWebStorageStore(options) {
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const prefix = options?.prefix ?? DEFAULT_PREFIX;
  const storage = options?.storage;

  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new TypeError(`maxEntries must be a positive integer, got ${maxEntries}`);
  }

  if (typeof prefix !== 'string' || prefix.length === 0) {
    throw new TypeError(`prefix must be a non-empty string, got ${JSON.stringify(prefix)}`);
  }

  if (storage !== undefined && (typeof storage !== 'object' || storage === null)) {
    throw new TypeError('storage must be an object implementing the Web Storage interface');
  }

  const backend = storage ?? globalThis.localStorage;

  try {
    const testKey = `${prefix}__probe__`;
    backend.setItem(testKey, '1');
    backend.removeItem(testKey);
  } catch {
    return createNoOpStore();
  }

  const store = Object.create(null);

  /**
   * Retrieves a cache entry by key.
   *
   * @param {string} key - Cache key (typically a URL).
   * @returns {Promise<CacheEntry | undefined>} - The cached entry, or undefined if absent.
   */
  store.get = function get(key) {
    try {
      const raw = backend.getItem(`${prefix}${key}`);
      if (raw === null) return Promise.resolve(undefined);

      const entry = deserializeEntry(raw);
      if (entry === undefined) {
        backend.removeItem(`${prefix}${key}`);
        return Promise.resolve(undefined);
      }

      return Promise.resolve(entry);
    } catch {
      return Promise.resolve(undefined);
    }
  };

  /**
   * Stores a cache entry. Evicts the oldest entry when the store is full.
   * On QuotaExceededError, evicts entries and retries.
   *
   * @param {string} key - Cache key (typically a URL).
   * @param {CacheEntry} entry - Cache entry to store.
   * @returns {Promise<void>}
   */
  store.set = function set(key, entry) {
    const storageKey = `${prefix}${key}`;
    const value = JSON.stringify({
      etag: entry.etag,
      lastModified: entry.lastModified,
      body: entry.body,
      timestamp: Date.now()
    });

    try {
      const keys = getPrefixedKeys(backend, prefix);
      const isOverwrite = keys.includes(storageKey);

      if (!isOverwrite) {
        while (getPrefixedKeys(backend, prefix).length >= maxEntries) {
          if (!evictOldest(backend, prefix)) break;
        }
      }

      backend.setItem(storageKey, value);
    } catch (err) {
      if (err?.name === 'QuotaExceededError') {
        while (evictOldest(backend, prefix)) {
          try {
            backend.setItem(storageKey, value);
            return Promise.resolve();
          } catch (retryErr) {
            if (retryErr?.name !== 'QuotaExceededError') return Promise.resolve();
          }
        }
      }
    }

    return Promise.resolve();
  };

  /**
   * Removes a cache entry by key.
   *
   * @param {string} key - Cache key (typically a URL).
   * @returns {Promise<boolean>} - Whether the entry existed and was removed.
   */
  store.delete = function del(key) {
    try {
      const storageKey = `${prefix}${key}`;
      const exists = backend.getItem(storageKey) !== null;
      if (exists) backend.removeItem(storageKey);
      return Promise.resolve(exists);
    } catch {
      return Promise.resolve(false);
    }
  };

  /**
   * Removes all cache entries matching this store's prefix.
   *
   * @returns {Promise<void>}
   */
  store.clear = function clear() {
    try {
      const keys = getPrefixedKeys(backend, prefix);
      for (const key of keys) {
        backend.removeItem(key);
      }
    } catch {
      // Graceful degradation: if we can't clear, silently continue
    }
    return Promise.resolve();
  };

  return Object.freeze(store);
}
