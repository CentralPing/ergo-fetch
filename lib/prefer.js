/**
 * @fileoverview Prefer header interceptor for RFC 7240 preference negotiation.
 * @module @centralping/ergo-fetch/lib/prefer
 */

/**
 * @typedef {object} PreferInterceptor
 * @property {(ctx: object) => void} request - Sets the Prefer header on outgoing requests.
 * @property {(ctx: object, response: Response) => void} response - Parses Preference-Applied header.
 */

/**
 * Builds the Prefer header value from a preferences object.
 * Object values of `true` become bare tokens (no `=value`).
 *
 * @param {object} preferences - Key-value preference pairs.
 * @returns {string} - Formatted Prefer header value per RFC 7240.
 */
function buildPreferHeader(preferences) {
  const parts = [];

  for (const [key, value] of Object.entries(preferences)) {
    if (value === true) {
      parts.push(key);
    } else {
      parts.push(`${key}=${value}`);
    }
  }

  return parts.join(', ');
}

/**
 * Parses the Preference-Applied response header into an array of preference names.
 *
 * @param {string} value - Raw Preference-Applied header value.
 * @returns {string[]} - Array of applied preference names.
 */
function parsePreferenceApplied(value) {
  return value
    .split(',')
    .map(token => token.trim().split('=')[0].trim())
    .filter(Boolean);
}

/**
 * Creates a Prefer header interceptor that attaches a pre-computed Prefer
 * header to outgoing requests and parses the Preference-Applied response header.
 *
 * @param {string | object} preferences - Preference string (e.g., 'return=representation')
 *   or object (e.g., {return: 'representation', wait: '10'}).
 * @returns {PreferInterceptor} - Frozen null-prototype interceptor object.
 * @throws {TypeError} When preferences is neither a string nor a non-null object.
 */
export function createPreferInterceptor(preferences) {
  if (typeof preferences === 'string') {
    if (!preferences.trim()) {
      throw new TypeError('preferences string must not be empty');
    }
  } else if (
    preferences === null ||
    typeof preferences !== 'object' ||
    Array.isArray(preferences)
  ) {
    throw new TypeError('preferences must be a non-empty string or a non-null object');
  } else if (Object.keys(preferences).length === 0) {
    throw new TypeError('preferences object must not be empty');
  }

  const headerValue =
    typeof preferences === 'string' ? preferences : buildPreferHeader(preferences);

  const interceptor = Object.create(null);

  /**
   * Sets the Prefer header on the request context using the pre-computed value.
   *
   * @param {object} ctx - Request context.
   * @param {Headers} ctx.headers - Mutable request headers.
   */
  interceptor.request = function request(ctx) {
    ctx.headers.set('prefer', headerValue);
  };

  /**
   * Parses the Preference-Applied response header and sets the result on the context.
   *
   * @param {object} ctx - Request context.
   * @param {Response} response - Fetch response.
   */
  interceptor.response = function response(ctx, response) {
    const applied = response.headers.get('preference-applied');

    if (applied) {
      ctx.preferencesApplied = parsePreferenceApplied(applied);
    }
  };

  return Object.freeze(interceptor);
}
