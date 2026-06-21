/**
 * @fileoverview Core fetch client with interceptor pipeline.
 * @module @centralping/ergo-fetch/lib/client
 */

import {createRequestIdInterceptor} from './request-id.js';
import {createPreferInterceptor} from './prefer.js';
import {createCsrfInterceptor} from './csrf.js';
import {createConditionalInterceptor} from './conditional.js';
import {createRateLimitInterceptor} from './rate-limit.js';
import {createRetryInterceptor} from './retry.js';
import {parseProblemDetails} from './problem-details.js';

/** @type {ReadonlySet<string>} */
const BODY_FORBIDDEN_METHODS = new Set(['GET', 'HEAD']);

/** @type {number} */
const DEFAULT_TIMEOUT = 30_000;

/**
 * @typedef {object} ClientConfig
 * @property {string} baseUrl - Base URL for all requests (required, must be a valid URL).
 * @property {number} [timeout] - Default request timeout in milliseconds (default: DEFAULT_TIMEOUT).
 * @property {object | Headers} [headers] - Default headers for all requests.
 * @property {boolean | import('./request-id.js').RequestIdInterceptorOptions} [requestId] -
 *   Request-ID interceptor config (default: enabled with defaults, false to disable).
 * @property {false | string | object} [prefer] - Prefer interceptor config
 *   (default: disabled, string or object to enable).
 * @property {boolean | import('./csrf.js').CsrfInterceptorOptions} [csrf] -
 *   CSRF interceptor config (default: enabled with defaults, false to disable).
 * @property {boolean | import('./conditional.js').ConditionalInterceptorOptions} [conditional] -
 *   Conditional interceptor config (default: enabled with defaults, false to disable).
 * @property {boolean | import('./rate-limit.js').RateLimitInterceptorOptions} [rateLimit] -
 *   Rate-limit interceptor config (default: enabled with defaults, false to disable).
 * @property {boolean | import('./retry.js').RetryInterceptorOptions} [retry] -
 *   Retry interceptor config (default: enabled with defaults, false to disable).
 */

/**
 * @typedef {object} RequestOptions
 * @property {object | Headers} [headers] - Per-request headers (merged with defaults).
 * @property {*} [body] - Request body (auto-serialized to JSON for plain objects).
 * @property {object} [params] - URL path parameters for `:key` substitution.
 * @property {object} [query] - URL query parameters appended via URLSearchParams.
 * @property {AbortSignal} [signal] - User abort signal (combined with timeout signal).
 * @property {number} [timeout] - Per-request timeout in milliseconds.
 * @property {boolean} [retry] - Set to false to disable retry for this request.
 * @property {boolean} [conditional] - Set to false to disable conditional headers for this request.
 * @property {boolean} [idempotent] - Explicit idempotency override for retry eligibility.
 */

/**
 * @typedef {object} ClientResponse
 * @property {number} status - HTTP status code.
 * @property {Headers} headers - Response headers.
 * @property {*} body - Parsed response body (JSON auto-parsed, text otherwise, undefined for 204/HEAD).
 * @property {string} [requestId] - Captured X-Request-Id value.
 * @property {import('./rate-limit.js').RateLimitState} [rateLimit] - Current rate limit state snapshot.
 * @property {Response} raw - Original fetch Response (body stream consumed).
 */

/**
 * @typedef {object} Client
 * @property {(path: string, options?: RequestOptions) => Promise<ClientResponse>} get -
 *   Sends a GET request.
 * @property {(path: string, options?: RequestOptions) => Promise<ClientResponse>} post -
 *   Sends a POST request.
 * @property {(path: string, options?: RequestOptions) => Promise<ClientResponse>} put -
 *   Sends a PUT request.
 * @property {(path: string, options?: RequestOptions) => Promise<ClientResponse>} patch -
 *   Sends a PATCH request.
 * @property {(path: string, options?: RequestOptions) => Promise<ClientResponse>} delete -
 *   Sends a DELETE request.
 * @property {(path: string, options?: RequestOptions) => Promise<ClientResponse>} head -
 *   Sends a HEAD request.
 * @property {(method: string, path: string, options?: RequestOptions) => Promise<ClientResponse>} request -
 *   Sends a request with an explicit HTTP method.
 */

/**
 * Creates a configured HTTP client with an interceptor pipeline.
 *
 * The client assembles interceptors based on configuration, then executes
 * requests through a pipeline: prepare → enrich (request interceptors) →
 * fetch → interpret (response interceptors) → retry or return.
 *
 * @param {ClientConfig} config - Client configuration.
 * @returns {Readonly<Client>} - Frozen client instance with HTTP method helpers.
 * @throws {TypeError} When config is not a non-null object.
 * @throws {TypeError} When config.baseUrl is missing, empty, or an invalid URL.
 * @throws {TypeError} When config.timeout is not a positive finite number.
 */
export function createClient(config) {
  if (config == null || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('config must be a non-null object');
  }

  if (typeof config.baseUrl !== 'string' || !config.baseUrl) {
    throw new TypeError('config.baseUrl must be a non-empty string');
  }

  const baseUrl = new URL(config.baseUrl).href;

  if (config.timeout !== undefined) {
    if (
      typeof config.timeout !== 'number' ||
      !Number.isFinite(config.timeout) ||
      config.timeout <= 0
    ) {
      throw new TypeError('config.timeout must be a positive finite number');
    }
  }

  const defaultTimeout = config.timeout ?? DEFAULT_TIMEOUT;
  const defaultHeaders = config.headers != null ? new Headers(config.headers) : new Headers();

  const requestIdInterceptor =
    config.requestId !== false
      ? createRequestIdInterceptor(normalizeInterceptorOptions(config.requestId))
      : undefined;

  const preferInterceptor =
    config.prefer != null && config.prefer !== false
      ? createPreferInterceptor(config.prefer)
      : undefined;

  const csrfInterceptor =
    config.csrf !== false
      ? createCsrfInterceptor(normalizeInterceptorOptions(config.csrf))
      : undefined;

  const conditionalInterceptor =
    config.conditional !== false
      ? createConditionalInterceptor(normalizeInterceptorOptions(config.conditional))
      : undefined;

  const rateLimitInterceptor =
    config.rateLimit !== false
      ? createRateLimitInterceptor(normalizeInterceptorOptions(config.rateLimit))
      : undefined;

  const retryInterceptor =
    config.retry !== false
      ? createRetryInterceptor(normalizeInterceptorOptions(config.retry))
      : undefined;

  const requestPipeline = [
    csrfInterceptor,
    conditionalInterceptor,
    preferInterceptor,
    requestIdInterceptor,
    rateLimitInterceptor,
    retryInterceptor
  ].filter(i => i != null);

  const responsePipeline = [
    csrfInterceptor,
    requestIdInterceptor,
    preferInterceptor,
    conditionalInterceptor,
    rateLimitInterceptor,
    retryInterceptor
  ].filter(i => i != null);

  const client = Object.create(null);

  client.get = function get(path, options) {
    return executeRequest('GET', path, options);
  };
  client.post = function post(path, options) {
    return executeRequest('POST', path, options);
  };
  client.put = function put(path, options) {
    return executeRequest('PUT', path, options);
  };
  client.patch = function patch(path, options) {
    return executeRequest('PATCH', path, options);
  };
  client.delete = function del(path, options) {
    return executeRequest('DELETE', path, options);
  };
  client.head = function head(path, options) {
    return executeRequest('HEAD', path, options);
  };
  client.request = executeRequest;

  /**
   * Executes a request through the interceptor pipeline.
   *
   * @param {string} method - HTTP method.
   * @param {string} path - URL path (must start with /).
   * @param {RequestOptions} [options] - Per-request options.
   * @returns {Promise<ClientResponse>} - Frozen response object.
   * @throws {TypeError} When path is not a string or does not start with /.
   * @throws {TypeError} When body is provided for GET or HEAD requests.
   * @throws {import('./problem-details.js').ProblemDetailsError} When the server responds with status >= 400.
   */
  async function executeRequest(method, path, options) {
    const upperMethod = String(method).toUpperCase();

    if (typeof path !== 'string') {
      throw new TypeError('path must be a string');
    }

    if (!path.startsWith('/')) {
      throw new TypeError('path must start with /');
    }

    if (options?.body !== undefined && BODY_FORBIDDEN_METHODS.has(upperMethod)) {
      throw new TypeError(`Request body is not allowed for ${upperMethod} requests`);
    }

    if (options?.signal !== undefined && !(options.signal instanceof AbortSignal)) {
      throw new TypeError('options.signal must be an AbortSignal');
    }

    const url = buildUrl(baseUrl, path, options?.params, options?.query);
    const jsonBody = needsJsonSerialization(options?.body);
    const serializedBody = jsonBody ? JSON.stringify(options.body) : (options?.body ?? undefined);
    const timeout = options?.timeout ?? defaultTimeout;
    const userSignal = options?.signal;

    const ctx = Object.create(null);
    ctx.method = upperMethod;
    ctx.url = url;
    ctx.baseUrl = baseUrl;
    if (options?.idempotent !== undefined) ctx.idempotent = options.idempotent;

    let activeRequestPipeline = requestPipeline;
    let activeResponsePipeline = responsePipeline;

    if (options?.retry === false && retryInterceptor) {
      activeRequestPipeline = activeRequestPipeline.filter(i => i !== retryInterceptor);
      activeResponsePipeline = activeResponsePipeline.filter(i => i !== retryInterceptor);
    }

    if (options?.conditional === false && conditionalInterceptor) {
      activeRequestPipeline = activeRequestPipeline.filter(i => i !== conditionalInterceptor);
      activeResponsePipeline = activeResponsePipeline.filter(i => i !== conditionalInterceptor);
    }

    for (;;) {
      ctx.headers = mergeHeaders(defaultHeaders, options?.headers);
      if (jsonBody && !ctx.headers.has('content-type')) {
        ctx.headers.set('content-type', 'application/json');
      }

      for (const interceptor of activeRequestPipeline) {
        await interceptor.request(ctx);
      }

      if (ctx.rateLimitDelay > 0) {
        await sleep(ctx.rateLimitDelay, userSignal);
        ctx.rateLimitDelay = undefined;
      }

      const signal = buildAbortSignal(timeout, userSignal);

      const response = await fetch(ctx.url, {
        method: ctx.method,
        headers: ctx.headers,
        body: serializedBody,
        signal
      });

      let retryApproved = false;
      let retryDelay = 0;
      let bodyOverride;

      for (const interceptor of activeResponsePipeline) {
        const result = await interceptor.response(ctx, response);

        if (result != null) {
          if (result.retry) {
            if (result.delay != null && result.delay > retryDelay) {
              retryDelay = result.delay;
            }
            if (interceptor === retryInterceptor) {
              retryApproved = true;
            }
          }

          if ('body' in result && bodyOverride === undefined) {
            bodyOverride = result.body;
          }
        }
      }

      if (retryApproved) {
        if (retryDelay > 0) await sleep(retryDelay, userSignal);
        continue;
      }

      if (response.status >= 400) {
        const error = await parseProblemDetails(response);
        if (error) throw error;
      }

      const parsedBody =
        bodyOverride !== undefined ? bodyOverride : await parseResponseBody(response, upperMethod);

      const result = Object.create(null);
      result.status = response.status;
      result.headers = response.headers;
      result.body = parsedBody;
      result.requestId = ctx.requestId;
      result.rateLimit = rateLimitInterceptor?.getState();
      result.raw = response;
      return Object.freeze(result);
    }
  }

  return Object.freeze(client);
}

/**
 * Normalizes interceptor option values: `true` or `undefined` become `undefined`
 * (factory defaults), objects pass through.
 *
 * @param {*} value - Interceptor config value.
 * @returns {object | undefined} - Normalized options, or undefined for defaults.
 */
function normalizeInterceptorOptions(value) {
  if (value === true || value === undefined) return undefined;
  return value;
}

/**
 * Builds a fully resolved URL from base URL, path, path parameters, and query parameters.
 *
 * Path parameters use `:key` syntax (e.g., `/users/:id`). Values are URI-encoded.
 * Query parameters are appended via URLSearchParams. Array values produce
 * multiple entries for the same key.
 *
 * @param {string} base - Base URL.
 * @param {string} path - URL path with optional `:key` placeholders.
 * @param {object} [params] - Path parameter key-value pairs.
 * @param {object} [query] - Query parameter key-value pairs.
 * @returns {string} - Fully resolved URL string.
 */
function buildUrl(base, path, params, query) {
  let resolvedPath = path;

  if (params != null) {
    for (const [key, value] of Object.entries(params)) {
      resolvedPath = resolvedPath.replaceAll(`:${key}`, encodeURIComponent(String(value)));
    }
  }

  const url = new URL(resolvedPath, base);

  if (query != null) {
    for (const [key, value] of Object.entries(query)) {
      if (value == null) continue;

      if (Array.isArray(value)) {
        for (const v of value) {
          url.searchParams.append(key, String(v));
        }
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.href;
}

/**
 * Merges default headers with per-request override headers.
 *
 * @param {Headers} defaults - Default headers.
 * @param {object | Headers} [override] - Per-request headers.
 * @returns {Headers} - Merged headers (new instance).
 */
function mergeHeaders(defaults, override) {
  const headers = new Headers(defaults);

  if (override == null) return headers;

  const entries = override instanceof Headers ? override.entries() : Object.entries(override);

  for (const [key, value] of entries) {
    headers.set(key, value);
  }

  return headers;
}

/**
 * Determines whether a body value requires JSON serialization.
 *
 * Returns `true` for plain objects and arrays. Returns `false` for `null`,
 * `undefined`, primitives, and Web Platform body types (FormData, Blob,
 * ArrayBuffer, URLSearchParams, ReadableStream, TypedArray).
 *
 * @param {*} body - Request body value.
 * @returns {boolean} - Whether the body should be JSON-serialized.
 */
function needsJsonSerialization(body) {
  if (body == null) return false;
  if (typeof body !== 'object') return false;
  if (body instanceof FormData) return false;
  if (body instanceof Blob) return false;
  if (body instanceof ArrayBuffer) return false;
  if (body instanceof URLSearchParams) return false;
  if (body instanceof ReadableStream) return false;
  if (ArrayBuffer.isView(body)) return false;
  return true;
}

/**
 * Builds a combined AbortSignal from a timeout and an optional user signal.
 *
 * @param {number} timeout - Timeout in milliseconds.
 * @param {AbortSignal} [userSignal] - Optional user-provided abort signal.
 * @returns {AbortSignal} - Combined signal.
 */
function buildAbortSignal(timeout, userSignal) {
  const timeoutSignal = AbortSignal.timeout(timeout);

  if (userSignal) {
    return AbortSignal.any([timeoutSignal, userSignal]);
  }

  return timeoutSignal;
}

/**
 * Parses the response body based on Content-Type.
 *
 * Returns parsed JSON for `application/json` and `+json` content types,
 * raw text for all other content types, or `undefined` for HEAD responses
 * and 204/304 statuses.
 *
 * @param {Response} response - Fetch API response.
 * @param {string} method - HTTP method (uppercase).
 * @returns {Promise<* | undefined>} - Parsed body, or undefined.
 */
async function parseResponseBody(response, method) {
  if (method === 'HEAD') return undefined;
  if (response.status === 204 || response.status === 304) return undefined;

  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json') || contentType.includes('+json')) {
    return response.json();
  }

  return response.text();
}

/**
 * Returns a Promise that resolves after the specified delay, or rejects
 * immediately if the optional signal is already aborted or becomes aborted
 * during the wait.
 *
 * @param {number} ms - Delay in milliseconds.
 * @param {AbortSignal} [signal] - Optional signal for early cancellation.
 * @returns {Promise<void>}
 */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const timer = setTimeout(onTimer, ms);

    function onTimer() {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }

    function onAbort() {
      clearTimeout(timer);
      reject(signal.reason);
    }

    signal?.addEventListener('abort', onAbort, {once: true});
  });
}
