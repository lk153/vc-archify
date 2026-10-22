'use client';

import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';
const KEY = 'vca-theme';

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * App theme switch, styled like the diagram viewer's own theme toggle: a pill
 * track with a sliding knob that shows a sun (light) or moon (dark). Its look
 * follows <html data-theme> / prefers-color-scheme in CSS, so it is right before
 * hydration too. The choice is a per-visitor convenience in localStorage.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const read = () => setTheme((document.documentElement.dataset.theme as Theme | undefined) ?? systemTheme());
    read();
    const media = window.matchMedia?.('(prefers-color-scheme: light)');
    media?.addEventListener('change', read);
    return () => media?.removeEventListener('change', read);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage can be unavailable (private mode); the toggle still works for this page */
    }
    setTheme(next);
  };

  const label = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label}>
      <span className="theme-toggle-icon" aria-hidden="true" />
    </button>
  );
}

/** Inline, render-blocking snippet that applies a stored theme before first paint. */
export const themeBootstrap = `try{var t=localStorage.getItem('${KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
