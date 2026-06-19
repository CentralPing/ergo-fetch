/**
 * @fileoverview Start/stop helpers for contract test servers using node:test lifecycle hooks.
 * @module test/helpers/setup-server
 */

import http from 'node:http';

/**
 * Starts an HTTP server on an ephemeral port and returns the base URL and a close function.
 *
 * @param {function} handler - Node.js HTTP request handler (req, res) => void.
 * @returns {Promise<{baseUrl: string, close: () => Promise<void>}>} - Server access object.
 */
export function startServer(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);

    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address();

      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close() {
          server.closeAllConnections();
          return new Promise(res => server.close(res));
        }
      });
    });

    server.once('error', reject);
  });
}
