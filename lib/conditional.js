/**
 * @fileoverview Conditional request interceptor for ETag and Last-Modified management.
 * @module @centralping/ergo-fetch/lib/conditional
 */

import {createMemoryStore} from '../stores/memory.js';

/** @type {ReadonlySet<string>} */
const DEFAULT_READ_METHODS = new Set(['GET', 'HEAD']);

/** @type {ReadonlySet<string>} */
const DEFAULT_WRITE_METHODS = new Set(['PUT', 'PATCH', 'DELETE']);

/**
 * @typedef {object} ConditionalInterceptorOptions
 * @property {import('../stores/memory.js').CacheStore} [store] - Cache store instance
 *   (default: in-memory store).
 * @property {object} [methods] - Method classification overrides.
 * @property {string[]} [methods.read] - Methods that receive cache-validation headers
 *   (default: ['GET', 'HEAD']).
 * @property {string[]} [methods.write] - Methods that receive precondition headers
 *   (default: ['PUT', 'PATCH', 'DELETE']).
 */

/**
 * @typedef {object} ConditionalInterceptor
 * @property {(ctx: object) => Promise<void>} request - Attaches conditional headers from cache.
 * @property {(ctx: object, response: Response) => Promise<{body?: *} | void>} response -
 *   Caches validators and body; returns cached body on 304.
 * @property {() => import('../stores/memory.js').CacheStore} getStore - Returns the underlying
 *   cache store.
 */

/**
 * Validates that a value is an array of non-empty strings.
 *
 * @param {*} methods - Value to validate.
 * @param {string} name - Option name for error messages.
 * @throws {TypeError} When the value is not an array of non-empty strings.
 */
function validateMethodArray(methods, name) {
  if (!Array.isArray(methods)) {
    throw new TypeError(`${name} must be an array of strings`);
  }

  for (const method of methods) {
    if (typeof method !== 'string' || !method) {
      throw new TypeError(`${name} must contain only non-empty strings`);
    }
  }
}

/** @type {ReadonlyArray<string>} */
const STORE_METHODS = ['get', 'set', 'delete', 'clear'];

/**
 * Validates that a store implements the CacheStore interface.
 *
 * @param {*} store - Value to validate.
 * @throws {TypeError} When the store does not implement all required methods.
 */
function validateStore(store) {
  if (!store || typeof store !== 'object') {
    throw new TypeError('store must be a CacheStore object');
  }

  for (const name of STORE_METHODS) {
    if (typeof store[name] !== 'function') {
      throw new TypeError(`store.${name} must be a function`);
    }
  }
}

/**
 * Creates a conditional request interceptor that automatically manages ETag and
 * Last-Modified headers for cache validation and optimistic concurrency.
 *
 * For read methods (GET, HEAD):
 * - Attaches `If-None-Match` and `If-Modified-Since` from cached validators
 * - Returns the cached body transparently on 304 Not Modified
 * - Caches response validators and body on success
 *
 * For write methods (PUT, PATCH, DELETE):
 * - Attaches `If-Match` with strong ETags only (per RFC 9110 §13.1.1)
 * - Invalidates the cache entry on success
 *
 * @param {ConditionalInterceptorOptions} [options] - Interceptor configuration.
 * @returns {ConditionalInterceptor} - Frozen null-prototype interceptor object.
 * @throws {TypeError} When store does not implement the CacheStore interface.
 * @throws {TypeError} When methods.read or methods.write contain invalid values.
 * @throws {TypeError} When methods.read and methods.write overlap.
 */
export function createConditionalInterceptor(options) {
  if (options?.methods?.read !== undefined) {
    validateMethodArray(options.methods.read, 'methods.read');
  }

  if (options?.methods?.write !== undefined) {
    validateMethodArray(options.methods.write, 'methods.write');
  }

  const store = options?.store ?? createMemoryStore();
  validateStore(store);

  const readMethods = new Set(options?.methods?.read ?? DEFAULT_READ_METHODS);
  const writeMethods = new Set(options?.methods?.write ?? DEFAULT_WRITE_METHODS);

  for (const method of readMethods) {
    if (writeMethods.has(method)) {
      throw new TypeError(`methods.read and methods.write must not overlap: ${method}`);
    }
  }

  const interceptor = Object.create(null);

  /**
   * Attaches conditional headers from the cache store based on the request method.
   *
   * Read methods receive `If-None-Match` and/or `If-Modified-Since` for cache
   * validation. Write methods receive `If-Match` for optimistic concurrency,
   * but only when the cached ETag is strong (no `W/` prefix) per RFC 9110 §13.1.1.
   *
   * @param {object} ctx - Request context.
   * @param {string} ctx.method - HTTP method (uppercase).
   * @param {string} ctx.url - Fully resolved request URL.
   * @param {Headers} ctx.headers - Mutable request headers.
   */
  interceptor.request = async function request(ctx) {
    const entry = await store.get(ctx.url);
    if (!entry) return;

    if (readMethods.has(ctx.method)) {
      if (ctx.method !== 'HEAD' && entry.body === undefined) return;

      if (entry.etag) ctx.headers.set('if-none-match', entry.etag);
      if (entry.lastModified) ctx.headers.set('if-modified-since', entry.lastModified);
    } else if (writeMethods.has(ctx.method)) {
      if (entry.etag && !entry.etag.startsWith('W/')) {
        ctx.headers.set('if-match', entry.etag);
      }
    }
  };

  /**
   * Processes conditional response semantics: caches validators and body on
   * successful reads, returns cached body on 304, and invalidates cache on
   * successful writes.
   *
   * Response body is cached by cloning the response and parsing the clone,
   * preserving the original response stream for the pipeline.
   *
   * @param {object} ctx - Request context.
   * @param {string} ctx.method - HTTP method (uppercase).
   * @param {string} ctx.url - Fully resolved request URL.
   * @param {Response} res - Fetch API response.
   * @returns {Promise<{body?: *} | void>} - Cached body on 304, or void.
   */
  interceptor.response = async function response(ctx, res) {
    if (res.status === 304 && readMethods.has(ctx.method)) {
      if (ctx.method === 'HEAD') return;

      const entry = await store.get(ctx.url);

      if (entry?.body !== undefined) {
        return {body: entry.body};
      }

      return;
    }

    if (readMethods.has(ctx.method) && res.status === 200) {
      const etag = res.headers.get('etag') ?? undefined;
      const lastModified = res.headers.get('last-modified') ?? undefined;

      if (etag !== undefined || lastModified !== undefined) {
        const entry = {etag, lastModified};

        if (ctx.method !== 'HEAD') {
          try {
            const clone = res.clone();
            const text = await clone.text();
            const contentType = res.headers.get('content-type') ?? '';
            entry.body = contentType.includes('json') ? JSON.parse(text) : text;
          } catch {
            /* c8 ignore next */
          }
        } else {
          const existing = await store.get(ctx.url);

          if (existing?.body !== undefined) {
            entry.body = existing.body;
          }
        }

        await store.set(ctx.url, entry);
      }
    }

    if (writeMethods.has(ctx.method) && res.ok) {
      await store.delete(ctx.url);
    }
  };

  /**
   * Returns the underlying cache store instance.
   *
   * @returns {import('../stores/memory.js').CacheStore} - The cache store.
   */
  interceptor.getStore = function getStore() {
    return store;
  };

  return Object.freeze(interceptor);
}
