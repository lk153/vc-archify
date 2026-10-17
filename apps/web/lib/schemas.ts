import fs from 'node:fs';
import path from 'node:path';

// Build-time facts read from the vendored engine's JSON Schemas, so the site
// never states an IR version the engine does not accept.
const SCHEMAS = path.join(process.cwd(), '..', '..', 'skills', 'vc-archify', 'schemas');

export const schemaPath = (type: string) => `/schemas/${type}.schema.json`;

/** Accepted `schema_version` values for a diagram type, e.g. [1, 2]. */
export function schemaVersions(type: string): number[] {
  try {
    const schema = JSON.parse(fs.readFileSync(path.join(SCHEMAS, `${type}.schema.json`), 'utf8'));
    const field = schema?.properties?.schema_version ?? {};
    if (Array.isArray(field.enum)) return field.enum.filter((v: unknown): v is number => typeof v === 'number');
    if (typeof field.const === 'number') return [field.const];
  } catch {
    /* fall through */
  }
  return [];
}

export const formatVersions = (versions: number[]) => (versions.length ? versions.map((v) => `v${v}`).join(' · ') : 'n/a');
