import { artifactHtml, galleryEntries } from '@/lib/gallery';

// Each gallery artifact is a self-contained HTML document rendered by the
// engine at build time and served verbatim from the CDN (headers: next.config.ts).
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return galleryEntries('gallery').map((e) => ({ slug: e.slug }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return new Response(artifactHtml(slug), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
