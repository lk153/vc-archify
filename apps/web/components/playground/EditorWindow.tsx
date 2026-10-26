'use client';

// A large, window-like editor for the IR JSON: a modal <dialog> the reader can
// move by its title bar, resize from any edge or corner, or maximize to fill
// the browser window. It edits the same text as the panel's editor, so closing
// it simply returns to the page, with the caret where it was left. The window's
// size, position, maximized state and line wrapping are remembered.

import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { EngineDiagnostic } from './engine';
import { locatePointer, offsetOf } from './jsonLocate';
import styles from './Playground.module.css';

export interface TextSelection {
  start: number;
  end: number;
}

interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
  maximized: boolean;
  wrap: boolean;
}

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const KEY = 'vca-editor-window-v1';
const MIN_W = 420;
const MIN_H = 260;
const SHOWN_PROBLEMS = 3;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/** Keep the window inside the browser window (it never shrinks below the minimum size). */
function fit(g: Geometry): Geometry {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = clamp(g.w, Math.min(MIN_W, vw), vw);
  const h = clamp(g.h, Math.min(MIN_H, vh), vh);
  return { ...g, w, h, x: clamp(g.x, 0, vw - w), y: clamp(g.y, 0, vh - h) };
}

function initialGeometry(): Geometry {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(1100, Math.round(vw * 0.86));
  const h = Math.min(900, Math.round(vh * 0.86));
  const fallback: Geometry = { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w, h, maximized: vw < 900, wrap: false };
  try {
    const stored = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Partial<Geometry> | null;
    const numbers = stored && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(stored[k as keyof Geometry]));
    return fit(numbers ? { ...fallback, ...stored, maximized: Boolean(stored.maximized), wrap: Boolean(stored.wrap) } as Geometry : fallback);
  } catch {
    return fallback;
  }
}

function remember(g: Geometry) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(g));
  } catch {
    /* storage unavailable: the window opens at its default size next time */
  }
}

const lineColumn = (text: string, offset: number) => ({
  line: text.slice(0, offset).split('\n').length,
  column: offset - text.lastIndexOf('\n', offset - 1),
});

interface Props {
  open: boolean;
  title: string;
  value: string;
  onChange: (value: string) => void;
  onRender: () => void;
  onFormat: () => void;
  /** The render status line, and its state (`ok`, `error`, `rendering`…). */
  status: string;
  statusState: string;
  diagnostics: EngineDiagnostic[];
  /** Caret to start from (the panel editor's). */
  selection: TextSelection;
  /** Closed by the close button or Escape; returns the caret to put back in the panel editor. */
  onClose: (selection: TextSelection) => void;
}

export function EditorWindow({ open, title, value, onChange, onRender, onFormat, status, statusState, diagnostics, selection, onClose }: Props) {
  const ids = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const geometryRef = useRef<Geometry | null>(null);
  geometryRef.current = geometry;
  const [caret, setCaret] = useState({ line: 1, column: 1 });

  const update = (next: Geometry, persist = false) => {
    setGeometry(next);
    if (persist) remember(next);
  };

  // Size the window before it first paints, then open the modal dialog.
  useLayoutEffect(() => {
    if (open) setGeometry((g) => fit(g ?? initialGeometry()));
  }, [open]);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && geometry && !dialog.open) {
      dialog.showModal();
      const area = textRef.current;
      if (area) {
        area.focus();
        area.setSelectionRange(selection.start, selection.end);
        const { line } = lineColumn(area.value, selection.start);
        area.scrollTop = Math.max(0, (line - 6) * (parseFloat(getComputedStyle(area).lineHeight) || 20));
        setCaret(lineColumn(area.value, selection.start));
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
    // Opening reads the caret once; later selection props must not move it.
  }, [open, geometry !== null]);

  // A smaller browser window keeps the editor window inside it.
  useEffect(() => {
    if (!open) return undefined;
    const onResize = () => setGeometry((g) => (g ? fit(g) : g));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  const close = () => dialogRef.current?.close();
  const handleClosed = () => {
    const area = textRef.current;
    onClose({ start: area?.selectionStart ?? 0, end: area?.selectionEnd ?? 0 });
  };

  const toggleMaximized = () => {
    if (geometry) update({ ...geometry, maximized: !geometry.maximized }, true);
  };
  const toggleWrap = () => {
    if (geometry) update({ ...geometry, wrap: !geometry.wrap }, true);
  };

  // Move by the title bar, resize by an edge or corner.
  const startDrag = (mode: 'move' | Edge) => (event: ReactPointerEvent<HTMLElement>) => {
    const start = geometryRef.current;
    if (event.button !== 0 || !start || start.maximized) return;
    if (mode === 'move' && (event.target as HTMLElement).closest('button, input, label')) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const { clientX: px, clientY: py } = event;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const minW = Math.min(MIN_W, vw);
    const minH = Math.min(MIN_H, vh);
    const right = start.x + start.w;
    const bottom = start.y + start.h;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - px;
      const dy = e.clientY - py;
      let { x, y, w, h } = start;
      if (mode === 'move') {
        x = clamp(start.x + dx, 0, vw - w);
        y = clamp(start.y + dy, 0, vh - h);
      } else {
        if (mode.includes('w')) {
          x = clamp(start.x + dx, 0, right - minW);
          w = right - x;
        }
        if (mode.includes('e')) w = clamp(start.w + dx, minW, vw - start.x);
        if (mode.includes('n')) {
          y = clamp(start.y + dy, 0, bottom - minH);
          h = bottom - y;
        }
        if (mode.includes('s')) h = clamp(start.h + dy, minH, vh - start.y);
      }
      update({ ...start, x, y, w, h });
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      if (geometryRef.current) remember(geometryRef.current);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  const trackCaret = () => {
    const area = textRef.current;
    if (area) setCaret(lineColumn(area.value, area.selectionStart));
  };

  const select = (start: number, end: number) => {
    const area = textRef.current;
    if (!area) return;
    area.focus();
    area.setSelectionRange(start, end);
    const { line } = lineColumn(area.value, start);
    area.scrollTop = Math.max(0, (line - 6) * (parseFloat(getComputedStyle(area).lineHeight) || 20));
    trackCaret();
  };
  const goTo = (d: EngineDiagnostic) => {
    if (d.path) {
      const range = locatePointer(value, d.path);
      if (range) select(range.start, range.end);
    } else if (d.line !== undefined) {
      const offset = offsetOf(value, d.line, d.column ?? 1);
      select(offset, Math.min(value.length, offset + 1));
    }
  };

  const maximized = geometry?.maximized ?? false;
  const style = geometry && !maximized ? { left: geometry.x, top: geometry.y, width: geometry.w, height: geometry.h } : undefined;

  return (
    <dialog
      ref={dialogRef}
      className={styles.editorDialog}
      style={style}
      data-maximized={maximized ? 'true' : undefined}
      aria-labelledby={`${ids}-title`}
      onClose={handleClosed}
      data-testid="pg-editor-window"
    >
      <div className={styles.editorWindow}>
        <header className={styles.editorWindowBar} onPointerDown={startDrag('move')} onDoubleClick={(e) => !(e.target as HTMLElement).closest('button') && toggleMaximized()}>
          <h2 id={`${ids}-title`} className={styles.editorWindowTitle}>
            {title}
          </h2>
          <button type="button" className={`button ${styles.tiny}`} onClick={onFormat}>
            Format
          </button>
          <button type="button" className={`button primary ${styles.tiny}`} onClick={onRender} title="Render now (Ctrl/⌘ + Enter)">
            Render
          </button>
          <button
            type="button"
            className={styles.windowButton}
            onClick={toggleMaximized}
            aria-pressed={maximized}
            aria-label={maximized ? 'Restore window size' : 'Maximize'}
            title={maximized ? 'Restore size (double-click the title bar)' : 'Maximize (double-click the title bar)'}
            data-testid="pg-editor-window-maximize"
          >
            <span aria-hidden="true">{maximized ? '❐' : '□'}</span>
          </button>
          <button type="button" className={styles.windowButton} onClick={close} aria-label="Close editor window" title="Close (Esc)" data-testid="pg-editor-window-close">
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <textarea
          ref={textRef}
          className={styles.editorWindowText}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            trackCaret();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              onRender();
            }
          }}
          onSelect={trackCaret}
          aria-label={title}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          wrap={geometry?.wrap ? 'soft' : 'off'}
          data-wrap={geometry?.wrap ? 'true' : undefined}
          data-testid="pg-editor-window-text"
        />
        {diagnostics.length > 0 && (
          <ol className={styles.editorWindowProblems} aria-label="Problems">
            {diagnostics.slice(0, SHOWN_PROBLEMS).map((d, index) => (
              <li key={`${d.code}-${index}`}>
                {d.code && <code className={styles.code}>{d.code}</code>} <span>{d.message.split('\n')[0]}</span>
                {(d.path || d.line !== undefined) && (
                  <button type="button" className={styles.linkButton} onClick={() => goTo(d)}>
                    Go to {d.path ? <code>{d.path}</code> : `line ${d.line}`}
                  </button>
                )}
              </li>
            ))}
            {diagnostics.length > SHOWN_PROBLEMS && <li className={styles.muted}>+{diagnostics.length - SHOWN_PROBLEMS} more in Diagnostics</li>}
          </ol>
        )}
        <footer className={styles.editorWindowFoot}>
          <span className={styles.editorWindowStatus} data-state={statusState}>
            {status}
          </span>
          <span className={styles.editorWindowCaret}>
            Ln {caret.line}, Col {caret.column}
          </span>
          <label className={styles.check}>
            <input type="checkbox" checked={geometry?.wrap ?? false} onChange={toggleWrap} />
            Wrap lines
          </label>
          <span className={styles.muted}>
            <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> renders · <kbd>Esc</kbd> closes
          </span>
        </footer>
      </div>
      {!maximized && EDGES.map((edge) => (
        <div key={edge} className={styles.resizeHandle} data-edge={edge} onPointerDown={startDrag(edge)} aria-hidden="true" />
      ))}
    </dialog>
  );
}
