/**
 * @fileoverview Async iterator-based pagination for traversing multi-page API responses.
 * @module @centralping/ergo-fetch/lib/pagination
 */

import {parseLinkHeader} from './link-header.js';
import {serializeOffsetParams} from '@centralping/ergo-wire';
import {isPathAbsolute, assertPathAbsolute, getPathPortion} from './assert-path-absolute.js';
import {isQueryBuilder} from './query-builder.js';

/** @type {number} */
const DEFAULT_PER_PAGE = 20;

/** @type {number} */
const DEFAULT_PAGE = 1;

/**
 * @typedef {'offset' | 'cursor'} PaginationStrategy
 */

/**
 * @typedef {object} PaginatorOptions
 * @property {PaginationStrategy} [strategy] - Pagination strategy (default: 'offset').
 * @property {number} [page] - Starting page number for offset strategy (default: 1).
 * @property {number} [perPage] - Items per page for offset strategy (default: 20).
 * @property {number} [limit] - Items per request for cursor strategy (default: 20).
 * @property {number} [maxPages] - Maximum pages to fetch before stopping (default: Infinity).
 * @property {object | import('./query-builder.js').QueryBuilder} [query] - Additional query
 *   parameters for the initial request, or a QueryBuilder whose serialized params are merged
 *   with pagination keys on each page request.
 * @property {object | Headers} [headers] - Additional headers for each request.
 * @property {AbortSignal} [signal] - Abort signal for cancellation.
 */

/**
 * @typedef {object} PageMeta
 * @property {number} [total] - Total item count from X-Total-Count header.
 * @property {number} page - Current page number (1-indexed).
 */

/**
 * @typedef {object} Page
 * @property {*} data - Parsed response body for this page.
 * @property {Readonly<PageMeta>} meta - Page metadata.
 * @property {Map<string, import('./link-header.js').LinkObject>} links - Parsed Link header relations.
 * @property {boolean} done - Whether this is the last page (no next link or maxPages reached).
 */

/**
 * @typedef {object} Paginator
 * @property {() => AsyncIterator<Readonly<Page>>} [Symbol.asyncIterator] - Returns an async iterator over pages.
 */

/** @type {ReadonlySet<PaginationStrategy>} */
const VALID_STRATEGIES = new Set(['offset', 'cursor']);

/**
 * Creates an async iterable that traverses paginated API responses.
 *
 * Each call to the iterator's `.next()` method fetches the next page via the
 * provided client (preserving the full interceptor pipeline). Pages are yielded
 * one at a time with no prefetching, providing natural backpressure.
 *
 * Two strategies are supported:
 * - `'offset'` (default): uses `page`/`per_page` query params on the wire (options
 *   accept ergonomic `perPage`, serialized via ergo-wire); follows `rel="next"`
 *   Link headers for subsequent pages.
 * - `'cursor'`: uses `limit` query param for the initial request, follows
 *   `rel="next"` Link headers containing opaque cursor tokens.
 *
 * Next-link handling is same-origin confined: absolute `rel="next"` URLs are
 * normalized to `pathname + search` (origin is discarded), and network-path
 * references (`//host/...`) are rejected. All subsequent requests go through
 * the same client (and its `baseUrl`), preventing cross-origin redirects.
 *
 * **Operational note:** `maxPages` defaults to `Infinity`, meaning pagination
 * continues until the server stops providing a resolvable `rel="next"` link.
 * When traversing untrusted or third-party APIs, specify a finite `maxPages`
 * to prevent a misbehaving server (e.g. self-referential or always-advancing
 * next links) from driving an unbounded request loop.
 *
 * @param {object} client - Client instance with a `get(path, options)` method.
 * @param {string} path - Initial request path (must start with /).
 * @param {PaginatorOptions} [options] - Pagination configuration.
 * @returns {Readonly<Paginator>} - Frozen async iterable over pages.
 * @throws {TypeError} When client is not a non-null object with a get method.
 * @throws {TypeError} When path is not a path-absolute string (single /).
 * @throws {TypeError} When options is not a plain object.
 * @throws {TypeError} When options.strategy is not a valid strategy.
 * @throws {TypeError} When options.page is not a positive integer.
 * @throws {TypeError} When options.perPage is not a positive integer.
 * @throws {TypeError} When options.limit is not a positive integer.
 * @throws {TypeError} When options.maxPages is not a positive integer or Infinity.
 * @throws {TypeError} When options.headers is not a Headers instance or plain object.
 * @throws {TypeError} When options.signal is not an AbortSignal.
 * @throws {TypeError} When options.query is not a plain object or QueryBuilder.
 * @throws {TypeError} When options.query includes pagination parameters that conflict
 *   with paginator-owned keys (`page[...]`, `page`, `per_page`, or `limit`).
 */
export function createPaginator(client, path, options) {
  if (client == null || typeof client !== 'object') {
    throw new TypeError('client must be a non-null object');
  }

  if (typeof client.get !== 'function') {
    throw new TypeError('client.get must be a function');
  }

  if (typeof path !== 'string') {
    throw new TypeError('path must be a string');
  }

  assertPathAbsolute(path, 'path');

  if (
    options !== undefined &&
    (typeof options !== 'object' || options === null || Array.isArray(options))
  ) {
    throw new TypeError('options must be a plain object');
  }

  const strategy = options?.strategy ?? 'offset';

  if (!VALID_STRATEGIES.has(strategy)) {
    throw new TypeError(`options.strategy must be 'offset' or 'cursor', got '${strategy}'`);
  }

  const maxPages = options?.maxPages ?? Infinity;

  if (
    typeof maxPages !== 'number' ||
    maxPages <= 0 ||
    (maxPages !== Infinity && (!Number.isFinite(maxPages) || !Number.isInteger(maxPages)))
  ) {
    throw new TypeError('options.maxPages must be a positive integer or Infinity');
  }

  const headers = options?.headers;
  const signal = options?.signal;
  const extraQuery = options?.query;

  if (
    headers != null &&
    !(headers instanceof Headers) &&
    (typeof headers !== 'object' || Array.isArray(headers))
  ) {
    throw new TypeError('options.headers must be a Headers instance or a plain object');
  }

  if (signal != null && !(signal instanceof AbortSignal)) {
    throw new TypeError('options.signal must be an AbortSignal');
  }

  if (
    extraQuery != null &&
    !isQueryBuilder(extraQuery) &&
    (typeof extraQuery !== 'object' || Array.isArray(extraQuery))
  ) {
    throw new TypeError('options.query must be a plain object or QueryBuilder');
  }

  const mergedExtraQuery = normalizeExtraQuery(extraQuery);
  assertNoPaginatorQueryConflicts(mergedExtraQuery, strategy);

  let initialQuery;

  if (strategy === 'offset') {
    const page = options?.page ?? DEFAULT_PAGE;
    const perPage = options?.perPage ?? DEFAULT_PER_PAGE;

    if (!Number.isInteger(page) || page < 1) {
      throw new TypeError('options.page must be a positive integer');
    }

    if (!Number.isInteger(perPage) || perPage < 1) {
      throw new TypeError('options.perPage must be a positive integer');
    }

    const wire = serializeOffsetParams({page, perPage});
    initialQuery = Object.assign(Object.create(null), mergedExtraQuery, wire);
  } else {
    const limit = options?.limit ?? DEFAULT_PER_PAGE;

    if (!Number.isInteger(limit) || limit < 1) {
      throw new TypeError('options.limit must be a positive integer');
    }

    initialQuery = Object.assign(Object.create(null), mergedExtraQuery, {limit});
  }

  const iterable = Object.create(null);

  const startPage = strategy === 'offset' ? (options?.page ?? DEFAULT_PAGE) : DEFAULT_PAGE;

  iterable[Symbol.asyncIterator] = function asyncIterator() {
    const iteratorQuery = Object.assign(Object.create(null), initialQuery);
    return generatePages(client, path, iteratorQuery, headers, signal, maxPages, startPage);
  };

  return Object.freeze(iterable);
}

/**
 * Normalizes `options.query` to a null-prototype plain object.
 *
 * QueryBuilder instances are serialized via `toString()` and parsed into key/value
 * pairs so pagination keys can be merged on top for the initial request.
 *
 * @param {object | import('./query-builder.js').QueryBuilder | undefined} query -
 *   Additional query parameters or a QueryBuilder.
 * @returns {object | undefined} - Parsed query object, or undefined when absent.
 */
function normalizeExtraQuery(query) {
  if (query == null) return undefined;

  if (isQueryBuilder(query)) {
    return parseQueryString(query.toString());
  }

  return query;
}

/**
 * Parses a URL query string into a null-prototype object.
 *
 * Duplicate keys retain the last value, matching `URLSearchParams` iteration order.
 *
 * @param {string} queryString - Query string without a leading `?`.
 * @returns {object} - Parsed query parameters.
 */
function parseQueryString(queryString) {
  const result = Object.create(null);

  if (queryString.length === 0) return result;

  const params = new URLSearchParams(queryString);

  for (const [key, value] of params) {
    result[key] = value;
  }

  return result;
}

/**
 * Rejects `options.query` parameters that overlap paginator-owned pagination keys.
 *
 * JSON:API `page[...]` bracket params and flat pagination keys must be supplied via
 * paginator options (`page`, `perPage`, `limit`), not merged query input.
 *
 * @param {object | undefined} query - Normalized extra query object.
 * @param {PaginationStrategy} strategy - Active pagination strategy.
 * @throws {TypeError} When query includes conflicting pagination parameters.
 */
function assertNoPaginatorQueryConflicts(query, strategy) {
  if (query == null) return;

  for (const key of Object.keys(query)) {
    if (key.startsWith('page[') && key.endsWith(']')) {
      throw new TypeError(
        'options.query must not include JSON:API page[...] parameters when using paginate(); use paginator page/perPage/limit options instead'
      );
    }
  }

  if (strategy === 'offset') {
    if (query.page !== undefined || query.per_page !== undefined || query.limit !== undefined) {
      throw new TypeError(
        'options.query must not include page, per_page, or limit when using paginate() offset strategy; use paginator page/perPage options instead'
      );
    }
  } else if (
    query.limit !== undefined ||
    query.page !== undefined ||
    query.per_page !== undefined
  ) {
    throw new TypeError(
      'options.query must not include limit, page, or per_page when using paginate() cursor strategy; use paginator limit option instead'
    );
  }
}

/**
 * Async generator that fetches pages sequentially, yielding frozen Page objects.
 *
 * @param {object} client - Client instance.
 * @param {string} initialPath - First request path.
 * @param {object} initialQuery - Query parameters for the first request.
 * @param {object | Headers} [headers] - Headers for each request.
 * @param {AbortSignal} [signal] - Abort signal.
 * @param {number} maxPages - Maximum pages to fetch.
 * @param {number} startPage - Starting page number for meta.page (1-indexed).
 * @yields {Readonly<Page>} - Frozen page objects.
 */
async function* generatePages(
  client,
  initialPath,
  initialQuery,
  headers,
  signal,
  maxPages,
  startPage
) {
  let currentPath = initialPath;
  let currentQuery = initialQuery;
  let pagesConsumed = 0;

  while (pagesConsumed < maxPages) {
    const requestOptions = Object.create(null);
    if (currentQuery) requestOptions.query = currentQuery;
    if (headers) requestOptions.headers = headers;
    if (signal) requestOptions.signal = signal;

    const response = await client.get(currentPath, requestOptions);

    pagesConsumed++;

    const linkHeader = response.headers.get('link');
    const requestUrl = response.raw?.url || undefined;
    const links = parseLinkHeader(linkHeader, requestUrl);

    const totalHeader = response.headers.get('x-total-count');
    const total =
      totalHeader != null && totalHeader.trim() !== '' ? Number(totalHeader) : undefined;

    const nextLink = links.get('next');
    let nextPath;

    if (nextLink != null) {
      try {
        const nextUrl = new URL(nextLink.href);
        nextPath = nextUrl.pathname + nextUrl.search;
      } catch {
        const href = nextLink.href;
        const pathPortion = getPathPortion(href);

        if (isPathAbsolute(pathPortion)) {
          nextPath = href;
        }
      }
    }

    const done = nextPath == null || pagesConsumed >= maxPages;

    const meta = Object.create(null);
    meta.page = startPage + pagesConsumed - 1;
    if (total != null && Number.isInteger(total) && total >= 0) {
      meta.total = total;
    }

    const page = Object.create(null);
    page.data = response.body;
    page.meta = Object.freeze(meta);
    page.links = links;
    page.done = done;

    yield Object.freeze(page);

    if (done) return;

    currentPath = nextPath;
    currentQuery = undefined;
  }
}
