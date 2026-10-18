#!/usr/bin/env node
// Post-deploy smoke test (Plan §4.5) for the single-page app: the playground
// page, its security headers, the in-browser engine bundle, the example IR, and
// the redirects from the former multi-page site.
//
//   pnpm smoke https://vc-archify.vercel.app
//   VERCEL_AUTOMATION_BYPASS_SECRET=… pnpm smoke <protected-deployment-url>
//   pnpm smoke <url> --allow-protected   # exit 0 when the URL is behind Vercel Authentication

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--'))?.replace(/\/$/, '');
const allowProtected = args.includes('--allow-protected');
if (!base || !/^https?:\/\//.test(base)) {
  console.error('Usage: node scripts/smoke.mjs <deployment-url> [--allow-protected]');
  process.exit(2);
}

const headers = { 'User-Agent': 'vc-archify-smoke' };
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
}

const failures = [];
const fetchPath = (path) => fetch(`${base}${path}`, { headers, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
const header = (res, name) => res.headers.get(name) ?? '';

const probe = await fetchPath('/');
if (probe.status === 401 || probe.status === 403) {
  const message = `smoke: ${base} is protected (HTTP ${probe.status}); set VERCEL_AUTOMATION_BYPASS_SECRET to test it.`;
  if (allowProtected) {
    console.log(`${message} Skipping.`);
    process.exit(0);
  }
  console.error(message);
  process.exit(1);
}

const expectOk = async (path, check) => {
  try {
    const res = await fetchPath(path);
    if (res.status !== 200) return failures.push(`${path}: HTTP ${res.status}`);
    if (check) await check(res, path);
    console.log(`  ✓ ${path}`);
  } catch (error) {
    failures.push(`${path}: ${error.message}`);
  }
};
const requireHeader = (res, path, name, pattern) => {
  if (!pattern.test(header(res, name))) failures.push(`${path}: header ${name} = ${JSON.stringify(header(res, name))} does not match ${pattern}`);
};

console.log(`smoke: ${base}`);
await expectOk('/', async (res, path) => {
  requireHeader(res, path, 'content-type', /text\/html/);
  requireHeader(res, path, 'x-content-type-options', /nosniff/);
  requireHeader(res, path, 'x-frame-options', /SAMEORIGIN/i);
  requireHeader(res, path, 'referrer-policy', /strict-origin-when-cross-origin/);
  const html = await res.text();
  if (!html.includes('vc-archify')) failures.push(`${path}: page does not mention vc-archify`);
  if (!html.includes('data-testid="pg-editor"')) failures.push(`${path}: the playground editor is missing`);
});

await expectOk('/engine/manifest.json', async (res, path) => {
  try {
    const manifest = await res.json();
    if (!manifest || typeof manifest !== 'object') failures.push(`${path}: empty manifest`);
  } catch {
    failures.push(`${path}: not JSON (the in-browser engine was not deployed)`);
  }
});

await expectOk('/examples/web-app.architecture.json', async (res, path) => {
  try {
    const ir = await res.json();
    if (ir.diagram_type !== 'architecture') failures.push(`${path}: unexpected diagram_type ${ir.diagram_type}`);
  } catch {
    failures.push(`${path}: not JSON`);
  }
});

for (const path of ['/playground', '/gallery']) {
  try {
    const res = await fetchPath(path);
    if (res.status !== 308 || !/\/$/.test(header(res, 'location'))) {
      failures.push(`${path}: expected 308 to /, got ${res.status} ${header(res, 'location')}`);
    } else {
      console.log(`  ✓ ${path} → 308 /`);
    }
  } catch (error) {
    failures.push(`${path}: ${error.message}`);
  }
}

if (failures.length) {
  console.error(`smoke FAILED (${failures.length}):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('smoke: all checks passed');
