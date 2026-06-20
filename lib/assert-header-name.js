/**
 * @fileoverview RFC 9110 header name validation utility.
 * @module @centralping/ergo-fetch/lib/assert-header-name
 */

/**
 * RFC 9110 Section 5.6.2 token grammar: `token = 1*tchar`.
 *
 * tchar = "!" / "#" / "$" / "%" / "&" / "'" / "*" / "+" / "-" / "." /
 *          "^" / "_" / "`" / "|" / "~" / DIGIT / ALPHA
 *
 * @type {RegExp}
 */
export const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * Asserts that a value is a valid HTTP header name per RFC 9110 token grammar.
 *
 * @param {string} value - Value to validate as a header name.
 * @throws {TypeError} When value is not a string or does not conform to RFC 9110 token grammar.
 */
export function assertValidHeaderName(value) {
  if (typeof value !== 'string' || !HEADER_NAME_RE.test(value)) {
    throw new TypeError('headerName must be a valid HTTP token (RFC 9110 Section 5.6.2)');
  }
}
