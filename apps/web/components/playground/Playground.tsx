'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { BrandMark } from '@/components/BrandMark';
import { ThemeToggle } from '@/components/ThemeToggle';
import { REPO_URL, SITE_NAME, UPSTREAM_URL } from '@/lib/site';
import { preloadEngine, renderInBrowser, type DiagramType, type EngineDiagnostic, type RenderSuccess } from './engine';
import { locatePointer, offsetOf } from './jsonLocate';
import {
  createDiagram, loadLibrary, savedIdOf, savedSource, sortedLibrary, storageAvailable, storeLibrary, titleOf, typeOf,
  type SavedDiagram,
} from './library';
import { withPreviewTheme, type PreviewTheme, type ResolvedTheme } from './previewTheme';
import { SyncPanel, syncBadges } from './SyncPanel';
import { useDiagramSync } from './sync/useDiagramSync';
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
  panelWidth?: number;
  panelOpen?: boolean;
}

type Rendered = RenderSuccess & { text: string };

const STORAGE_KEY = 'vca-playground-v1';
const AUTO_RENDER_DELAY_MS = 700;
// Configuration panel width (px). The preview takes everything else.
const PANEL_DEFAULT = 440;
const PANEL_MIN = 320;
const PANEL_MAX_RATIO = 0.6;
const clampPanel = (width: number) =>
  Math.round(Math.min(Math.max(width, PANEL_MIN), Math.max(PANEL_MIN, window.innerWidth * PANEL_MAX_RATIO)));
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
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT);
  const [panelOpen, setPanelOpen] = useState(true);
  const [resizing, setResizing] = useState(false);
  const [siteTheme, setSiteTheme] = useState<ResolvedTheme>('dark');
  const [status, setStatus] = useState<Status>({ state: 'loading', message: 'Loading the playground…' });
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [diagnostics, setDiagnostics] = useState<EngineDiagnostic[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [renderCount, setRenderCount] = useState(0);
  const [library, setLibrary] = useState<SavedDiagram[]>([]);
  const [libraryOk, setLibraryOk] = useState(true);
  const [libraryNote, setLibraryNote] = useState('');

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestedRef = useRef<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<string | null>(null);

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

  // ---- My diagrams (browser storage) ------------------------------------------
  const updateLibrary = useCallback((update: (current: SavedDiagram[]) => SavedDiagram[]) => {
    setLibrary((current) => {
      const next = update(current);
      if (!storeLibrary(next)) setLibraryNote('Could not save: browser storage is unavailable or full. Use Download JSON to keep your work.');
      return next;
    });
  }, []);

  const openSaved = useCallback((id: string, list?: SavedDiagram[]) => {
    const entry = (list ?? library).find((d) => d.id === id);
    if (!entry) return;
    abortRef.current?.abort();
    setText(entry.text);
    setSource(savedSource(entry.id));
    setEdited(false);
    setReady(true);
    setExampleQuery(null);
    setLibraryNote('');
    void render(entry.text);
  }, [library, render]);

  const addToLibrary = useCallback((entries: SavedDiagram[]) => {
    updateLibrary((current) => [...entries, ...current]);
  }, [updateLibrary]);

  // Folder and GitHub sync. When a pull replaces the open diagram, reload the editor.
  const sync = useDiagramSync({
    library,
    updateLibrary,
    onExternalChange: (ids, next) => {
      const openId = savedIdOf(sourceRef.current);
      const entry = openId && ids.includes(openId) ? next.find((d) => d.id === openId) : undefined;
      if (entry) {
        setText(entry.text);
        void render(entry.text);
        setLibraryNote(`“${entry.name}” was updated from sync.`);
      }
    },
  });

  // First load: ?example=<source> wins, then the saved draft, then the default example.
  useEffect(() => {
    const stored = readStored();
    if (typeof stored.autoRender === 'boolean') setAutoRender(stored.autoRender);
    if (stored.previewTheme && THEMES.some((t) => t.value === stored.previewTheme)) setPreviewTheme(stored.previewTheme);
    if (typeof stored.panelWidth === 'number') setPanelWidth(clampPanel(stored.panelWidth));
    if (typeof stored.panelOpen === 'boolean') setPanelOpen(stored.panelOpen);
    const ok = storageAvailable();
    const saved = ok ? loadLibrary() : [];
    setLibraryOk(ok);
    setLibrary(saved);
    const storedSavedId = savedIdOf(stored.source ?? null);
    let requested: string | null = null;
    try {
      requested = new URLSearchParams(window.location.search).get('example');
    } catch {
      requested = null;
    }
    if (requested && exampleBySource.has(requested)) {
      void loadExample(requested, { updateUrl: false });
    } else if (storedSavedId && saved.some((d) => d.id === storedSavedId)) {
      openSaved(storedSavedId, saved);
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

  // Remember the draft and preferences (immediately when the selected diagram
  // changes, so a reload reopens it; debounced while typing).
  const storedSourceRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!ready) return undefined;
    const save = () => writeStored({ text, source, edited, autoRender, previewTheme, panelWidth, panelOpen });
    if (storedSourceRef.current !== source) {
      storedSourceRef.current = source;
      save();
      return undefined;
    }
    const timer = window.setTimeout(save, 400);
    return () => window.clearTimeout(timer);
  }, [text, source, edited, autoRender, previewTheme, panelWidth, panelOpen, ready]);

  // A diagram from "My diagrams" saves itself as you edit.
  const savedId = savedIdOf(source);
  useEffect(() => {
    if (!ready || !savedId) return undefined;
    const timer = window.setTimeout(() => {
      updateLibrary((current) => current.map((d) => (d.id === savedId && d.text !== text
        ? { ...d, text, type: typeOf(text) ?? d.type, updatedAt: Date.now() }
        : d)));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [text, savedId, ready, updateLibrary]);

  // Drag the divider to resize the configuration panel (pointer) or use the arrow keys.
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panelWidth;
    setResizing(true);
    const move = (e: PointerEvent) => setPanelWidth(clampPanel(startWidth + e.clientX - startX));
    const stop = () => {
      setResizing(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };
  const resizeByKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 80 : 20;
    if (event.key === 'ArrowLeft') setPanelWidth((w) => clampPanel(w - step));
    else if (event.key === 'ArrowRight') setPanelWidth((w) => clampPanel(w + step));
    else if (event.key === 'Home') setPanelWidth(clampPanel(PANEL_MIN));
    else if (event.key === 'End') setPanelWidth(clampPanel(window.innerWidth));
    else return;
    event.preventDefault();
  };

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
  sourceRef.current = source;
  const currentSaved = savedId ? library.find((d) => d.id === savedId) : undefined;
  const sortedSaved = useMemo(() => sortedLibrary(library), [library]);
  const typeLabelOf = (type: string | null) => examples.find((e) => e.type === type)?.typeLabel ?? type ?? 'Diagram';

  const onEdit = (value: string) => {
    setText(value);
    if (!edited && !savedId) {
      setEdited(true);
      setExampleQuery(null);
    }
  };

  const onPickExample = (next: string) => {
    const id = savedIdOf(next);
    if (id) openSaved(id);
    else if (next) void loadExample(next);
  };

  const saveAsMine = () => {
    const entry = createDiagram(titleOf(text) ?? currentExample?.title ?? 'Untitled diagram', text);
    addToLibrary([entry]);
    setSource(savedSource(entry.id));
    setEdited(false);
    setExampleQuery(null);
    setLibraryNote(`Saved “${entry.name}” to My diagrams in this browser.`);
  };

  const createNew = async (type: string) => {
    const template = examples.find((e) => e.type === type);
    if (!template) return;
    setStatus({ state: 'loading', message: `Creating a new ${template.typeLabel} diagram…` });
    try {
      const response = await fetch(`/examples/${encodeURIComponent(template.source)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const ir = await response.json();
      const name = `Untitled ${template.typeLabel.toLowerCase()} diagram`;
      ir.meta = { ...(ir.meta ?? {}), title: name };
      const entry = createDiagram(name, `${JSON.stringify(ir, null, 2)}\n`);
      addToLibrary([entry]);
      openSaved(entry.id, [entry]);
      setLibraryNote(`Created “${name}” from the ${template.title} example. Edit the JSON; it saves as you type.`);
    } catch (error) {
      setDiagnostics([{ code: 'playground/new', severity: 'error', message: `Could not create the diagram: ${(error as Error)?.message || error}`, fixes: [] }]);
      setStatus({ state: 'error', count: 1 });
    }
  };

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const imported: SavedDiagram[] = [];
    const problems: EngineDiagnostic[] = [];
    for (const file of Array.from(files)) {
      const value = await file.text();
      let ir: unknown;
      try {
        ir = JSON.parse(value);
      } catch (error) {
        problems.push({ code: 'playground/import', severity: 'error', message: `${file.name} is not valid JSON: ${(error as Error).message}`, fixes: ['import the .json IR file (Download JSON), not the rendered .html'] });
        continue;
      }
      if (typeof (ir as { diagram_type?: unknown })?.diagram_type !== 'string') {
        problems.push({ code: 'playground/import', severity: 'error', message: `${file.name} has no "diagram_type", so it is not a vc-archify diagram IR.`, fixes: ['import a vc-archify IR JSON file'] });
        continue;
      }
      imported.push(createDiagram(titleOf(value) ?? file.name.replace(/\.json$/i, ''), value));
    }
    if (importRef.current) importRef.current.value = '';
    if (imported.length) {
      addToLibrary(imported);
      openSaved(imported[imported.length - 1].id, imported);
      setLibraryNote(`Imported ${imported.length} ${imported.length === 1 ? 'diagram' : 'diagrams'} into My diagrams.`);
    }
    if (problems.length) {
      setDiagnostics(problems);
      setStatus({ state: 'error', count: problems.length });
    }
  };

  const renameSaved = (name: string) => {
    if (!savedId) return;
    updateLibrary((current) => current.map((d) => (d.id === savedId ? { ...d, name, updatedAt: Date.now() } : d)));
  };

  const deleteSaved = async () => {
    if (!currentSaved) return;
    const entry = currentSaved;
    const inFolder = Boolean(entry.folder && sync.folder.state === 'connected');
    if (!window.confirm(`Delete “${entry.name}” from My diagrams${inFolder ? ` and its file ${entry.folder!.file} from the folder` : ''}? This cannot be undone (download the JSON first to keep a copy).`)) return;
    const fromGitHub = Boolean(entry.github && sync.github.configured
      && window.confirm(`Also delete ${entry.github.path} from ${sync.github.settings.repo} on GitHub? This makes a commit.`));
    updateLibrary((current) => current.filter((d) => d.id !== entry.id));
    setLibraryNote(`Deleted “${entry.name}”.`);
    void loadExample(defaultSource, { updateUrl: false });
    if (inFolder) await sync.folder.remove(entry);
    if (fromGitHub) await sync.github.remove(entry);
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

  const name = currentSaved
    ? `${slugify(currentSaved.name) || 'diagram'}${currentSaved.type ? `.${currentSaved.type}` : ''}`
    : baseName(text, source, edited, rendered?.type);
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
    <div
      className={styles.app}
      data-panel={panelOpen ? 'open' : 'closed'}
      data-resizing={resizing ? 'true' : undefined}
      style={{ '--panel-width': `${panelWidth}px` } as CSSProperties}
    >
      <aside id={`${ids}-panel`} className={styles.panel} aria-label="Diagram configuration" hidden={!panelOpen}>
        <header className={styles.panelHeader}>
          <span className={styles.brand}>
            <BrandMark size={22} />
            <span>{SITE_NAME}</span>
          </span>
          <div className={styles.panelHeaderActions}>
            <ThemeToggle />
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setPanelOpen(false)}
              aria-controls={`${ids}-panel`}
              aria-expanded={panelOpen}
              aria-label="Hide configuration panel"
              title="Hide panel: show the preview full width"
              data-testid="pg-hide-panel"
            >
              <span aria-hidden="true">«</span>
            </button>
          </div>
        </header>

        <div className={styles.controls}>
          <div className={styles.field}>
            <label htmlFor={exampleId}>Diagram</label>
            <select
              id={exampleId}
              className={styles.select}
              value={source ?? ''}
              onChange={(event) => onPickExample(event.target.value)}
              data-testid="pg-example"
            >
              {!source && <option value="">Unsaved draft</option>}
              {sortedSaved.length > 0 && (
                <optgroup label="My diagrams">
                  {sortedSaved.map((d) => (
                    <option key={d.id} value={savedSource(d.id)}>
                      {d.name} · {typeLabelOf(d.type)}
                    </option>
                  ))}
                </optgroup>
              )}
              {exampleGroups.map(([label, group]) => (
                <optgroup key={label} label={`Examples · ${label}`}>
                  {group.map((e) => (
                    <option key={e.source} value={e.source}>
                      {e.title} · {e.typeLabel}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className={styles.row}>
            <select
              className={`${styles.select} ${styles.newSelect}`}
              value=""
              onChange={(event) => {
                const type = event.target.value;
                event.target.value = '';
                if (type) void createNew(type);
              }}
              disabled={!ready || !libraryOk}
              aria-label="New diagram from a template"
              data-testid="pg-new"
            >
              <option value="">+ New…</option>
              {exampleGroups.map(([label, group]) => (
                <option key={label} value={group[0].type}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`button ${styles.small}`}
              onClick={() => importRef.current?.click()}
              disabled={!libraryOk}
              data-testid="pg-import"
            >
              Import JSON
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              multiple
              hidden
              onChange={(event) => void importFiles(event.target.files)}
              data-testid="pg-import-input"
            />
            {!savedId && (
              <button type="button" className={`button ${styles.small}`} onClick={saveAsMine} disabled={!ready || !text.trim() || !libraryOk} data-testid="pg-save">
                Save to My diagrams
              </button>
            )}
            {currentExample && edited && (
              <button type="button" className={`button ${styles.small}`} onClick={() => void loadExample(currentExample.source)}>
                Revert edits
              </button>
            )}
          </div>

          {currentSaved && (
            <div className={styles.savedRow}>
              <label className={styles.nameField}>
                <span>Name</span>
                <input
                  className={styles.nameInput}
                  value={currentSaved.name}
                  onChange={(event) => renameSaved(event.target.value)}
                  onBlur={(event) => !event.target.value.trim() && renameSaved(titleOf(text) ?? 'Untitled diagram')}
                  data-testid="pg-name"
                />
              </label>
              <button type="button" className={`button ${styles.small} ${styles.danger}`} onClick={() => void deleteSaved()} data-testid="pg-delete">
                Delete
              </button>
            </div>
          )}
          <p className={styles.libraryHint} data-testid="pg-library-note">
            {libraryNote ||
              (!libraryOk
                ? 'Browser storage is unavailable, so diagrams cannot be saved here. Use Download JSON to keep your work.'
                : currentSaved
                  ? 'Saved in this browser as you edit. Download JSON to back it up or move it to another device.'
                  : 'Examples are read-only templates. Save to My diagrams to keep your edits in this browser.')}
          </p>
          {currentSaved && syncBadges(sync, currentSaved).length > 0 && (
            <p className={styles.badges} data-testid="pg-sync-badges">
              {syncBadges(sync, currentSaved).map((badge) => (
                <span key={badge} className={styles.badge} data-ok={badge.endsWith('✓') ? 'true' : 'false'}>
                  {badge}
                </span>
              ))}
            </p>
          )}
          <SyncPanel sync={sync} current={currentSaved} disabled={!libraryOk} />

          <div className={styles.row}>
            <button type="button" className={`button primary ${styles.small}`} onClick={() => void render(text)} disabled={!ready} data-testid="pg-render">
              Render
            </button>
            <label className={styles.check}>
              <input type="checkbox" checked={autoRender} onChange={(event) => setAutoRender(event.target.checked)} />
              Auto-render
            </label>
          </div>
          <fieldset className={styles.themes}>
            <legend className={styles.inlineLegend}>Preview theme</legend>
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

        <section className={styles.diagnostics} aria-labelledby={`${ids}-diag`} data-testid="pg-diagnostics">
          <h2 id={`${ids}-diag`} className="visually-hidden">
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

        <div className={styles.editorBlock}>
          <div className={styles.editorHeader}>
            <label htmlFor={editorId} className={styles.editorLabel}>
              IR JSON
              {currentSaved ? <span className={styles.muted}> · {currentSaved.name}</span> : null}
              {currentExample ? <span className={styles.muted}> · {currentExample.title}{edited ? ' (edited, not saved)' : ''}</span> : null}
            </label>
            <button type="button" className={`button ${styles.tiny}`} onClick={formatJson} disabled={!ready}>
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
            <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> renders now. Everything runs in your browser; nothing is uploaded.
          </p>
        </div>

        <footer className={styles.panelFooter}>
          <div className={styles.row}>
            <button
              type="button"
              className={`button ${styles.small}`}
              disabled={!rendered}
              onClick={() => rendered && download(`${currentSaved ? name : baseName(rendered.text, source, edited, rendered.type)}.html`, rendered.html, 'text/html;charset=utf-8')}
              data-testid="pg-download-html"
            >
              Download HTML
            </button>
            <button
              type="button"
              className={`button ${styles.small}`}
              disabled={!text.trim()}
              onClick={() => download(`${name}.json`, text, 'application/json;charset=utf-8')}
              data-testid="pg-download-json"
            >
              Download JSON
            </button>
          </div>
          {stale && rendered && <p className={styles.muted}>Download HTML saves the last successful render.</p>}
          <p className={styles.credits}>
            <a href={REPO_URL}>{SITE_NAME}</a> · MIT · built on the <a href={UPSTREAM_URL}>Archify</a> engine
          </p>
        </footer>
      </aside>

      {panelOpen && (
        <div
          className={styles.resizer}
          role="separator"
          aria-orientation="vertical"
          aria-controls={`${ids}-panel`}
          aria-label="Resize configuration panel"
          aria-valuemin={PANEL_MIN}
          aria-valuenow={panelWidth}
          tabIndex={0}
          onPointerDown={startResize}
          onKeyDown={resizeByKey}
          onDoubleClick={() => setPanelWidth(clampPanel(PANEL_DEFAULT))}
        />
      )}

      <section className={styles.stage} aria-labelledby={`${ids}-preview`}>
        <h2 id={`${ids}-preview`} className="visually-hidden">
          Preview
        </h2>
        {!panelOpen && (
          <button
            type="button"
            className={styles.showPanel}
            onClick={() => setPanelOpen(true)}
            aria-controls={`${ids}-panel`}
            aria-expanded={panelOpen}
            aria-label="Show configuration panel"
            title="Show panel"
            data-testid="pg-show-panel"
          >
            <span aria-hidden="true">»</span>
          </button>
        )}
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
          {rendered && (stale || status.state === 'error') && (
            <p className={styles.staleBadge} role="note" data-testid="pg-stale">
              <span className={styles.staleIcon} aria-hidden="true">i</span>
              {status.state === 'error'
                ? 'Preview shows the last successful render. Fix the issues in Diagnostics to update it.'
                : status.state === 'rendering' || autoRender
                  ? 'Updating the preview…'
                  : 'Preview is out of date. Press Render (Ctrl/⌘ + Enter) to update it.'}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
