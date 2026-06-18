# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project scaffolding: package.json, ESLint, Prettier, TypeScript declarations, CI/CD workflows
- DECISIONS.md with full architectural decisions from Lead Architect design session
- PLAN.md with Phase 1 implementation plan (module specifications, ordering, acceptance criteria)
- Minimal `createClient()` factory (scaffold — not yet functional)
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
  (`createRateLimitInterceptor`, `parseRetryAfter`): X-RateLimit-* header parsing,
  automatic 429 retry signaling with Retry-After + Reset fallback, optional
  proactive throttling
- `lib/retry.js` — Retry interceptor with exponential backoff
  (`createRetryInterceptor`): configurable backoff (exponential/linear) with
  AWS-style full jitter, Retry-After header override, per-request attempt
  tracking via WeakMap, idempotency-aware retry eligibility
