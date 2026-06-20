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
  baseUrl: 'https://api.example.com',
});

// GET with automatic conditional request caching
const user = await api.get('/users/:id', {
  params: {id: '123'},
});

console.log(user.status); // 200
console.log(user.body);   // parsed JSON body
```

## Features

| Feature | Description |
| --- | --- |
| **RFC 9457 Problem Details** | Structured error handling with classification (`isRetryable`, `isValidation`, `isAuth`) |
| **Conditional requests (RFC 9110)** | Automatic ETag/Last-Modified caching with transparent 304 handling |
| **Rate limit awareness** | Tracks `X-RateLimit-*` headers, auto-retries on 429 with Retry-After |
| **Exponential backoff** | Retries transient failures (503, 429) with AWS-style full jitter; retries 500/502/504 for idempotent methods (GET, HEAD, OPTIONS, PUT, DELETE) |
| **CSRF lifecycle** | Extracts tokens from safe responses, injects on unsafe same-origin requests |
| **Prefer header (RFC 7240)** | Declarative `return=minimal` / `return=representation` negotiation |
| **Request-ID correlation** | Captures `X-Request-Id` from responses, optionally generates for requests |
| **Fail-fast validation** | Invalid inputs throw synchronously before any network call |

## Configuration

```javascript
import {createClient} from '@centralping/ergo-fetch';

const api = createClient({
  // Required
  baseUrl: 'https://api.example.com',

  // Optional — most interceptors enabled by default (prefer is opt-in)
  timeout: 30000,            // Default request timeout (ms)
  headers: {'Accept': 'application/json'},

  // Interceptor configuration (true = defaults, false = disabled, object = custom)
  requestId: {generate: true},
  prefer: 'return=representation',
  csrf: true,
  conditional: true,
  rateLimit: {proactive: true, threshold: 10},
  retry: {maxAttempts: 3, backoff: 'exponential', jitter: 'full'},
});
```

### Interceptor Options

#### `requestId`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `headerName` | `string` | `'x-request-id'` | Header name for request ID |
| `generate` | `boolean` | `false` | Generate UUID for outgoing requests |

#### `csrf`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `cookieName` | `string` | `'__csrf'` | Cookie containing CSRF token |
| `headerName` | `string` | `'x-csrf-token'` | Header for CSRF token injection |
| `safeMethods` | `string[]` | `['GET', 'HEAD', 'OPTIONS']` | Methods that extract (not inject) tokens |

#### `conditional`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `store` | `CacheStore` | in-memory (1024 entries) | Cache store for validators and bodies |
| `methods.read` | `string[]` | `['GET', 'HEAD']` | Methods receiving `If-None-Match` / `If-Modified-Since` |
| `methods.write` | `string[]` | `['PUT', 'PATCH', 'DELETE']` | Methods receiving `If-Match` |

#### `rateLimit`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `proactive` | `boolean` | `false` | Throttle requests when remaining < threshold |
| `threshold` | `number` | `5` | Remaining count triggering proactive throttle |
| `headerPrefix` | `string` | `'x-ratelimit'` | Header prefix for rate limit headers |

#### `retry`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `maxAttempts` | `number` | `3` | Max attempts including initial request |
| `maxDelay` | `number` | `60000` | Backoff cap in milliseconds |
| `baseDelay` | `number` | `1000` | Base delay for backoff computation |
| `backoff` | `'exponential' \| 'linear'` | `'exponential'` | Backoff strategy |
| `jitter` | `'full' \| 'none'` | `'full'` | AWS-style full jitter or deterministic |

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
  headers?: object | Headers;   // Per-request headers (merged with defaults)
  body?: any;                   // Auto-serialized to JSON for plain objects
  params?: object;              // URL path parameters (:key substitution)
  query?: object;               // URL query parameters via URLSearchParams
  signal?: AbortSignal;         // User abort signal
  timeout?: number;             // Per-request timeout (ms)
  retry?: boolean;              // Set false to disable retry
  conditional?: boolean;        // Set false to disable conditional headers
  idempotent?: boolean;         // Override idempotency for retry eligibility
}
```

### Client Response

```typescript
interface ClientResponse {
  status: number;               // HTTP status code
  headers: Headers;             // Response headers
  body: any;                    // Parsed JSON or text
  requestId?: string;           // Captured X-Request-Id
  rateLimit?: RateLimitState;   // Current rate limit state
  raw: Response;                // Original fetch Response
}
```

### Error Handling

Responses with `status >= 400` throw `ProblemDetailsError` (RFC 9457):

```javascript
import {createClient, ProblemDetailsError, isRetryable, isValidation, isAuth} from '@centralping/ergo-fetch';

const api = createClient({baseUrl: 'https://api.example.com'});

try {
  await api.get('/users/999');
} catch (err) {
  if (err instanceof ProblemDetailsError) {
    console.log(err.status);     // 404
    console.log(err.title);      // "Not Found"
    console.log(err.detail);     // "User 999 does not exist"
    console.log(err.type);       // "about:blank"
    console.log(err.extensions); // null-prototype object of extra fields
  }

  if (isValidation(err)) { /* 400 or 422 */ }
  if (isAuth(err))        { /* 401 or 403 */ }
  if (isRetryable(err))   { /* 429 or 503 */ }
}
```

### URL Building

Path parameters use `:key` syntax. Query parameters are appended via `URLSearchParams`:

```javascript
await api.get('/users/:id/posts', {
  params: {id: '123'},
  query: {page: 1, limit: 20, tags: ['news', 'tech']},
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
  conditional: {store},
});
```

## TypeScript

Full TypeScript declarations are included. Import types directly:

```typescript
import {createClient} from '@centralping/ergo-fetch';
import type {
  Client,
  ClientConfig,
  ClientResponse,
  RequestOptions,
} from '@centralping/ergo-fetch/lib/client';
import type {CacheStore, CacheEntry} from '@centralping/ergo-fetch/stores/memory';
import type {RateLimitState} from '@centralping/ergo-fetch/lib/rate-limit';
import type {RetryInterceptorOptions} from '@centralping/ergo-fetch/lib/retry';

const config: ClientConfig = {
  baseUrl: 'https://api.example.com',
  retry: {maxAttempts: 5, jitter: 'full'},
};

const api: Readonly<Client> = createClient(config);
const result: ClientResponse = await api.get('/health');
```

## Requirements

- Node.js 22+
- Any environment with native `fetch` (modern browsers, Deno, Bun)

## License

[MIT](LICENSE)
