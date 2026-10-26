'use client';

// Notifications for background work (folder and GitHub sync). A task shows as
// a toast with a progress bar while it runs, then turns into its result:
// success fades after a few seconds, an error stays longer. The viewport is a
// polite live region, so screen readers hear progress and results too.

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './Playground.module.css';

export type ToastTone = 'progress' | 'ok' | 'error';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  done: number;
  total: number | null;
}

export interface ToastTask {
  /** Report progress; `total: null` shows an indeterminate bar. */
  update(done: number, total?: number | null): void;
  succeed(title: string): void;
  fail(title: string): void;
}

// A fast sync still shows its bar long enough to be noticed, so it never just flashes.
export const MIN_PROGRESS_MS = 600;
const OK_MS = 4_000;
const ERROR_MS = 12_000;
const MAX_TOASTS = 4;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const patch = useCallback((id: number, update: (toast: Toast) => Partial<Toast>) => {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, ...update(t) } : t)));
  }, []);

  const expire = useCallback((id: number, ms: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.set(id, window.setTimeout(() => dismiss(id), ms));
  }, [dismiss]);

  const task = useCallback((title: string, total: number | null = null): ToastTask => {
    const id = nextId.current++;
    const started = Date.now();
    let settled = false;
    setToasts((list) => [...list, { id, tone: 'progress' as const, title, done: 0, total }].slice(-MAX_TOASTS));
    const settle = (tone: 'ok' | 'error', result: string) => {
      if (settled) return;
      settled = true;
      // Fill the bar, then show the result once it has been visible long enough.
      if (tone === 'ok') patch(id, (t) => ({ done: t.total ?? 1, total: t.total ?? 1 }));
      window.setTimeout(() => {
        patch(id, () => ({ tone, title: result }));
        expire(id, tone === 'ok' ? OK_MS : ERROR_MS);
      }, Math.max(0, MIN_PROGRESS_MS - (Date.now() - started)));
    };
    return {
      update: (done, nextTotal) => {
        if (!settled) patch(id, (t) => ({ done, total: nextTotal === undefined ? t.total : nextTotal }));
      },
      succeed: (result) => settle('ok', result),
      fail: (result) => settle('error', result),
    };
  }, [expire, patch]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return { toasts, task, dismiss };
}

export function ProgressBar({ done, total, label, slim = false }: { done: number; total: number | null; label: string; slim?: boolean }) {
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : null;
  return (
    <div
      className={styles.progress}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      data-indeterminate={percent === null ? 'true' : undefined}
      data-slim={slim ? 'true' : undefined}
    >
      <span className={styles.progressFill} style={percent === null ? undefined : { width: `${percent}%` }} />
    </div>
  );
}

export function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className={styles.toasts} role="region" aria-label="Notifications" aria-live="polite" data-testid="pg-toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={styles.toast} data-tone={toast.tone} role={toast.tone === 'error' ? 'alert' : undefined} data-testid="pg-toast">
          <span className={styles.toastIcon} aria-hidden="true">
            {toast.tone === 'ok' ? '✓' : toast.tone === 'error' ? '!' : ''}
          </span>
          <div className={styles.toastBody}>
            <p className={styles.toastTitle}>
              {toast.title}
              {toast.tone === 'progress' && toast.total ? <span className={styles.toastCount}> {toast.done} / {toast.total}</span> : null}
            </p>
            {toast.tone !== 'error' && <ProgressBar done={toast.done} total={toast.total} label={toast.title} />}
          </div>
          <button type="button" className={styles.toastClose} onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
