export type DiagramType =
  | 'architecture' | 'workflow' | 'sequence' | 'dataflow' | 'lifecycle' | 'erd'
  | 'class' | 'tree' | 'timeline' | 'waterfall';

export declare const DIAGRAM_TYPES: readonly DiagramType[];
export declare const FEATURED_TYPES: readonly DiagramType[];

export interface Diagnostic {
  code?: string;
  message: string;
  [key: string]: unknown;
}

export declare class RenderError extends Error {
  diagnostics: Diagnostic[];
  stdout: string;
  stderr: string;
  exitCode: number | string | null;
}

export interface RenderOptions {
  type?: DiagramType;
  quality?: 'standard' | 'showcase';
}

export interface RenderResult {
  type: DiagramType;
  html: string;
  bytes: number;
  sha256: string;
}

export interface EngineReport {
  ok: boolean;
  diagnostics?: Diagnostic[];
  checks?: { name: string; ok: boolean; details?: string[] }[];
  [key: string]: unknown;
}

export interface ArtifactSummary {
  title: string | null;
  viewBox: string | null;
  preset: string | null;
  nodeIds: string[];
  edges: string[];
}

export declare function skillRoot(): string;
export declare function sha256(data: string | Uint8Array): string;
export declare function diagramTypeOf(ir: unknown, explicit?: DiagramType): DiagramType;
export declare function validateDiagram(ir: unknown, options?: RenderOptions): Promise<EngineReport>;
export declare function renderDiagram(ir: unknown, options?: RenderOptions): Promise<RenderResult>;
export declare function checkArtifact(html: string): Promise<EngineReport>;
export declare function extractSvg(html: string): string;
export declare function artifactSummary(html: string): ArtifactSummary;
export declare function inlineScriptHashes(html: string): string[];
export declare function artifactCsp(html: string): string;
