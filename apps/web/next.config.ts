import path from 'node:path';
import type { NextConfig } from 'next';

const repoRoot = path.resolve(process.cwd(), '..', '..');

const security = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Vercel already sends HSTS on *.vercel.app; add `preload` only once a custom apex domain exists.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: { unoptimized: true }, // Hobby: never use the Image Optimization quota (Plan §4.0)
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  async redirects() {
    // The app is a single page; links to the earlier multi-page site land on it.
    return ['/playground', '/gallery', '/gallery/:path*', '/start', '/guide', '/community', '/cases/:path*'].map((source) => ({
      source,
      destination: '/',
      permanent: true,
    }));
  },
  async headers() {
    return [{ source: '/:path*', headers: security }];
  },
};

export default nextConfig;
