/**
 * @fileoverview RFC 8288 Web Linking Link header parser.
 * @module @centralping/ergo-fetch/lib/link-header
 */

/**
 * @typedef {object} LinkObject
 * @property {string} href - Resolved target URI.
 * @property {string} rel - Relationship type.
 */

/**
 * RFC 9110 Section 5.6.2 token character lookup. A character code maps to
 * `true` when it is a valid `tchar`.
 *
 * tchar = "!" / "#" / "$" / "%" / "&" / "'" / "*" / "+" / "-" / "." /
 *         "^" / "_" / "`" / "|" / "~" / DIGIT / ALPHA
 *
 * @type {ReadonlyArray<boolean>}
 */
const TOKEN_CHARS = /* @__PURE__ */ (() => {
  const table = new Array(128).fill(false);
  const chars = "!#$%&'*+-.^_`|~";
  for (let i = 0; i < chars.length; i++) table[chars.charCodeAt(i)] = true;
  for (let c = 0x30; c <= 0x39; c++) table[c] = true; // DIGIT
  for (let c = 0x41; c <= 0x5a; c++) table[c] = true; // ALPHA upper
  for (let c = 0x61; c <= 0x7a; c++) table[c] = true; // ALPHA lower
  return Object.freeze(table);
})();

/**
 * Advances past optional whitespace (SP 0x20 and HTAB 0x09).
 *
 * @param {string} str - Input string.
 * @param {number} start - Current position.
 * @returns {number} - Position after whitespace.
 */
function skipOWS(str, start) {
  let i = start;
  while (i < str.length) {
    const ch = str.charCodeAt(i);
    if (ch !== 0x20 && ch !== 0x09) break;
    i++;
  }
  return i;
}

/**
 * Scans a run of RFC 9110 token characters starting at `start`.
 *
 * @param {string} str - Input string.
 * @param {number} start - Start position.
 * @returns {number} - End position (exclusive) of the token.
 */
function scanToken(str, start) {
  let i = start;
  while (i < str.length) {
    const code = str.charCodeAt(i);
    if (code >= 128 || !TOKEN_CHARS[code]) break;
    i++;
  }
  return i;
}

/**
 * Parses an RFC 9110 quoted-string starting at the opening `"`.
 *
 * Handles backslash-escaped characters (`quoted-pair`). Returns the
 * unescaped string content and the position after the closing `"`.
 *
 * @param {string} str - Input string.
 * @param {number} start - Position of the opening `"`.
 * @returns {{value: string, end: number}} - Parsed value and end position.
 */
function parseQuotedString(str, start) {
  let i = start + 1; // skip opening '"'
  let value = '';
  let segmentStart = i;

  while (i < str.length) {
    const ch = str.charCodeAt(i);

    if (ch === 0x22) {
      // closing '"'
      value += str.slice(segmentStart, i);
      return {value, end: i + 1};
    }

    if (ch === 0x5c && i + 1 < str.length) {
      // quoted-pair: backslash + next char
      value += str.slice(segmentStart, i);
      i++;
      value += str[i];
      i++;
      segmentStart = i;
      continue;
    }

    i++;
  }

  // Unterminated quoted-string — return what we have
  value += str.slice(segmentStart, i);
  return {value, end: i};
}

/**
 * Advances past the current link-value to the next comma separator,
 * respecting angle brackets and quoted strings.
 *
 * @param {string} str - Input string.
 * @param {number} start - Current position within a malformed link-value.
 * @returns {number} - Position of the comma separator, or string length.
 */
function skipToNextComma(str, start) {
  let i = start;
  while (i < str.length) {
    const ch = str.charCodeAt(i);
    if (ch === 0x2c) return i; // ','
    if (ch === 0x22) {
      // skip quoted-string to avoid false comma match
      const qs = parseQuotedString(str, i);
      i = qs.end;
      continue;
    }
    i++;
  }
  return i;
}

/**
 * Parses an RFC 8288 Link header value into a Map of link objects keyed
 * by relationship type.
 *
 * Each link object is a frozen null-prototype object containing `href`,
 * `rel`, and any additional link parameters. Both parameter names and
 * relation types are lowercased per RFC 8288 case-insensitivity.
 *
 * When multiple links declare the same `rel`, the last one wins (per
 * RFC 8288 Section 3.3 guidance). When a single link declares multiple
 * space-separated `rel` values, a separate Map entry is created for each.
 *
 * Malformed link-values (missing angle brackets, missing `rel` parameter,
 * unclosed brackets) are silently skipped. Invalid `requestUrl` throws
 * synchronously (programmer error).
 *
 * @param {string} headerValue - Raw Link header value.
 * @param {string} [requestUrl] - Base URL for resolving relative URI-references.
 * @returns {Map<string, Readonly<LinkObject>>} - Links keyed by relationship type.
 * @throws {TypeError} When requestUrl is provided but is not a valid URL.
 */
export function parseLinkHeader(headerValue, requestUrl) {
  const result = new Map();

  if (typeof headerValue !== 'string' || headerValue.length === 0) {
    return result;
  }

  let baseUrl;
  if (requestUrl !== undefined) {
    if (typeof requestUrl !== 'string' || requestUrl.length === 0) {
      throw new TypeError('requestUrl must be a non-empty string when provided');
    }
    baseUrl = new URL(requestUrl).href;
  }

  const len = headerValue.length;
  let pos = 0;

  while (pos < len) {
    // Skip whitespace and commas between link-values
    pos = skipOWS(headerValue, pos);
    if (pos >= len) break;

    if (headerValue.charCodeAt(pos) === 0x2c) {
      pos++;
      continue;
    }

    // Expect '<' to start a URI-reference
    if (headerValue.charCodeAt(pos) !== 0x3c) {
      pos = skipToNextComma(headerValue, pos);
      continue;
    }

    // Extract URI from angle brackets
    const closeAngle = headerValue.indexOf('>', pos + 1);
    if (closeAngle === -1) break; // unclosed '<' — nothing more to parse

    const rawHref = headerValue.slice(pos + 1, closeAngle);
    pos = closeAngle + 1;

    // Parse link parameters
    const params = Object.create(null);

    while (pos < len) {
      pos = skipOWS(headerValue, pos);
      if (pos >= len) break;

      const ch = headerValue.charCodeAt(pos);
      if (ch === 0x2c) break; // ',' — end of this link-value

      if (ch !== 0x3b) break; // not ';' — unexpected, stop params
      pos++; // skip ';'
      pos = skipOWS(headerValue, pos);

      // Parse parameter name (token)
      const nameEnd = scanToken(headerValue, pos);
      if (nameEnd === pos) break; // empty name — stop params
      const name = headerValue.slice(pos, nameEnd).toLowerCase();
      pos = nameEnd;

      pos = skipOWS(headerValue, pos);

      let value;

      if (pos >= len || headerValue.charCodeAt(pos) !== 0x3d) {
        value = '';
      } else {
        pos++; // skip '='
        pos = skipOWS(headerValue, pos);

        if (pos < len && headerValue.charCodeAt(pos) === 0x22) {
          const qs = parseQuotedString(headerValue, pos);
          value = qs.value;
          pos = qs.end;
        } else {
          const valueEnd = scanToken(headerValue, pos);
          value = headerValue.slice(pos, valueEnd);
          pos = valueEnd;
        }
      }

      if (!(name in params)) {
        params[name] = value;
      }
    }

    // Skip comma separator if present
    if (pos < len && headerValue.charCodeAt(pos) === 0x2c) {
      pos++;
    }

    // A link without rel is not useful — skip it
    if (!params.rel) continue;

    // Resolve relative URIs when a base URL was validated
    let href = rawHref;
    if (baseUrl) {
      try {
        href = new URL(rawHref, baseUrl).href;
      } catch {
        // Invalid relative URI — preserve raw value
      }
    }

    // RFC 8288 Section 3.3: rel can contain multiple space-separated types
    const rels = params.rel.split(/\s+/);

    for (const rel of rels) {
      if (!rel) continue; // skip empty segments from leading/trailing whitespace

      // RFC 8288 Section 2.1: relation types are case-insensitive
      const canonicalRel = rel.toLowerCase();

      const link = Object.create(null);
      link.href = href;
      link.rel = canonicalRel;

      for (const key of Object.keys(params)) {
        if (key === 'rel' || key === 'href') continue;
        link[key] = params[key];
      }

      result.set(canonicalRel, Object.freeze(link));
    }
  }

  return result;
}
