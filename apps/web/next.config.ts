import fs from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

const repoRoot = path.resolve(process.cwd(), '..', '..');

// Written by scripts/build-gallery.mjs before `next build`. The viewer's inline
// scripts are identical in every artifact, so one hash-based CSP covers them.
function artifactCsp(): string | null {
  try {
    const gallery = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.generated', 'gallery.json'), 'utf8'));
    return typeof gallery.csp === 'string' ? gallery.csp : null;
  } catch {
    return null;
  }
}

const security = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // Vercel already sends HSTS on *.vercel.app; add `preload` only once a custom apex domain exists.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

// Artifacts are self-contained and meant to be embedded (gallery Proof Lab,
// docs, PR comments), so they get a strict CSP instead of X-Frame-Options.
const csp = artifactCsp();
const artifactHeaders = [
  ...security,
  ...(csp ? [{ key: 'Content-Security-Policy', value: csp }] : []),
  { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: { unoptimized: true }, // Hobby: never use the Image Optimization quota (Plan §4.0)
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  async redirects() {
    // PRD §6: legacy *.html artifact URLs → extension-less (permanent = 308).
    return [
      { source: '/gallery/artifacts/:slug([^/]+)\\.html', destination: '/gallery/artifacts/:slug', permanent: true },
      { source: '/cases/life/:slug([^/]+)\\.html', destination: '/cases/life/:slug', permanent: true },
      { source: '/gallery.html', destination: '/gallery', permanent: true },
      { source: '/guide.html', destination: '/guide', permanent: true },
      { source: '/start.html', destination: '/start', permanent: true },
      { source: '/index.html', destination: '/', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/((?!gallery/artifacts/|cases/life/).*)',
        headers: [...security, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
      { source: '/gallery/artifacts/:slug', headers: artifactHeaders },
      { source: '/cases/life/:slug', headers: artifactHeaders },
    ];
  },
};

export default nextConfig;
