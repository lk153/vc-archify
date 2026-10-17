import { artifactHtml, galleryEntries } from '@/lib/gallery';

// "Beyond code" artifacts (leave plan, renting, budget, job search).
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return galleryEntries('life').map((e) => ({ slug: e.slug }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return new Response(artifactHtml(slug), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
