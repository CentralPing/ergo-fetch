# @centralping/ergo-fetch

RFC-compliant HTTP client for ergo-router APIs — conditional requests, rate limiting, pagination, and more.

## Status

**Pre-release.** Phase 1 implementation in progress.

## Overview

`@centralping/ergo-fetch` is the client-side counterpart to [`@centralping/ergo-router`](https://github.com/CentralPing/ergo-router). It encodes all RFC-correct client behaviors so application code expresses intent — not HTTP mechanics.

### What it does

- **RFC 9457 Problem Details** — structured error handling with classification (retryable, auth, validation)
- **Conditional requests (RFC 9110)** — automatic ETag/Last-Modified caching with transparent 304 handling
- **Rate limit awareness** — tracks X-RateLimit-* headers, auto-retries on 429 with Retry-After
- **Exponential backoff** — retries transient failures with jitter for idempotent requests
- **CSRF lifecycle** — extracts tokens from safe responses, injects on unsafe requests
- **Prefer header (RFC 7240)** — declarative return=minimal/representation
- **Pagination (RFC 8288)** — async iterators over Link header navigation
- **Idempotency-Key** — auto-generated keys for safe mutation retry
- **JSON:API query builder** — type-safe construction with structural validation
- **SSE/streaming** — fetch-based EventSource with full auth support
- **Offline queue** — idempotent mutation replay on reconnection
- **OpenAPI codegen** — typed clients generated from ergo-router specs

### Design principles

1. **Zero runtime dependencies** — built entirely on Web Platform APIs
2. **Fail-fast** — invalid inputs throw synchronously before network calls
3. **RFC compliance** — no approximations, implements specs correctly
4. **Secure defaults** — CSRF, credential management, origin validation on by default
5. **Multi-language portable** — interface-first design blueprints to Rust, Go, Python

## Quick Start

```javascript
import {createClient} from '@centralping/ergo-fetch';

const api = createClient({
  baseUrl: 'https://api.example.com',
  conditional: true,
  rateLimit: true,
  retry: {maxAttempts: 3},
  csrf: true,
});

// All RFC behaviors are automatic
const user = await api.get('/users/123');
```

## Requirements

- Node.js 22+ (or any environment with native `fetch`)
- Modern browsers (Chrome 80+, Firefox 78+, Safari 14+)
- Deno 2.x, Bun 1.x

## License

[MIT](LICENSE)
