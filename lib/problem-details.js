/**
 * @fileoverview RFC 9457 Problem Details parsing, error class, and classifiers.
 * @module @centralping/ergo-fetch/lib/problem-details
 */

/**
 * Content-Type prefix for RFC 9457 Problem Details responses.
 *
 * @type {string}
 */
const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/**
 * HTTP status codes that are unconditionally retryable.
 *
 * 500, 502, and 504 are intentionally excluded — those are retryable only
 * when the request is idempotent, which is the retry interceptor's concern.
 *
 * @type {Set<number>}
 */
const RETRYABLE_STATUSES = new Set([429, 503]);

/**
 * HTTP status codes classified as validation errors.
 *
 * @type {Set<number>}
 */
const VALIDATION_STATUSES = new Set([400, 422]);

/**
 * HTTP status codes classified as authentication/authorization errors.
 *
 * @type {Set<number>}
 */
const AUTH_STATUSES = new Set([401, 403]);

/**
 * Standard RFC 9457 fields (not treated as extension members).
 *
 * @type {Set<string>}
 */
const STANDARD_FIELDS = new Set(['type', 'title', 'status', 'detail', 'instance']);

/**
 * Structured error representing an RFC 9457 Problem Details response.
 *
 * Carries all standard Problem Details fields (`type`, `title`, `status`,
 * `detail`, `instance`) and any extension members from the response body.
 *
 * @extends Error
 */
export class ProblemDetailsError extends Error {
  /**
   * @param {object} problem - Parsed Problem Details body.
   * @param {string} [problem.type] - URI reference identifying the problem type.
   * @param {string} [problem.title] - Short human-readable summary.
   * @param {number} [problem.status] - HTTP status code.
   * @param {string} [problem.detail] - Human-readable explanation.
   * @param {string} [problem.instance] - URI reference identifying the occurrence.
   */
  constructor(problem) {
    super(problem.title ?? problem.detail ?? 'Problem Details Error');

    /** @type {string} */
    this.name = 'ProblemDetailsError';

    /** @type {string | undefined} */
    this.type = problem.type;

    /** @type {string | undefined} */
    this.title = problem.title;

    /** @type {number | undefined} */
    this.status = problem.status;

    /** @type {string | undefined} */
    this.detail = problem.detail;

    /** @type {string | undefined} */
    this.instance = problem.instance;

    /** @type {object | undefined} */
    this.extensions = extractExtensions(problem);
  }
}

/**
 * Extracts extension members from a Problem Details body.
 *
 * Extension members are any keys not in the RFC 9457 standard set. Returns
 * a null-prototype object for safety against prototype pollution from
 * server-originated keys. Returns `undefined` when no extensions are present.
 *
 * @param {object} problem - Parsed Problem Details body.
 * @returns {object | undefined} - Null-prototype object of extension members, or undefined.
 */
function extractExtensions(problem) {
  const keys = Object.keys(problem).filter(k => !STANDARD_FIELDS.has(k));

  if (keys.length === 0) return undefined;

  const extensions = Object.create(null);
  for (const key of keys) {
    extensions[key] = problem[key];
  }
  return extensions;
}

/**
 * Determines whether a Response carries an RFC 9457 Problem Details body.
 *
 * Checks the `Content-Type` header for `application/problem+json`,
 * case-insensitive, ignoring parameters (charset, boundary, etc.).
 *
 * @param {Response} response - Fetch API Response object.
 * @returns {boolean} - Whether the response is a Problem Details response.
 */
export function isProblemResponse(response) {
  const contentType = response.headers.get('content-type');
  if (contentType == null) return false;

  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  return mediaType === PROBLEM_CONTENT_TYPE;
}

/**
 * Parses a response into a ProblemDetailsError when applicable.
 *
 * Returns a ProblemDetailsError in two cases:
 * 1. The response has `Content-Type: application/problem+json` — the body is
 *    parsed as RFC 9457 Problem Details (body is consumed via `response.json()`).
 * 2. The response has `status >= 400` without problem+json — a minimal
 *    ProblemDetailsError is constructed from the status code and status text.
 *
 * Returns `undefined` when the response is not an error (status < 400 and
 * content-type is not problem+json).
 *
 * @param {Response} response - Fetch API Response to examine.
 * @returns {Promise<ProblemDetailsError | undefined>} - Parsed error, or undefined for non-errors.
 */
export async function parseProblemDetails(response) {
  if (isProblemResponse(response)) {
    try {
      const body = await response.json();

      if (body == null || typeof body !== 'object' || Array.isArray(body)) {
        throw new TypeError('Problem Details body must be a JSON object');
      }

      const status =
        Number.isInteger(body.status) && body.status >= 100 && body.status <= 599
          ? body.status
          : response.status;

      return new ProblemDetailsError({
        type: body.type,
        title: body.title,
        status,
        detail: body.detail,
        instance: body.instance,
        ...extractRawExtensions(body)
      });
    } catch {
      return new ProblemDetailsError({
        status: response.status,
        title: response.statusText
      });
    }
  }

  if (response.status >= 400) {
    return new ProblemDetailsError({
      type: 'about:blank',
      status: response.status,
      title: response.statusText
    });
  }

  return undefined;
}

/**
 * Extracts raw extension members from a body for spreading into the
 * ProblemDetailsError constructor (preserves all non-standard keys).
 *
 * @param {object} body - Parsed JSON body.
 * @returns {object} - Object containing only extension members.
 */
function extractRawExtensions(body) {
  const result = Object.create(null);
  for (const key of Object.keys(body)) {
    if (!STANDARD_FIELDS.has(key)) {
      result[key] = body[key];
    }
  }
  return result;
}

/**
 * Determines whether an error is unconditionally retryable.
 *
 * Returns `true` for ProblemDetailsError with status 429 or 503, and for
 * network errors (TypeError thrown by fetch on connection failure). Status
 * codes 500, 502, and 504 are excluded — those are retryable only when the
 * request is idempotent, a decision owned by the retry interceptor.
 *
 * @param {Error} err - Error to classify.
 * @returns {boolean} - Whether the error is unconditionally retryable.
 */
export function isRetryable(err) {
  if (err instanceof ProblemDetailsError) {
    return RETRYABLE_STATUSES.has(err.status);
  }
  return err instanceof TypeError;
}

/**
 * Determines whether an error represents a validation failure.
 *
 * A validation error is a ProblemDetailsError with status 400 or 422.
 *
 * @param {Error} err - Error to classify.
 * @returns {boolean} - Whether the error is a validation error.
 */
export function isValidation(err) {
  if (err instanceof ProblemDetailsError) {
    return VALIDATION_STATUSES.has(err.status);
  }
  return false;
}

/**
 * Determines whether an error represents an authentication or authorization failure.
 *
 * An auth error is a ProblemDetailsError with status 401 or 403.
 *
 * @param {Error} err - Error to classify.
 * @returns {boolean} - Whether the error is an auth error.
 */
export function isAuth(err) {
  if (err instanceof ProblemDetailsError) {
    return AUTH_STATUSES.has(err.status);
  }
  return false;
}
