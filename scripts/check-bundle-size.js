/**
 * @fileoverview Verifies Phase 2 minified+gzip bundle size stays within PLAN-PHASE-2 budget.
 *
 * Bundles `index.js` with esbuild (minify, ESM) and measures gzip output. Baseline is
 * the Phase 1 (0.1.0-beta.1) measurement using the same method.
 *
 * @module scripts/check-bundle-size
 */

/* eslint-disable no-console */

import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';

import * as esbuild from 'esbuild';

/** Phase 1 (0.1.0-beta.1) minified+gzip bundle size in bytes. */
const PHASE1_MIN_GZIP_BYTES = 4841;

/** Maximum allowed increase over Phase 1 per PLAN-PHASE-2 (5 KiB). */
const MAX_DELTA_BYTES = 5 * 1024;

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const ENTRY = join(ROOT, 'index.js');

const result = await esbuild.build({
  entryPoints: [ENTRY],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'neutral',
  write: false
});

const minified = result.outputFiles[0].text;
const gzipBytes = gzipSync(minified).length;
const delta = gzipBytes - PHASE1_MIN_GZIP_BYTES;

console.log(`Phase 1 min+gzip baseline: ${PHASE1_MIN_GZIP_BYTES} bytes`);
console.log(`Phase 2 min+gzip size:     ${gzipBytes} bytes`);
console.log(`Delta:                   ${delta} bytes (max ${MAX_DELTA_BYTES})`);

if (delta > MAX_DELTA_BYTES) {
  console.error(
    `Bundle size regression: Phase 2 exceeds Phase 1 by ${delta} bytes (limit ${MAX_DELTA_BYTES})`
  );
  process.exit(1);
}
