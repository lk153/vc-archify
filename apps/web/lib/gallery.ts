import fs from 'node:fs';
import path from 'node:path';

// Data produced by scripts/build-gallery.mjs (apps/web/.generated). Read only
// at build time by statically generated pages and route handlers.

export type DiagramType =
  | 'architecture' | 'workflow' | 'sequence' | 'dataflow' | 'lifecycle' | 'erd'
  | 'class' | 'tree' | 'timeline' | 'waterfall';

export interface GalleryEntry {
  slug: string;
  kind: 'gallery' | 'life';
  type: DiagramType;
  title: string;
  subtitle: string;
  preset: string;
  engineeringProfile: string | null;
  focus: string | null;
  viewBox: string | null;
  nodeCount: number;
  edgeCount: number;
  bytes: number;
  sha256: string;
  source: string;
  sourceSha256: string;
  checks: number;
}

export interface GalleryData {
  engine: { version: string; upstreamCommit: string };
  csp: string;
  entries: GalleryEntry[];
}

const GENERATED = path.join(process.cwd(), '.generated');
let cached: GalleryData | undefined;

export function gallery(): GalleryData {
  if (!cached) {
    const file = path.join(GENERATED, 'gallery.json');
    if (!fs.existsSync(file)) {
      throw new Error('apps/web/.generated/gallery.json is missing. Run `pnpm --filter @vca/web gallery` first.');
    }
    cached = JSON.parse(fs.readFileSync(file, 'utf8')) as GalleryData;
  }
  return cached;
}

export const galleryEntries = (kind: GalleryEntry['kind'] = 'gallery') => gallery().entries.filter((e) => e.kind === kind);

export function findEntry(kind: GalleryEntry['kind'], slug: string): GalleryEntry | undefined {
  return gallery().entries.find((e) => e.kind === kind && e.slug === slug);
}

export function findEntryBySource(source: string): GalleryEntry | undefined {
  return gallery().entries.find((e) => e.source === source);
}

export const artifactHtml = (slug: string) => fs.readFileSync(path.join(GENERATED, 'artifacts', `${slug}.html`), 'utf8');
export const sourceText = (source: string) => fs.readFileSync(path.join(GENERATED, 'sources', source), 'utf8');

/** Public URL path of an artifact. */
export const artifactPath = (e: Pick<GalleryEntry, 'kind' | 'slug'>) =>
  e.kind === 'life' ? `/cases/life/${e.slug}` : `/gallery/artifacts/${e.slug}`;

export const TYPE_LABELS: Record<DiagramType, string> = {
  architecture: 'Architecture',
  workflow: 'Workflow',
  sequence: 'Sequence',
  dataflow: 'Data flow',
  lifecycle: 'Lifecycle',
  erd: 'Entity-relationship',
  class: 'Class',
  tree: 'Tree',
  timeline: 'Timeline',
  waterfall: 'Waterfall',
};
