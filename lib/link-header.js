/**
 * @fileoverview RFC 8288 Web Linking Link header parser (delegated to ergo-wire).
 * @module @centralping/ergo-fetch/lib/link-header
 */

import {parseLinkHeader as wireParseLinkHeader} from '@centralping/ergo-wire';

/**
 * @typedef {object} LinkObject
 * @property {string} href - Resolved target URI.
 * @property {string} rel - Relationship type.
 */

/**
 * Parses an RFC 8288 Link header value into a Map of link objects keyed
 * by relationship type.
 *
 * @param {string} headerValue - Raw Link header value.
 * @param {string} [requestUrl] - Base URL for resolving relative URI-references.
 * @returns {Map<string, Readonly<LinkObject>>} - Links keyed by relationship type.
 * @throws {TypeError} When requestUrl is provided but is not a valid URL.
 */
export function parseLinkHeader(headerValue, requestUrl) {
  return wireParseLinkHeader(headerValue, requestUrl);
}
