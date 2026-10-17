import type { MetadataRoute } from 'next';
import { FEATURED_TYPES } from '@/lib/content';
import { artifactPath, gallery } from '@/lib/gallery';
import { schemaPath } from '@/lib/schemas';
import { SITE_URL } from '@/lib/site';

// Generated at build time: every static page, gallery artifact, "beyond code"
// case and the published schemas of the six featured diagram types.
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: { path: string; priority: number }[] = [
    { path: '/', priority: 1 },
    { path: '/start', priority: 0.9 },
    { path: '/gallery', priority: 0.9 },
    { path: '/guide', priority: 0.8 },
    { path: '/playground', priority: 0.7 },
    { path: '/community', priority: 0.5 },
  ];
  return [
    ...pages.map(({ path, priority }) => ({ url: `${SITE_URL}${path === '/' ? '' : path}`, changeFrequency: 'weekly' as const, priority })),
    ...gallery().entries.map((entry) => ({ url: `${SITE_URL}${artifactPath(entry)}`, changeFrequency: 'monthly' as const, priority: 0.6 })),
    ...FEATURED_TYPES.map((type) => ({ url: `${SITE_URL}${schemaPath(type)}`, changeFrequency: 'monthly' as const, priority: 0.3 })),
  ];
}
