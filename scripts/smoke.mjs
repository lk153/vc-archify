#!/usr/bin/env node
// Post-deploy smoke test (Plan §4.5) for the single-page app: the playground
// page, its security headers, the in-browser engine bundle, the example IR, and
// the redirects from the former multi-page site.
//
//   pnpm smoke https://vc-archify.vercel.app
//   VERCEL_AUTOMATION_BYPASS_SECRET=… pnpm smoke <protected-deployment-url>
//   VERCEL_TOKEN=… pnpm smoke <protected-deployment-url> --vercel-curl   # bypass via `vercel curl`
//   pnpm smoke <url> --allow-protected   # exit 0 when the URL is behind Vercel Deployment Protection

import { execFile } from 'node:child_process';

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--'))?.replace(/\/$/, '');
const allowProtected = args.includes('--allow-protected');
if (!base || !/^https?:\/\//.test(base)) {
  console.error('Usage: node scripts/smoke.mjs <deployment-url> [--allow-protected] [--vercel-curl]');
  process.exit(2);
}

const headers = { 'User-Agent': 'vc-archify-smoke' };
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
}

const failures = [];
const header = (res, name) => res.headers.get(name) ?? '';

// Plain fetch, without following redirects (the redirect checks need the 308).
const viaFetch = (path) => fetch(`${base}${path}`, { headers, redirect: 'manual', signal: AbortSignal.timeout(20_000) });

// `vercel curl` reaches protected deployment URLs with the CLI's own auth
// (VERCEL_TOKEN), so the staged deployment can be checked before promotion
// without a bypass secret. The raw `curl -i` output becomes a Response.
const viaVercelCurl = (path) => new Promise((resolve, reject) => {
  const argv = ['curl', `${base}${path}`, '--token', process.env.VERCEL_TOKEN, '--', '-s', '-i', '--max-time', '20', '-A', headers['User-Agent']];
  const env = { ...process.env, VERCEL_TELEMETRY_DISABLED: '1' };
  execFile('vercel', argv, { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024, env }, (error, stdout, stderr) => {
    if (error) return reject(new Error(`vercel curl failed: ${String(stderr).trim().split('\n').pop() || error.message}`));
    // Ignore anything the CLI prints before the HTTP response itself.
    const start = stdout.indexOf('HTTP/');
    if (start === -1) return reject(new Error('vercel curl: no HTTP response'));
    let raw = stdout.subarray(start);
    for (;;) {
      const end = raw.indexOf('\r\n\r\n');
      if (end === -1) return reject(new Error('vercel curl: no HTTP response'));
      const head = raw.subarray(0, end).toString('latin1');
      const body = raw.subarray(end + 4);
      const status = Number(head.match(/^HTTP\/[\d.]+ (\d{3})/)?.[1]);
      if (!(status >= 100 && status <= 599)) return reject(new Error('vercel curl: unparseable status line'));
      // Skip interim responses (100 Continue) and keep the final one.
      if (status === 100 && /^HTTP\//.test(body.subarray(0, 5).toString('latin1'))) { raw = body; continue; }
      const responseHeaders = new Headers();
      for (const line of head.split('\r\n').slice(1)) {
        const i = line.indexOf(':');
        if (i > 0) responseHeaders.append(line.slice(0, i).trim(), line.slice(i + 1).trim());
      }
      return resolve(new Response([204, 304].includes(status) ? null : body, { status, headers: responseHeaders }));
    }
  });
});

let fetchPath = viaFetch;
if (args.includes('--vercel-curl') && process.env.VERCEL_TOKEN && !process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  try {
    await viaVercelCurl('/');
    fetchPath = viaVercelCurl;
    console.log('smoke: using `vercel curl` (Deployment Protection bypass through VERCEL_TOKEN)');
  } catch (error) {
    console.log(`smoke: ${error.message}; falling back to plain requests`);
  }
}

// Deployment Protection answers 401/403, or redirects to a Vercel login/SSO page.
const isProtected = (res) => res.status === 401 || res.status === 403
  || (res.status >= 300 && res.status < 400 && /vercel\.com\/(login|sso)|\/sso-api|_vercel_sso/.test(header(res, 'location')));

const probe = await fetchPath('/');
if (isProtected(probe)) {
  const message = `smoke: ${base} is protected (HTTP ${probe.status}${header(probe, 'location') ? ` → ${header(probe, 'location')}` : ''}); `
    + 'set VERCEL_AUTOMATION_BYPASS_SECRET or pass --vercel-curl with VERCEL_TOKEN to test it.';
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
    if (res.status !== 200) return failures.push(`${path}: HTTP ${res.status}${header(res, 'location') ? ` → ${header(res, 'location')}` : ''}`);
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
