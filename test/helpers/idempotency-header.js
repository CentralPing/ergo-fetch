/**
 * @fileoverview Test helper for parsing RFC 8941 quoted Idempotency-Key header values.
 * @module test/helpers/idempotency-header
 */

/**
 * Extracts the raw idempotency key from an RFC 8941 quoted header value.
 *
 * @param {Headers} headers - Request headers.
 * @param {string} [name] - Header name (default: `idempotency-key`).
 * @returns {string | null} - Unquoted key value, or null when absent.
 */
export function idempotencyHeaderValue(headers, name = 'idempotency-key') {
  const raw = headers.get(name);
  if (raw == null) return null;
  const match = /^"((?:[^"\\]|\\.)*)"$/.exec(raw);
  return match ? match[1].replace(/\\(["\\])/g, '$1') : raw;
}
