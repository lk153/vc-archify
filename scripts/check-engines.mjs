#!/usr/bin/env node
// Plan §4.1.1: pnpm pins the Node runtime (devEngines.runtime) and Vercel reads
// engines.node. Their major versions must never diverge.

import fs from 'node:fs';

const read = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const root = read('package.json');
const web = read('apps/web/package.json');
const runtime = root.devEngines?.runtime;
const problems = [];

if (runtime?.name !== 'node' || !runtime.version) problems.push('root package.json: devEngines.runtime must pin a Node version (run `pnpm runtime set node 24`).');
const major = (v) => String(v ?? '').match(/(\d+)/)?.[1];
const runtimeMajor = major(runtime?.version);
for (const [name, pkg] of [['package.json', root], ['apps/web/package.json', web]]) {
  const engine = pkg.engines?.node;
  if (!/^\d+\.x$/.test(engine ?? '')) problems.push(`${name}: engines.node must be a major-only range like "24.x" (got ${JSON.stringify(engine)}).`);
  else if (major(engine) !== runtimeMajor) problems.push(`${name}: engines.node ${engine} disagrees with devEngines.runtime ${runtime?.version}.`);
}
if (process.versions.node.split('.')[0] !== runtimeMajor) {
  problems.push(`running on Node ${process.versions.node}, expected the pinned ${runtime?.version} (run through pnpm).`);
}

if (problems.length) {
  console.error(`check-engines failed:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-engines: Node ${runtime.version} (devEngines) ↔ engines.node ${root.engines.node} ✓`);
