'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { preloadEngine, renderInBrowser, type DiagramType, type EngineDiagnostic, type RenderSuccess } from './engine';
import { locatePointer, offsetOf } from './jsonLocate';
import { withPreviewTheme, type PreviewTheme, type ResolvedTheme } from './previewTheme';
import styles from './Playground.module.css';

export interface PlaygroundExample {
  source: string;
  title: string;
  type: DiagramType;
  typeLabel: string;
}

interface Props {
  examples: PlaygroundExample[];
  defaultSource: string;
}

type Status =
  | { state: 'idle' }
  | { state: 'loading'; message: string }
  | { state: 'rendering' }
  | { state: 'ok'; ms: number; bytes: number; type: DiagramType }
  | { state: 'error'; count: number };

interface Stored {
  text?: string;
  source?: string | null;
  edited?: boolean;
  autoRender?: boolean;
  previewTheme?: PreviewTheme;
}

type Rendered = RenderSuccess & { text: string };

const STORAGE_KEY = 'vca-playground-v1';
const AUTO_RENDER_DELAY_MS = 700;
const THEMES: { value: PreviewTheme; label: string }[] = [
  { value: 'site', label: 'Match site' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

// The page must work without storage (private mode, blocked site data).
function readStored(): Stored {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const value = raw ? JSON.parse(raw) : null;
    return value && typeof value === 'object' ? (value as Stored) : {};
  } catch {
    return {};
  }
}

function writeStored(value: Stored) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable: the draft simply is not remembered */
  }
}

function setExampleQuery(source: string | null) {
  try {
    const url = new URL(window.location.href);
    if (source) url.searchParams.set('example', source);
    else url.searchParams.delete('example');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* history can be unavailable in embedded contexts */
  }
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function slugify(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function baseName(text: string, source: string | null, edited: boolean, type?: string) {
  if (source && !edited) return source.replace(/\.json$/, '');
  try {
    const ir = JSON.parse(text);
    const slug = typeof ir?.meta?.title === 'string' ? slugify(ir.meta.title) : '';
    const kind = typeof ir?.diagram_type === 'string' ? slugify(ir.diagram_type) : type;
    if (slug) return kind ? `${slug}.${kind}` : slug;
  } catch {
    /* fall through */
  }
  return source ? source.replace(/\.json$/, '') : `${type || 'vc-archify'}-diagram`;
}

const formatKb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;

export function Playground({ examples, defaultSource }: Props) {
  const ids = useId();
  const editorId = `${ids}-editor`;
  const exampleId = `${ids}-example`;
  const helpId = `${ids}-help`;
  const statusId = `${ids}-status`;

  const [text, setText] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [edited, setEdited] = useState(false);
  const [ready, setReady] = useState(false);
  const [autoRender, setAutoRender] = useState(true);
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>('site');
  const [siteTheme, setSiteTheme] = useState<ResolvedTheme>('dark');
  const [status, setStatus] = useState<Status>({ state: 'loading', message: 'Loading the playground…' });
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [diagnostics, setDiagnostics] = useState<EngineDiagnostic[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [renderCount, setRenderCount] = useState(0);

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestedRef = useRef<string | null>(null);

  const exampleBySource = useMemo(() => new Map(examples.map((e) => [e.source, e])), [examples]);
  // Group the picker by diagram type, in the order the examples arrive.
  const exampleGroups = useMemo(() => {
    const groups = new Map<string, PlaygroundExample[]>();
    for (const e of examples) groups.set(e.typeLabel, [...(groups.get(e.typeLabel) ?? []), e]);
    return [...groups.entries()];
  }, [examples]);

  const render = useCallback(async (value: string) => {
    requestedRef.current = value;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ state: 'rendering' });
    try {
      const result = await renderInBrowser(value, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setRenderCount((count) => count + 1);
      setWarnings(result.warnings ?? []);
      if (result.ok) {
        setRendered({ ...result, text: value });
        setDiagnostics([]);
        setStatus({ state: 'ok', ms: result.ms, bytes: result.bytes, type: result.type });
      } else {
        setDiagnostics(result.diagnostics);
        setStatus({ state: 'error', count: result.diagnostics.length });
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      setRenderCount((count) => count + 1);
      setDiagnostics([{ code: 'playground/unexpected', severity: 'error', message: String((error as Error)?.message || error), fixes: [] }]);
      setStatus({ state: 'error', count: 1 });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const loadExample = useCallback(async (next: string, { updateUrl = true } = {}) => {
    const example = exampleBySource.get(next);
    if (!example) return;
    abortRef.current?.abort();
    setStatus({ state: 'loading', message: `Loading example “${example.title}”…` });
    preloadEngine({ type: example.type }).catch(() => {});
    try {
      const response = await fetch(`/examples/${encodeURIComponent(next)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const value = await response.text();
      setText(value);
      setSource(next);
      setEdited(false);
      setReady(true);
      if (updateUrl) setExampleQuery(next);
      void render(value);
    } catch (error) {
      setReady(true);
      setDiagnostics([{
        code: 'playground/example-load',
        severity: 'error',
        message: `The example ${next} could not be loaded: ${(error as Error)?.message || error}`,
        fixes: ['check your connection and pick the example again'],
      }]);
      setStatus({ state: 'error', count: 1 });
    }
  }, [exampleBySource, render]);

  // First load: ?example=<source> wins, then the saved draft, then the default example.
  useEffect(() => {
    const stored = readStored();
    if (typeof stored.autoRender === 'boolean') setAutoRender(stored.autoRender);
    if (stored.previewTheme && THEMES.some((t) => t.value === stored.previewTheme)) setPreviewTheme(stored.previewTheme);
    let requested: string | null = null;
    try {
      requested = new URLSearchParams(window.location.search).get('example');
    } catch {
      requested = null;
    }
    if (requested && exampleBySource.has(requested)) {
      void loadExample(requested, { updateUrl: false });
    } else if (typeof stored.text === 'string' && stored.text.trim()) {
      const storedSource = stored.source && exampleBySource.has(stored.source) ? stored.source : null;
      setText(stored.text);
      setSource(storedSource);
      setEdited(storedSource ? Boolean(stored.edited) : true);
      setReady(true);
      if (requested) setExampleQuery(null);
      void render(stored.text);
    } else {
      if (requested) setExampleQuery(null);
      void loadExample(defaultSource, { updateUrl: false });
    }
    return () => abortRef.current?.abort();
    // Runs once on mount; the callbacks are stable for a given example list.
  }, []);

  // Debounced auto-render after edits.
  useEffect(() => {
    if (!ready || !autoRender || text === requestedRef.current) return undefined;
    const timer = window.setTimeout(() => void render(text), AUTO_RENDER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [text, ready, autoRender, render]);

  // Remember the draft and preferences.
  useEffect(() => {
    if (!ready) return undefined;
    const timer = window.setTimeout(() => writeStored({ text, source, edited, autoRender, previewTheme }), 400);
    return () => window.clearTimeout(timer);
  }, [text, source, edited, autoRender, previewTheme, ready]);

  // Follow the site theme (header toggle or system preference).
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const update = () => {
      const explicit = root.dataset.theme;
      setSiteTheme(explicit === 'light' || explicit === 'dark' ? explicit : media.matches ? 'light' : 'dark');
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    media.addEventListener('change', update);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', update);
    };
  }, []);

  const effectiveTheme: ResolvedTheme = previewTheme === 'site' ? siteTheme : previewTheme;
  const srcDoc = useMemo(() => (rendered ? withPreviewTheme(rendered.html, effectiveTheme) : ''), [rendered, effectiveTheme]);
  const stale = Boolean(rendered && rendered.text !== text);
  const currentExample = source ? exampleBySource.get(source) : undefined;

  const onEdit = (value: string) => {
    setText(value);
    if (!edited) {
      setEdited(true);
      setExampleQuery(null);
    }
  };

  const onPickExample = (next: string) => {
    if (next) void loadExample(next);
  };

  const selectRange = (start: number, end: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    editor.setSelectionRange(start, end);
    const line = text.slice(0, start).split('\n').length;
    const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 20;
    editor.scrollTop = Math.max(0, (line - 4) * lineHeight);
  };

  const goToPointer = (pointer: string) => {
    const range = locatePointer(text, pointer);
    if (range) selectRange(range.start, range.end);
    else editorRef.current?.focus();
  };

  const goToLine = (line: number, column: number) => {
    const offset = offsetOf(text, line, column);
    selectRange(offset, Math.min(text.length, offset + 1));
  };

  const formatJson = () => {
    try {
      const formatted = `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
      if (formatted !== text) onEdit(formatted);
    } catch {
      void render(text);
    }
  };

  const name = baseName(text, source, edited, rendered?.type);
  const statusText = (() => {
    switch (status.state) {
      case 'loading':
        return status.message;
      case 'rendering':
        return 'Rendering…';
      case 'ok':
        return `Rendered ${status.type} diagram in ${status.ms} ms (${formatKb(status.bytes)}).`;
      case 'error':
        return `${status.count} ${status.count === 1 ? 'problem' : 'problems'} found${rendered ? '; the preview shows the last successful render' : ''}.`;
      default:
        return '';
    }
  })();

  return (
    <div className={styles.playground}>
      <div className={styles.toolbar}>
        <div className={styles.field}>
          <label htmlFor={exampleId}>Example</label>
          <div className={styles.exampleRow}>
            <select
              id={exampleId}
              className={styles.select}
              value={source ?? ''}
              onChange={(event) => onPickExample(event.target.value)}
              data-testid="pg-example"
            >
              {!source && <option value="">Your draft</option>}
              {exampleGroups.map(([label, group]) => (
                <optgroup key={label} label={label}>
                  {group.map((e) => (
                    <option key={e.source} value={e.source}>
                      {e.title} · {e.typeLabel}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {source && edited && (
              <button type="button" className={`button ${styles.small}`} onClick={() => void loadExample(source)}>
                Revert edits
              </button>
            )}
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" className="button primary" onClick={() => void render(text)} disabled={!ready} data-testid="pg-render">
            Render
          </button>
          <label className={styles.check}>
            <input type="checkbox" checked={autoRender} onChange={(event) => setAutoRender(event.target.checked)} />
            Auto-render
          </label>
        </div>
      </div>

      <div className={styles.workspace}>
        <div className={styles.editorColumn}>
          <div className={styles.editorHeader}>
            <label htmlFor={editorId} className={styles.editorLabel}>
              IR JSON{currentExample ? <span className={styles.muted}> · {currentExample.title}{edited ? ' (edited)' : ''}</span> : null}
            </label>
            <button type="button" className={`button ${styles.small}`} onClick={formatJson} disabled={!ready}>
              Format
            </button>
          </div>
          <textarea
            id={editorId}
            ref={editorRef}
            className={styles.editor}
            value={text}
            onChange={(event) => onEdit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void render(text);
              }
            }}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            wrap="off"
            aria-describedby={`${helpId} ${statusId}`}
            placeholder={ready ? 'Paste or write a vc-archify IR (JSON) here.' : 'Loading…'}
            data-testid="pg-editor"
          />
          <p id={helpId} className={styles.help}>
            Edits render automatically when Auto-render is on. Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> (<kbd>⌘</kbd> + <kbd>Enter</kbd> on
            macOS) to render now. Everything runs in your browser; nothing is uploaded.
          </p>
        </div>

        <div className={styles.previewColumn}>
          <section className={styles.diagnostics} aria-labelledby={`${ids}-diag`} data-testid="pg-diagnostics">
            <h2 id={`${ids}-diag`} className={styles.panelTitle}>
              Diagnostics
            </h2>
            <p id={statusId} role="status" aria-live="polite" className={styles.status} data-state={status.state} data-renders={renderCount} data-testid="pg-status">
              {statusText}
            </p>
            {diagnostics.length > 0 && (
              <ol className={styles.diagList}>
                {diagnostics.map((d, index) => (
                  <li key={`${d.code}-${index}`} className={styles.diag} data-severity={d.severity}>
                    <div className={styles.diagHead}>
                      {d.code && <code className={styles.code}>{d.code}</code>}
                      {d.path && (
                        <button type="button" className={styles.linkButton} onClick={() => goToPointer(d.path!)}>
                          Go to <code>{d.path}</code>
                        </button>
                      )}
                      {d.line !== undefined && (
                        <button type="button" className={styles.linkButton} onClick={() => goToLine(d.line!, d.column ?? 1)}>
                          Go to line {d.line}, column {d.column ?? 1}
                        </button>
                      )}
                    </div>
                    <p className={styles.message}>{d.message}</p>
                    {d.fixes.length > 0 && (
                      <div className={styles.fixes}>
                        <p className={styles.fixesLabel}>Suggested {d.fixes.length === 1 ? 'fix' : 'fixes'}</p>
                        <ul>
                          {d.fixes.map((fix) => (
                            <li key={fix}>{fix}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {warnings.length > 0 && (
              <details className={styles.warnings}>
                <summary>
                  {warnings.length} engine {warnings.length === 1 ? 'notice' : 'notices'}
                </summary>
                <ul>
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
          </section>
          <section className={styles.previewPanel} aria-labelledby={`${ids}-preview`}>
            <div className={styles.previewHeader}>
              <h2 id={`${ids}-preview`} className={styles.panelTitle}>
                Preview
              </h2>
              <fieldset className={styles.themes}>
                <legend className="visually-hidden">Preview theme</legend>
                {THEMES.map((theme) => (
                  <label key={theme.value} className={styles.themeOption}>
                    <input
                      type="radio"
                      name={`${ids}-theme`}
                      value={theme.value}
                      checked={previewTheme === theme.value}
                      onChange={() => setPreviewTheme(theme.value)}
                    />
                    <span>{theme.label}</span>
                  </label>
                ))}
              </fieldset>
            </div>
            <div className={styles.frameWrap} data-stale={stale || status.state === 'error' ? 'true' : 'false'}>
              {rendered ? (
                <iframe
                  title={`Diagram preview: ${rendered.type}`}
                  className={styles.frame}
                  sandbox="allow-scripts allow-downloads"
                  referrerPolicy="no-referrer"
                  srcDoc={srcDoc}
                  data-testid="pg-preview"
                  data-theme={effectiveTheme}
                />
              ) : (
                <div className={styles.placeholder}>{status.state === 'error' ? 'Fix the problems to see a preview.' : 'The diagram appears here.'}</div>
              )}
            </div>
            <div className={styles.downloads}>
              <button
                type="button"
                className="button"
                disabled={!rendered}
                onClick={() => rendered && download(`${baseName(rendered.text, source, edited, rendered.type)}.html`, rendered.html, 'text/html;charset=utf-8')}
                data-testid="pg-download-html"
              >
                Download HTML
              </button>
              <button
                type="button"
                className="button"
                disabled={!text.trim()}
                onClick={() => download(`${name}.json`, text, 'application/json;charset=utf-8')}
                data-testid="pg-download-json"
              >
                Download JSON
              </button>
              {stale && rendered && <span className={styles.muted}>Download HTML saves the last successful render.</span>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
