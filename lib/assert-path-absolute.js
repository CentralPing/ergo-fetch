/**
 * @fileoverview RFC 3986 path-absolute validation utility.
 * @module @centralping/ergo-fetch/lib/assert-path-absolute
 */

/**
 * Checks whether a character code is a HEXDIG per RFC 3986.
 *
 * @param {number} code - UTF-16 character code.
 * @returns {boolean} - Whether the code is 0-9, A-F, or a-f.
 */
function isHexDigit(code) {
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x46) ||
    (code >= 0x61 && code <= 0x66)
  );
}

/**
 * Checks whether a character code is valid in an RFC 3986 URI path.
 *
 * Accepts the `pchar` production (Section 3.3) plus `/` for segment
 * separation. Percent-encoding (`%`) is excluded — the caller must
 * validate the full `% HEXDIG HEXDIG` sequence separately.
 *
 * ```
 * pchar     = unreserved / pct-encoded / sub-delims / ":" / "@"
 * unreserved = ALPHA / DIGIT / "-" / "." / "_" / "~"
 * sub-delims = "!" / "$" / "&" / "'" / "(" / ")" / "*" / "+" / "," / ";" / "="
 * ```
 *
 * @param {number} code - UTF-16 character code.
 * @returns {boolean} - Whether the code is valid in a path segment.
 */
function isValidPathCode(code) {
  if (code === 0x21) return true;
  if (code === 0x24) return true;
  if (code >= 0x26 && code <= 0x2f) return true;
  if (code >= 0x30 && code <= 0x3b) return true;
  if (code === 0x3d) return true;
  if (code >= 0x40 && code <= 0x5a) return true;
  if (code === 0x5f) return true;
  if (code >= 0x61 && code <= 0x7a) return true;
  if (code === 0x7e) return true;
  return false;
}

/**
 * Validates that a string is an RFC 3986 `path-absolute`.
 *
 * A `path-absolute` begins with `/` but not `//` (which would trigger
 * authority parsing per Section 3.2). Each character must be in the
 * `pchar` set (unreserved, sub-delims, `:`, `@`), a `/` segment
 * separator, or a properly-formed `% HEXDIG HEXDIG` sequence.
 *
 * @param {string} value - String to validate.
 * @returns {boolean} - Whether the string is a valid absolute path.
 */
export function isPathAbsolute(value) {
  if (typeof value !== 'string') return false;
  if (value.charCodeAt(0) !== 0x2f) return false;
  if (value.length > 1 && value.charCodeAt(1) === 0x2f) return false;

  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);

    if (code === 0x25) {
      if (i + 2 >= value.length) return false;
      if (!isHexDigit(value.charCodeAt(i + 1))) return false;
      if (!isHexDigit(value.charCodeAt(i + 2))) return false;
      i += 2;
    } else if (!isValidPathCode(code)) {
      return false;
    }
  }

  return true;
}

/**
 * Asserts that a value is a valid RFC 3986 `path-absolute`.
 *
 * Throws a descriptive TypeError when validation fails, using the
 * provided label to identify the parameter in the error message.
 *
 * @param {string} value - String to validate.
 * @param {string} label - Parameter name for the error message.
 * @throws {TypeError} When value is not a valid RFC 3986 path-absolute.
 */
export function assertPathAbsolute(value, label) {
  if (!isPathAbsolute(value)) {
    throw new TypeError(
      `${label} must be a valid RFC 3986 path-absolute (ASCII letters, digits, ` +
        'unreserved, sub-delimiters, percent-encoding, and segment separators only)'
    );
  }
}
