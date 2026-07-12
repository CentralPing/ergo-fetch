# @centralping/ergo-fetch

RFC-compliant HTTP client for ergo-router APIs — conditional requests, rate limiting, retry, and more.

## Overview

`@centralping/ergo-fetch` is the client-side counterpart to [`@centralping/ergo-router`](https://github.com/CentralPing/ergo-router). It encodes RFC-correct client behaviors so application code expresses intent — not HTTP mechanics.

**Zero runtime dependencies.** Built entirely on Web Platform APIs (`fetch`, `Headers`, `AbortSignal`, `URL`).

## Install

```bash
npm install @centralping/ergo-fetch
```

## Quick Start

```javascript
import {createClient} from '@centralping/ergo-fetch';

const api = createClient({
  baseUrl: 'https://api.example.com'
});

// GET with automatic conditional request caching
const user = await api.get('/users/:id', {
  params: {id: '123'}
});

console.log(user.status); // 200
console.log(user.body); // parsed JSON body
```

## Features

| Feature                             | Description                                                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **RFC 9457 Problem Details**        | Structured error handling with classification (`isRetryable`, `isValidation`, `isAuth`)                                                       |
| **Conditional requests (RFC 9110)** | Automatic ETag/Last-Modified caching with transparent 304 handling                                                                            |
| **Rate limit awareness**            | Tracks `X-RateLimit-*` headers, auto-retries on 429 with Retry-After                                                                         |
| **Exponential backoff**             | Retries transient failures (503, 429) and network errors (`TypeError`) with AWS-style full jitter; retries 500/502/504 for idempotent methods |
| **CSRF lifecycle**                  | Extracts tokens from safe responses, injects on unsafe same-origin requests                                                                   |
| **Prefer header (RFC 7240)**        | Declarative `return=minimal` / `return=representation` negotiation                                                                            |
| **Request-ID correlation**          | Captures `X-Request-Id` from responses, optionally generates for requests                                                                     |
| **Pagination (RFC 8288)**           | Async iterator over paginated responses via Link headers (offset and cursor strategies)                                                       |
| **JSON:API query builder**          | Immutable builder with structural validation and bracket-notation serialization                                                                |
| **Idempotency-Key management**      | Auto-generates keys for safe mutation retry; body fingerprinting detects reuse errors                                                         |
| **Web Storage caching**             | localStorage/sessionStorage adapter for durable conditional request caching                                                                   |
| **Fail-fast validation**            | Invalid inputs throw synchronously before any network call                                                                                    |

## Configuration

```javascript
import {createClient} from '@centralping/ergo-fetch';

const api = createClient({
  // Required
  baseUrl: 'https://api.example.com',

  // Optional — most interceptors enabled by default (prefer and idempotency are opt-in)
  timeout: 30000, // Default request timeout (ms)
  headers: {Accept: 'application/json'},

  // Interceptor configuration (true = defaults, false = disabled, object = custom)
  requestId: {generate: true},
  prefer: 'return=representation',
  csrf: true,
  conditional: true,
  rateLimit: {proactive: true, threshold: 10},
  retry: {maxAttempts: 3, backoff: 'exponential', jitter: 'full'},
  idempotency: true // Opt-in: auto-generate Idempotency-Key for POST requests
});
```

### Interceptor Options

#### `requestId`

| Option       | Type      | Default          | Description                         |
| ------------ | --------- | ---------------- | ----------------------------------- |
| `headerName` | `string`  | `'x-request-id'` | Header name for request ID          |
| `generate`   | `boolean` | `false`          | Generate UUID for outgoing requests |

#### `csrf`

| Option        | Type       | Default                      | Description                              |
| ------------- | ---------- | ---------------------------- | ---------------------------------------- |
| `cookieName`  | `string`   | `'__csrf'`                   | Cookie containing CSRF token             |
| `headerName`  | `string`   | `'x-csrf-token'`             | Header for CSRF token injection          |
| `safeMethods` | `string[]` | `['GET', 'HEAD', 'OPTIONS']` | Methods that extract (not inject) tokens |

#### `conditional`

| Option          | Type         | Default                      | Description                                             |
| --------------- | ------------ | ---------------------------- | ------------------------------------------------------- |
| `store`         | `CacheStore` | in-memory (1024 entries)     | Cache store for validators and bodies                   |
| `methods.read`  | `string[]`   | `['GET', 'HEAD']`            | Methods receiving `If-None-Match` / `If-Modified-Since` |
| `methods.write` | `string[]`   | `['PUT', 'PATCH', 'DELETE']` | Methods receiving `If-Match`                            |

#### `rateLimit`

| Option         | Type      | Default         | Description                                   |
| -------------- | --------- | --------------- | --------------------------------------------- |
| `proactive`    | `boolean` | `false`         | Throttle requests when remaining < threshold  |
| `threshold`    | `number`  | `5`             | Remaining count triggering proactive throttle |
| `headerPrefix` | `string`  | `'x-ratelimit'` | Header prefix for rate limit headers          |

#### `retry`

| Option        | Type                        | Default         | Description                            |
| ------------- | --------------------------- | --------------- | -------------------------------------- |
| `maxAttempts` | `number`                    | `3`             | Max attempts including initial request |
| `maxDelay`    | `number`                    | `60000`         | Backoff cap in milliseconds            |
| `baseDelay`   | `number`                    | `1000`          | Base delay for backoff computation     |
| `backoff`     | `'exponential' \| 'linear'` | `'exponential'` | Backoff strategy                       |
| `jitter`      | `'full' \| 'none'`          | `'full'`        | AWS-style full jitter or deterministic |

#### `idempotency`

Disabled by default. Set `true` for defaults or pass an options object.

| Option       | Type         | Default              | Description                                   |
| ------------ | ------------ | -------------------- | --------------------------------------------- |
| `headerName` | `string`     | `'idempotency-key'`  | Header name for the idempotency key           |
| `methods`    | `string[]`   | `['POST']`           | Methods that receive auto-generated keys      |
| `generator`  | `() => string` | `crypto.randomUUID` | Custom key generator function                 |
| `ttl`        | `number`     | `300000`             | Key registry TTL in milliseconds (5 minutes)  |

## API Reference

### `createClient(config)`

Creates a configured HTTP client. Returns a frozen object with HTTP method helpers.

```typescript
import {createClient} from '@centralping/ergo-fetch';
import type {ClientConfig, Client} from '@centralping/ergo-fetch/lib/client';

const api: Readonly<Client> = createClient({baseUrl: 'https://api.example.com'});
```

### HTTP Methods

All methods return `Promise<ClientResponse>`.

```javascript
api.get(path, options?)
api.post(path, options?)
api.put(path, options?)
api.patch(path, options?)
api.delete(path, options?)
api.head(path, options?)
api.request(method, path, options?)

// Pagination
api.paginate(path, options?)    // → AsyncIterable<Page>
api.paginateAll(path, options?) // → Promise<any[]>

// JSON:API query builder
api.query(path?)                // → QueryBuilder
```

### Request Options

```typescript
interface RequestOptions {
  headers?: object | Headers; // Per-request headers (merged with defaults)
  body?: any; // Auto-serialized to JSON for plain objects
  params?: object; // URL path parameters (:key substitution)
  query?: object | QueryBuilder; // URL query params or QueryBuilder (auto-serialized)
  signal?: AbortSignal; // User abort signal
  timeout?: number; // Per-request timeout (ms)
  retry?: boolean; // Set false to disable retry
  conditional?: boolean; // Set false to disable conditional headers
  idempotent?: boolean; // Override idempotency for retry eligibility
  idempotencyKey?: string; // Explicit idempotency key for this request
}
```

### Client Response

```typescript
interface ClientResponse {
  status: number; // HTTP status code
  headers: Headers; // Response headers
  body: any; // Parsed JSON or text
  requestId?: string; // Captured X-Request-Id
  rateLimit?: RateLimitState; // Current rate limit state
  raw: Response; // Original fetch Response
}
```

### Error Handling

Responses with `status >= 400` throw `ProblemDetailsError` (RFC 9457):

```javascript
import {
  createClient,
  ProblemDetailsError,
  isRetryable,
  isValidation,
  isAuth
} from '@centralping/ergo-fetch';

const api = createClient({baseUrl: 'https://api.example.com'});

try {
  await api.get('/users/999');
} catch (err) {
  if (err instanceof ProblemDetailsError) {
    console.log(err.status); // 404
    console.log(err.title); // "Not Found"
    console.log(err.detail); // "User 999 does not exist"
    console.log(err.type); // "about:blank"
    console.log(err.extensions); // null-prototype object of extra fields
  }

  if (isValidation(err)) {
    /* 400 or 422 */
  }
  if (isAuth(err)) {
    /* 401 or 403 */
  }
  if (isRetryable(err)) {
    /* 429 or 503 */
  }
}
```

### URL Building

Path parameters use `:key` syntax. Query parameters are appended via `URLSearchParams`:

```javascript
await api.get('/users/:id/posts', {
  params: {id: '123'},
  query: {page: 1, limit: 20, tags: ['news', 'tech']}
});
// → GET https://api.example.com/users/123/posts?page=1&limit=20&tags=news&tags=tech
```

### Body Serialization

Plain objects and arrays are auto-serialized to JSON with `Content-Type: application/json`. Web Platform body types pass through unchanged:

```javascript
// Auto-JSON serialization
await api.post('/users', {body: {name: 'Alice', email: 'alice@example.com'}});

// FormData (no Content-Type set — browser sets multipart boundary)
const form = new FormData();
form.append('file', blob);
await api.post('/upload', {body: form});
```

### Per-Request Overrides

Disable specific interceptors for individual requests:

```javascript
// Skip conditional headers for this request
await api.get('/always-fresh', {conditional: false});

// Skip retry for non-idempotent mutation
await api.post('/payments', {body: charge, retry: false});

// Force retry eligibility on a POST (PUT/DELETE are already idempotent per RFC 9110)
await api.post('/idempotent-op', {body: data, idempotent: true});
```

### Abort and Timeout

The `timeout` option applies **per attempt**, not to the entire retry sequence. Each retry attempt gets a fresh timeout window — retry delays (including `Retry-After` waits) do not consume timeout budget. User abort signals cancel retry delay sleeps immediately.

```javascript
// Per-request timeout (overrides client default)
await api.get('/slow-endpoint', {timeout: 60000});

// User-controlled abort
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);
await api.get('/stream', {signal: controller.signal});
```

### Memory Store

Custom cache store for the conditional interceptor:

```javascript
import {createClient, createMemoryStore} from '@centralping/ergo-fetch';

const store = createMemoryStore({maxEntries: 256});

const api = createClient({
  baseUrl: 'https://api.example.com',
  conditional: {store}
});
```

### Utilities

#### `parseMediaType(contentType)`

Extracts the normalized `type/subtype` from a Content-Type header value. Strips parameters, trims whitespace, and lowercases per RFC 9110 Section 8.3.1.

```javascript
import {parseMediaType} from '@centralping/ergo-fetch';

parseMediaType('Application/JSON; charset=utf-8'); // → 'application/json'
parseMediaType(null); // → undefined
```

#### `isJsonMediaType(contentType)`

Determines whether a Content-Type represents a JSON media type — matches `application/json` exactly, or any `+json` structured syntax suffix type per RFC 6838.

```javascript
import {isJsonMediaType} from '@centralping/ergo-fetch';

isJsonMediaType('application/json'); // → true
isJsonMediaType('application/vnd.api+json'); // → true
isJsonMediaType('text/plain'); // → false
isJsonMediaType('text/plain; format=json'); // → false
```

### Web Storage Store

Durable cache store backed by `localStorage` or `sessionStorage` that survives
page reloads:

```javascript
import {createClient, createWebStorageStore} from '@centralping/ergo-fetch';

const store = createWebStorageStore({
  storage: localStorage,       // or sessionStorage (default: localStorage)
  prefix: 'my-app:',           // namespace prefix (default: 'ergo-fetch:')
  maxEntries: 200              // oldest entries evicted when exceeded (default: 100)
});

const api = createClient({
  baseUrl: 'https://api.example.com',
  conditional: {store}
});
```

If the storage backend is inaccessible (e.g., `SecurityError` in private
browsing mode), the factory returns a no-op store that silently ignores all
operations.

### Pagination

Traverse paginated API responses using async iteration. Each page request goes
through the full interceptor pipeline (conditional requests, rate limiting,
retry). A 429 mid-pagination retries transparently.

**Offset strategy (default):**

```javascript
for await (const page of api.paginate('/users', {perPage: 25})) {
  console.log(`Page ${page.meta.page}, items: ${page.data.length}`);
  if (page.meta.total) {
    console.log(`Total: ${page.meta.total}`);
  }
  process(page.data);
}
```

**Cursor strategy:**

```javascript
for await (const page of api.paginate('/events', {strategy: 'cursor', limit: 50})) {
  process(page.data);
}
```

**Collect all pages into a flat array:**

```javascript
const allUsers = await api.paginateAll('/users', {perPage: 25});
// → flattened array of all items across all pages

const first100 = await api.paginateAll('/users', {perPage: 25, maxPages: 4});
```

**Paginator options:**

| Option     | Type                       | Default    | Description                                       |
| ---------- | -------------------------- | ---------- | ------------------------------------------------- |
| `strategy` | `'offset' \| 'cursor'`     | `'offset'` | Pagination strategy                               |
| `page`     | `number`                   | `1`        | Starting page number (offset strategy)            |
| `perPage`  | `number`                   | `20`       | Items per page (offset strategy)                  |
| `limit`    | `number`                   | `20`       | Items per request (cursor strategy)               |
| `maxPages` | `number`                   | `Infinity` | Safety limit on pages fetched                     |
| `query`    | `object`                   | —          | Additional query parameters for each request      |
| `headers`  | `object \| Headers`        | —          | Additional headers for each request               |
| `signal`   | `AbortSignal`              | —          | Abort signal for cancellation                     |

**Page shape:**

```typescript
interface Page {
  data: any;       // Parsed response body for this page
  meta: {
    total?: number; // From X-Total-Count header (undefined if absent)
    page: number;   // Current page number (1-indexed)
  };
  links: Map<string, {href: string, rel: string}>; // Parsed Link header relations
  done: boolean;   // true when no more pages
}
```

The iterator fetches the next page only when the consumer calls `.next()` — no
prefetching, natural backpressure.

**Standalone export:**

```javascript
import {createPaginator} from '@centralping/ergo-fetch';

const paginator = createPaginator(api, '/users', {perPage: 25});
for await (const page of paginator) {
  process(page.data);
}
```

### Query Builder

Construct JSON:API-compliant query strings with structural validation. The
builder is immutable — each method returns a new instance.

```javascript
import {createQueryBuilder, isQueryBuilder} from '@centralping/ergo-fetch';

const q = createQueryBuilder('/articles')
  .fields('articles', ['title', 'body', 'createdAt'])
  .fields('authors', ['name', 'avatar'])
  .include(['author', 'comments', 'comments.author'])
  .filter({published: true, category: 'tech'})
  .sort(['-createdAt', 'title'])
  .page({number: 2, size: 10});

q.toString();
// → "fields[articles]=title,body,createdAt&fields[authors]=name,avatar&..."

q.path; // → "/articles"
isQueryBuilder(q); // true
```

**Execute via client:**

```javascript
// Pass as query option — auto-serialized
const result = await api.get('/articles', {query: q});

// Or use the builder's fetch method
const result = await q.fetch(api);

// Or use the client convenience
const q = api.query('/articles').fields('articles', ['title']).page({number: 1, size: 10});
const result = await q.fetch(api);
```

**Builder methods:**

| Method                            | Description                                               |
| --------------------------------- | --------------------------------------------------------- |
| `.fields(type, fieldNames)`       | Sparse fieldsets for a resource type                       |
| `.include(paths)`                 | Relationship paths to include (dot-notation)              |
| `.filter(criteria)`               | Filter key-value pairs (merges with existing filters)     |
| `.sort(fields)`                   | Sort fields (`-` prefix for descending)                   |
| `.page(params)`                   | Pagination params (`{number, size}`, `{offset, limit}`, or `{cursor}`) |
| `.param(key, value)`              | Custom query parameter (must not be all-lowercase)        |
| `.toString()`                     | Serialize to URL query string (no leading `?`)            |
| `.fetch(client)`                  | Execute the query via a client's `get` method             |

**Pagination strategy enforcement:**

Mixing strategies (e.g., `{number: 1, cursor: 'abc'}`) throws `TypeError` at
build time. Three strategies are supported: `{number, size}`, `{offset, limit}`,
and `{cursor}`.

### Idempotency

Automatic `Idempotency-Key` header generation for safe mutation retry. When
enabled, the interceptor generates a unique key per request and preserves it
across retries so the server sees identical keys for each attempt.

```javascript
const api = createClient({
  baseUrl: 'https://api.example.com',
  idempotency: true // auto-generate keys for POST requests
});

// Key auto-generated, preserved across retries
await api.post('/orders', {body: orderData});

// Explicit key
await api.post('/orders', {body: orderData, idempotencyKey: 'order-123'});

// Disable for this request
await api.post('/webhooks', {body: data, idempotent: false});
```

**Body fingerprinting:** When an explicit key is reused, the interceptor
compares SHA-256 digests of the request body. A mismatch throws `TypeError`
(accidental key reuse with different content is a programming error).
`undefined`, `null`, and `''` are treated equivalently as bodiless for
fingerprint comparison.

**Key lifecycle:**

| Event                | Behavior                                         |
| -------------------- | ------------------------------------------------ |
| First request        | Generate key, attach header, store fingerprint   |
| Retry (same context) | Reattach stored key without regeneration          |
| 2xx response         | Clear key from registry                          |
| Non-2xx response     | Preserve key for potential retry                 |
| TTL expiration       | Evict key lazily on next request                 |

## TypeScript

Full TypeScript declarations are included. Import types directly:

```typescript
import {createClient, createQueryBuilder} from '@centralping/ergo-fetch';
import type {
  Client,
  ClientConfig,
  ClientResponse,
  RequestOptions
} from '@centralping/ergo-fetch/lib/client';
import type {CacheStore, CacheEntry} from '@centralping/ergo-fetch/stores/memory';
import type {RateLimitState} from '@centralping/ergo-fetch/lib/rate-limit';
import type {RetryInterceptorOptions} from '@centralping/ergo-fetch/lib/retry';
import type {Paginator, PaginatorOptions, Page, PageMeta} from '@centralping/ergo-fetch/lib/pagination';
import type {QueryBuilder} from '@centralping/ergo-fetch/lib/query-builder';
import type {IdempotencyInterceptorOptions} from '@centralping/ergo-fetch/lib/idempotency';

const config: ClientConfig = {
  baseUrl: 'https://api.example.com',
  retry: {maxAttempts: 5, jitter: 'full'},
  idempotency: true
};

const api: Readonly<Client> = createClient(config);
const result: ClientResponse = await api.get('/health');
```

## Requirements

- Node.js 22+
- Any environment with native `fetch` (modern browsers, Deno, Bun)

## License

[MIT](LICENSE)
