# Implementation Plan: @centralping/ergo-fetch — Phase 2

> **Document type:** Detailed implementation plan for Phase 2 (0.2.0) of `@centralping/ergo-fetch`.
> Covers multi-request patterns: pagination, JSON:API query building, idempotency, and
> persistent storage adapters.
>
> **Prerequisites:** Phase 1 (0.1.0) must be complete and stable. Phase 2 builds on the
> interceptor pipeline, retry infrastructure, and store interfaces established in Phase 1.

---

## Phase 2 Scope: Multi-Request Patterns (0.2.0)

Phase 2 extends the single-request foundation with patterns that span multiple requests
or require structured query construction. A developer gains:

- Pagination via async iterators (offset-based and cursor-based)
- Type-safe JSON:API query builder with structural validation
- Idempotency-Key generation with automatic replay on failure
- Persistent storage via localStorage/sessionStorage

---

## Implementation Order

| Order | Module | Depends On |
| --- | --- | --- |
| 1 | `lib/link-header.js` | Nothing (pure RFC 8288 parser) |
| 2 | `lib/pagination.js` | `lib/link-header.js`, Phase 1 client |
| 3 | `lib/query-builder.js` | Nothing (pure construction) |
| 4 | `lib/idempotency.js` | Phase 1 retry interceptor |
| 5 | `stores/web-storage.js` | Phase 1 store interface |
| 6 | Integration into `lib/client.js` | All of the above |
| 7 | Updated `index.js` exports | All of the above |

---

## Module Specifications

### 1. `lib/link-header.js`

**Purpose:** Parse RFC 8288 Web Linking `Link` headers into structured link objects.
Shared utility consumed by `lib/pagination.js` and potentially by other modules.

**Exports:**
- `parseLinkHeader(headerValue)` → `Map<rel, LinkObject>`
- `LinkObject` shape: `{href, rel, ...params}`

**RFC 8288 compliance:**
- Parse comma-separated link values
- Extract target URI from angle brackets (`<uri>`)
- Parse link parameters (`;param=value` and `;param="quoted-value"`)
- Handle multiple `rel` values per link
- Handle extension parameters (`type`, `title`, `hreflang`, etc.)
- Reject malformed entries gracefully (skip, don't throw)

**Parsing rules:**
```
Link: <https://api.example.com/users?page=2>; rel="next",
      <https://api.example.com/users?page=5>; rel="last"

→ Map {
    "next" => {href: "https://api.example.com/users?page=2", rel: "next"},
    "last" => {href: "https://api.example.com/users?page=5", rel: "last"}
  }
```

**Edge cases:**
- Multiple links with the same `rel` → last wins (per RFC 8288 §3.3 guidance)
- Quoted-string parameter values → unquote
- URI-reference in angle brackets may be relative → resolve against request URL
- Empty header value → return empty Map
- Malformed entry (missing brackets, missing rel) → skip entry, continue parsing

**Tests:** Full RFC 8288 compliance suite: simple cases, multiple links, quoted params,
relative URIs, extension params, malformed entries, edge cases.

---

### 2. `lib/pagination.js`

**Purpose:** Async iterator interface for traversing paginated API responses using
RFC 8288 Link headers and `X-Total-Count`.

**Exports:**
- `createPaginator(client, path, options?)` → AsyncIterable<Page>
- `Page` shape: `{data, meta, links, done}`

**Page shape:**
```js
{
  data: any,            // Response body for this page
  meta: {
    total: number?,     // From X-Total-Count (undefined if not provided)
    page: number?,      // Current page number (offset strategy)
    perPage: number?,   // Items per page
    cursor: string?,    // Current cursor (cursor strategy)
  },
  links: {
    first: string?,     // URL from Link rel="first"
    prev: string?,      // URL from Link rel="prev"
    next: string?,      // URL from Link rel="next"
    last: string?,      // URL from Link rel="last"
  },
  done: boolean,        // true when no more pages (no rel="next")
}
```

**Strategies:**

**Offset-based (default):**
```js
for await (const page of api.paginate('/users', {perPage: 25})) {
  process(page.data);
  console.log(`Page ${page.meta.page} of ${Math.ceil(page.meta.total / 25)}`);
}
```

- Initial request: `GET /users?page=1&perPage=25` (or uses query from options)
- Subsequent requests: follow `Link: rel="next"` URL
- Terminates when: no `rel="next"` in response, or `page.done === true`

**Cursor-based:**
```js
for await (const page of api.paginate('/events', {strategy: 'cursor', limit: 50})) {
  process(page.data);
}
```

- Initial request: `GET /events?limit=50`
- Subsequent requests: follow `Link: rel="next"` URL (contains cursor param)
- Terminates when: no `rel="next"` in response

**Options:**
- `strategy` — `'offset'` (default) or `'cursor'`
- `perPage` — items per page (offset strategy, default 25)
- `limit` — items per page (cursor strategy, default 25)
- `query` — additional query parameters merged into each request
- `maxPages` — maximum pages to traverse (safety limit, default `Infinity`)
- `concurrency` — number of pages to prefetch (default 1 = sequential)

**Convenience methods on client:**
```js
// Async iterator
for await (const page of api.paginate('/users', {perPage: 25})) { ... }

// Collect all pages into a single array
const allUsers = await api.paginateAll('/users', {perPage: 25});
// → flattened array of all items across all pages

// Collect with limit
const first100 = await api.paginateAll('/users', {perPage: 25, maxPages: 4});
```

**Backpressure:** The iterator only fetches the next page when the consumer calls
`.next()`. No prefetching by default. With `concurrency > 1`, prefetches N pages ahead
but pauses if the consumer stops consuming.

**Interaction with interceptors:** Each page request goes through the full interceptor
pipeline (conditional requests, rate limiting, retry). A 429 on page 3 retries
transparently — the iterator consumer doesn't observe it.

**Tests:**
- Offset strategy: multi-page traversal, total count tracking, termination
- Cursor strategy: multi-page traversal, cursor propagation, termination
- Backpressure: verify no prefetch without consumption
- Error mid-pagination: retry transparent to consumer
- maxPages limit: terminates after N pages
- Empty collection: zero pages, done immediately
- Single page: one page, done immediately

---

### 3. `lib/query-builder.js`

**Purpose:** Type-safe JSON:API query parameter builder with structural validation.
Produces URL-encoded query strings conforming to the JSON:API specification.

**Exports:**
- `createQueryBuilder(basePath?)` → QueryBuilder instance
- Query builder is also accessible via `client.query(path)` convenience

**Builder API:**
```js
const q = createQueryBuilder('/articles')
  .fields('articles', ['title', 'body', 'createdAt'])
  .fields('authors', ['name', 'avatar'])
  .include(['author', 'comments', 'comments.author'])
  .filter({published: true, category: 'tech'})
  .sort(['-createdAt', 'title'])
  .page({number: 2, size: 10});

q.toString();
// → "fields[articles]=title,body,createdAt&fields[authors]=name,avatar&include=author,comments,comments.author&filter[published]=true&filter[category]=tech&sort=-createdAt,title&page[number]=2&page[size]=10"

q.path;
// → "/articles"

// Execute with client
const result = await q.fetch(client);

// Or via client convenience
const result = await api.get('/articles', {query: q});
```

**Structural validation (fail-fast at build time):**

| Method | Validation |
| --- | --- |
| `fields(type, fields)` | `type` must be non-empty string; `fields` must be string[] |
| `include(paths)` | Must be string[] with dot-notation paths |
| `filter(criteria)` | Must be object with string/number/boolean values |
| `sort(fields)` | Must be string[] with optional `-` prefix |
| `page(params)` | Strategy-dependent validation (see below) |

**Pagination strategy enforcement:**
- `page({number, size})` — offset/page-number strategy
- `page({offset, limit})` — offset/limit strategy
- `page({cursor})` — cursor strategy (exclusive, cannot combine with sort/filter/include/fields per JSON:API spec)
- Mixing strategies throws TypeError at build time

**Immutability:** Each builder method returns a new builder instance (persistent data
structure pattern). The original is never mutated.

```js
const base = createQueryBuilder('/articles').fields('articles', ['title']);
const page1 = base.page({number: 1, size: 10});
const page2 = base.page({number: 2, size: 10});
// base, page1, page2 are all independent
```

**Serialization:**
- `fields[type]` → comma-separated field names
- `include` → comma-separated dot-paths
- `filter[key]` → value (string coercion)
- `sort` → comma-separated (with `-` prefix for descending)
- `page[key]` → value
- All values URL-encoded via `encodeURIComponent`
- Bracket notation for nested keys (`fields[articles]`, `filter[published]`)

**Custom parameters:** JSON:API allows custom query parameters (must contain at least one
non-lowercase character per spec):
```js
q.param('camelCase', 'value');  // valid custom param
q.param('x-custom', 'value');  // valid (contains hyphen)
q.param('lowercase', 'value'); // throws — reserved namespace
```

**Tests:**
- Each builder method in isolation
- Method chaining and immutability
- Serialization format correctness
- Structural validation (invalid types, empty arrays, strategy mixing)
- Custom parameter validation
- Integration with client.get() via query option
- Round-trip: builder output validates against `@centralping/json-api-query` schema

---

### 4. `lib/idempotency.js`

**Purpose:** Automatic Idempotency-Key header generation and management for safe
mutation retry.

**Exports:**
- `createIdempotencyInterceptor(options?)` → interceptor object

**Behavior:**

**Request interceptor:**
- For mutating requests (POST, PUT, PATCH, DELETE) marked as idempotent:
  - Generate a `crypto.randomUUID()` key
  - Attach as `Idempotency-Key` header
  - Store the key + request fingerprint in memory
- For explicitly provided keys (`options.idempotencyKey`):
  - Use the provided key directly
  - Still store fingerprint

**Response interceptor:**
- On success (2xx): clear stored key
- On retryable failure (5xx, network error): preserve key for retry
  - The retry interceptor reuses the same key on subsequent attempts
- On 409 Conflict with matching key: surface as non-retryable error
  (duplicate request detected by server)

**Request fingerprinting:**
```js
{
  method,
  path,
  bodyHash,     // SHA-256 of serialized body (or undefined for no-body)
  timestamp,    // When the key was generated
}
```

Body hashing uses `crypto.subtle.digest('SHA-256', body)` for content-addressable
fingerprinting. This detects if the same idempotency key is accidentally reused
with different request content (a bug in the caller's code).

**Options:**
- `headerName` — default `'idempotency-key'`
- `methods` — methods to auto-generate keys for (default `['POST']`)
- `generator` — custom key generator function (default `crypto.randomUUID`)
- `ttl` — how long to retain keys in memory (default 5 minutes)

**Interaction with retry:**
When the retry interceptor retries a request, it checks for a stored idempotency key.
If found, the same key is reattached. This ensures the server sees identical keys
across retries, enabling at-most-once processing.

**Per-request control:**
```js
// Auto-generate key
await api.post('/orders', {body: orderData, idempotent: true});

// Provide explicit key
await api.post('/orders', {body: orderData, idempotencyKey: 'my-key-123'});

// Disable for this request (even if globally enabled)
await api.post('/webhooks', {body: data, idempotent: false});
```

**Tests:**
- Key generation and header attachment
- Key reuse across retries
- Key cleared on success
- Body fingerprint mismatch detection
- TTL expiration
- 409 Conflict handling
- Custom generator function
- Per-request override (enable/disable)
- Integration with retry interceptor

---

### 5. `stores/web-storage.js`

**Purpose:** CacheStore implementation backed by `localStorage` or `sessionStorage`.
Provides durable conditional request caching that survives page reloads.

**Exports:**
- `createWebStorageStore(options?)` → CacheStore

**Options:**
- `storage` — `localStorage` (default) or `sessionStorage`
- `prefix` — key prefix for namespacing (default `'ergo-fetch:'`)
- `maxEntries` — maximum entries before LRU eviction (default 100)
- `serializer` — custom serialization (default JSON.stringify/parse)

**Storage format:**
```js
// Key: `${prefix}${url}`
// Value: JSON.stringify({etag, lastModified, body, timestamp})
```

**LRU eviction:**
- On `set()`, if entry count exceeds `maxEntries`:
  - Scan all entries with matching prefix
  - Remove oldest by `timestamp`
  - This is O(n) but acceptable given maxEntries cap and infrequency

**Error handling:**
- `QuotaExceededError` on `set()` → evict oldest entries until space available,
  then retry. If still fails after clearing all entries, silently drop (cache miss
  is non-fatal).
- `SecurityError` (private browsing mode blocks storage) → fall back to no-op store
  (all gets return undefined, all sets are silent no-ops). Log warning once.

**Browser compatibility:**
- `localStorage` / `sessionStorage` available in all target browsers
- Storage event (`window.addEventListener('storage')`) not used — cross-tab sync
  is a future concern, not Phase 2

**Tests:**
- Basic CRUD operations
- LRU eviction at maxEntries
- QuotaExceededError recovery
- SecurityError fallback (mock storage that throws)
- Namespace isolation (two stores with different prefixes)
- Serialization/deserialization round-trip

---

### 6. Integration into `lib/client.js`

**Changes to client.js for Phase 2:**

**New client methods:**
```js
client.paginate(path, options?)   → AsyncIterable<Page>
client.paginateAll(path, options?) → Promise<any[]>
client.query(path)                → QueryBuilder
```

**New config options:**
```js
createClient({
  // ...Phase 1 options...
  idempotency: true | {methods: ['POST'], generator: fn},
  jsonApi: true,  // enables query builder validation mode
});
```

**Interceptor pipeline additions:**
- Idempotency interceptor added in Enrich stage (after CSRF, before conditional)
- Order matters: CSRF → Idempotency → Conditional → Prefer → Request-ID

**Query builder integration:**
When `options.query` is a QueryBuilder instance (detected via symbol or instanceof),
serialize it to a query string instead of treating as a plain object.

---

### 7. Updated `index.js` exports

**New exports for Phase 2:**
```js
export {createClient} from './lib/client.js';
export {ProblemDetailsError, isRetryable, isValidation, isAuth} from './lib/problem-details.js';
export {createMemoryStore} from './stores/memory.js';
export {createWebStorageStore} from './stores/web-storage.js';
export {createQueryBuilder} from './lib/query-builder.js';
export {parseLinkHeader} from './lib/link-header.js';
```

Individual interceptor factories remain importable via deep imports
(`@centralping/ergo-fetch/lib/idempotency`) for advanced composition.

---

## Acceptance Criteria (Phase 2)

### Functional

- [ ] Pagination async iterator traverses all pages via Link headers (offset strategy)
- [ ] Pagination async iterator traverses all pages via Link headers (cursor strategy)
- [ ] `paginateAll()` collects all pages into a flattened array
- [ ] Pagination respects `maxPages` safety limit
- [ ] Pagination handles 429/retry transparently mid-traversal
- [ ] Query builder produces spec-compliant JSON:API query strings
- [ ] Query builder validates structurally at build time (type errors, strategy mixing)
- [ ] Query builder is immutable (method chaining returns new instances)
- [ ] Query builder output validates against `@centralping/json-api-query` schema
- [ ] Idempotency-Key auto-generated for configured methods
- [ ] Same idempotency key reused across retries
- [ ] 409 Conflict with idempotency key surfaces as non-retryable error
- [ ] Web storage store persists ETag cache across page reloads
- [ ] Web storage store handles QuotaExceeded and SecurityError gracefully

### Non-Functional

- [ ] Zero new runtime dependencies (web-storage store uses native APIs)
- [ ] All Phase 1 tests still pass (no regressions)
- [ ] Coverage thresholds maintained
- [ ] Bundle size increase < 5KB min+gzip over Phase 1
- [ ] Contract tests: pagination against ergo-router with `presets.jsonApi` + paginate enabled
- [ ] Contract tests: idempotency against ergo-router with idempotency middleware enabled

### Documentation

- [ ] README updated with pagination and query builder examples
- [ ] JSDoc on all new exports
- [ ] CHANGELOG.md entry for 0.2.0

---

## Contract Test Additions (Phase 2)

```
test/contracts/
├── pagination-offset.spec.func.js    # Multi-page traversal, X-Total-Count, Link headers
├── pagination-cursor.spec.func.js    # Cursor-based traversal, opaque tokens
├── idempotency.spec.func.js          # Key generation, replay, 409 detection
└── query-builder.spec.func.js        # Builder output against live JSON:API endpoint
```

**Test server additions:**
- Routes with paginate middleware (offset and cursor strategies)
- Routes with idempotency middleware (required: true)
- Routes with JSON:API query validation enabled

---

## Open Items (to resolve during Phase 2 implementation)

1. **Pagination prefetch:** Should `concurrency > 1` be Phase 2 or deferred?
   Recommendation: defer to Phase 2.1 patch. Sequential is correct and sufficient initially.

2. **Query builder + pagination integration:** Should `api.paginate()` accept a QueryBuilder?
   Recommendation: yes. `api.paginate('/articles', {query: builder})` merges builder params
   with pagination params on each page request.

3. **Idempotency storage persistence:** Should idempotency keys survive page reload
   (web-storage backed)?
   Recommendation: no. Idempotency keys are per-session. Cross-session key reuse would
   cause false 409 conflicts on legitimate re-submissions.

4. **Web storage key collision:** What if two client instances with the same baseUrl
   share localStorage?
   Recommendation: include `prefix` in config that defaults to baseUrl origin. Two clients
   to the same API share cache (correct behavior — same resources, same ETags).
