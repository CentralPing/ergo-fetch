# Implementation Plan: @centralping/ergo-fetch

> **Document type:** Detailed implementation plan for Phase 1 (0.1.0) of `@centralping/ergo-fetch`.
> Covers module-by-module design, implementation order, testing strategy, and acceptance criteria.

---

## Phase 1 Scope: Core HTTP Client (0.1.0)

Phase 1 delivers a production-ready HTTP client with automatic RFC-compliant behavior for
single request/response cycles. A developer can install ergo-fetch and immediately get:

- Structured error handling (RFC 9457 Problem Details)
- Conditional requests (ETag, Last-Modified) with transparent 304 handling
- Rate limit awareness with automatic retry
- Exponential backoff retry for transient failures
- CSRF token lifecycle management
- Prefer header negotiation
- Request-ID correlation
- Content negotiation

---

## Implementation Order

Modules are ordered by dependency — each module builds on the previous:

| Order | Module | Depends On |
| --- | --- | --- |
| 1 | `stores/memory.js` | Nothing (foundational) |
| 2 | `lib/problem-details.js` | Nothing |
| 3 | `lib/request-id.js` | Nothing |
| 4 | `lib/prefer.js` | Nothing |
| 5 | `lib/csrf.js` | Nothing |
| 6 | `lib/conditional.js` | `stores/memory.js` |
| 7 | `lib/rate-limit.js` | Nothing |
| 8 | `lib/retry.js` | `lib/rate-limit.js`, `lib/problem-details.js` |
| 9 | `lib/client.js` | All of the above (interceptor pipeline assembly) |
| 10 | `index.js` | `lib/client.js` (createClient factory) |

---

## Module Specifications

### 1. `stores/memory.js`

**Purpose:** In-memory implementation of the CacheStore and QueueStore interfaces.
Default store for all caching operations.

**Exports:**
- `createMemoryStore()` → CacheStore
- `createMemoryQueueStore()` → QueueStore (Phase 2, but interface defined now)

**Interface (CacheStore):**
```js
{
  get(key) → Promise<{etag?, lastModified?, body?} | undefined>
  set(key, {etag?, lastModified?, body?}) → Promise<void>
  delete(key) → Promise<void>
  clear() → Promise<void>
}
```

**Implementation details:**
- Backed by `Map`
- All methods return resolved Promises (async interface compliance)
- Optional `maxEntries` for LRU eviction (Phase 1 can use unbounded)
- Keys are URL strings (normalized via `new URL()`)

**Tests:** Boundary tests verifying all interface methods, eviction behavior, key normalization.

---

### 2. `lib/problem-details.js`

**Purpose:** Parse RFC 9457 Problem Details responses and provide error classification.

**Exports:**
- `parseProblemDetails(response)` → `ProblemDetails | undefined`
- `ProblemDetailsError` — Error subclass with structured fields
- `isRetryable(error)` → boolean
- `isValidation(error)` → boolean
- `isAuth(error)` → boolean

**ProblemDetails shape:**
```js
{
  type,      // URI reference (default: "about:blank")
  title,     // Human-readable summary
  status,    // HTTP status code
  detail,    // Human-readable explanation
  instance,  // URI reference identifying the occurrence
  // ...extension members
}
```

**Detection logic:**
- Check `Content-Type` header for `application/problem+json` (exact or with params)
- If detected, parse JSON body into ProblemDetails
- If Content-Type doesn't match but status >= 400, construct minimal ProblemDetails from status

**Classification:**
- `isRetryable`: status 429, 503, or network error (TypeError)
- `isValidation`: status 400, 422
- `isAuth`: status 401, 403

**Tests:** Boundary tests with mocked Response objects. Cover content-type detection edge cases,
malformed JSON handling, extension member preservation.

---

### 3. `lib/request-id.js`

**Purpose:** Capture `X-Request-Id` from responses and associate with requests.

**Exports:**
- `createRequestIdInterceptor(options?)` → interceptor object

**Behavior:**
- Response interceptor reads `X-Request-Id` header
- Stores on the response context for application access
- Optionally generates and attaches `X-Request-Id` to outgoing requests
  (useful for client-side tracing)

**Options:**
- `headerName` — default `'x-request-id'`
- `generate` — boolean (default `false`), generate outgoing request IDs

**Tests:** Verify header capture, optional generation, custom header names.

---

### 4. `lib/prefer.js`

**Purpose:** Construct and manage the Prefer header (RFC 7240).

**Exports:**
- `createPreferInterceptor(preferences)` → interceptor object

**Behavior:**
- Request interceptor attaches `Prefer` header with configured preferences
- Response interceptor reads `Preference-Applied` header
- Handles `return=minimal` (interpret 204 as success with no body)
- Handles `return=representation` (expect full resource in response)

**Options:**
- `preferences` — string or object (`{return: 'minimal'}`)

**Tests:** Header construction, Preference-Applied detection, 204 interpretation.

---

### 5. `lib/csrf.js`

**Purpose:** Automatic CSRF token lifecycle management.

**Exports:**
- `createCsrfInterceptor(options?)` → interceptor object

**Behavior:**
- Response interceptor extracts CSRF token from response cookies or headers
  after safe-method requests (GET, HEAD, OPTIONS)
- Request interceptor attaches token to unsafe-method requests
  (POST, PUT, PATCH, DELETE) via header
- Token storage is in-memory per client instance (not persisted)

**Options:**
- `cookieName` — default `'__csrf'` (ergo-router convention)
- `headerName` — default `'x-csrf-token'`
- `safeMethods` — default `['GET', 'HEAD', 'OPTIONS']`

**Security considerations:**
- Token is scoped to the client instance (not global)
- Cleared on client destruction
- Never sent cross-origin unless explicitly configured

**Tests:** Token extraction from Set-Cookie, header injection, safe/unsafe method distinction,
cross-origin blocking.

---

### 6. `lib/conditional.js`

**Purpose:** Automatic ETag and Last-Modified conditional request management.

**Exports:**
- `createConditionalInterceptor(options?)` → interceptor object

**Behavior:**
- Response interceptor caches ETag and Last-Modified for successful responses
- Request interceptor attaches `If-None-Match` (reads) or `If-Match` (writes)
- On 304 Not Modified, returns the cached body transparently
- On 412 Precondition Failed, surfaces as a ProblemDetailsError

**Options:**
- `store` — CacheStore instance (default: in-memory)
- `methods.read` — methods that get conditional headers for cache validation (default: `['GET', 'HEAD']`)
- `methods.write` — methods that get precondition headers (default: `['PUT', 'PATCH', 'DELETE']`)

**RFC compliance:**
- `If-None-Match` uses weak comparison (strips `W/` prefixes) per RFC 9110 §8.8.3.2
- `If-Match` uses strong comparison per RFC 9110 §8.8.3.2
- 304 response must return original cached headers (Content-Type, etc.)

**Tests:** ETag caching, 304 transparent handling, If-Match for writes, weak vs strong comparison,
cache invalidation on successful writes.

---

### 7. `lib/rate-limit.js`

**Purpose:** Track rate limit state from response headers.

**Exports:**
- `createRateLimitInterceptor(options?)` → interceptor object

**Behavior:**
- Response interceptor parses `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
  `X-RateLimit-Reset` headers
- Exposes current rate limit state on the client (observable)
- On 429, extracts `Retry-After` and signals retry to the pipeline
- Optional proactive throttling: delay requests when remaining < threshold

**Options:**
- `proactive` — boolean (default `false`), enable proactive throttling
- `threshold` — number (default `5`), remaining count below which to throttle
- `headerPrefix` — default `'x-ratelimit'`

**Observable state:**
- `limit` — total budget
- `remaining` — remaining in window
- `reset` — reset timestamp
- `limited` — boolean, currently rate limited

**Tests:** Header parsing, 429 detection, Retry-After extraction, proactive throttling behavior,
state observation.

---

### 8. `lib/retry.js`

**Purpose:** Retry transient failures with exponential backoff.

**Exports:**
- `createRetryInterceptor(options?)` → interceptor object

**Behavior:**
- Response interceptor evaluates retry eligibility
- On eligible failure, signals retry to the pipeline with computed delay
- Tracks attempt count per request
- Respects `Retry-After` header (overrides computed delay)

**Options:**
- `maxAttempts` — default `3`
- `maxDelay` — default `60000` ms (cap for backoff)
- `baseDelay` — default `1000` ms
- `backoff` — `'exponential'` (default) or `'linear'`
- `jitter` — `'full'` (default, AWS-style) or `'none'`

**Retry eligibility rules:**
- 429 → always retry
- 503 → always retry
- 500, 502, 504 → retry if idempotent (GET, HEAD, OPTIONS, or has Idempotency-Key)
- Network error (TypeError) → retry if idempotent
- All other statuses → never retry

**Backoff formula (exponential + full jitter):**
`delay = random(0, min(maxDelay, baseDelay * 2^attempt))`

**Tests:** Eligibility rules for each status code, backoff computation, Retry-After override,
attempt budget exhaustion, idempotency detection.

---

### 9. `lib/client.js`

**Purpose:** Core fetch wrapper that assembles and executes the interceptor pipeline.

**Exports:**
- `createClientCore(config)` → client instance

**Client instance methods:**
- `get(path, options?)` → Promise<Response>
- `post(path, options?)` → Promise<Response>
- `put(path, options?)` → Promise<Response>
- `patch(path, options?)` → Promise<Response>
- `delete(path, options?)` → Promise<Response>
- `head(path, options?)` → Promise<Response>
- `request(method, path, options?)` → Promise<Response>

**Request options:**
```js
{
  headers: {},        // Additional headers
  body: any,          // Request body (auto-serialized if object)
  params: {},         // URL path parameters (:id replacement)
  query: {},          // URL query parameters
  signal: AbortSignal, // Abort control
  timeout: number,    // Request timeout in ms
  // Per-request interceptor overrides
  retry: false,       // Disable retry for this request
  conditional: false, // Disable conditional headers for this request
  idempotent: true,   // Mark as idempotent (for retry eligibility)
}
```

**Pipeline execution:**
1. Build URL from `baseUrl` + path + params + query
2. **Prepare:** Validate URL, serialize body, validate headers
3. **Enrich:** Run all request interceptors (CSRF, conditional, prefer, request-ID)
4. **Send:** Execute `fetch(url, init)` with AbortController timeout
5. **Interpret:** Run all response interceptors (problem-details, conditional, rate-limit, retry)
6. If retry signaled: re-enter from step 3 (Enrich) with updated state
7. Return processed response or throw ProblemDetailsError

**Response shape (success):**
```js
{
  status: number,
  headers: Headers,
  body: any,           // Parsed JSON body (or raw for non-JSON)
  requestId: string?,  // From X-Request-Id header
  rateLimit: {...},    // Current rate limit state
  raw: Response,       // Original fetch Response for advanced use
}
```

**Fail-fast validation (Prepare stage):**
- `baseUrl` must be a valid URL
- `path` must be a string starting with `/`
- `body` on GET/HEAD throws TypeError
- `headers` values must not contain CRLF

**Tests:** URL construction, body serialization, header merging, timeout/abort, pipeline
execution order, per-request overrides, fail-fast validation errors.

---

### 10. `index.js`

**Purpose:** Public entry point. Exports `createClient` factory.

**Exports:**
- `createClient(config)` → fully-configured client instance
- Re-exports: `ProblemDetailsError`, store creators, individual interceptor factories

**`createClient` responsibilities:**
- Validate configuration
- Instantiate default stores
- Create interceptors from config
- Assemble interceptor pipeline in correct order
- Return frozen client instance

---

## Acceptance Criteria (Phase 1)

### Functional

- [ ] `createClient()` produces a working client with all Phase 1 interceptors
- [ ] RFC 9457 Problem Details correctly parsed from ergo-router error responses
- [ ] ETag-based conditional requests produce 304 → cached body transparently
- [ ] Rate limit headers tracked, 429 triggers automatic retry with Retry-After
- [ ] Exponential backoff retry on 5xx for idempotent requests
- [ ] CSRF tokens extracted from safe responses, injected on unsafe requests
- [ ] Prefer header sent, Preference-Applied detected
- [ ] Request-ID captured from responses
- [ ] Fail-fast validation throws on invalid inputs before fetch

### Non-Functional

- [ ] Zero runtime dependencies (verified by `npm ls --production`)
- [ ] Tree-shakeable — unused modules not included by bundlers
- [ ] All tests pass on Node 22 and 24
- [ ] Coverage: branches 80%, functions 100%, lines 80%, statements 80%
- [ ] TypeScript declarations generated and validated (`check-types` passes)
- [ ] Bundle size < 15KB minified+gzipped (core only, no stores)
- [ ] Contract tests pass against a live ergo-router instance

### Documentation

- [ ] JSDoc on all exported functions
- [ ] README with Quick Start, API reference, and TypeScript examples
- [ ] CHANGELOG.md entry for 0.1.0

---

## Phase 2 Preview (0.2.0)

Builds on Phase 1 with multi-request patterns:

- `lib/pagination.js` — async iterator interface over Link headers
- `lib/query-builder.js` — JSON:API query construction with structural validation
- `lib/idempotency.js` — key generation, fingerprinting, replay
- `stores/web-storage.js` — localStorage/sessionStorage adapter

---

## Phase 3 Preview (0.3.0)

Advanced patterns requiring the most design thought:

- `lib/sse.js` — Server-Sent Events via fetch + ReadableStream
- Offline queue (queue store + replay engine + conflict events)
- `codegen/` — OpenAPI client generation CLI
- `stores/idb.js` — IndexedDB adapter for durable cache + queue

---

## Contract Test Infrastructure

Phase 1 contract tests require a test harness:

```
test/
├── fixtures/
│   └── server.js         # Ephemeral ergo-router instance for contract tests
├── helpers/
│   └── setup-server.js   # Start/stop server, port allocation
└── contracts/
    ├── conditional.spec.func.js
    ├── rate-limit.spec.func.js
    ├── csrf.spec.func.js
    ├── problem-details.spec.func.js
    └── retry.spec.func.js
```

The test server uses `@centralping/ergo` + `@centralping/ergo-router` as dev dependencies
to create a real server exercising all behaviors the client must handle correctly.

---

## Open Items (to resolve during implementation)

1. **Response body parsing:** Should `client.get()` auto-parse JSON, or return raw Response?
   Recommendation: auto-parse JSON when Content-Type indicates it, expose `.raw` for others.

2. **AbortController management:** One controller per request, or shared per client?
   Recommendation: per-request (isolated abort), with client-level `destroy()` that aborts all.

3. **Observable state mechanism:** EventEmitter pattern, or simple getter properties?
   Recommendation: getter properties for synchronous reads, optional event subscription for
   reactive frameworks (adapters will wrap these).

4. **Interceptor ordering guarantees:** Should users be able to add custom interceptors?
   Recommendation: yes, via `interceptors` array in config. Custom interceptors run after
   built-in ones in Enrich stage, before built-in ones in Interpret stage (sandwich pattern).
