import fs from 'node:fs';
import path from 'node:path';

// Data produced by scripts/build-examples.mjs (apps/web/.generated). Read only
// at build time by the statically generated page and the examples route.

export type DiagramType =
  | 'architecture' | 'workflow' | 'sequence' | 'dataflow' | 'lifecycle' | 'erd'
  | 'class' | 'tree' | 'timeline' | 'waterfall';

export interface ExampleEntry {
  slug: string;
  source: string;
  type: DiagramType;
  title: string;
  preset: string;
  nodeCount: number;
  edgeCount: number;
  bytes: number;
  sha256: string;
  sourceSha256: string;
}

export interface ExamplesData {
  engine: { version: string; upstreamCommit: string };
  entries: ExampleEntry[];
}

const GENERATED = path.join(process.cwd(), '.generated');
let cached: ExamplesData | undefined;

export function examplesData(): ExamplesData {
  if (!cached) {
    const file = path.join(GENERATED, 'examples.json');
    if (!fs.existsSync(file)) {
      throw new Error('apps/web/.generated/examples.json is missing. Run `pnpm --filter @vca/web examples` first.');
    }
    cached = JSON.parse(fs.readFileSync(file, 'utf8')) as ExamplesData;
  }
  return cached;
}

export const exampleEntries = () => examplesData().entries;
export const exampleSource = (source: string) => fs.readFileSync(path.join(GENERATED, 'sources', path.basename(source)), 'utf8');

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
