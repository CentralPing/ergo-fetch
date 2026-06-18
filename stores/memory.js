/**
 * @fileoverview In-memory cache store implementing the CacheStore interface.
 * @module @centralping/ergo-fetch/stores/memory
 */

/** @type {number} */
const DEFAULT_MAX_ENTRIES = 1024;

/**
 * @typedef {object} CacheEntry
 * @property {string} [etag] - ETag value for the cached resource.
 * @property {string} [lastModified] - Last-Modified value for the cached resource.
 * @property {*} [body] - Cached response body.
 */

/**
 * @typedef {object} CacheStore
 * @property {(key: string) => Promise<CacheEntry | undefined>} get - Retrieves a cache entry.
 * @property {(key: string, entry: CacheEntry) => Promise<void>} set - Stores a cache entry.
 * @property {(key: string) => Promise<boolean>} delete - Removes a cache entry.
 * @property {() => Promise<void>} clear - Removes all cache entries.
 */

/**
 * @typedef {object} QueueEntry
 * @property {string} method - HTTP method.
 * @property {string} url - Request URL.
 * @property {object} [headers] - Request headers.
 * @property {*} [body] - Request body.
 * @property {string} [idempotencyKey] - Idempotency key for replay safety.
 */

/**
 * Queue store interface for offline request queuing (Phase 2).
 *
 * Implementations maintain ordered entries that are replayed on reconnection.
 * All methods are async to support IndexedDB and other async backends.
 *
 * @typedef {object} QueueStore
 * @property {(entry: QueueEntry) => Promise<string>} enqueue - Adds an entry and returns its ID.
 * @property {() => Promise<QueueEntry | undefined>} peek - Returns the next entry without removing it.
 * @property {(id: string) => Promise<void>} dequeue - Removes an entry by ID.
 * @property {() => Promise<QueueEntry[]>} list - Returns all queued entries in order.
 * @property {() => Promise<void>} clear - Removes all queued entries.
 * @property {() => Promise<number>} size - Returns the number of queued entries.
 */

/**
 * Creates an in-memory cache store backed by a Map.
 *
 * When the store exceeds `maxEntries`, the oldest entry (first inserted) is
 * evicted before the new entry is stored (FIFO eviction).
 *
 * @param {object} [options] - Store configuration.
 * @param {number} [options.maxEntries] - Maximum number of entries before eviction
 *   (default: {@link DEFAULT_MAX_ENTRIES}).
 * @returns {CacheStore} - Async cache store instance.
 * @throws {TypeError} When maxEntries is not a positive integer.
 */
export function createMemoryStore(options) {
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;

  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new TypeError(`maxEntries must be a positive integer, got ${maxEntries}`);
  }

  /** @type {Map<string, CacheEntry>} */
  const cache = new Map();

  const store = Object.create(null);

  /**
   * Retrieves a cache entry by key.
   *
   * @param {string} key - Cache key.
   * @returns {Promise<CacheEntry | undefined>} - The cached entry, or undefined if absent.
   */
  store.get = function get(key) {
    return Promise.resolve(cache.get(key));
  };

  /**
   * Stores a cache entry. Evicts the oldest entry when the store is full.
   *
   * @param {string} key - Cache key.
   * @param {CacheEntry} entry - Cache entry to store.
   * @returns {Promise<void>}
   */
  store.set = function set(key, entry) {
    cache.delete(key);

    if (cache.size >= maxEntries) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }

    cache.set(key, entry);
    return Promise.resolve();
  };

  /**
   * Removes a cache entry by key.
   *
   * @param {string} key - Cache key.
   * @returns {Promise<boolean>} - Whether the entry existed and was removed.
   */
  store.delete = function del(key) {
    return Promise.resolve(cache.delete(key));
  };

  /**
   * Removes all cache entries.
   *
   * @returns {Promise<void>}
   */
  store.clear = function clear() {
    cache.clear();
    return Promise.resolve();
  };

  return Object.freeze(store);
}
