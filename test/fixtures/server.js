/**
 * @fileoverview Contract test server built on @centralping/ergo-router.
 *
 * Provides deterministic routes exercising interceptor behaviors:
 * conditional requests (ETag/Last-Modified), rate limiting, CSRF token lifecycle,
 * RFC 9457 problem details, retry semantics, pagination (offset + cursor),
 * idempotency-key lifecycle, and JSON:API query parameter echoing.
 *
 * @module test/fixtures/server
 */

import createRouter from '@centralping/ergo-router';

/**
 * Creates a configured ergo-router instance with all contract test routes.
 *
 * @returns {{handle: () => function}} - Router with handle() method for http.createServer.
 */
export function createTestServer() {
  const router = createRouter({
    transport: {requestId: {}},
    strictPatch: false,
    strictBody: false
  });

  registerResourceRoutes(router);
  registerRateLimitRoutes(router);
  registerErrorRoutes(router);
  registerCsrfRoutes(router);
  registerRetryRoutes(router);
  registerRetryAfterDelayRoutes(router);
  registerTimeoutRoutes(router);
  registerPaginationRoutes(router);
  registerIdempotencyRoutes(router);
  registerJsonApiRoutes(router);

  return router;
}

/**
 * GET /resource — returns JSON with ETag + Last-Modified; supports conditional semantics.
 * PUT /resource — requires If-Match; returns updated resource or 412.
 */
function registerResourceRoutes(router) {
  let currentEtag = '"v1"';
  const lastModified = 'Wed, 18 Jun 2025 12:00:00 GMT';
  let resourceBody = {id: 1, name: 'Test Resource', version: 1};

  router.get('/resource', (req, res) => {
    const ifNoneMatch = req.headers['if-none-match'];
    const ifModifiedSince = req.headers['if-modified-since'];

    if (ifNoneMatch && ifNoneMatch === currentEtag) {
      res.statusCode = 304;
      res.end();
      return;
    }

    if (ifModifiedSince && !ifNoneMatch) {
      const clientDate = Date.parse(ifModifiedSince);
      const serverDate = Date.parse(lastModified);

      if (!Number.isNaN(clientDate) && !Number.isNaN(serverDate) && clientDate >= serverDate) {
        res.statusCode = 304;
        res.end();
        return;
      }
    }

    const body = JSON.stringify(resourceBody);
    res.setHeader('content-type', 'application/json');
    res.setHeader('etag', currentEtag);
    res.setHeader('last-modified', lastModified);
    res.statusCode = 200;
    res.end(body);
  });

  router.put('/resource', (req, res) => {
    const ifMatch = req.headers['if-match'];

    if (!ifMatch || ifMatch !== currentEtag) {
      const problem = {
        type: 'https://httpstatuses.com/412',
        title: 'Precondition Failed',
        status: 412,
        detail: !ifMatch ? 'Missing If-Match header' : 'ETag mismatch'
      };
      res.setHeader('content-type', 'application/problem+json');
      res.statusCode = 412;
      res.end(JSON.stringify(problem));
      return;
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      let parsed;

      try {
        parsed = body ? JSON.parse(body) : {};
      } catch {
        res.setHeader('content-type', 'application/problem+json');
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            type: 'https://httpstatuses.com/400',
            title: 'Bad Request',
            status: 400,
            detail: 'Malformed JSON body'
          })
        );
        return;
      }

      resourceBody = {...resourceBody, ...parsed, version: resourceBody.version + 1};
      currentEtag = `"v${resourceBody.version}"`;

      res.setHeader('content-type', 'application/json');
      res.setHeader('etag', currentEtag);
      res.statusCode = 200;
      res.end(JSON.stringify(resourceBody));
    });
  });
}

/**
 * GET /rate-limited — returns X-RateLimit-* headers; responds 429 after threshold.
 * GET /rate-limited/reset — resets the rate limit counter (test utility).
 */
function registerRateLimitRoutes(router) {
  const limit = 3;
  let remaining = limit;
  const resetTime = Math.floor(Date.now() / 1000) + 60;

  router.get('/rate-limited/reset', (req, res) => {
    remaining = limit;
    res.statusCode = 204;
    res.end();
  });

  router.get('/rate-limited', (req, res) => {
    res.setHeader('x-ratelimit-limit', String(limit));
    res.setHeader('x-ratelimit-remaining', String(Math.max(0, remaining - 1)));
    res.setHeader('x-ratelimit-reset', String(resetTime));

    if (remaining <= 0) {
      res.setHeader('retry-after', '1');
      const problem = {
        type: 'https://httpstatuses.com/429',
        title: 'Too Many Requests',
        status: 429,
        detail: 'Rate limit exceeded'
      };
      res.setHeader('content-type', 'application/problem+json');
      res.statusCode = 429;
      res.end(JSON.stringify(problem));
      return;
    }

    remaining--;
    res.setHeader('content-type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ok: true, remaining: remaining}));
  });
}

/**
 * GET|POST|PUT|DELETE /error/:status — returns RFC 9457 problem+json for any status code.
 */
function registerErrorRoutes(router) {
  /** @type {Map<string, number>} */
  const callCounts = new Map();

  /**
   * @param {import('node:http').IncomingMessage} req - Incoming request.
   * @param {import('node:http').ServerResponse} res - Server response.
   * @param {object} params - Route parameters.
   */
  function handleError(req, res, params) {
    const status = Number(params.status);

    if (!Number.isInteger(status) || status < 400 || status > 599) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/problem+json');
      res.end(
        JSON.stringify({
          type: 'https://httpstatuses.com/400',
          title: 'Bad Request',
          status: 400,
          detail: 'Status must be an integer between 400 and 599'
        })
      );
      return;
    }

    const key = `${req.method}:${params.status}`;
    const count = (callCounts.get(key) ?? 0) + 1;
    callCounts.set(key, count);

    const problem = {
      type: `https://httpstatuses.com/${status}`,
      title: statusTitle(status),
      status,
      detail: `Synthetic ${status} error for testing`,
      instance: `/error/${status}`,
      _callCount: count
    };

    res.setHeader('content-type', 'application/problem+json');
    res.statusCode = status;
    res.end(JSON.stringify(problem));
  }

  router.get('/error/:status', handleError);
  router.post('/error/:status', handleError);
  router.put('/error/:status', handleError);
  router.delete('/error/:status', handleError);
}

/**
 * GET /csrf-token — issues a CSRF cookie via Set-Cookie header.
 * POST /csrf-protected — requires x-csrf-token header matching the issued token.
 */
function registerCsrfRoutes(router) {
  const csrfToken = 'test-csrf-token-abc123';

  router.get('/csrf-token', (req, res) => {
    res.setHeader('set-cookie', `__csrf=${csrfToken}; Path=/; HttpOnly; SameSite=Strict`);
    res.setHeader('content-type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ok: true}));
  });

  router.post('/csrf-protected', (req, res) => {
    const token = req.headers['x-csrf-token'];

    if (token !== csrfToken) {
      const problem = {
        type: 'https://httpstatuses.com/403',
        title: 'Forbidden',
        status: 403,
        detail: 'Invalid or missing CSRF token'
      };
      res.setHeader('content-type', 'application/problem+json');
      res.statusCode = 403;
      res.end(JSON.stringify(problem));
      return;
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify({ok: true, received: body || null}));
    });
  });
}

/**
 * GET|PUT|DELETE /retry-once — returns 503 on first request per request-id, 200 on subsequent.
 * GET /retry-once/reset — clears seen request-ids (test utility).
 */
function registerRetryRoutes(router) {
  const seen = new Set();

  router.get('/retry-once/reset', (req, res) => {
    seen.clear();
    res.statusCode = 204;
    res.end();
  });

  /**
   * @param {import('node:http').IncomingMessage} req - Incoming request.
   * @param {import('node:http').ServerResponse} res - Server response.
   */
  function handleRetryOnce(req, res) {
    const requestId = req.headers['x-request-id'];
    const key = requestId ?? 'anonymous';

    if (!seen.has(key)) {
      seen.add(key);
      const problem = {
        type: 'https://httpstatuses.com/503',
        title: 'Service Unavailable',
        status: 503,
        detail: 'Temporary failure — retry'
      };
      res.setHeader('content-type', 'application/problem+json');
      res.setHeader('retry-after', '0');
      res.statusCode = 503;
      res.end(JSON.stringify(problem));
      return;
    }

    res.setHeader('content-type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ok: true, retried: true}));
  }

  router.get('/retry-once', handleRetryOnce);
  router.put('/retry-once', handleRetryOnce);
  router.delete('/retry-once', handleRetryOnce);
}

/**
 * GET /retry-after-delay — returns 503 with configurable Retry-After on first call, 200 on second.
 * GET /retry-after-delay/reset — clears state (test utility).
 * Query parameter ?seconds= sets the Retry-After value (default: 1).
 */
function registerRetryAfterDelayRoutes(router) {
  const seen = new Set();

  router.get('/retry-after-delay/reset', (req, res) => {
    seen.clear();
    res.statusCode = 204;
    res.end();
  });

  router.get('/retry-after-delay', (req, res) => {
    const requestId = req.headers['x-request-id'];
    const key = requestId ?? 'anonymous';
    const url = new URL(req.url, 'http://localhost');
    const rawSeconds = url.searchParams.get('seconds');
    const parsedSeconds = Number(rawSeconds ?? '1');
    const seconds =
      Number.isInteger(parsedSeconds) && parsedSeconds >= 0 ? String(parsedSeconds) : '1';

    if (!seen.has(key)) {
      seen.add(key);
      const problem = {
        type: 'https://httpstatuses.com/503',
        title: 'Service Unavailable',
        status: 503,
        detail: 'Temporary failure — retry after delay'
      };
      res.setHeader('content-type', 'application/problem+json');
      res.setHeader('retry-after', seconds);
      res.statusCode = 503;
      res.end(JSON.stringify(problem));
      return;
    }

    res.setHeader('content-type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ok: true, retried: true}));
  });
}

/**
 * GET /timeout — delays response by the duration specified in ?ms= query parameter.
 */
function registerTimeoutRoutes(router) {
  router.get('/timeout', (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const parsed = Number(url.searchParams.get('ms') ?? '5000');
    const ms = Number.isFinite(parsed) && parsed >= 0 ? parsed : 5000;

    const timer = setTimeout(() => {
      res.setHeader('content-type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify({ok: true, delayed: ms}));
    }, ms);

    res.on('close', () => clearTimeout(timer));
  });
}

/**
 * GET /paginated — offset-based pagination with Link + X-Total-Count headers.
 * GET /paginated-cursor — cursor-based pagination with Link headers (no X-Total-Count).
 */
function registerPaginationRoutes(router) {
  const items = Array.from({length: 25}, (_, i) => ({id: i + 1, name: `Item ${i + 1}`}));

  router.get('/paginated', (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const rawPage = Number(url.searchParams.get('page') ?? '1');
    const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
    const rawPerPage = Number(url.searchParams.get('perPage') ?? '10');
    const perPage = Number.isInteger(rawPerPage) && rawPerPage >= 1 ? rawPerPage : 10;

    const start = (page - 1) * perPage;
    const pageItems = items.slice(start, start + perPage);
    const totalPages = Math.ceil(items.length / perPage);

    const links = [];
    links.push(`</paginated?page=1&perPage=${perPage}>; rel="first"`);
    if (page > 1) links.push(`</paginated?page=${page - 1}&perPage=${perPage}>; rel="prev"`);
    if (page < totalPages)
      links.push(`</paginated?page=${page + 1}&perPage=${perPage}>; rel="next"`);
    links.push(`</paginated?page=${totalPages}&perPage=${perPage}>; rel="last"`);

    res.setHeader('x-total-count', String(items.length));
    res.setHeader('link', links.join(', '));
    res.setHeader('content-type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify(pageItems));
  });

  router.get('/paginated-cursor', (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const rawCursor = url.searchParams.get('cursor');
    const startIndex = rawCursor != null ? Number(rawCursor) : 0;
    const rawLimit = Number(url.searchParams.get('limit') ?? '10');
    const limit = Number.isInteger(rawLimit) && rawLimit >= 1 ? rawLimit : 10;

    const pageItems = items.slice(startIndex, startIndex + limit);
    const nextIndex = startIndex + limit;

    const links = [];
    links.push(`</paginated-cursor?limit=${limit}>; rel="first"`);
    if (nextIndex < items.length) {
      links.push(`</paginated-cursor?cursor=${nextIndex}&limit=${limit}>; rel="next"`);
    }

    res.setHeader('link', links.join(', '));
    res.setHeader('content-type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify(pageItems));
  });
}

/**
 * POST /idempotent — requires Idempotency-Key header; tracks duplicates.
 * POST /idempotent-retry — returns 503 on first attempt, 201 on retry (same key).
 * GET /idempotent/reset — clears idempotency state (test utility).
 */
function registerIdempotencyRoutes(router) {
  /** @type {Map<string, {body: string, status: number, responseBody: object}>} */
  const seen = new Map();
  /** @type {Set<string>} */
  const retrySeen = new Set();

  router.get('/idempotent/reset', (req, res) => {
    seen.clear();
    retrySeen.clear();
    res.statusCode = 204;
    res.end();
  });

  router.post('/idempotent', (req, res) => {
    const key = req.headers['idempotency-key'];

    if (!key) {
      res.setHeader('content-type', 'application/problem+json');
      res.statusCode = 400;
      res.end(
        JSON.stringify({
          type: 'https://httpstatuses.com/400',
          title: 'Bad Request',
          status: 400,
          detail: 'Idempotency-Key header is required'
        })
      );
      return;
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      const existing = seen.get(key);

      if (existing) {
        if (existing.body !== body) {
          res.setHeader('content-type', 'application/problem+json');
          res.statusCode = 409;
          res.end(
            JSON.stringify({
              type: 'https://httpstatuses.com/409',
              title: 'Conflict',
              status: 409,
              detail: 'Idempotency key already used with a different request'
            })
          );
          return;
        }

        res.setHeader('content-type', 'application/json');
        res.statusCode = existing.status;
        res.end(JSON.stringify(existing.responseBody));
        return;
      }

      const responseBody = {created: true, key, received: body || undefined};
      seen.set(key, {body, status: 201, responseBody});

      res.setHeader('content-type', 'application/json');
      res.statusCode = 201;
      res.end(JSON.stringify(responseBody));
    });
  });

  router.post('/idempotent-retry', (req, res) => {
    const key = req.headers['idempotency-key'];

    if (!key) {
      req.resume();
      res.setHeader('content-type', 'application/problem+json');
      res.statusCode = 400;
      res.end(
        JSON.stringify({
          type: 'https://httpstatuses.com/400',
          title: 'Bad Request',
          status: 400,
          detail: 'Idempotency-Key header is required'
        })
      );
      return;
    }

    req.resume();
    req.on('end', () => {
      if (!retrySeen.has(key)) {
        retrySeen.add(key);
        res.setHeader('content-type', 'application/problem+json');
        res.setHeader('retry-after', '0');
        res.statusCode = 503;
        res.end(
          JSON.stringify({
            type: 'https://httpstatuses.com/503',
            title: 'Service Unavailable',
            status: 503,
            detail: 'Temporary failure — retry'
          })
        );
        return;
      }

      res.setHeader('content-type', 'application/json');
      res.statusCode = 201;
      res.end(JSON.stringify({created: true, key, retried: true}));
    });
  });
}

/**
 * GET /jsonapi — echoes received query parameters as JSON.
 * Validates that query builder output arrives at the server correctly.
 */
function registerJsonApiRoutes(router) {
  router.get('/jsonapi', (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const params = Object.create(null);

    for (const [key, value] of url.searchParams) {
      if (key in params) {
        if (Array.isArray(params[key])) {
          params[key].push(value);
        } else {
          params[key] = [params[key], value];
        }
      } else {
        params[key] = value;
      }
    }

    res.setHeader('content-type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({data: [], query: params}));
  });
}

/**
 * Maps common HTTP status codes to their standard titles.
 *
 * @param {number} status - HTTP status code.
 * @returns {string} - Standard title for the status.
 */
function statusTitle(status) {
  const titles = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    412: 'Precondition Failed',
    422: 'Unprocessable Content',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  };

  return titles[status] ?? 'Error';
}
