# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `lib/rate-limit.js` — `parseRetryAfter` now validates HTTP-date values against
  IMF-fixdate grammar (RFC 9110 §5.6.7) instead of accepting any string
  `Date.parse` can interpret. Non-IMF date formats (ISO 8601, RFC 850, asctime,
  locale strings) are now correctly rejected. (fixes #45)

## [0.2.0-beta.1] - 2026-07-07

### Added

- `lib/assert-path-absolute.js` — Shared RFC 3986 `path-absolute` validator
  (`isPathAbsolute`, `assertPathAbsolute`) extracted from `query-builder.js`,
  used by `client.js`, `pagination.js`, and `query-builder.js` for unified path
  validation via character-by-character allowlist scanning
- `lib/media-type.js` — Shared media-type parser (`parseMediaType`, `isJsonMediaType`) for
  RFC-correct JSON Content-Type detection per RFC 9110 Section 8.3.1 and RFC 6838 Section 4.2.8
- `lib/link-header.js` — RFC 8288 Web Linking `Link` header parser
  (`parseLinkHeader`): character-by-character scanning (no regex), quoted-string
  handling per RFC 9110 §5.6.4, relative URI resolution, graceful degradation
  on malformed entries, and `Map<rel, LinkObject>` return type
- `lib/pagination.js` — Async iterator-based paginator (`createPaginator`) with
  offset and cursor strategies, Link header following, `X-Total-Count` parsing,
  `maxPages` safety limit, same-origin confinement for next-link URLs, and
  backpressure via on-demand page fetching
- `lib/query-builder.js` — Immutable JSON:API query parameter builder
  (`createQueryBuilder`, `isQueryBuilder`) with structural validation,
  pagination strategy mutual exclusivity, JSON:API reserved namespace
  enforcement, bracket notation serialization, and duck-type detection via
  `Symbol.for('ergo-fetch:query-builder')`
- `lib/idempotency.js` — Idempotency-Key interceptor
  (`createIdempotencyInterceptor`): automatic key generation via
  `crypto.randomUUID()` for configured methods, per-request control via
  `ctx.idempotent` and `ctx.idempotencyKey`, WeakMap-based key preservation
  across retries, SHA-256 body fingerprinting to detect accidental key reuse
  with different content, and TTL-based lazy eviction of registry entries
- `stores/web-storage.js` — Web Storage cache store adapter
  (`createWebStorageStore`) backed by `localStorage` or `sessionStorage` for
  durable conditional request caching that survives page reloads, with
  oldest-entry eviction by write timestamp, `QuotaExceededError` recovery,
  `SecurityError` fallback to a no-op store, namespace isolation via
  configurable prefix, and null-prototype deserialization
- `lib/client.js` — Phase 2 client integration: `client.paginate()` async
  iterator method, `client.paginateAll()` convenience method that flattens all
  pages into a single array, `client.query()` factory returning immutable
  `QueryBuilder` instances, `idempotency` client config option for automatic
  idempotency-key interceptor assembly, `idempotencyKey` per-request option,
  and `options.query` accepts `QueryBuilder` instances (auto-serialized via
  `toString()`)
- `index.js` — Public re-exports for `createWebStorageStore`,
  `createIdempotencyInterceptor`, `parseLinkHeader`, `createPaginator`,
  `createQueryBuilder`, and `isQueryBuilder`
- Contract tests for pagination (offset + cursor strategies), idempotency
  (key generation, replay, fingerprint mismatch), and query builder (chained
  builder output against test server) in `test/contracts/`

### Fixed

- `lib/client.js` and `lib/conditional.js` now use parsed media-type matching
  (`parseMediaType` + allowlist) instead of substring `includes()` for JSON
  Content-Type detection — eliminates false positives from `json` appearing in
  parameters or unrelated subtype positions

### Changed

- `lib/client.js` — Path validation upgraded from `startsWith('/')` denylist to
  RFC 3986 `path-absolute` allowlist via `assertPathAbsolute`; now rejects
  backslashes, control characters, non-ASCII, and `//` authority escapes
- `lib/pagination.js` — Path validation upgraded from dual-prefix denylist to
  RFC 3986 `path-absolute` allowlist; Link `rel="next"` href fallback branch now
  validates the path portion with `isPathAbsolute` instead of prefix checks
- `lib/query-builder.js` — Path validation functions (`isHexDigit`,
  `isValidPathCode`, `isValidBasePath`) extracted to shared
  `lib/assert-path-absolute.js`; behavior is unchanged

## [0.1.0-beta.1] - 2026-06-21

### Added

- TypeScript declarations with strongly-typed `Client` interface — `createClient`
  now returns `Readonly<Client>` instead of `object`, giving consumers full
  IntelliSense and type-checking for all HTTP method helpers
- Full README documentation: Quick Start, configuration reference, API reference
  with TypeScript examples, interceptor option tables, error handling guide
- All interceptor factories (`createRetryInterceptor`, `createRateLimitInterceptor`,
  `createCsrfInterceptor`, `createConditionalInterceptor`, `createRequestIdInterceptor`)
  now reject non-object options with `TypeError` instead of silently falling through
  to defaults
- Project scaffolding: package.json, ESLint, Prettier, TypeScript declarations, CI/CD workflows
- PLAN.md with Phase 1 implementation plan (module specifications, ordering, acceptance criteria)
- `lib/client.js` — Core client pipeline (`createClient`):
  configurable interceptor assembly, URL building with path param substitution
  and query via URLSearchParams, auto-JSON body serialization, timeout via
  `AbortSignal.timeout()` + `AbortSignal.any()`, response auto-parsing (JSON
  for `application/json` and `+json`), automatic retry via interceptor pipeline,
  per-request interceptor disable (`retry: false`, `conditional: false`),
  ProblemDetailsError on 4xx/5xx
- `stores/memory.js` — in-memory CacheStore with FIFO eviction (`createMemoryStore`)
- `lib/problem-details.js` — RFC 9457 Problem Details parsing:
  - `ProblemDetailsError` class with standard fields and null-prototype extensions
  - `isProblemResponse(response)` — content-type detection
  - `parseProblemDetails(response)` — async parser with graceful fallback
  - `isRetryable(err)` / `isValidation(err)` / `isAuth(err)` — error classifiers
- `lib/request-id.js` — X-Request-Id interceptor (`createRequestIdInterceptor`):
  optional UUID generation for outgoing requests, captures response request IDs
- `lib/prefer.js` — RFC 7240 Prefer header interceptor (`createPreferInterceptor`):
  pre-computed header value, Preference-Applied response parsing
- `lib/csrf.js` — CSRF token lifecycle interceptor (`createCsrfInterceptor`):
  auto-extraction from safe-method responses, injection on unsafe same-origin requests
- `lib/conditional.js` — ETag/Last-Modified conditional request interceptor
  (`createConditionalInterceptor`): transparent 304 body substitution, response
  caching on success, cache invalidation on writes, If-Match with strong ETags
  only per RFC 9110 §13.1.1
- `lib/rate-limit.js` — Rate limit tracking interceptor
  (`createRateLimitInterceptor`, `parseRetryAfter`): X-RateLimit-\* header parsing,
  automatic 429 retry signaling with Retry-After + Reset fallback, optional
  proactive throttling
- `lib/retry.js` — Retry interceptor with exponential backoff
  (`createRetryInterceptor`): configurable backoff (exponential/linear) with
  AWS-style full jitter, Retry-After header override, per-request attempt
  tracking via WeakMap, idempotency-aware retry eligibility
- Contract test infrastructure: 5 test suites (problem details, conditional
  requests, rate limiting, CSRF lifecycle, retry semantics) validating all
  Phase 1 interceptor behaviors against a real `@centralping/ergo-router` server

### Changed

- `createRequestIdInterceptor` and `createCsrfInterceptor` now validate `headerName`
  options against the RFC 9110 `token` grammar at factory time, rejecting syntactically
  invalid names (e.g., names with spaces, colons, or control characters) with a
  descriptive `TypeError` instead of deferring to a less attributable runtime error
  from `Headers.set()`

### Fixed

- `lib/client.js` — Timeout signal is now created per retry attempt instead of
  once before the retry loop. Retry delays (including `Retry-After` waits) no
  longer consume timeout budget, ensuring each attempt gets a full timeout
  window. User abort signals now cancel retry delay sleeps immediately instead
  of waiting for the next `fetch()` call. (fixes #24)
- `lib/client.js` — Network errors (`TypeError` from `fetch()`) now enter the
  retry pipeline instead of propagating immediately. The retry interceptor
  evaluates network errors via a new `error()` method, applying the same attempt
  budget and backoff strategy used for retryable HTTP status codes. This resolves
  the contradiction between `isRetryable(err)` classifying `TypeError` as
  retryable and the pipeline bypassing retry on network failures.
- `lib/retry.js` — `IDEMPOTENT_METHODS` now includes PUT and DELETE per
  RFC 9110 section 9.2.2; PUT and DELETE requests receiving 500, 502, or 504
  are now automatically retried without requiring `idempotent: true`
- `lib/client.js` — `csrfInterceptor` was missing from the response pipeline,
  preventing Set-Cookie token extraction on safe-method responses
