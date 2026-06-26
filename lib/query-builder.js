/**
 * @fileoverview Immutable JSON:API query parameter builder with structural validation.
 * @module @centralping/ergo-fetch/lib/query-builder
 */

/** @type {symbol} */
const QUERY_BUILDER_SYMBOL = Symbol.for('ergo-fetch:query-builder');

/**
 * @typedef {object} QueryBuilder
 * @property {string} [path] - Base path for the query.
 * @property {boolean} [Symbol.for('ergo-fetch:query-builder')] - Duck-typing marker.
 * @property {(type: string, fieldNames: string[]) => Readonly<QueryBuilder>} fields -
 *   Sets sparse fieldsets for a resource type. Returns a new builder.
 * @property {(paths: string[]) => Readonly<QueryBuilder>} include -
 *   Sets relationship paths to include. Returns a new builder.
 * @property {(criteria: object) => Readonly<QueryBuilder>} filter -
 *   Merges filter criteria. Returns a new builder.
 * @property {(fields: string[]) => Readonly<QueryBuilder>} sort -
 *   Sets sort fields (prefix with - for descending). Returns a new builder.
 * @property {(params: object) => Readonly<QueryBuilder>} page -
 *   Sets pagination parameters. Returns a new builder.
 * @property {(key: string, value: string | number | boolean) => Readonly<QueryBuilder>} param -
 *   Adds a custom query parameter. Returns a new builder.
 * @property {() => string} toString - Serializes to a URL query string (no leading ?).
 * @property {(client: object) => Promise<*>} fetch - Executes the query via a client's get method.
 */

/**
 * Known page parameter keys grouped by pagination strategy. Keys from
 * different groups cannot appear in a single `.page()` call.
 *
 * @type {ReadonlyArray<ReadonlyArray<string>>}
 */
const PAGE_STRATEGY_GROUPS = Object.freeze([
  Object.freeze(['number', 'size']),
  Object.freeze(['offset', 'limit']),
  Object.freeze(['cursor'])
]);

/**
 * Checks whether a parameter name is in the JSON:API reserved namespace.
 *
 * Per the JSON:API specification, parameter names consisting entirely of
 * lowercase ASCII letters (a-z) are reserved for the specification itself.
 * Custom parameters must contain at least one character that is not a
 * lowercase ASCII letter.
 *
 * @param {string} name - Parameter name.
 * @returns {boolean} - Whether the name falls in the reserved namespace.
 */
function isReservedParam(name) {
  if (name.length === 0) return false;

  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code < 0x61 || code > 0x7a) return false;
  }

  return true;
}

/**
 * Validates that a value is a scalar suitable for query string serialization.
 *
 * @param {*} value - Value to validate.
 * @param {string} context - Description for the error message.
 * @throws {TypeError} When value is not a string, finite number, or boolean.
 */
function assertScalar(value, context) {
  const type = typeof value;

  if (type !== 'string' && type !== 'number' && type !== 'boolean') {
    throw new TypeError(`${context} must be a string, number, or boolean`);
  }

  if (type === 'number' && !Number.isFinite(value)) {
    throw new TypeError(`${context} must be a finite number`);
  }
}

/**
 * Validates that page parameters do not mix pagination strategies.
 *
 * Strategy groups are: {number, size}, {offset, limit}, and {cursor}.
 * Keys not belonging to any group are accepted without restriction.
 *
 * @param {object} params - Page parameters.
 * @throws {TypeError} When keys from two or more strategy groups are present.
 */
function validatePageStrategy(params) {
  const keys = Object.keys(params);
  const matched = [];

  for (const group of PAGE_STRATEGY_GROUPS) {
    if (keys.some(k => group.includes(k))) {
      matched.push(group);
    }
  }

  if (matched.length > 1) {
    throw new TypeError(
      'page() mixes pagination strategies; use {number, size}, {offset, limit}, or {cursor}'
    );
  }
}

/**
 * Creates a deep-enough clone of builder state using null-prototype objects.
 *
 * @param {object} source - Source state.
 * @returns {object} - Independent clone of the state.
 */
function cloneState(source) {
  const state = Object.create(null);
  state.basePath = source.basePath;

  state.fieldSets = Object.create(null);
  for (const type of Object.keys(source.fieldSets)) {
    state.fieldSets[type] = [...source.fieldSets[type]];
  }

  state.includes = source.includes ? [...source.includes] : undefined;

  state.filters = Object.create(null);
  for (const key of Object.keys(source.filters)) {
    state.filters[key] = source.filters[key];
  }

  state.sorts = source.sorts ? [...source.sorts] : undefined;

  state.pageParams = source.pageParams
    ? Object.assign(Object.create(null), source.pageParams)
    : undefined;

  state.customParams = Object.create(null);
  for (const key of Object.keys(source.customParams)) {
    state.customParams[key] = source.customParams[key];
  }

  return state;
}

/**
 * Serializes builder state to a URL query string.
 *
 * Produces JSON:API-compliant parameters with bracket notation for nested
 * keys (`fields[type]`, `filter[key]`, `page[key]`) and comma separation
 * for array values. Individual values are URI-encoded; brackets and commas
 * in the structural format are left literal.
 *
 * @param {object} state - Builder state.
 * @returns {string} - Query string without leading `?`, or empty string.
 */
function serialize(state) {
  const parts = [];

  for (const type of Object.keys(state.fieldSets)) {
    const encoded = state.fieldSets[type].map(encodeURIComponent).join(',');
    parts.push(`fields[${encodeURIComponent(type)}]=${encoded}`);
  }

  if (state.includes) {
    parts.push(`include=${state.includes.map(encodeURIComponent).join(',')}`);
  }

  for (const key of Object.keys(state.filters)) {
    parts.push(
      `filter[${encodeURIComponent(key)}]=${encodeURIComponent(String(state.filters[key]))}`
    );
  }

  if (state.sorts) {
    parts.push(`sort=${state.sorts.map(encodeURIComponent).join(',')}`);
  }

  if (state.pageParams) {
    for (const key of Object.keys(state.pageParams)) {
      parts.push(
        `page[${encodeURIComponent(key)}]=${encodeURIComponent(String(state.pageParams[key]))}`
      );
    }
  }

  for (const key of Object.keys(state.customParams)) {
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(state.customParams[key]))}`);
  }

  return parts.join('&');
}

/**
 * Creates a frozen builder instance from internal state.
 *
 * @param {object} state - Builder state (not modified; cloned on mutation).
 * @returns {Readonly<QueryBuilder>} - Frozen immutable query builder.
 */
function createBuilderFromState(state) {
  const builder = Object.create(null);

  builder[QUERY_BUILDER_SYMBOL] = true;
  builder.path = state.basePath;

  /**
   * Sets sparse fieldsets for a JSON:API resource type.
   *
   * @param {string} type - Resource type name.
   * @param {string[]} fieldNames - Field names to include.
   * @returns {Readonly<QueryBuilder>} - New builder with the fieldset applied.
   * @throws {TypeError} When type is not a non-empty string.
   * @throws {TypeError} When fieldNames is not a non-empty array of non-empty strings.
   */
  builder.fields = function fields(type, fieldNames) {
    if (typeof type !== 'string' || type.length === 0) {
      throw new TypeError('fields() type must be a non-empty string');
    }

    if (!Array.isArray(fieldNames)) {
      throw new TypeError('fields() fieldNames must be an array');
    }

    if (fieldNames.length === 0) {
      throw new TypeError('fields() fieldNames must not be empty');
    }

    for (let i = 0; i < fieldNames.length; i++) {
      if (typeof fieldNames[i] !== 'string' || fieldNames[i].length === 0) {
        throw new TypeError(`fields() fieldNames[${i}] must be a non-empty string`);
      }
    }

    const next = cloneState(state);
    next.fieldSets[type] = [...fieldNames];
    return createBuilderFromState(next);
  };

  /**
   * Sets relationship paths to include.
   *
   * @param {string[]} paths - Dot-notation relationship paths.
   * @returns {Readonly<QueryBuilder>} - New builder with includes set.
   * @throws {TypeError} When paths is not a non-empty array of non-empty strings.
   */
  builder.include = function include(paths) {
    if (!Array.isArray(paths)) {
      throw new TypeError('include() paths must be an array');
    }

    if (paths.length === 0) {
      throw new TypeError('include() paths must not be empty');
    }

    for (let i = 0; i < paths.length; i++) {
      if (typeof paths[i] !== 'string' || paths[i].length === 0) {
        throw new TypeError(`include() paths[${i}] must be a non-empty string`);
      }
    }

    const next = cloneState(state);
    next.includes = [...paths];
    return createBuilderFromState(next);
  };

  /**
   * Merges filter criteria into the builder.
   *
   * Criteria values must be scalars (string, number, or boolean). Each call
   * merges into existing filters; for the same key the new value overwrites.
   *
   * @param {object} criteria - Filter key-value pairs.
   * @returns {Readonly<QueryBuilder>} - New builder with filters merged.
   * @throws {TypeError} When criteria is not a non-null, non-array object.
   * @throws {TypeError} When criteria is empty.
   * @throws {TypeError} When any value is not a string, number, or boolean.
   */
  builder.filter = function filter(criteria) {
    if (criteria == null || typeof criteria !== 'object' || Array.isArray(criteria)) {
      throw new TypeError('filter() criteria must be a non-null object');
    }

    const entries = Object.entries(criteria);

    if (entries.length === 0) {
      throw new TypeError('filter() criteria must not be empty');
    }

    for (const [key, value] of entries) {
      if (key.length === 0) {
        throw new TypeError('filter() criteria keys must be non-empty strings');
      }
      assertScalar(value, `filter() criteria['${key}']`);
    }

    const next = cloneState(state);
    for (const [key, value] of entries) {
      next.filters[key] = value;
    }
    return createBuilderFromState(next);
  };

  /**
   * Sets sort fields.
   *
   * Prefix a field name with `-` for descending order (e.g., `'-createdAt'`).
   *
   * @param {string[]} fields - Sort field names.
   * @returns {Readonly<QueryBuilder>} - New builder with sorts set.
   * @throws {TypeError} When fields is not a non-empty array of non-empty strings.
   */
  builder.sort = function sort(fields) {
    if (!Array.isArray(fields)) {
      throw new TypeError('sort() fields must be an array');
    }

    if (fields.length === 0) {
      throw new TypeError('sort() fields must not be empty');
    }

    for (let i = 0; i < fields.length; i++) {
      if (typeof fields[i] !== 'string' || fields[i].length === 0) {
        throw new TypeError(`sort() fields[${i}] must be a non-empty string`);
      }
    }

    const next = cloneState(state);
    next.sorts = [...fields];
    return createBuilderFromState(next);
  };

  /**
   * Sets pagination parameters.
   *
   * Three strategies are supported and must not be mixed in a single call:
   * - `{number, size}` — page-number strategy
   * - `{offset, limit}` — offset/limit strategy
   * - `{cursor}` — cursor strategy
   *
   * Each call replaces the previous pagination parameters entirely.
   *
   * @param {object} params - Pagination key-value pairs.
   * @returns {Readonly<QueryBuilder>} - New builder with page params set.
   * @throws {TypeError} When params is not a non-null, non-array object.
   * @throws {TypeError} When params is empty.
   * @throws {TypeError} When params mixes pagination strategies.
   * @throws {TypeError} When any value is not a string, number, or boolean.
   */
  builder.page = function page(params) {
    if (params == null || typeof params !== 'object' || Array.isArray(params)) {
      throw new TypeError('page() params must be a non-null object');
    }

    const entries = Object.entries(params);

    if (entries.length === 0) {
      throw new TypeError('page() params must not be empty');
    }

    for (const [key, value] of entries) {
      if (key.length === 0) {
        throw new TypeError('page() params keys must be non-empty strings');
      }
      assertScalar(value, `page() params['${key}']`);
    }

    validatePageStrategy(params);

    const next = cloneState(state);
    next.pageParams = Object.create(null);
    for (const [key, value] of entries) {
      next.pageParams[key] = value;
    }
    return createBuilderFromState(next);
  };

  /**
   * Adds a custom query parameter.
   *
   * Per JSON:API, parameter names consisting entirely of lowercase ASCII
   * letters (a-z) are reserved. Custom parameters must contain at least
   * one character outside that range.
   *
   * @param {string} key - Parameter name (must not be all-lowercase letters).
   * @param {string | number | boolean} value - Parameter value.
   * @returns {Readonly<QueryBuilder>} - New builder with the custom parameter.
   * @throws {TypeError} When key is not a non-empty string.
   * @throws {TypeError} When key is in the JSON:API reserved namespace.
   * @throws {TypeError} When value is not a string, number, or boolean.
   */
  builder.param = function param(key, value) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('param() key must be a non-empty string');
    }

    if (isReservedParam(key)) {
      throw new TypeError(
        `param() key '${key}' uses the JSON:API reserved namespace (all-lowercase letters); ` +
          'custom parameters must contain at least one non-lowercase-letter character'
      );
    }

    assertScalar(value, 'param() value');

    const next = cloneState(state);
    next.customParams[key] = value;
    return createBuilderFromState(next);
  };

  /**
   * Serializes the builder state to a URL query string.
   *
   * @returns {string} - Query string without leading `?`, or empty string.
   */
  builder.toString = function toString() {
    return serialize(state);
  };

  /**
   * Executes the query via a client's `get` method.
   *
   * Requires a base path to have been set via `createQueryBuilder(path)`.
   *
   * @param {object} client - Client with a `get(path, options?)` method.
   * @returns {Promise<*>} - The client response.
   * @throws {TypeError} When client is not a non-null object with a get method.
   * @throws {TypeError} When no base path was provided to createQueryBuilder().
   */
  builder.fetch = function fetch(client) {
    if (client == null || typeof client !== 'object') {
      throw new TypeError('fetch() client must be a non-null object');
    }

    if (typeof client.get !== 'function') {
      throw new TypeError('fetch() client.get must be a function');
    }

    if (state.basePath == null) {
      throw new TypeError('fetch() requires a base path; pass one to createQueryBuilder()');
    }

    const qs = serialize(state);
    const fullPath = qs ? `${state.basePath}?${qs}` : state.basePath;
    return client.get(fullPath);
  };

  return Object.freeze(builder);
}

/**
 * Creates an immutable JSON:API query parameter builder.
 *
 * Each builder method returns a new builder instance with the modification
 * applied, leaving the original unchanged (persistent data structure). The
 * builder validates inputs structurally at build time, throwing `TypeError`
 * for invalid arguments.
 *
 * Serialization produces URL query strings using JSON:API bracket notation
 * for nested keys (`fields[type]=...`, `filter[key]=...`, `page[key]=...`)
 * and comma separation for array values.
 *
 * The returned builder carries a `Symbol.for('ergo-fetch:query-builder')`
 * property set to `true` for duck-type detection by other modules.
 *
 * @param {string} [basePath] - Base path for the query (must be an absolute path
 *   starting with `/`, without backslashes, protocol-relative prefix, query, or fragment).
 * @returns {Readonly<QueryBuilder>} - Frozen immutable query builder.
 * @throws {TypeError} When basePath is provided but is not a valid absolute path.
 */
export function createQueryBuilder(basePath) {
  if (basePath !== undefined) {
    if (typeof basePath !== 'string') {
      throw new TypeError('basePath must be a string');
    }

    if (
      !basePath.startsWith('/') ||
      basePath.startsWith('//') ||
      basePath.includes('\\') ||
      basePath.includes('?') ||
      basePath.includes('#')
    ) {
      throw new TypeError(
        'basePath must be an absolute path without backslashes, protocol-relative prefix, query, or fragment'
      );
    }
  }

  const state = Object.create(null);
  state.basePath = basePath;
  state.fieldSets = Object.create(null);
  state.includes = undefined;
  state.filters = Object.create(null);
  state.sorts = undefined;
  state.pageParams = undefined;
  state.customParams = Object.create(null);

  return createBuilderFromState(state);
}

/**
 * Tests whether a value is a QueryBuilder instance.
 *
 * Uses the `Symbol.for('ergo-fetch:query-builder')` duck-typing marker
 * rather than `instanceof`, enabling detection across module boundaries
 * and different package versions.
 *
 * @param {*} value - Value to test.
 * @returns {boolean} - Whether the value is a query builder.
 */
export function isQueryBuilder(value) {
  return value != null && typeof value === 'object' && value[QUERY_BUILDER_SYMBOL] === true;
}
