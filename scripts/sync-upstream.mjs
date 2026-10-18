#!/usr/bin/env node
// Vendor the upstream Archify engine (MIT) into this repository and apply the
// vc-archify rebrand. Re-run it against a newer upstream checkout to sync:
//
//   node scripts/sync-upstream.mjs <path-to-upstream-archify-checkout> [--examples]
//
// What it does (see docs/adr/0001-build-vs-fork.md and UPSTREAM.md):
//   archify/                 -> skills/vc-archify/        (renderers, schemas, CLI, skill docs)
//   viewer/                  -> packages/viewer/src/      (viewer runtime sources)
//   docs/gallery/sources/    -> examples/                 (playground examples; only with --examples)
// then rewrites user-visible "Archify" branding to "vc-archify". Internal
// identifiers (the `Archify.*` viewer namespace, CSS classes, data-* contract,
// diagnostic codes, ARCHIFY_* environment variables) are kept unchanged so the
// engine keeps working and stays easy to diff against upstream.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUR_REPO_URL = 'https://github.com/lk153/vc-archify';
const OUR_SITE_URL = 'https://vc-archify.vercel.app';

const upstream = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(path.join(upstream, 'archify', 'SKILL.md'))) {
  console.error('Usage: node scripts/sync-upstream.mjs <path-to-upstream-archify-checkout> [--examples]');
  process.exit(2);
}

const TEXT_EXT = new Set(['.mjs', '.js', '.json', '.md', '.html', '.css', '.txt', '.yaml', '.yml', '.svg']);

function copyTree(from, to, { exclude = () => false } = {}) {
  // Replace the destination, but keep pnpm's node_modules links in workspace packages.
  if (fs.existsSync(to)) {
    for (const entry of fs.readdirSync(to)) {
      if (entry !== 'node_modules') fs.rmSync(path.join(to, entry), { recursive: true, force: true });
    }
  }
  const walk = (src, dst) => {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dst, entry.name);
      const rel = path.relative(from, s);
      if (exclude(rel, entry)) continue;
      if (entry.isDirectory()) walk(s, d);
      else if (entry.isFile()) fs.copyFileSync(s, d);
    }
  };
  walk(from, to);
}

function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile()) out.push(p);
    }
  };
  walk(dir);
  return out;
}

function rewrite(file, fn) {
  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before, file);
  if (after !== before) fs.writeFileSync(file, after);
  return after !== before;
}

// "Archify" as a product name. Skip the viewer's JavaScript namespace
// (`Archify.focus`, `var Archify = {}`, `window.Archify`, `typeof Archify`).
// A preceding identifier character excludes the match unless it is part of a
// string escape such as `\nArchify`.
const VISIBLE_NAME = /(?<!window\.|var |typeof )(?<!(?<!\\)[\w$.])Archify(?![\w$]|\.[A-Za-z_$])/g;
const rebrandText = (text) => text
  .replaceAll('https://archify.si', OUR_SITE_URL)
  .replace(/https:\/\/github\.com\/tt-a1i\/archify(?!\/schemas)(?=[/"'`)\s<#]|$)/g, OUR_REPO_URL)
  .replace(VISIBLE_NAME, 'vc-archify');

// --- 1. engine / skill package --------------------------------------------
const skillDir = path.join(ROOT, 'skills', 'vc-archify');
copyTree(path.join(upstream, 'archify'), skillDir, {
  exclude: (rel, entry) => {
    if (entry.name === 'node_modules' || entry.name === 'package-lock.json') return true;
    // Rendered example HTML is reproducible output (~800 KB each); keep the IR.
    if (rel.startsWith(`examples${path.sep}`) && /\.(html|png)$/.test(entry.name)) return true;
    return false;
  },
});

// --- 2. viewer sources ------------------------------------------------------
const viewerDir = path.join(ROOT, 'packages', 'viewer', 'src');
copyTree(path.join(upstream, 'viewer'), viewerDir);

// --- 3. playground examples -----------------------------------------------------
// The examples are vc-archify's own curated content after the first import, so
// they are only re-imported on request: `--examples` copies upstream's gallery
// IR (technical diagrams) over examples/.
const examplesDir = path.join(ROOT, 'examples');
const withExamples = process.argv.includes('--examples') || !fs.existsSync(examplesDir);
if (withExamples) {
  copyTree(path.join(upstream, 'docs', 'gallery', 'sources'), examplesDir);
  fs.copyFileSync(path.join(upstream, 'docs', 'gallery', 'manifest.json'), path.join(examplesDir, 'upstream-manifest.json'));
}

// --- 4. rebrand ---------------------------------------------------------------
let changed = 0;
for (const file of [...listFiles(skillDir), ...listFiles(viewerDir), ...(withExamples ? listFiles(examplesDir) : [])]) {
  if (!TEXT_EXT.has(path.extname(file))) continue;
  // The licence files must keep the upstream copyright notice verbatim.
  if (/(^|[\\/])(LICENSE|THIRD_PARTY_NOTICES\.md|JetBrainsMono-OFL\.txt)$/.test(file)) continue;
  if (rewrite(file, (text) => {
    let next = rebrandText(text);
    if (file.endsWith('.md')) {
      next = next.replaceAll('bin/archify.mjs', 'bin/vc-archify.mjs').replaceAll('`.archify/', '`.vc-archify/');
    }
    if (file.includes(`${path.sep}bin${path.sep}`)) {
      // CLI usage and fix hints: `archify <command>` -> `vc-archify <command>`.
      next = next.replace(/(?<![\w./@-])archify(?= )/g, 'vc-archify');
    }
    return next;
  })) changed += 1;
}

// SKILL.md identity.
rewrite(path.join(skillDir, 'SKILL.md'), (text) => text
  .replace(/^name: archify$/m, 'name: vc-archify')
  .replace(/^  author: tt-a1i$/m, '  author: lk153 (fork of tt-a1i/archify)')
  .replace('`.archify/<type>-<slug>-<YYYYMMDD-HHMMSS>/`', '`.vc-archify/<type>-<slug>-<YYYYMMDD-HHMMSS>/`'));

// The skill package is also the workspace package that ships the CLI.
rewrite(path.join(skillDir, 'package.json'), (text) => {
  const pkg = JSON.parse(text);
  pkg.name = 'vc-archify';
  pkg.description = `vc-archify: ${pkg.description}`;
  pkg.bin = { 'vc-archify': './bin/vc-archify.mjs' };
  pkg.repository = { type: 'git', url: `git+${OUR_REPO_URL}.git`, directory: 'skills/vc-archify' };
  pkg.homepage = OUR_SITE_URL;
  // Upstream maintenance scripts point at the upstream repository layout.
  pkg.scripts = { test: 'node bin/vc-archify.mjs doctor' };
  delete pkg.devDependencies;
  delete pkg.overrides;
  return `${JSON.stringify(pkg, null, 2)}\n`;
});

// vc-archify CLI entry (delegates to the vendored engine entry).
fs.writeFileSync(path.join(skillDir, 'bin', 'vc-archify.mjs'), `#!/usr/bin/env node
// vc-archify command-line entry. The vendored engine entry is bin/archify.mjs
// (upstream file name kept so internal self-references keep working).
import './archify.mjs';
`, { mode: 0o755 });

// Update checks: upstream polls a manifest on tt-a1i.github.io. vc-archify is a
// personal fork with no update feed, so the check is off unless explicitly
// re-enabled with VC_ARCHIFY_UPDATE_CHECK=1.
rewrite(path.join(skillDir, 'bin', 'delivery-update.mjs'), (text) => text.replace(
  "if (env.ARCHIFY_UPDATE_CHECK_DISABLED === '1')",
  "if (env.ARCHIFY_UPDATE_CHECK_DISABLED === '1' || env.VC_ARCHIFY_UPDATE_CHECK !== '1')",
));
rewrite(path.join(skillDir, 'scripts', 'check-update.mjs'), (text) => text.replace(
  "return process.env.ARCHIFY_UPDATE_CHECK_DISABLED === '1';",
  "return process.env.ARCHIFY_UPDATE_CHECK_DISABLED === '1' || process.env.VC_ARCHIFY_UPDATE_CHECK !== '1';",
));

// In-memory I/O hook for the browser playground (packages/browser-engine).
// When globalThis.__VCA_IO__ = { input, template, write(html) } is set, the
// renderer reads its input/template from it and hands the HTML to write()
// instead of touching the filesystem. Without the global, behaviour is unchanged.
const patch = (file, pairs) => rewrite(file, (text) => pairs.reduce((acc, [from, to]) => {
  if (!acc.includes(from)) throw new Error(`sync-upstream: patch anchor not found in ${path.relative(ROOT, file)}:\n${from}`);
  return acc.replace(from, to);
}, text));
patch(path.join(skillDir, 'renderers', 'shared', 'cli.mjs'), [
  [
    "  const inputPath = path.resolve(argv[2] || path.join(skillRoot, 'examples', defaultExample));\n  let input;\n  try {\n    input = fs.readFileSync(inputPath, 'utf8');",
    "  const injected = globalThis.__VCA_IO__; // vc-archify: in-memory I/O hook (browser playground)\n  const inputPath = injected ? '/memory/input.json' : path.resolve(argv[2] || path.join(skillRoot, 'examples', defaultExample));\n  let input;\n  try {\n    input = injected ? injected.input : fs.readFileSync(inputPath, 'utf8');",
  ],
  [
    // meta.output only names the file to write; resolving it inspects the real
    // filesystem (realpath/lstat/probe files), which the in-memory hook has not.
    "  if (authoredOutput !== undefined) validateAuthoredOutputPath(authoredOutput);",
    "  if (authoredOutput !== undefined && !injected) validateAuthoredOutputPath(authoredOutput); // vc-archify: no filesystem output under the in-memory hook",
  ],
  [
    "  const template = fs.readFileSync(path.join(skillRoot, 'assets/template.html'), 'utf8');",
    "  const template = injected ? injected.template : fs.readFileSync(path.join(skillRoot, 'assets/template.html'), 'utf8');\n  if (injected) return { diagram, template, outPath: '/memory/output.html', sourceEvidence };",
  ],
  [
    "  let candidatePath;\n  let candidateIdentity;\n  let candidateBinding;\n  try {\n    fs.mkdirSync(path.dirname(outPath), { recursive: true });",
    "  if (globalThis.__VCA_IO__) { globalThis.__VCA_IO__.write(html); return; } // vc-archify: in-memory I/O hook\n  let candidatePath;\n  let candidateIdentity;\n  let candidateBinding;\n  try {\n    fs.mkdirSync(path.dirname(outPath), { recursive: true });",
  ],
]);

// Artifact <head>: name the generator vc-archify and declare an inline (data:)
// icon, so browsers never probe /favicon.ico. That probe is a network request
// the artifact CSP (img-src data: blob:) would block and report.
const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230b1220'/%3E%3Cpath d='M18 22h14M32 22v20M32 42h14' fill='none' stroke='%2394a3b8' stroke-width='3' stroke-linecap='round'/%3E%3Crect x='9' y='15' width='18' height='14' rx='4' fill='%23083344' stroke='%2322d3ee' stroke-width='2.5'/%3E%3Crect x='37' y='35' width='18' height='14' rx='4' fill='%23064e3b' stroke='%2334d399' stroke-width='2.5'/%3E%3Ccircle cx='32' cy='32' r='4' fill='%23a78bfa'/%3E%3C/svg%3E";
patch(path.join(viewerDir, 'template.source.html'), [[
  `  <meta name="generator" content="archify ${JSON.parse(fs.readFileSync(path.join(skillDir, 'package.json'), 'utf8')).version}">\n`,
  `  <meta name="generator" content="vc-archify ${JSON.parse(fs.readFileSync(path.join(skillDir, 'package.json'), 'utf8')).version} (Archify engine)">\n  <link rel="icon" href="${ICON}">\n`,
]]);

// --- 5. provenance --------------------------------------------------------------
let commit = 'unknown';
try { commit = execFileSync('git', ['-C', upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
const release = JSON.parse(fs.readFileSync(path.join(skillDir, 'skill-release.json'), 'utf8'));
let previous = {};
try { previous = JSON.parse(fs.readFileSync(path.join(ROOT, 'UPSTREAM.json'), 'utf8')); } catch {}
// Keep the sync date stable when re-running against the same upstream commit.
const syncedAt = previous.commit === commit && previous.syncedAt ? previous.syncedAt : new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(ROOT, 'UPSTREAM.json'), `${JSON.stringify({
  upstream: 'https://github.com/tt-a1i/archify',
  license: 'MIT',
  commit,
  version: release.version,
  syncedAt,
  vendored: {
    'archify/': 'skills/vc-archify/',
    'viewer/': 'packages/viewer/src/',
    'docs/gallery/sources/': 'examples/',
  },
}, null, 2)}\n`);

// The shipped template is generated from the (patched) viewer sources.
const { generateViewer } = await import(path.join(ROOT, 'packages', 'viewer', 'scripts', 'generate-viewer.mjs'));
generateViewer();

console.log(`Vendored upstream ${commit.slice(0, 12)} (v${release.version}); rebranded ${changed} files; regenerated the viewer template.`);
