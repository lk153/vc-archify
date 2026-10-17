#!/usr/bin/env node
// Post-deploy smoke test (Plan §4.5): status codes, security headers, the
// artifact CSP and the .html → extension-less redirect on a live deployment.
//
//   pnpm smoke https://vc-archify.vercel.app
//   VERCEL_AUTOMATION_BYPASS_SECRET=… pnpm smoke <protected-preview-url>
//   pnpm smoke <url> --allow-protected   # exit 0 when the preview is behind Vercel Authentication

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
const fetchPath = async (path, init = {}) => {
  const res = await fetch(`${base}${path}`, { headers, redirect: 'manual', signal: AbortSignal.timeout(20_000), ...init });
  return res;
};

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

const header = (res, name) => res.headers.get(name) ?? '';
const requireHeader = (res, path, name, pattern) => {
  if (!pattern.test(header(res, name))) failures.push(`${path}: header ${name} = ${JSON.stringify(header(res, name))} does not match ${pattern}`);
};

console.log(`smoke: ${base}`);
for (const path of ['/', '/gallery', '/start', '/guide', '/playground', '/community']) {
  await expectOk(path, async (res) => {
    requireHeader(res, path, 'content-type', /text\/html/);
    requireHeader(res, path, 'x-content-type-options', /nosniff/);
    requireHeader(res, path, 'x-frame-options', /SAMEORIGIN/i);
    requireHeader(res, path, 'referrer-policy', /strict-origin-when-cross-origin/);
    const html = await res.text();
    if (!html.includes('vc-archify')) failures.push(`${path}: page does not mention vc-archify`);
  });
}

await expectOk('/sitemap.xml', async (res, path) => {
  const xml = await res.text();
  if (!xml.includes('/gallery/artifacts/')) failures.push(`${path}: no artifact URLs listed`);
});

await expectOk('/gallery/artifacts/web-app.architecture', async (res, path) => {
  requireHeader(res, path, 'content-type', /text\/html/);
  requireHeader(res, path, 'content-security-policy', /^default-src 'none'; script-src 'sha256-/);
  const html = await res.text();
  if (!/<svg\b[^>]*role="img"/.test(html)) failures.push(`${path}: no diagram SVG`);
  if (/archify\.si|github\.com\/tt-a1i/.test(html.replace(/https:\/\/github\.com\/tt-a1i\/archify\/schemas\/[^"]*/g, ''))) {
    failures.push(`${path}: upstream product links leaked into the artifact`);
  }
});

await expectOk('/cases/life/monthly-money.dataflow', (res, path) => requireHeader(res, path, 'content-type', /text\/html/));

await expectOk('/gallery/sources/web-app.architecture.json', async (res, path) => {
  try {
    const ir = await res.json();
    if (ir.diagram_type !== 'architecture') failures.push(`${path}: unexpected diagram_type ${ir.diagram_type}`);
  } catch {
    failures.push(`${path}: not JSON`);
  }
});

try {
  const res = await fetchPath('/gallery/artifacts/web-app.architecture.html');
  if (res.status !== 308 || !header(res, 'location').endsWith('/gallery/artifacts/web-app.architecture')) {
    failures.push(`/gallery/artifacts/web-app.architecture.html: expected 308 to the extension-less URL, got ${res.status} ${header(res, 'location')}`);
  } else {
    console.log('  ✓ /gallery/artifacts/web-app.architecture.html → 308');
  }
} catch (error) {
  failures.push(`redirect: ${error.message}`);
}

if (failures.length) {
  console.error(`smoke FAILED (${failures.length}):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('smoke: all checks passed');
