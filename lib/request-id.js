/**
 * @fileoverview Request-ID interceptor for X-Request-Id capture and correlation.
 * @module @centralping/ergo-fetch/lib/request-id
 */

/**
 * @typedef {object} RequestIdInterceptorOptions
 * @property {string} [headerName] - Header name for request ID (default: 'x-request-id').
 * @property {boolean} [generate] - Whether to generate a UUID for outgoing requests (default: false).
 */

/**
 * @typedef {object} RequestIdInterceptor
 * @property {(ctx: object) => void} request - Attaches request ID header when generation is enabled.
 * @property {(ctx: object, response: Response) => void} response - Captures request ID from response.
 */

/**
 * Creates a request-ID interceptor that optionally generates UUIDs for outgoing
 * requests and captures response request IDs for correlation.
 *
 * @param {RequestIdInterceptorOptions} [options] - Interceptor configuration.
 * @returns {RequestIdInterceptor} - Frozen null-prototype interceptor object.
 */
export function createRequestIdInterceptor(options) {
  if (
    options?.headerName !== undefined &&
    (typeof options.headerName !== 'string' || !options.headerName)
  ) {
    throw new TypeError('headerName must be a non-empty string');
  }

  if (options?.generate !== undefined && typeof options.generate !== 'boolean') {
    throw new TypeError('generate must be a boolean');
  }

  const headerName = options?.headerName ?? 'x-request-id';
  const generate = options?.generate ?? false;

  const interceptor = Object.create(null);

  /**
   * Attaches a generated UUID to the request headers when `generate` is enabled
   * and no existing header is present.
   *
   * @param {object} ctx - Request context.
   * @param {Headers} ctx.headers - Mutable request headers.
   */
  interceptor.request = function request(ctx) {
    if (generate && !ctx.headers.has(headerName)) {
      ctx.headers.set(headerName, crypto.randomUUID());
    }
  };

  /**
   * Captures the request ID from the response header and sets it on the context.
   *
   * @param {object} ctx - Request context.
   * @param {Response} response - Fetch response.
   */
  interceptor.response = function response(ctx, response) {
    const value = response.headers.get(headerName);

    if (value) {
      ctx.requestId = value;
    }
  };

  return Object.freeze(interceptor);
}
