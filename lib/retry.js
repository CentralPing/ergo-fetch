/**
 * @fileoverview Retry interceptor with exponential backoff for transient failures.
 * @module @centralping/ergo-fetch/lib/retry
 */

import {parseRetryAfter} from './rate-limit.js';

/** @type {number} */
const DEFAULT_MAX_ATTEMPTS = 3;

/** @type {number} */
const DEFAULT_MAX_DELAY = 60_000;

/** @type {number} */
const DEFAULT_BASE_DELAY = 1_000;

/**
 * HTTP status codes that are always retryable regardless of idempotency.
 *
 * @type {ReadonlySet<number>}
 */
const ALWAYS_RETRYABLE = new Set([429, 503]);

/**
 * HTTP status codes retryable only for idempotent requests.
 *
 * @type {ReadonlySet<number>}
 */
const IDEMPOTENT_RETRYABLE = new Set([500, 502, 504]);

/**
 * HTTP methods considered inherently idempotent per RFC 9110 section 9.2.2.
 * Includes safe methods (GET, HEAD, OPTIONS) plus PUT and DELETE.
 *
 * @type {ReadonlySet<string>}
 * @see https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2
 */
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

/**
 * @typedef {object} RetryInterceptorOptions
 * @property {number} [maxAttempts] - Maximum number of attempts including the
 *   initial request (default: 3).
 * @property {number} [maxDelay] - Maximum delay in milliseconds for the backoff
 *   cap (default: 60000).
 * @property {number} [baseDelay] - Base delay in milliseconds for backoff
 *   computation (default: 1000).
 * @property {'exponential' | 'linear'} [backoff] - Backoff strategy
 *   (default: 'exponential').
 * @property {'full' | 'none'} [jitter] - Jitter strategy — 'full' applies
 *   AWS-style full jitter, 'none' uses deterministic delays (default: 'full').
 */

/**
 * @typedef {object} RetryInterceptor
 * @property {(ctx: object) => void} request - Tracks attempt count on the
 *   request context.
 * @property {(ctx: object, response: Response) => {retry?: boolean, delay?: number} | void} response -
 *   Evaluates retry eligibility for HTTP responses and computes delay.
 * @property {(ctx: object, err: Error) => {retry?: boolean, delay?: number} | void} error -
 *   Evaluates retry eligibility for network errors (TypeError) and computes delay.
 */

/**
 * Determines whether a request is idempotent based on HTTP method or an
 * explicit `idempotent` flag on the context.
 *
 * @param {object} ctx - Request context.
 * @param {string} ctx.method - HTTP method (uppercase).
 * @param {boolean} [ctx.idempotent] - Explicit idempotency override.
 * @returns {boolean} - Whether the request is idempotent.
 */
function isIdempotent(ctx) {
  return ctx.idempotent === true || IDEMPOTENT_METHODS.has(ctx.method);
}

/**
 * Determines whether a response status is eligible for retry given the
 * request's idempotency.
 *
 * @param {number} status - HTTP response status code.
 * @param {boolean} idempotent - Whether the request is idempotent.
 * @returns {boolean} - Whether the status is retryable.
 */
function isRetryableStatus(status, idempotent) {
  if (ALWAYS_RETRYABLE.has(status)) return true;

  return idempotent && IDEMPOTENT_RETRYABLE.has(status);
}

/**
 * Creates a retry interceptor that evaluates transient failure responses and
 * signals the pipeline to retry with computed backoff delays.
 *
 * Retry eligibility:
 * - 429, 503: always retry (via `response()`)
 * - 500, 502, 504: retry only for idempotent requests (GET, HEAD, OPTIONS,
 *   PUT, DELETE, or `ctx.idempotent === true`) (via `response()`)
 * - Network errors (TypeError): always retry regardless of idempotency
 *   (via `error()`)
 *
 * Backoff formula (exponential + full jitter):
 * `delay = random(0, min(maxDelay, baseDelay * 2^attempt))`
 *
 * When a `Retry-After` header is present, its value overrides the computed
 * backoff delay.
 *
 * @param {RetryInterceptorOptions} [options] - Interceptor configuration.
 * @returns {RetryInterceptor} - Frozen null-prototype interceptor object.
 * @throws {TypeError} When options is not a non-null object.
 * @throws {TypeError} When maxAttempts is not a positive integer.
 * @throws {TypeError} When maxDelay is not a non-negative finite number.
 * @throws {TypeError} When baseDelay is not a non-negative finite number.
 * @throws {TypeError} When backoff is not 'exponential' or 'linear'.
 * @throws {TypeError} When jitter is not 'full' or 'none'.
 */
export function createRetryInterceptor(options) {
  if (
    options !== undefined &&
    (typeof options !== 'object' || options === null || Array.isArray(options))
  ) {
    throw new TypeError('options must be an object');
  }

  if (options?.maxAttempts !== undefined) {
    if (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1) {
      throw new TypeError('maxAttempts must be a positive integer');
    }
  }

  if (options?.maxDelay !== undefined) {
    if (
      typeof options.maxDelay !== 'number' ||
      !Number.isFinite(options.maxDelay) ||
      options.maxDelay < 0
    ) {
      throw new TypeError('maxDelay must be a non-negative finite number');
    }
  }

  if (options?.baseDelay !== undefined) {
    if (
      typeof options.baseDelay !== 'number' ||
      !Number.isFinite(options.baseDelay) ||
      options.baseDelay < 0
    ) {
      throw new TypeError('baseDelay must be a non-negative finite number');
    }
  }

  if (options?.backoff !== undefined) {
    if (options.backoff !== 'exponential' && options.backoff !== 'linear') {
      throw new TypeError("backoff must be 'exponential' or 'linear'");
    }
  }

  if (options?.jitter !== undefined) {
    if (options.jitter !== 'full' && options.jitter !== 'none') {
      throw new TypeError("jitter must be 'full' or 'none'");
    }
  }

  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const maxDelay = options?.maxDelay ?? DEFAULT_MAX_DELAY;
  const baseDelay = options?.baseDelay ?? DEFAULT_BASE_DELAY;
  const backoff = options?.backoff ?? 'exponential';
  const jitter = options?.jitter ?? 'full';

  /** @type {WeakMap<object, number>} */
  const attempts = new WeakMap();

  /**
   * Computes the backoff delay for a given attempt number.
   *
   * @param {number} attempt - Zero-based attempt index.
   * @returns {number} - Delay in milliseconds.
   */
  function computeRetryDelay(attempt) {
    let computedDelay;

    if (backoff === 'exponential') {
      computedDelay = Math.min(maxDelay, baseDelay * 2 ** attempt);
    } else {
      computedDelay = Math.min(maxDelay, baseDelay * (attempt + 1));
    }

    return jitter === 'full' ? Math.random() * computedDelay : computedDelay;
  }

  const interceptor = Object.create(null);

  /**
   * Initializes the attempt counter for the request context if not already set.
   *
   * @param {object} ctx - Request context.
   */
  interceptor.request = function request(ctx) {
    if (!attempts.has(ctx)) {
      attempts.set(ctx, 0);
    }
  };

  /**
   * Evaluates whether the response is eligible for retry and computes the
   * backoff delay.
   *
   * On eligible failure within the attempt budget, returns `{retry: true, delay}`
   * and increments the attempt counter. When the attempt budget is exhausted or
   * the response is not retryable, returns void.
   *
   * @param {object} ctx - Request context.
   * @param {string} ctx.method - HTTP method (uppercase).
   * @param {boolean} [ctx.idempotent] - Explicit idempotency override.
   * @param {Response} res - Fetch API response.
   * @returns {{retry: boolean, delay: number} | void} - Retry signal, or void.
   */
  interceptor.response = function response(ctx, res) {
    if (!isRetryableStatus(res.status, isIdempotent(ctx))) return;

    const attempt = attempts.get(ctx) ?? 0;

    if (attempt + 1 >= maxAttempts) return;

    attempts.set(ctx, attempt + 1);

    const retryAfter = parseRetryAfter(res.headers.get('retry-after'));

    if (retryAfter !== undefined) {
      return {retry: true, delay: retryAfter};
    }

    return {retry: true, delay: computeRetryDelay(attempt)};
  };

  /**
   * Evaluates whether a network error is eligible for retry and computes the
   * backoff delay.
   *
   * Only `TypeError` instances (network errors per the Fetch spec) are
   * retryable. All other error types are ignored, allowing them to propagate.
   * Network errors are always retryable regardless of idempotency — the most
   * common causes (DNS failure, connection refused) occur before the server
   * receives the request.
   *
   * @param {object} ctx - Request context.
   * @param {Error} err - The thrown error.
   * @returns {{retry: boolean, delay: number} | void} - Retry signal, or void.
   */
  interceptor.error = function error(ctx, err) {
    if (!(err instanceof TypeError)) return;

    const attempt = attempts.get(ctx) ?? 0;

    if (attempt + 1 >= maxAttempts) return;

    attempts.set(ctx, attempt + 1);

    return {retry: true, delay: computeRetryDelay(attempt)};
  };

  return Object.freeze(interceptor);
}
