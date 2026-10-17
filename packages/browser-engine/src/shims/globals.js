// esbuild `inject` file: free references to these Node globals inside the
// bundled engine resolve to the browser shims below.
import { Buffer } from './buffer.js';
import { process } from './process.js';

// diagnostics.mjs and atomic-output.mjs allocate an Int32Array over a
// SharedArrayBuffer at module scope (for Atomics.wait in CLI pipe handling).
// SharedArrayBuffer only exists in cross-origin-isolated pages; a plain
// ArrayBuffer keeps module initialisation working and Atomics.wait is never
// reached in the browser.
const SharedArrayBufferShim = ArrayBuffer;

const globalShim = globalThis;

export { Buffer, process, SharedArrayBufferShim as SharedArrayBuffer, globalShim as global };
