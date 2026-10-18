// @vca/browser-engine client: render vc-archify IR in the browser.
//
// The build (scripts/build.mjs) writes code-split ESM renderer bundles, a
// worker runtime, the HTML template and the locale catalogs to
// apps/web/public/engine/ and lists them in manifest.json.
//
// Per session the client fetches the manifest, the template and the modules a
// diagram type needs once, then serves them to workers from Blob URLs (chunk
// import specifiers rewritten to those Blob URLs), so later renders need no
// network. Every render runs in a brand-new module Worker: the renderers are
// CLI scripts whose top-level code is the render, and a fresh realm gives
// every module fresh state. The worker is terminated afterwards, on timeout,
// or when the caller aborts.
//
// Output is byte-identical to `renderDiagram(ir).html` from @vca/render: the
// IR is prepared exactly like the Node API does (meta.output = "out.html",
// pretty-printed JSON) and the engine runs with the same environment.

export const DIAGRAM_TYPES = Object.freeze([
  'architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle', 'erd',
  'class', 'tree', 'timeline', 'waterfall',
]);

export const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_BASE_URL = '/engine/';
const states = new Map();

function abortError() {
  return new DOMException('The render was aborted.', 'AbortError');
}

function resolveBase(baseUrl = DEFAULT_BASE_URL) {
  const href = new URL(baseUrl, globalThis.location?.href).href;
  return href.endsWith('/') ? href : `${href}/`;
}

async function fetchText(url, init) {
  const response = await fetch(url, { credentials: 'same-origin', ...init });
  if (!response.ok) throw new Error(`GET ${url} failed with HTTP ${response.status}`);
  return response.text();
}

function cached(map, key, factory) {
  if (!map.has(key)) {
    const promise = factory();
    map.set(key, promise);
    promise.catch(() => map.delete(key));
  }
  return map.get(key);
}

function engineState(baseUrl) {
  const base = resolveBase(baseUrl);
  return cached(states, base, async () => {
    const manifest = JSON.parse(await fetchText(new URL('manifest.json', base), { cache: 'no-cache' }));
    if (manifest?.schema !== 1) throw new Error('Unsupported engine manifest.');
    return { base, manifest, texts: new Map(), urls: new Map() };
  });
}

const text = (state, file) => cached(state.texts, file, () => fetchText(new URL(file, state.base)));

const blobUrl = (code) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));

// Blob URL for one ESM output whose static imports point at the Blob URLs of
// its dependencies. The build verifies the chunk graph is acyclic and that
// every import specifier appears verbatim as "./<file>".
function moduleUrl(state, file) {
  return cached(state.urls, file, async () => {
    const info = state.manifest.modules[file];
    if (!info) throw new Error(`Engine module ${file} is not in the manifest.`);
    const [code, deps] = await Promise.all([
      text(state, file),
      Promise.all(info.imports.map((dep) => moduleUrl(state, dep))),
    ]);
    let linked = code;
    info.imports.forEach((dep, index) => {
      linked = linked.split(JSON.stringify(`./${dep}`)).join(JSON.stringify(deps[index]));
    });
    return blobUrl(linked);
  });
}

const workerUrl = (state) => cached(state.urls, '#worker', async () => blobUrl(await text(state, state.manifest.worker)));

/** Virtual files (locale data) a diagram needs: the catalog manifest, English, and meta.locale if bundled. */
function wantedFiles(state, ir) {
  const { locales, files } = state.manifest;
  const wanted = new Set([locales.manifest, locales.catalogs.en]);
  const locale = typeof ir?.meta?.locale === 'string' ? ir.meta.locale.toLowerCase() : null;
  if (locale && locales.catalogs[locale]) wanted.add(locales.catalogs[locale]);
  return [...wanted].filter((path) => files[path]);
}

async function loadFiles(state, paths) {
  const entries = await Promise.all(paths.map(async (path) => [path, await text(state, state.manifest.files[path])]));
  return Object.fromEntries(entries);
}

/**
 * Fetch the manifest, template and worker (and a type's modules) ahead of the
 * first render. Safe to call repeatedly; failures are retried on next call.
 */
export async function preloadEngine({ type, baseUrl } = {}) {
  const state = await engineState(baseUrl);
  const jobs = [text(state, state.manifest.template), workerUrl(state)];
  if (type && state.manifest.entries[type]) jobs.push(moduleUrl(state, state.manifest.entries[type]));
  await Promise.all(jobs);
  return { engine: state.manifest.engine };
}

/** Engine version info from the build manifest. */
export async function engineInfo({ baseUrl } = {}) {
  const state = await engineState(baseUrl);
  return { ...state.manifest.engine };
}

function runWorker(url, job, { timeoutMs, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    let worker;
    try {
      worker = new Worker(url, { type: 'module', name: 'vc-archify-render' });
    } catch (error) {
      resolve({ ok: false, error: { code: 'engine/worker-start', message: `The render worker could not start: ${error?.message || error}` } });
      return;
    }
    let settled = false;
    const finish = (settle, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      settle(value);
    };
    const onAbort = () => finish(reject, abortError());
    const timer = setTimeout(() => finish(resolve, { ok: false, timedOut: true }), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    worker.onmessage = (event) => finish(resolve, event.data);
    worker.onmessageerror = () => finish(resolve, { ok: false, error: { code: 'engine/worker-message', message: 'The render worker returned an unreadable result.' } });
    worker.onerror = (event) => {
      event.preventDefault?.();
      finish(resolve, { ok: false, error: { code: 'engine/worker-error', message: event.message || 'The render worker failed.' } });
    };
    worker.postMessage(job);
  });
}

const POINTER = /^(\/[^\s(]*)/;

function toDiagnostic(entry) {
  const message = String(entry?.message ?? '').trim() || 'The engine reported a problem without a message.';
  const subjectPath = typeof entry?.subject?.path === 'string' ? entry.subject.path : undefined;
  const path = subjectPath ?? POINTER.exec(message)?.[1];
  const fixes = Array.isArray(entry?.supportedFixes)
    ? entry.supportedFixes.map((fix) => String(fix).trim()).filter(Boolean)
    : Array.isArray(entry?.fixes) ? entry.fixes.map(String) : [];
  return {
    ...(entry?.code ? { code: String(entry.code) } : {}),
    severity: entry?.severity === 'warning' ? 'warning' : 'error',
    message,
    ...(path ? { path } : {}),
    fixes,
  };
}

function failure(diagnostics, extra = {}) {
  return { ok: false, diagnostics: diagnostics.map(toDiagnostic), ...extra };
}

function lineColumn(textValue, offset) {
  const before = textValue.slice(0, Math.max(0, Math.min(offset, textValue.length)));
  const lines = before.split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

function parseInput(ir) {
  if (typeof ir !== 'string') return { ok: true, value: ir };
  try {
    return { ok: true, value: JSON.parse(ir) };
  } catch (error) {
    const message = `Input JSON could not be parsed: ${error.message}`;
    // Chromium's V8 reports the failing offset as "position N".
    const position = /position (\d+)/.exec(error.message);
    const where = position ? lineColumn(ir, Number(position[1])) : {};
    return {
      ok: false,
      result: {
        ok: false,
        diagnostics: [{ code: 'input/json-parse', severity: 'error', message, fixes: ['repair the JSON syntax and render again'], ...where }],
      },
    };
  }
}

const utf8Length = (value) => new TextEncoder().encode(value).byteLength;

/**
 * Render one IR (an object, or JSON text) to a self-contained HTML artifact.
 * Resolves to { ok: true, html, ... } or { ok: false, diagnostics }. Rejects
 * only with an AbortError when `signal` aborts.
 */
export async function renderInBrowser(ir, { signal, timeoutMs = DEFAULT_TIMEOUT_MS, baseUrl } = {}) {
  const started = performance.now();
  const parsed = parseInput(ir);
  if (!parsed.ok) return parsed.result;
  const value = parsed.value;
  const type = value?.diagram_type;
  if (!DIAGRAM_TYPES.includes(type)) {
    return failure([{
      code: 'input/diagram-type',
      message: `Unknown or missing diagram_type ${JSON.stringify(type)}. Expected one of: ${DIAGRAM_TYPES.join(', ')}.`,
      subject: { path: '/diagram_type' },
      supportedFixes: ['set "diagram_type" to one of the supported diagram types'],
    }]);
  }

  // Same candidate @vca/render writes for the CLI (see packages/render/src/index.mjs).
  const candidate = { ...value, meta: { ...(value.meta ?? {}), output: 'out.html' } };
  const input = `${JSON.stringify(candidate, null, 2)}\n`;

  let state;
  let template;
  let worker;
  let entry;
  let files;
  try {
    state = await engineState(baseUrl);
    [template, worker, entry, files] = await Promise.all([
      text(state, state.manifest.template),
      workerUrl(state),
      moduleUrl(state, state.manifest.entries[type]),
      loadFiles(state, wantedFiles(state, value)),
    ]);
  } catch (error) {
    return failure([{
      code: 'engine/load-failed',
      message: `The in-browser engine could not be loaded: ${error?.message || error}`,
      supportedFixes: ['check your connection and render again'],
    }]);
  }
  if (signal?.aborted) throw abortError();

  const job = { entryUrl: entry, input, template, files, argv: ['node', `/vc-archify/renderers/${type}/render-${type}.mjs`] };
  let reply = await runWorker(worker, job, { timeoutMs, signal });
  // The virtual filesystem reports reads it could not serve; supply any that
  // the build shipped (e.g. a catalog selected indirectly) and retry once.
  const extra = (reply.missingFiles || []).filter((path) => state.manifest.files[path] && !(path in files));
  if (!reply.ok && extra.length) {
    files = { ...files, ...(await loadFiles(state, extra)) };
    reply = await runWorker(worker, { ...job, files }, { timeoutMs, signal });
  }

  const ms = Math.round(performance.now() - started);
  const warnings = Array.isArray(reply.warnings) ? reply.warnings : [];
  if (reply.ok) return { ok: true, type, html: reply.html, bytes: utf8Length(reply.html), warnings, ms };
  if (reply.timedOut) {
    return failure([{
      code: 'engine/timeout',
      message: `Rendering did not finish within ${timeoutMs < 1000 ? `${timeoutMs} ms` : `${Math.round(timeoutMs / 1000)} s`} and was stopped.`,
      supportedFixes: ['reduce the number of nodes or edges', 'check for very long labels', 'render again'],
    }], { warnings, ms });
  }
  const error = reply.error || {};
  if (Array.isArray(error.diagnostics) && error.diagnostics.length) return failure(error.diagnostics, { warnings, ms });
  return failure([{
    code: error.code === 'ERR_VCA_BROWSER_UNSUPPORTED' ? 'engine/browser-unsupported' : (error.code?.includes('/') ? error.code : 'internal/unclassified'),
    message: error.message || 'The renderer failed without a diagnostic.',
    supportedFixes: error.code === 'ERR_VCA_BROWSER_UNSUPPORTED'
      ? ['render this diagram with the vc-archify CLI instead']
      : [],
  }], { warnings, ms });
}
