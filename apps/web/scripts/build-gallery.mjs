#!/usr/bin/env node
// Render every gallery and "beyond code" IR with the vendored engine into
// apps/web/.generated/ (git-ignored). The site's route handlers serve these
// files statically; the build fails if any IR fails validation or the
// engine's structural checks ("validated before delivery", Plan §3.1).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  artifactCsp, artifactSummary, checkArtifact, inlineScriptHashes, renderDiagram, sha256,
} from '@vca/render';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(WEB, '..', '..');
const OUT = path.join(WEB, '.generated');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const upstreamManifest = readJson(path.join(ROOT, 'gallery', 'upstream-manifest.json'));
const upstream = readJson(path.join(ROOT, 'UPSTREAM.json'));
const byInput = new Map(upstreamManifest.entries.map((e) => [path.basename(e.input), e]));

// Gallery order follows the upstream manifest (curated), then any new sources.
const galleryFiles = fs.readdirSync(path.join(ROOT, 'gallery', 'sources')).filter((f) => f.endsWith('.json'));
galleryFiles.sort((a, b) => {
  const ia = upstreamManifest.entries.findIndex((e) => path.basename(e.input) === a);
  const ib = upstreamManifest.entries.findIndex((e) => path.basename(e.input) === b);
  return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib) || a.localeCompare(b);
});
const lifeFiles = fs.readdirSync(path.join(ROOT, 'gallery', 'cases', 'life')).filter((f) => f.endsWith('.json')).sort();

const jobs = [
  ...galleryFiles.map((file) => ({ kind: 'gallery', file: path.join(ROOT, 'gallery', 'sources', file) })),
  ...lifeFiles.map((file) => ({ kind: 'life', file: path.join(ROOT, 'gallery', 'cases', 'life', file) })),
];

fs.rmSync(OUT, { recursive: true, force: true });
for (const dir of ['artifacts', 'sources']) fs.mkdirSync(path.join(OUT, dir), { recursive: true });

const entries = [];
const hashes = new Set();
const failures = [];
const started = Date.now();
await Promise.all(jobs.map(async (job) => {
  const name = path.basename(job.file);
  const ir = readJson(job.file);
  const meta = byInput.get(name);
  // Keep upstream's public artifact names (e.g. cache-miss.sequence) as slugs.
  const slug = job.kind === 'gallery' && meta
    ? path.basename(meta.artifact, '.html')
    : name.replace(/\.json$/, '');
  try {
    const result = await renderDiagram(ir);
    const check = await checkArtifact(result.html);
    if (!check.ok) {
      const failed = (check.checks ?? []).filter((c) => !c.ok).map((c) => `${c.name}: ${(c.details ?? []).join('; ')}`);
      throw new Error(`engine check failed:\n    ${failed.join('\n    ') || check.error}`);
    }
    const summary = artifactSummary(result.html);
    for (const h of inlineScriptHashes(result.html)) hashes.add(h);
    fs.writeFileSync(path.join(OUT, 'artifacts', `${slug}.html`), result.html);
    const sourceText = fs.readFileSync(job.file, 'utf8');
    fs.writeFileSync(path.join(OUT, 'sources', name), sourceText);
    entries.push({
      slug,
      kind: job.kind,
      type: result.type,
      title: summary.title ?? ir.meta?.title ?? slug,
      subtitle: ir.meta?.subtitle ?? meta?.subtitle ?? '',
      preset: summary.preset ?? ir.meta?.visual_preset ?? 'classic',
      engineeringProfile: ir.meta?.engineering_profile ?? null,
      focus: meta?.focus ?? null,
      viewBox: summary.viewBox,
      nodeCount: summary.nodeIds.length,
      edgeCount: summary.edges.length,
      bytes: result.bytes,
      sha256: result.sha256,
      source: name,
      sourceSha256: sha256(sourceText),
      checks: (check.checks ?? []).length,
    });
  } catch (error) {
    failures.push(`${path.relative(ROOT, job.file)}: ${error.message}${error.diagnostics?.length ? `\n    ${error.diagnostics.map((d) => d.message).join('\n    ')}` : ''}`);
  }
}));

if (failures.length) {
  console.error(`Gallery build failed for ${failures.length} source(s):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}

const order = new Map(jobs.map((job, i) => [path.basename(job.file), i]));
entries.sort((a, b) => order.get(a.source) - order.get(b.source));
const scriptHashes = [...hashes].sort();
const sample = fs.readFileSync(path.join(OUT, 'artifacts', `${entries[0].slug}.html`), 'utf8');
const gallery = {
  engine: { version: upstream.version, upstreamCommit: upstream.commit },
  csp: artifactCsp(sample).replace(/script-src [^;]+/, `script-src ${scriptHashes.join(' ')}`),
  entries,
};
fs.writeFileSync(path.join(OUT, 'gallery.json'), `${JSON.stringify(gallery, null, 2)}\n`);
// Thumbnails are committed (public/thumbnails, regenerated with `pnpm thumbnails`).
// A missing or stale one is an error in CI and a warning locally.
const thumbsDir = path.join(WEB, 'public', 'thumbnails');
let thumbs = {};
try { thumbs = readJson(path.join(thumbsDir, 'manifest.json')); } catch {}
const stale = entries.filter((e) => thumbs[e.slug]?.sourceSha256 !== e.sourceSha256
  || !['dark', 'light'].every((t) => fs.existsSync(path.join(thumbsDir, `${e.slug}-${t}.webp`))));
if (stale.length) {
  const message = `thumbnails missing or stale for: ${stale.map((e) => e.slug).join(', ')}. Run \`pnpm --filter @vca/web thumbnails\` and commit public/thumbnails.`;
  if (process.env.CI) {
    console.error(message);
    process.exit(1);
  }
  console.warn(`warning: ${message}`);
}

const total = entries.reduce((n, e) => n + e.bytes, 0);
console.log(`gallery: ${entries.length} artifacts (${(total / 1024 / 1024).toFixed(1)} MB) in ${Date.now() - started} ms -> ${path.relative(ROOT, OUT)}`);
