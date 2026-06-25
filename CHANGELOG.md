# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `lib/pagination.js` — Async iterator-based paginator (`createPaginator`) with
  offset and cursor strategies, Link header following, `X-Total-Count` parsing,
  `maxPages` safety limit, and backpressure via on-demand page fetching

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
