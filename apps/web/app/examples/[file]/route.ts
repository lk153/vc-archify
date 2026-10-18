import { exampleEntries, exampleSource } from '@/lib/examples';

// The IR of each playground example, fetched by the page when an example is picked.
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return exampleEntries().map((e) => ({ file: e.source }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  return new Response(exampleSource(file), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
