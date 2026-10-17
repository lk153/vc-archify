import fs from 'node:fs';
import path from 'node:path';

// Published JSON Schemas for the IR (one per diagram type, plus common.schema.json),
// served from the vendored engine so editors can validate/autocomplete IR files.
export const dynamic = 'force-static';
export const dynamicParams = false;

const SCHEMAS = path.join(process.cwd(), '..', '..', 'skills', 'vc-archify', 'schemas');

export function generateStaticParams() {
  return fs.readdirSync(SCHEMAS).filter((f) => f.endsWith('.schema.json')).map((file) => ({ file }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  return new Response(fs.readFileSync(path.join(SCHEMAS, path.basename(file)), 'utf8'), {
    headers: { 'Content-Type': 'application/schema+json; charset=utf-8' },
  });
}
