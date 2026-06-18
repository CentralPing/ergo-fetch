/**
 * @fileoverview Core fetch client with interceptor pipeline.
 * @module @centralping/ergo-fetch/lib/client
 */

/**
 * @param {object} config - Client configuration.
 * @param {string} config.baseUrl - Base URL for all requests.
 * @returns {object} - Client instance with HTTP method helpers.
 */
export function createClient(config) {
  if (!config?.baseUrl) {
    throw new TypeError('createClient requires a baseUrl');
  }

  new URL(config.baseUrl); // fail-fast: validate URL

  const client = Object.create(null);

  client.get = (path, options) => request('GET', path, options);
  client.post = (path, options) => request('POST', path, options);
  client.put = (path, options) => request('PUT', path, options);
  client.patch = (path, options) => request('PATCH', path, options);
  client.delete = (path, options) => request('DELETE', path, options);
  client.head = (path, options) => request('HEAD', path, options);
  client.request = request;

  function request(_method, _path, _options) {
    throw new Error('Not yet implemented');
  }

  return Object.freeze(client);
}
