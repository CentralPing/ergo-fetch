/**
 * @fileoverview Rate limit tracking interceptor with automatic 429 retry signaling.
 * @module @centralping/ergo-fetch/lib/rate-limit
 */

/** @type {number} */
const DEFAULT_THRESHOLD = 5;

/** @type {string} */
const DEFAULT_HEADER_PREFIX = 'x-ratelimit';

/**
 * @typedef {object} RateLimitState
 * @property {number | undefined} limit - Total request budget for the current window.
 * @property {number | undefined} remaining - Remaining requests in the current window.
 * @property {number | undefined} reset - Window reset timestamp (Unix epoch seconds).
 * @property {boolean} limited - Whether the client is currently rate-limited (429 received).
 */

/**
 * @typedef {object} RateLimitInterceptorOptions
 * @property {boolean} [proactive] - Enable proactive throttling when remaining drops
 *   below threshold (default: false).
 * @property {number} [threshold] - Remaining count below which proactive throttling
 *   activates (default: 5).
 * @property {string} [headerPrefix] - Header name prefix for rate limit headers
 *   (default: 'x-ratelimit').
 */

/**
 * @typedef {object} RateLimitInterceptor
 * @property {(ctx: object) => void} request - Sets rateLimitDelay on context when
 *   proactive throttling is active.
 * @property {(ctx: object, response: Response) => {retry?: boolean, delay?: number} | void} response -
 *   Parses rate limit headers and signals retry on 429.
 * @property {() => RateLimitState} getState - Returns a defensive copy of current state.
 */

/**
 * Parses a numeric header value, returning undefined for empty or non-finite values.
 *
 * @param {string} value - Raw header value.
 * @returns {number | undefined} - Parsed number, or undefined if invalid.
 */
function parseHeaderNumber(value) {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;

  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parses a Retry-After header value into milliseconds.
 *
 * Supports two formats per RFC 9110 §10.2.3:
 * - Integer: delay in seconds (e.g., `120`)
 * - HTTP-date: absolute timestamp (e.g., `Fri, 31 Dec 1999 23:59:59 GMT`)
 *
 * @param {string | null} value - Raw Retry-After header value.
 * @returns {number | undefined} - Delay in milliseconds, or undefined if unparseable.
 */
export function parseRetryAfter(value) {
  if (value == null) return undefined;

  const trimmed = value.trim();
  if (trimmed === '') return undefined;

  const seconds = Number(trimmed);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  if (/[a-zA-Z]/.test(trimmed)) {
    const date = Date.parse(trimmed);

    if (!Number.isNaN(date)) {
      return Math.max(0, date - Date.now());
    }
  }

  return undefined;
}

/**
 * Creates a rate-limit interceptor that tracks rate limit state from response
 * headers and signals retry on 429 Too Many Requests.
 *
 * Parses `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`
 * headers (prefix configurable). Exposes observable state via `getState()`.
 *
 * When proactive throttling is enabled, the request interceptor sets
 * `ctx.rateLimitDelay` (milliseconds) when the remaining budget drops below
 * the configured threshold. The pipeline is responsible for honoring this delay.
 *
 * @param {RateLimitInterceptorOptions} [options] - Interceptor configuration.
 * @returns {RateLimitInterceptor} - Frozen null-prototype interceptor object.
 * @throws {TypeError} When proactive is not a boolean.
 * @throws {TypeError} When threshold is not a positive integer.
 * @throws {TypeError} When headerPrefix is not a non-empty string.
 */
export function createRateLimitInterceptor(options) {
  if (options?.proactive !== undefined && typeof options.proactive !== 'boolean') {
    throw new TypeError('proactive must be a boolean');
  }

  if (options?.threshold !== undefined) {
    if (!Number.isInteger(options.threshold) || options.threshold < 1) {
      throw new TypeError('threshold must be a positive integer');
    }
  }

  if (
    options?.headerPrefix !== undefined &&
    (typeof options.headerPrefix !== 'string' || !options.headerPrefix)
  ) {
    throw new TypeError('headerPrefix must be a non-empty string');
  }

  const proactive = options?.proactive ?? false;
  const threshold = options?.threshold ?? DEFAULT_THRESHOLD;
  const headerPrefix = options?.headerPrefix ?? DEFAULT_HEADER_PREFIX;

  /** @type {RateLimitState} */
  const state = Object.create(null);
  state.limit = undefined;
  state.remaining = undefined;
  state.reset = undefined;
  state.limited = false;

  const interceptor = Object.create(null);

  /**
   * Sets `ctx.rateLimitDelay` when proactive throttling is active and the
   * remaining budget is below the threshold.
   *
   * @param {object} ctx - Request context.
   */
  interceptor.request = function request(ctx) {
    if (!proactive) return;
    if (state.remaining === undefined || state.remaining >= threshold) return;
    if (state.reset === undefined) return;

    const delayMs = state.reset * 1000 - Date.now();

    if (delayMs > 0) {
      ctx.rateLimitDelay = delayMs;
    }
  };

  /**
   * Parses rate limit headers from the response and updates internal state.
   * On 429, signals retry with the appropriate delay.
   *
   * @param {object} ctx - Request context.
   * @param {Response} res - Fetch API response.
   * @returns {{retry?: boolean, delay?: number} | void} - Retry signal on 429, or void.
   */
  interceptor.response = function response(ctx, res) {
    const limitHeader = res.headers.get(`${headerPrefix}-limit`);
    const remainingHeader = res.headers.get(`${headerPrefix}-remaining`);
    const resetHeader = res.headers.get(`${headerPrefix}-reset`);

    if (limitHeader !== null) {
      const n = parseHeaderNumber(limitHeader);
      if (n !== undefined) state.limit = n;
    }

    if (remainingHeader !== null) {
      const n = parseHeaderNumber(remainingHeader);
      if (n !== undefined) state.remaining = n;
    }

    if (resetHeader !== null) {
      const n = parseHeaderNumber(resetHeader);
      if (n !== undefined) state.reset = n;
    }

    if (res.status === 429) {
      state.limited = true;

      const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
      let delay = retryAfter;

      if (delay === undefined && state.reset !== undefined) {
        delay = Math.max(0, state.reset * 1000 - Date.now());
      }

      return {retry: true, delay};
    }

    state.limited = false;
  };

  /**
   * Returns a defensive copy of the current rate limit state.
   *
   * @returns {RateLimitState} - Current rate limit state.
   */
  interceptor.getState = function getState() {
    return {
      limit: state.limit,
      remaining: state.remaining,
      reset: state.reset,
      limited: state.limited
    };
  };

  return Object.freeze(interceptor);
}
