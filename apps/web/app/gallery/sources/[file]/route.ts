import { gallery, sourceText } from '@/lib/gallery';

// The exact IR that produced each artifact ("linked to the exact source").
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return gallery().entries.map((e) => ({ file: e.source }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  return new Response(sourceText(file), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
