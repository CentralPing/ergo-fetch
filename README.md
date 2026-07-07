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

| Feature                             | Description                                                                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RFC 9457 Problem Details**        | Structured error handling with classification (`isRetryable`, `isValidation`, `isAuth`)                                                             |
| **Conditional requests (RFC 9110)** | Automatic ETag/Last-Modified caching with transparent 304 handling                                                                                  |
| **Rate limit awareness**            | Tracks `X-RateLimit-*` headers, auto-retries on 429 with Retry-After                                                                                |
| **Exponential backoff**             | Retries transient failures (503, 429) and network errors (`TypeError`) with AWS-style full jitter; retries 500/502/504 for idempotent methods |
| **CSRF lifecycle**                  | Extracts tokens from safe responses, injects on unsafe same-origin requests                                                                         |
| **Prefer header (RFC 7240)**        | Declarative `return=minimal` / `return=representation` negotiation                                                                                  |
| **Request-ID correlation**          | Captures `X-Request-Id` from responses, optionally generates for requests                                                                           |
| **Pagination (RFC 8288)**           | Async iteration over paginated responses with Link header following, offset and cursor strategies                                                    |
| **JSON:API Query Builder**          | Immutable query parameter construction with structural validation and bracket notation                                                               |
| **Idempotency-Key**                 | Automatic key generation for safe mutation retry with body fingerprinting                                                                            |
| **Fail-fast validation**            | Invalid inputs throw synchronously before any network call                                                                                          |

## Configuration

```javascript
import {createClient} from '@centralping/ergo-fetch';

const api = createClient({
  // Required
  baseUrl: 'https://api.example.com',

  // Optional — most interceptors enabled by default (prefer is opt-in)
  timeout: 30000, // Default request timeout (ms)
  headers: {Accept: 'application/json'},

  // Interceptor configuration (true = defaults, false = disabled, object = custom)
  requestId: {generate: true},
  prefer: 'return=representation',
  csrf: true,
  conditional: true,
  rateLimit: {proactive: true, threshold: 10},
  retry: {maxAttempts: 3, backoff: 'exponential', jitter: 'full'},
  idempotency: true // or {headerName, methods, generator, ttl}
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

| Option       | Type         | Default              | Description                              |
| ------------ | ------------ | -------------------- | ---------------------------------------- |
| `headerName` | `string`     | `'idempotency-key'`  | Header name for the idempotency key      |
| `methods`    | `string[]`   | `['POST']`           | HTTP methods receiving auto-generated keys |
| `generator`  | `() => string` | `crypto.randomUUID` | Custom key generator function            |
| `ttl`        | `number`     | `300000`             | TTL for stored keys in milliseconds      |

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
```

### Request Options

```typescript
interface RequestOptions {
  headers?: object | Headers; // Per-request headers (merged with defaults)
  body?: any; // Auto-serialized to JSON for plain objects
  params?: object; // URL path parameters (:key substitution)
  query?: object | QueryBuilder; // URLSearchParams or QueryBuilder (auto-serialized)
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

### Pagination

Iterate over paginated API responses with automatic Link header following:

```javascript
// Async iteration over pages
for await (const page of api.paginate('/users', {perPage: 25})) {
  console.log(page.data);       // parsed response body
  console.log(page.meta.page);  // current page number (1-indexed)
  console.log(page.meta.total); // total items (from X-Total-Count header)
  console.log(page.done);       // true on the last page
}

// Collect all data into a flattened array
const allUsers = await api.paginateAll('/users', {perPage: 50, maxPages: 10});
```

#### `client.paginate(path, options?)`

Returns a frozen async iterable that yields `Page` objects. Follows RFC 8288 `Link` headers with `rel="next"` for page discovery.

#### `client.paginateAll(path, options?)`

Convenience method that collects all pages and returns a flattened `Array` of response body data.

#### Paginator Options

| Option    | Type                    | Default      | Description                                     |
| --------- | ----------------------- | ------------ | ----------------------------------------------- |
| `strategy` | `'offset' \| 'cursor'` | `'offset'`   | Pagination strategy                             |
| `page`    | `number`                | `1`          | Starting page number (offset strategy)          |
| `perPage` | `number`                | `20`         | Items per page (offset strategy)                |
| `limit`   | `number`                | `20`         | Items per request (cursor strategy)             |
| `maxPages` | `number`               | `Infinity`   | Maximum pages to fetch before stopping          |
| `query`   | `object`                | —            | Additional query parameters for the request     |
| `headers` | `object \| Headers`     | —            | Additional headers for each request             |
| `signal`  | `AbortSignal`           | —            | Abort signal for cancellation                   |

#### Page Object

```typescript
interface Page {
  data: any;               // Parsed response body for this page
  meta: {
    page: number;          // Current page number (1-indexed)
    total?: number;        // Total item count (from X-Total-Count header)
  };
  links: Map<string, LinkObject>; // Parsed Link header relations
  done: boolean;           // True when no next link or maxPages reached
}
```

#### Standalone Export

```javascript
import {createPaginator} from '@centralping/ergo-fetch';

const paginator = createPaginator(client, '/users', {perPage: 25});
for await (const page of paginator) { /* ... */ }
```

### Query Builder

Build JSON:API query parameters with an immutable fluent API:

```javascript
// Via client method
const q = api.query('/articles')
  .fields('articles', ['title', 'body'])
  .include(['author', 'comments'])
  .filter({status: 'published'})
  .sort(['-createdAt'])
  .page({number: 1, size: 20});

const result = await q.fetch(api);
```

Every method returns a new builder — the original is never modified.

#### `client.query(path?)`

Creates a `QueryBuilder` instance. When `path` is provided, the builder can execute requests via `.fetch(client)`.

#### Fluent API Methods

| Method                                       | Description                                                  |
| -------------------------------------------- | ------------------------------------------------------------ |
| `.fields(type, fieldNames)`                  | Sets sparse fieldsets for a resource type (`fields[type]`)   |
| `.include(paths)`                            | Sets relationship paths to include (`include=a,b`)           |
| `.filter(criteria)`                          | Merges filter criteria (`filter[key]=value`)                 |
| `.sort(fields)`                              | Sets sort fields, prefix with `-` for descending (`sort=a,-b`) |
| `.page(params)`                              | Sets pagination parameters (`page[key]=value`)               |
| `.param(key, value)`                         | Adds a custom query parameter (non-reserved names only)      |
| `.toString()`                                | Serializes to a query string (no leading `?`)                |
| `.fetch(client)`                             | Executes the query via the client's `get` method             |

#### Using QueryBuilder with Request Options

Pass a `QueryBuilder` as the `query` option on any request — it is automatically serialized:

```javascript
const q = api.query()
  .filter({active: true})
  .sort(['-name']);

await api.get('/users', {query: q});
```

#### Standalone Exports

```javascript
import {createQueryBuilder, isQueryBuilder} from '@centralping/ergo-fetch';

const q = createQueryBuilder('/articles')
  .fields('articles', ['title'])
  .filter({status: 'draft'});

console.log(q.toString());
// → fields[articles]=title&filter[status]=draft

isQueryBuilder(q); // true
```

### Idempotency Key

Automatically generates idempotency keys for configured HTTP methods (default: POST). Keys are preserved across retries so the server can safely deduplicate mutations.

```javascript
const api = createClient({
  baseUrl: 'https://api.example.com',
  idempotency: true // auto-generate keys for POST requests
});

// Key is generated and sent via the Idempotency-Key header
await api.post('/payments', {body: {amount: 1000}});

// Explicit key for a specific request
await api.post('/payments', {
  body: {amount: 1000},
  idempotencyKey: 'payment-abc-123'
});
```

When an explicit `idempotencyKey` is reused while a prior request with the same key is tracked, the interceptor compares SHA-256 body fingerprints. A mismatch throws `TypeError` — preventing accidental reuse of a key with different content.

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

### Web Storage Store

Durable cache store backed by `localStorage` or `sessionStorage` that survives
page reloads:

```javascript
import {createWebStorageStore} from '@centralping/ergo-fetch/stores/web-storage';
import {createClient} from '@centralping/ergo-fetch';

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

## TypeScript

Full TypeScript declarations are included. Import types directly:

```typescript
import {createClient} from '@centralping/ergo-fetch';
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
  retry: {maxAttempts: 5, jitter: 'full'}
};

const api: Readonly<Client> = createClient(config);
const result: ClientResponse = await api.get('/health');
```

## Requirements

- Node.js 22+
- Any environment with native `fetch` (modern browsers, Deno, Bun)

## License

[MIT](LICENSE)
