#!/usr/bin/env node
// Run the engine's Chrome-based gate (`vc-archify browser-check`: containment,
// readability, viewer chrome, theme states) on every artifact the site build
// produced in apps/web/.generated/artifacts. Needs Google Chrome/Chromium on
// PATH, or ARCHIFY_CHROME=/path/to/chrome.
//
//   pnpm --filter @vca/web gallery && pnpm browser-check

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS = path.join(ROOT, 'apps', 'web', '.generated', 'artifacts');
const CLI = path.join(ROOT, 'skills', 'vc-archify', 'bin', 'vc-archify.mjs');
// Failures that reproduce identically on upstream's own artifacts are tracked
// (not hidden) in a baseline; anything new fails the gate.
const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'browser-check-baseline.json'), 'utf8')).knownFailures;

if (!fs.existsSync(ARTIFACTS)) {
  console.error('No artifacts found. Run `pnpm --filter @vca/web gallery` first.');
  process.exit(2);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vca-browser-check-'));
const files = fs.readdirSync(ARTIFACTS).filter((f) => f.endsWith('.html')).sort();
const run = (file) => new Promise((resolve) => {
  // Copy first: browser-check writes receipt sidecars next to the artifact.
  const copy = path.join(work, file);
  fs.copyFileSync(path.join(ARTIFACTS, file), copy);
  execFile(process.execPath, [CLI, 'browser-check', copy, '--summary'], {
    cwd: work, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env: { ...process.env, ARCHIFY_UPDATE_CHECK_DISABLED: '1' },
  }, (error, stdout, stderr) => {
    let summary = null;
    try { summary = JSON.parse(stdout.trim().split('\n').pop()); } catch {}
    resolve({ file, ok: !error && summary?.ok === true, summary, stderr: stderr.trim() });
  });
});

const results = [];
for (const file of files) results.push(await run(file)); // sequential: one Chrome at a time
fs.rmSync(work, { recursive: true, force: true });

let failed = 0;
let known = 0;
for (const r of results) {
  const diag = (r.summary?.diagnostics ?? []).map((d) => d.message ?? JSON.stringify(d)).join('; ');
  if (r.ok) {
    const note = baseline[r.file] ? '  (listed in baseline; now passes, remove it)' : '';
    console.log(`  ✓ ${r.file}  ${Object.entries(r.summary.checks ?? {}).map(([k, v]) => `${k}:${v}`).join(' ')}${note}`);
  } else if (baseline[r.file]) {
    known += 1;
    console.log(`  ~ ${r.file}  known: ${baseline[r.file]}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${r.file}  ${r.summary?.status ?? 'error'} ${diag || r.stderr.split('\n')[0] || ''}`);
  }
}
console.log(`browser-check: ${results.length - failed - known} passed, ${known} known upstream deviations, ${failed} failed`);
process.exit(failed ? 1 : 0);
