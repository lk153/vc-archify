#!/usr/bin/env node
// Validate and render every playground example (repo-root examples/*.json)
// with the vendored engine before `next build`. The build fails if any example
// fails validation or the engine's structural checks. Output, all git-ignored,
// goes to apps/web/.generated/:
//   examples.json        the example list the page is built from
//   sources/<file>.json  the IR the page fetches when an example is picked
//   artifacts/<slug>.html  the rendered HTML (not served; used by tests and `pnpm browser-check`)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactSummary, checkArtifact, renderDiagram, sha256 } from '@vca/render';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(WEB, '..', '..');
const EXAMPLES = path.join(ROOT, 'examples');
const OUT = path.join(WEB, '.generated');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const upstream = readJson(path.join(ROOT, 'UPSTREAM.json'));
const manifest = readJson(path.join(EXAMPLES, 'upstream-manifest.json'));
const curated = manifest.entries.map((e) => path.basename(e.input));
const files = fs.readdirSync(EXAMPLES)
  .filter((f) => f.endsWith('.json') && f !== 'upstream-manifest.json')
  .sort((a, b) => {
    const ia = curated.indexOf(a);
    const ib = curated.indexOf(b);
    return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib) || a.localeCompare(b);
  });

fs.rmSync(OUT, { recursive: true, force: true });
for (const dir of ['artifacts', 'sources']) fs.mkdirSync(path.join(OUT, dir), { recursive: true });

const started = Date.now();
const failures = [];
const entries = await Promise.all(files.map(async (file) => {
  const sourceText = fs.readFileSync(path.join(EXAMPLES, file), 'utf8');
  const slug = file.replace(/\.json$/, '');
  try {
    const result = await renderDiagram(JSON.parse(sourceText));
    const check = await checkArtifact(result.html);
    if (!check.ok) {
      const failed = (check.checks ?? []).filter((c) => !c.ok).map((c) => `${c.name}: ${(c.details ?? []).join('; ')}`);
      throw new Error(`engine check failed:\n    ${failed.join('\n    ') || check.error}`);
    }
    const summary = artifactSummary(result.html);
    fs.writeFileSync(path.join(OUT, 'artifacts', `${slug}.html`), result.html);
    fs.writeFileSync(path.join(OUT, 'sources', file), sourceText);
    return {
      slug,
      source: file,
      type: result.type,
      title: summary.title ?? slug,
      preset: summary.preset ?? 'classic',
      nodeCount: summary.nodeIds.length,
      edgeCount: summary.edges.length,
      bytes: result.bytes,
      sha256: result.sha256,
      sourceSha256: sha256(sourceText),
    };
  } catch (error) {
    const details = error.diagnostics?.length ? `\n    ${error.diagnostics.map((d) => d.message).join('\n    ')}` : '';
    failures.push(`examples/${file}: ${error.message}${details}`);
    return null;
  }
}));

if (failures.length) {
  console.error(`Example build failed for ${failures.length} file(s):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}

fs.writeFileSync(path.join(OUT, 'examples.json'), `${JSON.stringify({
  engine: { version: upstream.version, upstreamCommit: upstream.commit },
  entries,
}, null, 2)}\n`);
console.log(`examples: ${entries.length} rendered and checked in ${Date.now() - started} ms -> ${path.relative(ROOT, OUT)}`);
