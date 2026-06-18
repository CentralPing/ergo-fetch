/**
 * @fileoverview CSRF token lifecycle interceptor for automatic extraction and injection.
 * @module @centralping/ergo-fetch/lib/csrf
 */

/**
 * @typedef {object} CsrfInterceptorOptions
 * @property {string} [cookieName] - Cookie name containing CSRF token (default: '__csrf').
 * @property {string} [headerName] - Header name for CSRF token (default: 'x-csrf-token').
 * @property {string[]} [safeMethods] - HTTP methods that do not require CSRF protection
 *   (default: ['GET', 'HEAD', 'OPTIONS']).
 */

/**
 * @typedef {object} CsrfInterceptor
 * @property {(ctx: object) => void} request - Attaches CSRF token for unsafe same-origin requests.
 * @property {(ctx: object, response: Response) => void} response - Extracts CSRF token from safe-method responses.
 * @property {() => string | undefined} getToken - Returns the current token value.
 * @property {() => void} clearToken - Clears the stored token.
 */

/**
 * Extracts a cookie value from a single Set-Cookie header string.
 *
 * @param {string} setCookieValue - Raw Set-Cookie header value.
 * @param {string} name - Cookie name to find.
 * @returns {string | undefined} - Cookie value, or undefined if not found.
 */
function extractCookieValue(setCookieValue, name) {
  const pair = setCookieValue.split(';')[0].trim();
  const eqIdx = pair.indexOf('=');

  if (eqIdx === -1) return undefined;

  const cookieName = pair.slice(0, eqIdx).trim();

  if (cookieName === name) return pair.slice(eqIdx + 1).trim();

  return undefined;
}

/**
 * Creates a CSRF interceptor that automatically extracts tokens from safe-method
 * responses and injects them into unsafe same-origin requests.
 *
 * @param {CsrfInterceptorOptions} [options] - Interceptor configuration.
 * @returns {CsrfInterceptor} - Frozen null-prototype interceptor object.
 * @throws {TypeError} When cookieName or headerName is not a non-empty string.
 */
export function createCsrfInterceptor(options) {
  if (
    options?.cookieName !== undefined &&
    (typeof options.cookieName !== 'string' || !options.cookieName)
  ) {
    throw new TypeError('cookieName must be a non-empty string');
  }

  if (
    options?.headerName !== undefined &&
    (typeof options.headerName !== 'string' || !options.headerName)
  ) {
    throw new TypeError('headerName must be a non-empty string');
  }

  if (options?.safeMethods !== undefined) {
    if (!Array.isArray(options.safeMethods)) {
      throw new TypeError('safeMethods must be an array of strings');
    }

    for (const method of options.safeMethods) {
      if (typeof method !== 'string' || !method) {
        throw new TypeError('safeMethods must contain only non-empty strings');
      }
    }
  }

  const cookieName = options?.cookieName ?? '__csrf';
  const headerName = options?.headerName ?? 'x-csrf-token';
  const safeMethods = new Set(options?.safeMethods ?? ['GET', 'HEAD', 'OPTIONS']);

  let token;

  const interceptor = Object.create(null);

  /**
   * Attaches the CSRF token header for unsafe same-origin requests.
   *
   * @param {object} ctx - Request context.
   * @param {string} ctx.method - HTTP method (uppercase).
   * @param {string} ctx.url - Request URL.
   * @param {string} ctx.baseUrl - Client base URL for origin comparison.
   * @param {Headers} ctx.headers - Mutable request headers.
   */
  interceptor.request = function request(ctx) {
    if (!token) return;
    if (safeMethods.has(ctx.method)) return;

    const requestOrigin = new URL(ctx.url).origin;
    const baseOrigin = new URL(ctx.baseUrl).origin;

    if (requestOrigin !== baseOrigin) return;

    ctx.headers.set(headerName, token);
  };

  /**
   * Extracts the CSRF token from safe-method response headers or Set-Cookie.
   *
   * @param {object} ctx - Request context.
   * @param {string} ctx.method - HTTP method (uppercase).
   * @param {Response} response - Fetch response.
   */
  interceptor.response = function response(ctx, res) {
    if (!safeMethods.has(ctx.method)) return;

    const requestOrigin = new URL(ctx.url).origin;
    const baseOrigin = new URL(ctx.baseUrl).origin;

    if (requestOrigin !== baseOrigin) return;

    const headerToken = res.headers.get(headerName);

    if (headerToken) {
      token = headerToken;
      return;
    }

    if (typeof res.headers.getSetCookie === 'function') {
      for (const cookie of res.headers.getSetCookie()) {
        const value = extractCookieValue(cookie, cookieName);

        if (value !== undefined) {
          token = value;
          return;
        }
      }
    } else {
      const raw = res.headers.get('set-cookie');

      if (raw) {
        for (const part of raw.split(/[\n,]/)) {
          const value = extractCookieValue(part, cookieName);

          if (value !== undefined) {
            token = value;
            return;
          }
        }
      }
    }
  };

  /**
   * Returns the current CSRF token value.
   *
   * @returns {string | undefined} - Current token, or undefined if not yet captured.
   */
  interceptor.getToken = function getToken() {
    return token;
  };

  /**
   * Clears the stored CSRF token.
   */
  interceptor.clearToken = function clearToken() {
    token = undefined;
  };

  return Object.freeze(interceptor);
}
