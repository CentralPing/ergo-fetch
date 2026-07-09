/**
 * @fileoverview Idempotency-Key interceptor for safe mutation retry.
 * @module @centralping/ergo-fetch/lib/idempotency
 */

import {assertValidHeaderName} from './assert-header-name.js';
import {formatIdempotencyKey, assertSfStringInner, fingerprint} from '@centralping/ergo-wire';

/** @type {string} */
const DEFAULT_HEADER_NAME = 'idempotency-key';

/** @type {number} */
const DEFAULT_TTL = 300_000;

/** @type {number} */
const DEFAULT_MAX_ENTRIES = 1024;

/** @type {ReadonlyArray<string>} */
const DEFAULT_METHODS = Object.freeze(['POST']);

/**
 * @typedef {object} IdempotencyInterceptorOptions
 * @property {string} [headerName] - Header name for the idempotency key
 *   (default: 'idempotency-key').
 * @property {string[]} [methods] - HTTP methods that receive auto-generated
 *   keys (default: ['POST']).
 * @property {() => string} [generator] - Custom key generator function
 *   (default: crypto.randomUUID).
 * @property {number} [ttl] - Time-to-live for stored keys in milliseconds
 *   (default: 300000).
 * @property {number} [maxEntries] - Maximum number of fingerprint registry
 *   entries before FIFO eviction (default: 1024). Under sustained load, still-
 *   valid fingerprints can be evicted before TTL expires; reuse of an evicted key
 *   with a different body will not trigger fingerprint-mismatch rejection. Size
 *   this to peak in-flight explicit-key fingerprint count when mismatch detection
 *   is relied on as a hard guarantee.
 */

/**
 * @typedef {object} IdempotencyInterceptor
 * @property {(ctx: object) => Promise<void>} request - Generates or reattaches
 *   an idempotency key on eligible requests.
 * @property {(ctx: object, response: Response) => void} response - Clears key
 *   metadata on successful responses.
 */

/**
 * @typedef {object} RegistryEntry
 * @property {string | undefined} bodyHash - Hex-encoded SHA-256 digest of the
 *   serialized request body, or undefined for bodiless requests.
 * @property {number} timestamp - Unix epoch milliseconds when the key was stored.
 */

/**
 * Creates an idempotency interceptor that automatically generates and manages
 * Idempotency-Key headers for safe mutation retry.
 *
 * For configured HTTP methods, the interceptor generates a unique key via
 * `crypto.randomUUID()` (or a custom generator), attaches it as a request
 * header, and preserves the key across retries so the server observes
 * identical keys for each attempt.
 *
 * Body fingerprinting detects accidental reuse of an explicit key with
 * different request content — a programming error that would cause the server
 * to reject the request or produce unexpected results.
 *
 * @param {IdempotencyInterceptorOptions} [options] - Interceptor configuration.
 * @returns {IdempotencyInterceptor} - Frozen null-prototype interceptor object.
 * @throws {TypeError} When options is not a non-null object.
 * @throws {TypeError} When headerName is not a valid HTTP token.
 * @throws {TypeError} When methods is not an array of non-empty strings.
 * @throws {TypeError} When generator is not a function.
 * @throws {TypeError} When ttl is not a positive finite number.
 * @throws {TypeError} When maxEntries is not a positive integer.
 */
export function createIdempotencyInterceptor(options) {
  if (
    options !== undefined &&
    (typeof options !== 'object' || options === null || Array.isArray(options))
  ) {
    throw new TypeError('options must be an object');
  }

  if (options?.headerName !== undefined) assertValidHeaderName(options.headerName);

  if (options?.methods !== undefined) {
    if (!Array.isArray(options.methods)) {
      throw new TypeError('methods must be an array of strings');
    }

    for (const method of options.methods) {
      if (typeof method !== 'string' || !method) {
        throw new TypeError('methods must contain only non-empty strings');
      }
    }
  }

  if (options?.generator !== undefined) {
    if (typeof options.generator !== 'function') {
      throw new TypeError('generator must be a function');
    }
  }

  if (options?.ttl !== undefined) {
    if (typeof options.ttl !== 'number' || !Number.isFinite(options.ttl) || options.ttl <= 0) {
      throw new TypeError('ttl must be a positive finite number');
    }
  }

  if (options?.maxEntries !== undefined) {
    if (!Number.isInteger(options.maxEntries) || options.maxEntries < 1) {
      throw new TypeError(`maxEntries must be a positive integer, got ${options.maxEntries}`);
    }
  }

  const headerName = options?.headerName ?? DEFAULT_HEADER_NAME;
  const methods = new Set((options?.methods ?? DEFAULT_METHODS).map(m => m.toUpperCase()));
  const generator = options?.generator ?? (() => crypto.randomUUID());
  const ttl = options?.ttl ?? DEFAULT_TTL;
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;

  /** @type {WeakMap<object, string>} */
  const keys = new WeakMap();

  /** @type {Map<string, RegistryEntry>} */
  const registry = new Map();

  /**
   * Evicts expired entries from the registry.
   *
   * @param {number} now - Current timestamp in milliseconds.
   */
  function evictExpired(now) {
    for (const [key, entry] of registry) {
      if (now - entry.timestamp >= ttl) {
        registry.delete(key);
      }
    }
  }

  const interceptor = Object.create(null);

  /**
   * Generates or reattaches an idempotency key for eligible requests.
   *
   * On first invocation for a context, evaluates eligibility and generates a
   * key. On subsequent invocations (retries), reattaches the previously stored
   * key without regeneration.
   *
   * @param {object} ctx - Request context.
   * @param {string} ctx.method - HTTP method (uppercase).
   * @param {boolean} [ctx.idempotent] - Per-request idempotency override.
   * @param {string} [ctx.idempotencyKey] - Explicit key provided by the caller.
   * @param {string} [ctx.body] - Serialized request body for fingerprinting.
   * @param {Headers} ctx.headers - Mutable request headers.
   */
  interceptor.request = async function request(ctx) {
    const existingKey = keys.get(ctx);

    if (existingKey !== undefined) {
      ctx.headers.set(headerName, formatIdempotencyKey(existingKey));
      return;
    }

    if (ctx.idempotent === false) return;

    const explicitKey = ctx.idempotencyKey;

    if (explicitKey != null && (typeof explicitKey !== 'string' || !explicitKey)) {
      throw new TypeError('idempotencyKey must be a non-empty string');
    }

    if (explicitKey != null) {
      assertSfStringInner(explicitKey);
    }

    const eligible = explicitKey != null || methods.has(ctx.method);

    if (!eligible) return;

    const now = Date.now();

    evictExpired(now);

    const key = explicitKey ?? generator();

    if (typeof key !== 'string' || !key) {
      throw new TypeError('generator must return a non-empty string');
    }

    if (explicitKey == null) {
      assertSfStringInner(key);
    }

    const bodyHash =
      explicitKey != null && ctx.body !== undefined ? await fingerprint(ctx.body) : undefined;

    const existing = registry.get(key);

    if (existing !== undefined && bodyHash !== existing.bodyHash) {
      throw new TypeError(
        `Idempotency key "${key}" reused with different request body (fingerprint mismatch)`
      );
    }

    keys.set(ctx, key);

    // Capacity-bound FIFO eviction runs after TTL cleanup (evictExpired above).
    // Still-valid fingerprints can be evicted under sustained load; once removed,
    // registry.set no longer enforces body-mismatch rejection for that key.
    registry.delete(key);

    if (registry.size >= maxEntries) {
      const oldest = registry.keys().next().value;
      registry.delete(oldest);
    }

    registry.set(key, {bodyHash, timestamp: now});
    ctx.headers.set(headerName, formatIdempotencyKey(key));
  };

  /**
   * Clears key metadata on successful responses.
   *
   * On 2xx status, the key is removed from the fingerprint registry since the
   * request completed successfully. On all other statuses, the key is preserved
   * for potential retry reuse.
   *
   * @param {object} ctx - Request context.
   * @param {Response} res - Fetch API response.
   */
  interceptor.response = function response(ctx, res) {
    const key = keys.get(ctx);

    if (key === undefined) return;

    if (res.status >= 200 && res.status < 300) {
      registry.delete(key);
    }
  };

  return Object.freeze(interceptor);
}
