// Per-render configuration that the worker runtime (src/worker.js) installs on
// globalThis before it imports a renderer entry. Every shim reads it lazily so
// a fresh worker realm always sees the job it was created for.

export function engineEnv() {
  return globalThis.__VCA_ENV__ || {};
}

export function unavailable(api, detail = '') {
  const error = new Error(
    `vc-archify browser engine: ${api} is not available in the browser${detail ? ` (${detail})` : ''}.`,
  );
  error.code = 'ERR_VCA_BROWSER_UNSUPPORTED';
  return error;
}
