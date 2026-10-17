// @vca/render: Node API around the vendored vc-archify engine
// (skills/vc-archify). Each call runs the engine CLI in a child process,
// because the upstream renderers are CLI scripts with filesystem I/O
// (see docs/adr/0001-build-vs-fork.md).

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

export const DIAGRAM_TYPES = Object.freeze([
  'architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle', 'erd',
  'class', 'tree', 'timeline', 'waterfall',
]);

/** The six diagram types with reference designs (Plan §1). */
export const FEATURED_TYPES = Object.freeze(['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle', 'erd']);

let cachedSkillRoot;
export function skillRoot() {
  if (!cachedSkillRoot) {
    const require = createRequire(import.meta.url);
    cachedSkillRoot = path.dirname(require.resolve('vc-archify/package.json'));
  }
  return cachedSkillRoot;
}

export class RenderError extends Error {
  constructor(message, { diagnostics = [], stdout = '', stderr = '', exitCode = null } = {}) {
    super(message);
    this.name = 'RenderError';
    this.diagnostics = diagnostics;
    this.stdout = stdout;
    this.stderr = stderr;
    this.exitCode = exitCode;
  }
}

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function run(args, { cwd, env } = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, args, {
      cwd,
      env: { ...process.env, ARCHIFY_UPDATE_CHECK_DISABLED: '1', NO_COLOR: '1', ...env },
      maxBuffer: 64 * 1024 * 1024,
      encoding: 'utf8',
    }, (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout, stderr }));
  });
}

const cliPath = () => path.join(skillRoot(), 'bin', 'vc-archify.mjs');

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/** Resolve the diagram type from an IR object (or an explicit override). */
export function diagramTypeOf(ir, explicit) {
  const type = explicit ?? ir?.diagram_type;
  if (!DIAGRAM_TYPES.includes(type)) {
    throw new RenderError(`Unknown or missing diagram_type ${JSON.stringify(type)}. Expected one of: ${DIAGRAM_TYPES.join(', ')}`);
  }
  return type;
}

async function withCandidate(ir, fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vca-render-'));
  try {
    // The engine requires meta.output; keep it inside the private temp dir.
    const candidate = { ...ir, meta: { ...(ir.meta ?? {}), output: 'out.html' } };
    const input = path.join(dir, 'candidate.json');
    await fs.writeFile(input, `${JSON.stringify(candidate, null, 2)}\n`);
    return await fn({ dir, input, output: path.join(dir, 'out.html') });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function diagnosticsFrom(stdout, stderr) {
  const report = parseJson(stdout);
  if (report?.diagnostics) return report.diagnostics;
  if (report?.problems) return report.problems;
  return stderr.split('\n').filter((line) => /^\[[\w/-]+\]/.test(line.trim())).map((line) => ({ message: line.trim() }));
}

/**
 * Validate an IR object with the engine's schema and layout gates.
 * Resolves to the engine's JSON report ({ ok, diagnostics, ... }).
 */
export async function validateDiagram(ir, { type, quality } = {}) {
  const diagramType = diagramTypeOf(ir, type);
  return withCandidate(ir, async ({ dir, input }) => {
    const args = [cliPath(), 'validate', diagramType, input, '--json'];
    if (quality) args.push('--quality', quality);
    const { code, stdout, stderr } = await run(args, { cwd: dir });
    const report = parseJson(stdout) ?? { ok: false, diagnostics: diagnosticsFrom(stdout, stderr) };
    return { ...report, ok: code === 0 && report.ok !== false };
  });
}

/**
 * Render an IR object to a self-contained HTML artifact.
 * Throws RenderError with the engine diagnostics when validation fails.
 */
export async function renderDiagram(ir, { type, quality } = {}) {
  const diagramType = diagramTypeOf(ir, type);
  return withCandidate(ir, async ({ dir, input, output }) => {
    const args = [cliPath(), 'render', diagramType, input, output];
    if (quality) args.push('--quality', quality);
    const { code, stdout, stderr } = await run(args, { cwd: dir });
    if (code !== 0) {
      const first = stderr.split('\n').find((line) => line.trim()) || 'render failed';
      throw new RenderError(`vc-archify render ${diagramType} failed: ${first}`, {
        diagnostics: diagnosticsFrom(stdout, stderr), stdout, stderr, exitCode: code,
      });
    }
    const html = await fs.readFile(output, 'utf8');
    return { type: diagramType, html, bytes: Buffer.byteLength(html), sha256: sha256(html) };
  });
}

/** Run the engine's structural artifact checks (no browser). */
export async function checkArtifact(html) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vca-check-'));
  try {
    const file = path.join(dir, 'artifact.html');
    await fs.writeFile(file, html);
    const { code, stdout, stderr } = await run([cliPath(), 'check', file, '--json'], { cwd: dir });
    const report = parseJson(stdout) ?? { ok: false, checks: [], error: stderr.trim() };
    return { ...report, ok: code === 0 && report.ok !== false };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** The diagram's root <svg role="img"> element. */
export function extractSvg(html) {
  const match = html.match(/<svg\b[^>]*\brole="img"[\s\S]*?<\/svg>/);
  if (!match) throw new RenderError('Artifact has no <svg role="img"> diagram.');
  return match[0];
}

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;
const unescapeHtml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** Structural facts about an artifact, used by the gallery and the tests. */
export function artifactSummary(html) {
  const svg = extractSvg(html);
  const root = svg.match(/<svg\b[^>]*>/)[0];
  const nodeIds = [...new Set([...svg.matchAll(/data-node-id="([^"]+)"/g)].map((m) => m[1]))];
  const edges = [...new Set([...svg.matchAll(/data-edge-from="([^"]+)" data-edge-to="([^"]+)"/g)].map((m) => `${m[1]}->${m[2]}`))];
  const title = html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1];
  return {
    title: title ? unescapeHtml(title.trim()) : null,
    viewBox: attr(root, 'viewBox'),
    preset: attr(root, 'data-preset') ?? html.match(/<html[^>]*data-preset="([^"]+)"/)?.[1] ?? null,
    nodeIds,
    edges,
  };
}

/**
 * CSP source expressions for every executable inline <script> in an artifact.
 * JSON data islands (type="application/json") are not executed and need none.
 */
export function inlineScriptHashes(html) {
  const hashes = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const type = attr(match[1], 'type');
    if (attr(match[1], 'src') !== null) continue;
    if (type && !/^(text\/javascript|module|application\/javascript)$/i.test(type)) continue;
    hashes.push(`'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`);
  }
  return hashes;
}

/** Content-Security-Policy for serving a self-contained artifact. */
export function artifactCsp(html) {
  return [
    "default-src 'none'",
    `script-src ${inlineScriptHashes(html).join(' ')}`,
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    'media-src blob:',
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    'frame-ancestors *',
  ].join('; ');
}
