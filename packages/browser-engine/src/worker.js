// vc-archify browser engine: render worker.
//
// One worker renders exactly one diagram and is then terminated by the client.
// A fresh worker is a fresh JavaScript realm, so every engine module (whose
// top-level code *is* the render) evaluates again with clean module state.
//
// Protocol (postMessage):
//   in : { entryUrl, input, template, files, argv }
//   out: { ok: true, html, warnings, ms } | { ok: false, error, missingFiles, warnings, ms }

function serializeError(error) {
  const diagnostics = Array.isArray(error?.archifyDiagnostics)
    ? JSON.parse(JSON.stringify(error.archifyDiagnostics))
    : null;
  return {
    name: String(error?.name || 'Error'),
    message: String(error?.message || error || 'Renderer failed without a message.'),
    code: typeof error?.code === 'string' ? error.code : undefined,
    stack: typeof error?.stack === 'string' ? error.stack.split('\n').slice(0, 12).join('\n') : undefined,
    diagnostics,
  };
}

self.onmessage = async (event) => {
  const { entryUrl, input, template, files, argv } = event.data || {};
  const started = performance.now();
  const warnings = [];
  const misses = [];
  const log = (stream, text) => {
    const line = String(text).trim();
    if (line && stream !== 'stdout') warnings.push(line);
  };
  for (const level of ['warn', 'error']) {
    console[level] = (...args) => log(level, args.map((value) => (typeof value === 'string' ? value : String(value))).join(' '));
  }
  console.log = () => {};
  console.info = () => {};

  let html = null;
  globalThis.__VCA_ENV__ = { argv, files: files || {}, misses, log };
  globalThis.__VCA_IO__ = {
    input,
    template,
    write(output) {
      html = String(output);
    },
  };

  try {
    await import(entryUrl);
    if (html === null) throw new Error('The renderer finished without producing HTML.');
    self.postMessage({ ok: true, html, warnings, ms: performance.now() - started });
  } catch (error) {
    self.postMessage({ ok: false, error: serializeError(error), missingFiles: [...new Set(misses)], warnings, ms: performance.now() - started });
  }
};

// Errors that escape the module graph asynchronously (never expected) still
// produce one structured reply instead of a silent hang.
self.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  self.postMessage({ ok: false, error: serializeError(event.reason), missingFiles: [], warnings: [], ms: 0 });
});
