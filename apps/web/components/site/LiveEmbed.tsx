'use client';

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';

export type EmbedTheme = 'dark' | 'light';

export const IFRAME_SANDBOX = 'allow-scripts allow-downloads allow-popups';

export function siteTheme(): EmbedTheme {
  const t = document.documentElement.dataset.theme;
  if (t === 'light' || t === 'dark') return t;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Calls `onChange` whenever the site theme changes (toggle or OS setting). */
export function watchSiteTheme(onChange: (theme: EmbedTheme) => void): () => void {
  const update = () => onChange(siteTheme());
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const media = window.matchMedia?.('(prefers-color-scheme: light)');
  media?.addEventListener?.('change', update);
  return () => {
    observer.disconnect();
    media?.removeEventListener?.('change', update);
  };
}

export const embedUrl = (href: string, theme: EmbedTheme, hash?: string) =>
  `${href}?embed=1&theme=${theme}${hash ? `#${hash}` : ''}`;

/**
 * Shows a static preview (children) and swaps in the live artifact only after
 * an explicit click, so list pages never pay for an ~800 KB artifact up front.
 * Without JavaScript the trigger is a plain link to the full viewer.
 */
export function LiveEmbed({
  href,
  hash,
  title,
  width,
  height,
  label = 'Click to explore live',
  children,
}: {
  href: string;
  hash?: string;
  title: string;
  width: number;
  height: number;
  label?: string;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<EmbedTheme | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  const live = theme !== null;
  // Once live: move focus into the diagram (the trigger is gone) and follow
  // later site theme changes; a theme change only swaps the iframe's query.
  useEffect(() => {
    if (!live) return;
    frame.current?.focus();
    return watchSiteTheme(setTheme);
  }, [live]);

  const load = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    setTheme(siteTheme());
  };

  return (
    <div className={`live-embed${theme ? ' is-live' : ''}`} style={{ aspectRatio: `${width} / ${height}` }}>
      {theme ? (
        <iframe
          ref={frame}
          className="live-embed-frame"
          src={embedUrl(href, theme, hash)}
          title={title}
          loading="lazy"
          sandbox={IFRAME_SANDBOX}
          allow="clipboard-write"
        />
      ) : (
        <>
          {children}
          <a className="live-embed-trigger" href={`${href}${hash ? `#${hash}` : ''}`} onClick={load}>
            <span className="live-embed-play" aria-hidden="true">
              ▶
            </span>
            {label}
            <span className="visually-hidden">: {title}</span>
          </a>
        </>
      )}
    </div>
  );
}
