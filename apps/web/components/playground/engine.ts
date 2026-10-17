// The in-browser vc-archify engine (packages/browser-engine). Its build output
// is served from /engine/ (apps/web/public/engine, produced by `pnpm engine`);
// this module is the typed client that loads it on demand.
export {
  DIAGRAM_TYPES,
  preloadEngine,
  renderInBrowser,
} from '@vca/browser-engine';
export type {
  DiagramType,
  EngineDiagnostic,
  RenderFailure,
  RenderResult,
  RenderSuccess,
} from '@vca/browser-engine';
