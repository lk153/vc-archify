import type { Metadata } from 'next';
import { SITE_NAME, TAGLINE } from './site';

// app/opengraph-image.tsx. A page-level `openGraph` object replaces the
// inherited file-based image, so it is referenced explicitly here.
const OG_IMAGE = { url: '/opengraph-image', width: 1200, height: 630, alt: `${SITE_NAME}: ${TAGLINE}` };

/** Per-page title, description, canonical URL and social cards. */
export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  const social = `${title} · ${SITE_NAME}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', siteName: SITE_NAME, title: social, description, url: path, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title: social, description, images: [OG_IMAGE.url] },
  };
}
