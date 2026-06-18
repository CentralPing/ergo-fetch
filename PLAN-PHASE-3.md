# Implementation Plan: @centralping/ergo-fetch — Phase 3

> **Document type:** Detailed implementation plan for Phase 3 (0.3.0) of `@centralping/ergo-fetch`.
> Covers advanced patterns: Server-Sent Events, offline queue with idempotent replay,
> OpenAPI client generation, and IndexedDB storage.
>
> **Prerequisites:** Phase 2 (0.2.0) must be complete and stable. Phase 3 builds on the
> pagination infrastructure, idempotency system, and store interfaces from Phase 1 and 2.

---

## Phase 3 Scope: Advanced Patterns (0.3.0)

Phase 3 delivers capabilities for real-time, offline-capable, and fully-typed API
interactions. A developer gains:

- Server-Sent Events via fetch + ReadableStream (not EventSource)
- Offline mutation queue with idempotent replay on reconnection
- Build-time OpenAPI client generation for typed API access
- IndexedDB storage for durable cache and queue persistence

---

## Implementation Order

| Order | Module | Depends On |
| --- | --- | --- |
| 1 | `lib/sse-parser.js` | Nothing (pure text stream parser) |
| 2 | `lib/sse.js` | `lib/sse-parser.js`, Phase 1 client interceptors |
| 3 | `stores/idb.js` | Phase 1 store interface |
| 4 | `lib/offline-queue.js` | `stores/idb.js`, Phase 2 idempotency |
| 5 | `lib/connectivity.js` | Nothing (navigator.onLine + events) |
| 6 | `lib/offline.js` | `lib/offline-queue.js`, `lib/connectivity.js`, Phase 1 client |
| 7 | `codegen/parser.js` | Nothing (OpenAPI spec parsing) |
| 8 | `codegen/emitter.js` | `codegen/parser.js` |
| 9 | `codegen/cli.js` | `codegen/parser.js`, `codegen/emitter.js` |
| 10 | Integration into `lib/client.js` | SSE + offline modules |
| 11 | Updated `index.js` exports | All of the above |

---

## Module Specifications

### 1. `lib/sse-parser.js`

**Purpose:** Pure text stream parser for the Server-Sent Events protocol (HTML Living
Standard §9.2). Converts a text byte stream into structured SSE event objects.

**Exports:**
- `createSSEParser()` → `{push(chunk), events(), reset()}`

**SSE event shape:**
```js
{
  id: string?,        // Last-Event-ID
  type: string?,      // Event type (default: "message")
  data: string,       // Event data (concatenated with newlines)
  retry: number?,     // Reconnection time in ms (from retry: field)
}
```

**Parsing rules (per HTML Living Standard §9.2.4):**
- Lines terminated by CR, LF, or CRLF
- Lines starting with `:` are comments (ignored)
- Lines with `field:value` format (space after colon is optional, stripped if present)
- Recognized fields: `event`, `data`, `id`, `retry`
- Unknown fields are ignored
- Empty line (`\n\n`) dispatches the current event
- `data` field values are concatenated with `\n` for multi-line data
- `id` field must not contain null characters (per spec security restriction)
- `retry` field must be ASCII digits only (otherwise ignored)

**Streaming behavior:**
- `push(chunk)` accepts string chunks from the ReadableStream
- Internal buffer handles partial lines across chunk boundaries
- `events()` returns an array of completed events since last call (drains internal queue)
- `reset()` clears internal state (for reconnection)

**Edge cases:**
- BOM at stream start (U+FEFF) → strip per spec
- Event with only `id:` (no data) → dispatched with empty data string
- Multiple `data:` lines → concatenated with `\n`
- `id:` with null byte → ignored (per spec security restriction)
- Very large events → no size limit in parser (caller responsible for backpressure)

**Tests:** Full compliance with HTML Living Standard §9.2 examples. Partial chunk boundary
handling. Multi-line data. Comments. Unknown fields. BOM stripping. Null byte in id.
Retry field validation.

---

### 2. `lib/sse.js`

**Purpose:** Server-Sent Events client using fetch + ReadableStream. Supports the full
interceptor pipeline (auth, CSRF, request-ID) on the connection request, which native
`EventSource` cannot.

**Exports:**
- `createSSEStream(client, path, options?)` → SSEConnection

**SSEConnection interface:**
```js
{
  // Async iterator interface
  [Symbol.asyncIterator]() → AsyncIterator<SSEEvent>,

  // Event-emitter interface
  on(type, handler) → unsubscribe function,
  off(type, handler) → void,

  // Control
  close() → void,
  reconnect() → void,

  // State
  readyState: 'connecting' | 'open' | 'closed',
  lastEventId: string?,
  url: string,
}
```

**Connection lifecycle:**

1. **Connect:** `fetch(url, {headers: {'Accept': 'text/event-stream'}, ...interceptorHeaders})`
2. **Stream:** Read response body as text stream, feed chunks to SSE parser
3. **Dispatch:** Emit parsed events to listeners and async iterator consumers
4. **Reconnect (on error):** Wait `retry` ms (from server or default 3000ms), then reconnect
   with `Last-Event-ID` header set to last received id

**Auto-reconnect behavior:**
- On network error or stream close: reconnect after delay
- On 204 No Content: do NOT reconnect (server signal to stop)
- On 4xx/5xx: do NOT reconnect (surface as error)
- `Last-Event-ID` header sent on reconnection (per SSE spec §9.2.4)
- Exponential backoff on repeated failures: `retry * 2^failureCount` (capped at 60s)

**Interceptor interaction:**
- Request interceptors (CSRF, auth) apply to EVERY connection attempt (including reconnects)
- Rate limit interceptor applies to connection requests
- Retry interceptor does NOT apply (SSE has its own reconnect logic)
- Conditional interceptor does NOT apply (streaming has no ETag semantics)

**Options:**
- `retry` — default reconnection delay in ms (default 3000, overridden by server `retry:` field)
- `maxRetries` — maximum reconnection attempts (default `Infinity`)
- `lastEventId` — initial Last-Event-ID (for resuming from a known position)
- `headers` — additional headers for the connection request
- `withCredentials` — send credentials cross-origin (default `false`)
- `signal` — AbortSignal to close the connection

**Dual interface design:**

```js
// Async iterator (pull-based)
const sse = api.stream('/events');
for await (const event of sse) {
  if (event.type === 'user-joined') handleJoin(event.data);
  if (event.type === 'message') handleMessage(event.data);
}

// Event emitter (push-based)
const sse = api.stream('/events');
sse.on('user-joined', event => handleJoin(event.data));
sse.on('message', event => handleMessage(event.data));
sse.on('error', err => console.error(err));
sse.on('open', () => console.log('connected'));

// Both can be used on the same connection
```

**Backpressure (async iterator mode):**
- Events are buffered internally until the consumer calls `.next()`
- Buffer has a max size (default 1000 events); overflow drops oldest events
- Buffer size observable via `sse.bufferedAmount`

**Client convenience method:**
```js
const sse = api.stream('/events', {lastEventId: '42'});
```

**Tests:**
- Connection establishment with correct headers
- Event parsing from streamed chunks
- Auto-reconnect on network error with Last-Event-ID
- No reconnect on 204, 4xx, 5xx
- Exponential backoff on repeated failures
- Interceptors applied on each connection attempt
- Async iterator consumption and backpressure
- Event-emitter dispatch by type
- Manual close terminates stream
- AbortSignal cancellation

---

### 3. `stores/idb.js`

**Purpose:** IndexedDB implementation of CacheStore and QueueStore interfaces. Provides
durable persistence for conditional request cache and offline mutation queue.

**Exports:**
- `createIDBStore(options?)` → CacheStore
- `createIDBQueueStore(options?)` → QueueStore

**Options (CacheStore):**
- `dbName` — IndexedDB database name (default `'ergo-fetch-cache'`)
- `storeName` — object store name (default `'responses'`)
- `maxEntries` — maximum cached entries (default 500)
- `ttl` — entry TTL in ms (default 7 days)

**Options (QueueStore):**
- `dbName` — IndexedDB database name (default `'ergo-fetch-queue'`)
- `storeName` — object store name (default `'mutations'`)

**Schema (CacheStore):**
```js
// Object store: "responses"
// Key path: "url" (string)
{
  url: string,            // Primary key
  etag: string?,
  lastModified: string?,
  body: any,              // Stored as structured clone
  headers: object?,       // Response headers snapshot
  timestamp: number,      // Date.now() at cache time
}
// Index: "timestamp" (for TTL cleanup and LRU eviction)
```

**Schema (QueueStore):**
```js
// Object store: "mutations"
// Key path: "id" (auto-increment)
{
  id: number,             // Auto-generated primary key
  method: string,
  url: string,
  headers: object,
  body: any,              // Structured clone of request body
  idempotencyKey: string, // For replay safety
  fingerprint: string,    // Body hash for dedup
  timestamp: number,      // When queued
  attempts: number,       // Replay attempts so far
  lastError: string?,     // Last failure reason
}
// Index: "timestamp" (for ordered replay)
// Index: "idempotencyKey" (for dedup lookup)
```

**TTL and eviction (CacheStore):**
- On `get()`: check timestamp against TTL. If expired, delete and return undefined.
- On `set()`: if entry count > maxEntries, delete oldest by timestamp.
- Background cleanup NOT performed (no timers, no service workers). Cleanup is
  opportunistic on reads/writes.

**Transaction safety:**
- All operations use IndexedDB transactions
- `set()` uses `"readwrite"` transaction with single `put()` operation
- `get()` uses `"readonly"` transaction
- Queue operations (`enqueue`, `dequeue`) use `"readwrite"` with ordering guarantees

**Error handling:**
- `VersionError` (database upgrade needed) → delete and recreate database
- `QuotaExceededError` → evict oldest entries until space available
- All errors wrapped in rejected Promises (never throw synchronously)
- If IndexedDB is unavailable (e.g., Firefox private browsing pre-v115) → throw on
  construction with clear error message

**Database lifecycle:**
- Opened lazily on first operation (not at construction time)
- Connection held open for the client's lifetime
- Closed when client is destroyed (`client.destroy()`)
- Database version: 1 (bump on schema changes in future versions)

**Tests:**
- Basic CRUD operations (both stores)
- TTL expiration on read
- LRU eviction at maxEntries
- Ordered queue operations (FIFO)
- Dedup by idempotencyKey
- Transaction isolation
- Error handling (simulated quota exceeded)
- Database upgrade/recreation

---

### 4. `lib/offline-queue.js`

**Purpose:** Core queue engine that manages mutation persistence, ordering, and replay
coordination. Does NOT detect connectivity — that's `lib/connectivity.js`.

**Exports:**
- `createOfflineQueue(options)` → OfflineQueue

**OfflineQueue interface:**
```js
{
  // Queue operations
  enqueue(request) → Promise<QueueEntry>,
  peek() → Promise<QueueEntry?>,
  size() → Promise<number>,
  entries() → Promise<QueueEntry[]>,
  clear() → Promise<void>,

  // Replay control
  replay(client) → Promise<ReplayResult>,
  replayOne(client) → Promise<ReplayResult>,

  // Events
  on(event, handler) → unsubscribe,

  // State
  replaying: boolean,
}
```

**QueueEntry shape:**
```js
{
  id: string | number,
  method: string,
  url: string,
  headers: object,
  body: any,
  idempotencyKey: string,
  timestamp: number,
  attempts: number,
}
```

**ReplayResult shape:**
```js
{
  succeeded: QueueEntry[],
  failed: {entry: QueueEntry, error: ProblemDetailsError}[],
  remaining: number,
}
```

**Options:**
- `store` — QueueStore instance (default: in-memory, recommend IDB for durability)
- `maxRetries` — max replay attempts per entry (default 3)
- `filter` — request filter function `(request) => boolean` (default: mutations only)
- `onConflict` — conflict handler `(entry, error) => 'retry' | 'skip' | 'abort'`

**Enqueue behavior:**
- Validate request is eligible (passes `filter`)
- Generate idempotency key if not present
- Persist to store with `attempts: 0`
- Return the queue entry (caller can track status)

**Replay behavior:**
- Process entries in FIFO order (by timestamp)
- For each entry:
  1. Reconstruct the request from stored data
  2. Execute via the client (full interceptor pipeline)
  3. On success (2xx): dequeue entry
  4. On retryable failure (5xx, network): increment `attempts`, keep in queue
  5. On 409 Conflict: call `onConflict` handler
  6. On non-retryable failure (4xx other than 409): dequeue + add to `failed`
  7. If `attempts >= maxRetries`: dequeue + add to `failed`
- Stop replay on first non-retryable failure if `onConflict` returns `'abort'`

**Events:**
- `'enqueue'` — entry added to queue
- `'dequeue'` — entry removed (success or permanent failure)
- `'replay-start'` — replay process beginning
- `'replay-end'` — replay complete with result
- `'conflict'` — 409 response during replay
- `'drain'` — queue is now empty

**Ordering guarantees:**
- Entries replayed in strict timestamp order (FIFO)
- No parallelism during replay (sequential execution)
- If entry N fails retryably, entries N+1... are NOT processed until N succeeds or
  exhausts retries. This preserves causal ordering for dependent mutations.

**Tests:**
- Enqueue and replay cycle (happy path)
- Ordering preservation (FIFO)
- Retry on 5xx with attempt tracking
- Permanent failure dequeue
- 409 Conflict event and handler
- maxRetries exhaustion
- Filter excludes GET requests
- Sequential replay (no parallel execution)
- Event emission for all lifecycle events
- Replay with empty queue (no-op)

---

### 5. `lib/connectivity.js`

**Purpose:** Detect online/offline state changes. Provides the signal that triggers
offline queue enqueue and replay.

**Exports:**
- `createConnectivityMonitor()` → ConnectivityMonitor

**ConnectivityMonitor interface:**
```js
{
  isOnline: boolean,          // Current state
  on(event, handler) → unsubscribe,
  destroy() → void,
}
```

**Events:**
- `'online'` — transitioned from offline to online
- `'offline'` — transitioned from online to offline

**Detection strategy:**
- Primary: `navigator.onLine` + `window.addEventListener('online'|'offline')`
- Validation: on `'online'` event, perform a lightweight probe (HEAD to baseUrl)
  to confirm actual connectivity (browsers emit false-positive `online` events)
- Node.js: always report `online: true` (Node.js has no offline concept; server-side
  code is always "online" by definition). Events never fire.

**Probe behavior:**
- HEAD request to `${baseUrl}/` with short timeout (5s)
- On success: confirm online, emit `'online'` event
- On failure: remain offline, retry probe with backoff
- Probe uses raw `fetch` (not the client pipeline — avoids circular dependency)

**Tests:**
- Initial state from `navigator.onLine`
- Event emission on state change
- Probe validation on online event
- Probe failure keeps offline state
- Node.js always-online behavior
- Destroy removes event listeners

---

### 6. `lib/offline.js`

**Purpose:** Orchestration layer that connects the offline queue, connectivity monitor,
and the client pipeline. This is the "offline capability" that users enable via config.

**Exports:**
- `createOfflineManager(client, options)` → OfflineManager

**OfflineManager interface:**
```js
{
  // State
  isOnline: boolean,
  queue: OfflineQueue,

  // Events (delegated from queue + connectivity)
  on(event, handler) → unsubscribe,

  // Manual control
  replay() → Promise<ReplayResult>,
  destroy() → void,
}
```

**Orchestration behavior:**

**When offline:**
- Mutating requests that would fail → enqueued instead of executed
- Client methods return a "pending" response:
  ```js
  {status: 202, body: undefined, queued: true, queueEntry: entry}
  ```
- Read requests (GET, HEAD) → throw `OfflineError` immediately
  (reads cannot be queued — stale data is worse than an error)

**When transitioning to online:**
- Connectivity monitor fires `'online'`
- Probe confirms connectivity
- Replay triggered automatically
- Events bubble up: `'replay-start'`, `'replay-end'`, `'conflict'`, `'drain'`

**Options:**
- `store` — QueueStore (default: IDB queue store)
- `filter` — which requests to queue (default: `['POST', 'PUT', 'PATCH', 'DELETE']`)
- `autoReplay` — replay on reconnection (default `true`)
- `onConflict` — conflict handler (default: skip and emit event)

**Client integration:**
When offline mode is enabled, the `lib/client.js` Send stage checks connectivity
before executing fetch. If offline and the request passes the filter, it routes to
the queue instead of the network.

**Tests:**
- Mutations queued when offline
- Reads rejected when offline
- Auto-replay on reconnection
- Manual replay control
- Event propagation (queue events → manager events)
- Destroy cleans up connectivity listener

---

### 7. `codegen/parser.js`

**Purpose:** Parse an OpenAPI 3.1 document into an intermediate representation (IR)
suitable for code generation. Handles the subset of OpenAPI that ergo-router's
`generateOpenAPI()` produces.

**Exports:**
- `parseOpenAPISpec(spec)` → IR (intermediate representation)

**Input:** OpenAPI 3.1 document (JavaScript object, already parsed from YAML/JSON).

**Intermediate Representation (IR):**
```js
{
  info: {title, version, description},
  baseUrl: string,    // From servers[0].url
  routes: [
    {
      method: string,
      path: string,           // OpenAPI path format: /users/{id}
      operationId: string?,
      summary: string?,
      description: string?,
      tags: string[],
      deprecated: boolean,
      parameters: [
        {name, in, required, schema, description}
      ],
      requestBody: {
        required: boolean,
        contentType: string,
        schema: object,       // JSON Schema
      }?,
      responses: {
        [statusCode]: {
          description: string,
          contentType: string?,
          schema: object?,    // JSON Schema
        }
      },
      security: [
        {scheme: string, type: string, scopes?: string[]}
      ],
    }
  ],
  schemas: {          // From components.schemas
    [name]: object,   // JSON Schema
  },
}
```

**Path conversion:**
- OpenAPI `{param}` → ergo-router `:param` (for documentation/matching)
- Path parameters extracted into `parameters` array

**Security scheme resolution:**
- Dereference `security` entries against `components.securitySchemes`
- Resolve scheme type (http/bearer, http/basic, apiKey)

**Schema handling:**
- Inline schemas kept as-is (no transformation)
- `$ref` references resolved against `components.schemas`
- Circular references detected and replaced with `{$circular: refPath}`

**Validation:**
- Must be OpenAPI 3.1.x (check `openapi` field)
- Must have at least one path
- Malformed entries logged as warnings but don't fail parsing

**Tests:**
- Parse minimal spec (single route)
- Parse full ergo-router output (all middleware annotations)
- $ref resolution
- Circular reference handling
- Security scheme resolution
- Path parameter extraction
- Multiple response codes
- Invalid spec detection

---

### 8. `codegen/emitter.js`

**Purpose:** Generate TypeScript type declarations and client code from the parsed IR.

**Exports:**
- `emitTypeScript(ir, options?)` → `{files: [{path, content}]}`

**Generated output structure:**
```
generated/
├── api-types.d.ts        # Request/response type interfaces
├── api-client.ts         # Typed client wrapper
└── index.ts              # Barrel export
```

**`api-types.d.ts` generation:**

For each route in the IR:
```typescript
// Generated from: GET /users/{id}
export interface GetUserParams {
  id: string;
}

export interface GetUserResponse {
  id: string;
  name: string;
  email: string;
}

// Generated from: POST /users
export interface CreateUserBody {
  name: string;
  email: string;
}

export interface CreateUserResponse {
  id: string;
  name: string;
  email: string;
}
```

**JSON Schema → TypeScript conversion:**
- `type: 'string'` → `string`
- `type: 'number'` / `type: 'integer'` → `number`
- `type: 'boolean'` → `boolean`
- `type: 'array', items: schema` → `SchemaType[]`
- `type: 'object', properties: {...}` → interface with properties
- `required` array → non-optional properties
- `enum` → union literal type
- `oneOf` / `anyOf` → union type
- `allOf` → intersection type
- `$ref` → reference to named interface (from components.schemas)
- Nullable → `Type | null`

**`api-client.ts` generation:**

```typescript
import type {CreateClient} from '@centralping/ergo-fetch';
import type {GetUserParams, GetUserResponse, CreateUserBody, CreateUserResponse} from './api-types';

export interface TypedApi {
  getUser(params: GetUserParams): Promise<GetUserResponse>;
  createUser(body: CreateUserBody): Promise<CreateUserResponse>;
  listUsers(query?: ListUsersQuery): Promise<ListUsersResponse>;
  // ... all routes
}

export function createTypedApi(client: ReturnType<CreateClient>): TypedApi {
  return {
    getUser: ({id}) => client.get(`/users/${id}`),
    createUser: (body) => client.post('/users', {body}),
    listUsers: (query) => client.get('/users', {query}),
  };
}
```

**Naming conventions:**
- Operation name: `operationId` if present, else `{method}{PathSegments}` in camelCase
- Params interface: `{OperationName}Params`
- Body interface: `{OperationName}Body`
- Response interface: `{OperationName}Response`
- Query interface: `{OperationName}Query`
- Components schemas: preserve original name

**Options:**
- `outputDir` — target directory (default `'./generated'`)
- `clientImport` — import path for ergo-fetch (default `'@centralping/ergo-fetch'`)
- `operationNaming` — `'operationId'` (default) or `'method-path'`
- `exportStyle` — `'named'` (default) or `'default'`

**Tests:**
- Type generation for each JSON Schema type
- Interface generation for object schemas
- Union/intersection types for oneOf/anyOf/allOf
- Enum literal types
- Nullable handling
- Route method generation with correct params
- OperationId naming vs fallback naming
- Full end-to-end: IR → files → TypeScript compilation passes

---

### 9. `codegen/cli.js`

**Purpose:** Command-line interface for generating typed clients from OpenAPI specs.

**Binary:** `ergo-fetch-codegen` (registered in package.json `bin` field)

**Usage:**
```bash
# From a local file
npx @centralping/ergo-fetch codegen ./openapi.json --output ./src/api/

# From a URL
npx @centralping/ergo-fetch codegen https://api.example.com/openapi.json --output ./src/api/

# From a running ergo-router server
npx @centralping/ergo-fetch codegen http://localhost:3000/openapi --output ./src/api/
```

**Arguments:**
- `<source>` — path to OpenAPI spec file (JSON/YAML) or URL to fetch
- `--output, -o` — output directory (required)
- `--format` — `'typescript'` (default, only option in Phase 3)
- `--naming` — operation naming strategy: `'operationId'` | `'method-path'`
- `--watch, -w` — watch source file for changes and regenerate

**Execution flow:**
1. Load spec from file or URL
2. Parse YAML/JSON into JavaScript object
3. Feed to `parser.js` → IR
4. Feed IR to `emitter.js` → file objects
5. Write files to output directory
6. Report results (routes generated, types created)

**YAML dependency:**
The CLI is the one place where a runtime dependency is acceptable (it's a dev tool,
not shipped to browsers). Uses `yaml` package for YAML parsing. This is a devDependency
of the consumer, not of the library itself.

**Package.json integration:**
```json
{
  "bin": {
    "ergo-fetch-codegen": "./codegen/cli.js"
  }
}
```

**Watch mode:**
- Uses `fs.watch()` on the source file
- On change: re-parse, re-emit, overwrite output
- Debounced (100ms) to avoid rapid-fire on save

**Error handling:**
- Invalid spec: print validation errors, exit 1
- Network error (URL source): print error, exit 1
- Write error: print error, exit 1
- Partial spec (some routes invalid): warn per route, generate valid ones

**Tests:**
- CLI argument parsing
- File source loading (JSON and YAML)
- URL source loading (mock HTTP)
- Output file writing
- Error cases (invalid spec, missing output dir)
- Watch mode (mock fs.watch)

---

### 10. Integration into `lib/client.js`

**Changes to client.js for Phase 3:**

**New client methods:**
```js
client.stream(path, options?)  → SSEConnection
client.destroy()               → void (closes SSE, flushes queue, aborts pending)
```

**New config options:**
```js
createClient({
  // ...Phase 1 + 2 options...
  offline: true | {
    store: idbQueueStore,
    filter: request => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method),
    autoReplay: true,
    onConflict: (entry, error) => 'skip',
  },
});
```

**Pipeline modification for offline:**
The Send stage gains a connectivity check:
1. If online → execute fetch normally
2. If offline AND request passes filter → enqueue, return pending response
3. If offline AND request does NOT pass filter → throw OfflineError

**New observable state:**
```js
client.offline.isOnline;       // boolean
client.offline.queue.size();   // Promise<number>
client.offline.on('drain', () => {});
client.offline.on('conflict', (entry, error) => {});
```

---

### 11. Updated `index.js` exports

**New exports for Phase 3:**
```js
// SSE
export {createSSEStream} from './lib/sse.js';

// Offline
export {createOfflineManager} from './lib/offline.js';
export {createOfflineQueue} from './lib/offline-queue.js';
export {createConnectivityMonitor} from './lib/connectivity.js';

// Stores
export {createIDBStore, createIDBQueueStore} from './stores/idb.js';

// Codegen (available but typically used via CLI)
export {parseOpenAPISpec} from './codegen/parser.js';
export {emitTypeScript} from './codegen/emitter.js';
```

**Package.json additions:**
```json
{
  "bin": {
    "ergo-fetch-codegen": "./codegen/cli.js"
  },
  "exports": {
    "./codegen": {
      "types": "./types/codegen/index.d.ts",
      "default": "./codegen/index.js"
    }
  }
}
```

---

## Acceptance Criteria (Phase 3)

### SSE/Streaming

- [ ] SSE connection established with correct headers (Accept: text/event-stream)
- [ ] Client interceptors (auth, CSRF, request-ID) applied to connection request
- [ ] Events parsed correctly from streamed chunks
- [ ] Auto-reconnect on network error with Last-Event-ID
- [ ] Exponential backoff on repeated connection failures
- [ ] No reconnect on 204 (server stop signal)
- [ ] Async iterator interface with backpressure
- [ ] Event-emitter interface with type-based dispatch
- [ ] Manual close terminates stream and prevents reconnection
- [ ] Contract test: SSE against ergo-router with `presets.sse`

### Offline Queue

- [ ] Mutations enqueued when offline (not executed)
- [ ] Reads rejected immediately when offline
- [ ] Auto-replay triggered on reconnection
- [ ] Idempotency keys preserved across replay
- [ ] 409 Conflict surfaces as event (not silent failure)
- [ ] FIFO ordering preserved during replay
- [ ] Sequential execution (no parallel replay)
- [ ] Failed entries exhausting retries are dequeued
- [ ] Queue persists in IndexedDB across page reloads
- [ ] Queue drain event fires when empty

### IndexedDB Store

- [ ] Cache store CRUD operations via IndexedDB
- [ ] TTL expiration on read
- [ ] LRU eviction at maxEntries
- [ ] Queue store ordered operations
- [ ] Survives page reload (data persisted)
- [ ] QuotaExceeded handling (eviction + retry)
- [ ] Graceful error when IndexedDB unavailable

### OpenAPI Codegen

- [ ] Parses OpenAPI 3.1 spec produced by ergo-router's `generateOpenAPI()`
- [ ] Generates valid TypeScript that compiles without errors
- [ ] Generated client methods match route signatures
- [ ] JSON Schema → TypeScript type conversion covers all common types
- [ ] $ref resolution produces correct type references
- [ ] CLI loads spec from file (JSON + YAML) and URL
- [ ] CLI writes output to specified directory
- [ ] Generated client wraps `@centralping/ergo-fetch` createClient

### Non-Functional

- [ ] Zero new runtime dependencies in core (YAML only in codegen CLI, as devDep of consumer)
- [ ] All Phase 1 + 2 tests still pass
- [ ] Coverage thresholds maintained
- [ ] SSE + offline add < 8KB min+gzip to bundle (when tree-shaken)
- [ ] IndexedDB store is optional (unused = not bundled)
- [ ] Codegen output compiles under `strict: true` TypeScript

### Documentation

- [ ] README updated with SSE, offline, and codegen sections
- [ ] Codegen README with usage examples
- [ ] JSDoc on all new exports
- [ ] CHANGELOG.md entry for 0.3.0

---

## Contract Test Additions (Phase 3)

```
test/contracts/
├── sse.spec.func.js              # SSE connection, events, reconnect
├── offline-replay.spec.func.js   # Queue, replay, idempotency preservation
└── codegen-roundtrip.spec.func.js # Generate from router spec → compile → execute
```

**Test server additions:**
- SSE route using `presets.sse` with event emission on interval
- Routes that simulate offline → online transitions (controlled via test API)
- OpenAPI endpoint (`router.routeTable()` + `generateOpenAPI(router)`)

---

## Open Items (to resolve during Phase 3 implementation)

1. **SSE buffer overflow policy:** When consumer is slow and buffer exceeds max size,
   should we drop oldest events or newest?
   Recommendation: drop oldest (consumer already missed them; newest are most relevant).

2. **Offline queue + conditional requests:** Should queued mutations include If-Match
   headers from the cache? They may be stale by replay time.
   Recommendation: NO. Queued mutations should NOT include conditional headers. By the
   time they replay, cached ETags are likely stale. Let the server enforce its own
   preconditions. If the consumer needs optimistic locking, they should handle 412 in
   the onConflict handler.

3. **Codegen: YAML as dependency:** Should `yaml` be a dependency of ergo-fetch or a
   peer dependency?
   Recommendation: neither. The codegen CLI detects if `yaml` is available (`await import('yaml')`)
   and prints a helpful message if not. Consumers add `yaml` to their own devDependencies.
   This keeps ergo-fetch at zero runtime deps.

4. **Codegen: multiple response types per route:** ergo-router's `generateOpenAPI()` may
   produce multiple response schemas (200, 201, 400, etc.). Should the generated type
   use a discriminated union?
   Recommendation: generate separate types per status code group. Success responses (2xx)
   get the primary return type. Error responses are handled by ProblemDetailsError (not typed
   per-route — they follow RFC 9457 uniformly).

5. **SSE + offline interaction:** Can SSE work offline?
   Recommendation: NO. SSE requires an active connection. When offline, `api.stream()` throws
   OfflineError. When connectivity is restored, the consumer must re-establish the stream
   (optionally with `lastEventId` to resume).

6. **Service Worker integration:** Should ergo-fetch provide a Service Worker script for
   offline queue management?
   Recommendation: NOT in Phase 3. Service Workers add significant complexity (separate
   execution context, lifecycle management, message passing). The in-page queue with
   IndexedDB is sufficient for PWA use cases. Service Worker integration is a candidate
   for Phase 4 or a separate package.
