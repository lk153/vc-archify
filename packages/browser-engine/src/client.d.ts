export type DiagramType =
  | 'architecture' | 'workflow' | 'sequence' | 'dataflow' | 'lifecycle' | 'erd'
  | 'class' | 'tree' | 'timeline' | 'waterfall';

export declare const DIAGRAM_TYPES: readonly DiagramType[];
export declare const DEFAULT_TIMEOUT_MS: number;

export interface EngineDiagnostic {
  /** Engine diagnostic code, e.g. "schema/required" or "architecture/unknown-endpoint". */
  code?: string;
  severity: 'error' | 'warning';
  message: string;
  /** JSON pointer into the IR, when the engine names one. */
  path?: string;
  /** Suggested fixes from the engine. */
  fixes: string[];
  /** 1-based position, for JSON syntax errors. */
  line?: number;
  column?: number;
}

export interface RenderSuccess {
  ok: true;
  type: DiagramType;
  /** The self-contained artifact; byte-identical to `renderDiagram(ir).html` from @vca/render. */
  html: string;
  bytes: number;
  /** Non-blocking engine notices (e.g. locale fallbacks). */
  warnings: string[];
  /** Wall-clock time of the call in milliseconds. */
  ms: number;
}

export interface RenderFailure {
  ok: false;
  diagnostics: EngineDiagnostic[];
  warnings?: string[];
  ms?: number;
}

export type RenderResult = RenderSuccess | RenderFailure;

export interface RenderOptions {
  /** Aborting terminates the render worker; the promise then rejects with an AbortError. */
  signal?: AbortSignal;
  /** Default 30 000 ms; a render that runs longer is stopped and reported as engine/timeout. */
  timeoutMs?: number;
  /** Where the engine build is served (default "/engine/"). */
  baseUrl?: string;
}

export interface EngineInfo {
  version: string;
  upstreamCommit: string;
}

/** Render one IR (object or JSON text) in a fresh Web Worker. */
export declare function renderInBrowser(ir: unknown, options?: RenderOptions): Promise<RenderResult>;

/** Fetch the manifest, template, worker and optionally one type's modules ahead of time. */
export declare function preloadEngine(options?: { type?: DiagramType; baseUrl?: string }): Promise<{ engine: EngineInfo }>;

export declare function engineInfo(options?: { baseUrl?: string }): Promise<EngineInfo>;
