/**
 * @fileoverview RFC 9110 media-type parsing and JSON Content-Type detection.
 * @module @centralping/ergo-fetch/lib/media-type
 */

/**
 * Extracts the normalized type/subtype from a Content-Type header value.
 *
 * Strips parameters (everything after the first `;`), trims whitespace, and
 * lowercases per RFC 9110 Section 8.4 case-insensitivity rules.
 *
 * @param {string | null | undefined} contentType - Raw Content-Type header value.
 * @returns {string | undefined} - Normalized `type/subtype`, or undefined if input is absent.
 */
export function parseMediaType(contentType) {
  if (contentType == null || contentType === '') return undefined;

  const semicolonIdx = contentType.indexOf(';');
  const raw = semicolonIdx === -1 ? contentType : contentType.slice(0, semicolonIdx);

  return raw.trim().toLowerCase();
}

/**
 * Determines whether a Content-Type header value represents a JSON media type.
 *
 * Matches `application/json` exactly, or any structured syntax suffix type
 * ending with `+json` per RFC 6838 Section 4.2.8.
 *
 * @param {string | null | undefined} contentType - Raw Content-Type header value.
 * @returns {boolean} - Whether the content type is a JSON media type.
 */
export function isJsonMediaType(contentType) {
  const mediaType = parseMediaType(contentType);
  if (mediaType === undefined) return false;

  if (mediaType === 'application/json') return true;

  return mediaType.endsWith('+json');
}
