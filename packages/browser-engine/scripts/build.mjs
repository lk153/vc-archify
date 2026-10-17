#!/usr/bin/env node
// Build the in-browser vc-archify engine into apps/web/public/engine/.
//
//   render-<type>-<hash>.js  per-type ESM entries (the vendored CLI renderers)
//   chunk-<hash>.js          shared ESM chunks (esbuild code splitting)
//   worker-<hash>.js         Web Worker runtime (src/worker.js)
//   template-<hash>.txt      skills/vc-archify/assets/template.html
//   locales/*.json           locale manifest + catalogs for the virtual FS
//   manifest.json            the only stable name; read by src/client.js
//
// Node built-ins resolve to src/shims/* (or to stubs that throw a clear error
// when called), `process`/`Buffer`/`SharedArrayBuffer` are injected globals,
// and every `import.meta.url` becomes a virtual file:///vc-archify/... URL so
// the engine's relative data lookups land in the virtual filesystem.
//
// Usage: node scripts/build.mjs [--out <dir>] [--quiet] [--sizes]
//   --sizes  also report brotli (quality 11) sizes; slower

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import * as esbuild from 'esbuild';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(PKG, '..', '..');
const SKILL = path.join(ROOT, 'skills', 'vc-archify');
const SHIMS = path.join(PKG, 'src', 'shims');
const VIRTUAL_ROOT = '/vc-archify';

const args = process.argv.slice(2);
const outArg = args.indexOf('--out');
const OUT = path.resolve(outArg === -1 ? path.join(ROOT, 'apps', 'web', 'public', 'engine') : args[outArg + 1]);
const quiet = args.includes('--quiet');
const withBrotli = args.includes('--sizes');

const DIAGRAM_TYPES = [
  'architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle', 'erd',
  'class', 'tree', 'timeline', 'waterfall',
];

const fail = (message) => {
  console.error(`browser-engine build: ${message}`);
  process.exit(1);
};

// --- Node built-ins -----------------------------------------------------------
const SHIMMED = {
  fs: 'fs.js',
  path: 'path.js',
  url: 'url.js',
  crypto: 'crypto.js',
  os: 'os.js',
  process: 'process.js',
  buffer: 'buffer.js',
};
// Imported by code paths the browser never reaches (repository evidence via
// git, remote brand capture, temp directories). Named exports must cover what
// the engine imports; esbuild fails the build loudly if one is missing.
const UNAVAILABLE = {
  child_process: ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'],
  http: ['request', 'get', 'Agent', 'createServer'],
  https: ['request', 'get', 'Agent', 'createServer'],
  net: ['isIP', 'isIPv4', 'isIPv6', 'connect', 'createConnection', 'Socket'],
  dns: ['lookup', 'resolve', 'promises'],
  'dns/promises': ['lookup', 'resolve'],
  'timers/promises': ['setTimeout', 'setImmediate', 'setInterval'],
  'fs/promises': ['readFile', 'writeFile', 'mkdir', 'mkdtemp', 'rm', 'stat', 'lstat', 'open', 'readdir', 'rename', 'unlink', 'realpath', 'access', 'copyFile'],
  module: ['createRequire'],
  worker_threads: ['Worker', 'isMainThread', 'parentPort'],
};

const builtinFilter = new RegExp(`^(node:)?(${[...Object.keys(SHIMMED), ...Object.keys(UNAVAILABLE)].map((n) => n.replace('/', '\\/')).join('|')})$`);

const nodeBuiltins = {
  name: 'vca-node-builtins',
  setup(build) {
    build.onResolve({ filter: builtinFilter }, ({ path: spec }) => {
      const name = spec.replace(/^node:/, '');
      if (SHIMMED[name]) return { path: path.join(SHIMS, SHIMMED[name]) };
      return { path: name, namespace: 'vca-unavailable' };
    });
    build.onResolve({ filter: /^node:/ }, ({ path: spec, importer }) => ({
      errors: [{ text: `Unsupported Node built-in ${spec} imported by ${path.relative(ROOT, importer)}; add a shim in packages/browser-engine/src/shims.` }],
    }));
    build.onLoad({ filter: /.*/, namespace: 'vca-unavailable' }, ({ path: name }) => ({
      resolveDir: SHIMS,
      loader: 'js',
      contents: [
        "import { unavailable } from './env.js';",
        `const fail = (member) => () => { throw unavailable(${JSON.stringify(`node:${name}`)} + '.' + member + '()'); };`,
        ...UNAVAILABLE[name].map((member) => `export const ${member} = fail(${JSON.stringify(member)});`),
        "export default new Proxy({}, { get: (_target, member) => (typeof member === 'string' ? fail(member) : undefined) });",
      ].join('\n'),
    }));
  },
};

// --- import.meta.url → virtual file URL --------------------------------------
const importMetaUrl = {
  name: 'vca-import-meta-url',
  setup(build) {
    build.onLoad({ filter: /\.m?js$/ }, async ({ path: file }) => {
      const source = await fs.promises.readFile(file, 'utf8');
      if (!source.includes('import.meta')) return undefined;
      if (!file.startsWith(`${SKILL}${path.sep}`)) {
        return { errors: [{ text: `import.meta is only rewritten inside skills/vc-archify (found in ${path.relative(ROOT, file)})` }] };
      }
      const virtualUrl = `file://${VIRTUAL_ROOT}/${path.relative(SKILL, file).split(path.sep).join('/')}`;
      const contents = source.replace(/\bimport\.meta\.url\b/g, JSON.stringify(virtualUrl));
      if (/\bimport\.meta\b/.test(contents)) {
        return { errors: [{ text: `Unsupported import.meta usage (only import.meta.url is rewritten) in ${path.relative(ROOT, file)}` }] };
      }
      return { contents, loader: 'js' };
    });
  },
};

// --- helpers ------------------------------------------------------------------
const shortHash = (data) => createHash('sha256').update(data).digest('hex').slice(0, 12);
const gzipSize = (data) => zlib.gzipSync(data, { level: 9 }).length;
const brotliSize = (data) => zlib.brotliCompressSync(data, {
  params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length },
}).length;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

const pkgJson = JSON.parse(fs.readFileSync(path.join(SKILL, 'package.json'), 'utf8'));
const upstream = JSON.parse(fs.readFileSync(path.join(ROOT, 'UPSTREAM.json'), 'utf8'));
const banner = `/*! vc-archify browser engine — bundles skills/vc-archify v${pkgJson.version} (MIT; © 2026 tt-a1i, © 2025 Cocoon AI; brand marks: Simple Icons, see THIRD_PARTY_NOTICES.md). https://github.com/lk153/vc-archify */`;

// --- build --------------------------------------------------------------------
const started = Date.now();
// Files are staged in a sibling directory and swapped in at the end, so a
// concurrent build (e.g. turbo running this package and the web app's `engine`
// step together) never leaves the served directory half-written.
const STAGE = `${OUT}.tmp-${process.pid}`;
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};
// Remove staging leftovers of builds that died before swapping.
if (fs.existsSync(path.dirname(OUT))) {
  for (const name of fs.readdirSync(path.dirname(OUT))) {
    const match = name.startsWith(`${path.basename(OUT)}.`) && /\.(tmp|old)-(\d+)$/.exec(name);
    if (match && !alive(Number(match[2]))) fs.rmSync(path.join(path.dirname(OUT), name), { recursive: true, force: true });
  }
}
fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(path.join(STAGE, 'locales'), { recursive: true });

const common = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  charset: 'utf8',
  legalComments: 'none',
  banner: { js: banner },
  write: false,
  metafile: true,
  logLevel: 'warning',
  absWorkingDir: ROOT,
};

const renderers = await esbuild.build({
  ...common,
  entryPoints: DIAGRAM_TYPES.map((type) => ({
    in: path.join(SKILL, 'renderers', type, `render-${type}.mjs`),
    out: `render-${type}`,
  })),
  outdir: OUT,
  splitting: true,
  entryNames: '[name]-[hash]',
  chunkNames: 'chunk-[hash]',
  inject: [path.join(SHIMS, 'globals.js')],
  plugins: [nodeBuiltins, importMetaUrl],
});

const outputs = new Map(renderers.outputFiles.map((file) => [path.basename(file.path), file]));
const modules = {};
const entries = {};
for (const [outPath, meta] of Object.entries(renderers.metafile.outputs)) {
  const file = path.basename(outPath);
  if (!file.endsWith('.js')) continue;
  const code = outputs.get(file).text;
  const imports = meta.imports.filter((entry) => !entry.external).map((entry) => {
    if (entry.kind !== 'import-statement') fail(`${file}: unsupported ${entry.kind} of ${entry.path}`);
    return path.basename(entry.path);
  });
  for (const dep of imports) {
    // client.js links Blob URLs by replacing this exact specifier.
    if (!code.includes(JSON.stringify(`./${dep}`))) fail(`${file}: import specifier "./${dep}" not found verbatim`);
  }
  if (/\bimport\.meta\b/.test(code)) fail(`${file}: import.meta survived the build`);
  if (/\b__require\b/.test(code)) fail(`${file}: CommonJS require() survived the build`);
  modules[file] = { imports, bytes: Buffer.byteLength(code) };
  if (meta.entryPoint) {
    const type = DIAGRAM_TYPES.find((t) => meta.entryPoint.endsWith(`/render-${t}.mjs`));
    if (!type) fail(`unknown entry ${meta.entryPoint}`);
    entries[type] = file;
  }
}
for (const type of DIAGRAM_TYPES) if (!entries[type]) fail(`no entry produced for ${type}`);

// The client links modules depth-first; a cycle between chunks would deadlock.
const visiting = new Set();
const done = new Set();
const visit = (file, trail) => {
  if (done.has(file)) return;
  if (visiting.has(file)) fail(`chunk import cycle: ${[...trail, file].join(' -> ')}`);
  visiting.add(file);
  for (const dep of modules[file].imports) visit(dep, [...trail, file]);
  visiting.delete(file);
  done.add(file);
};
for (const file of Object.keys(modules)) visit(file, []);

const worker = await esbuild.build({
  ...common,
  entryPoints: [path.join(PKG, 'src', 'worker.js')],
  outfile: path.join(OUT, 'worker.js'),
  banner: { js: '/*! vc-archify browser engine worker (MIT) */' },
});
const workerCode = worker.outputFiles[0].text;
const workerFile = `worker-${shortHash(workerCode)}.js`;

const written = new Map();
const emit = (file, data) => {
  fs.mkdirSync(path.dirname(path.join(STAGE, file)), { recursive: true });
  fs.writeFileSync(path.join(STAGE, file), data);
  written.set(file, Buffer.from(data));
};
for (const [file, output] of outputs) emit(file, output.contents);
emit(workerFile, workerCode);

const template = fs.readFileSync(path.join(SKILL, 'assets', 'template.html'));
const templateFile = `template-${shortHash(template)}.txt`;
emit(templateFile, template);

// Locale data, addressed by the virtual path the engine computes from its
// rewritten import.meta.url (renderers/shared/i18n.mjs → /vc-archify/locales/).
const files = {};
const addVirtual = (relative) => {
  const data = fs.readFileSync(path.join(SKILL, relative));
  const name = `${relative.replace(/\.json$/, '').split('/').pop()}-${shortHash(data)}.json`;
  emit(`locales/${name}`, data);
  files[`${VIRTUAL_ROOT}/${relative}`] = `locales/${name}`;
  return `${VIRTUAL_ROOT}/${relative}`;
};
const localeManifest = JSON.parse(fs.readFileSync(path.join(SKILL, 'locales', 'manifest.json'), 'utf8'));
const locales = { manifest: addVirtual('locales/manifest.json'), catalogs: {} };
for (const { locale, file } of localeManifest.catalogs) {
  locales.catalogs[locale.toLowerCase()] = addVirtual(`locales/${file}`);
}
if (!locales.catalogs.en) fail('locale manifest has no en catalog');

const manifest = {
  schema: 1,
  engine: { version: pkgJson.version, upstreamCommit: upstream.commit },
  worker: workerFile,
  template: templateFile,
  entries,
  modules,
  files,
  locales,
};
emit('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);

const previous = `${OUT}.old-${process.pid}`;
if (fs.existsSync(OUT)) fs.renameSync(OUT, previous);
try {
  fs.renameSync(STAGE, OUT);
} catch (error) {
  // Another build swapped in first; the output is deterministic, so keep it.
  if (!['ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error;
  fs.rmSync(STAGE, { recursive: true, force: true });
}
fs.rmSync(previous, { recursive: true, force: true });

// --- report ---------------------------------------------------------------------
const size = (file) => {
  const data = written.get(file);
  return { raw: data.length, gzip: gzipSize(data), br: withBrotli ? brotliSize(data) : null };
};
const closure = (file, acc = new Set()) => {
  if (acc.has(file)) return acc;
  acc.add(file);
  for (const dep of modules[file].imports) closure(dep, acc);
  return acc;
};
const sum = (list) => list.map(size).reduce((a, b) => ({ raw: a.raw + b.raw, gzip: a.gzip + b.gzip, br: a.br === null ? null : a.br + b.br }), { raw: 0, gzip: 0, br: withBrotli ? 0 : null });
const fmt = ({ raw, gzip, br }) => `${kb(raw).padStart(10)} raw ${kb(gzip).padStart(10)} gzip${br === null ? '' : ` ${kb(br).padStart(10)} br`}`;

const report = {
  files: Object.fromEntries([...written.keys()].sort().map((file) => [file, size(file)])),
  firstRender: {},
};
const baseFiles = [workerFile, templateFile, files[locales.manifest], files[locales.catalogs.en]];
for (const type of DIAGRAM_TYPES) report.firstRender[type] = sum([...baseFiles, ...closure(entries[type])]);

if (!quiet) {
  console.log(`browser-engine: built ${written.size} files into ${path.relative(ROOT, OUT)} in ${Date.now() - started} ms`);
  for (const [file, s] of Object.entries(report.files)) console.log(`  ${file.padEnd(36)} ${fmt(s)}`);
  console.log('  first render per type (worker + template + en locale + type modules):');
  for (const [type, s] of Object.entries(report.firstRender)) console.log(`    ${type.padEnd(14)} ${fmt(s)}`);
}
