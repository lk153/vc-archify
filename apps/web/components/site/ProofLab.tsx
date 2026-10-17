'use client';

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { embedUrl, IFRAME_SANDBOX, siteTheme, type EmbedTheme } from './LiveEmbed';
import { thumbnailSrc } from './thumbnail-src';

export interface ProofLabEntry {
  slug: string;
  title: string;
  typeLabel: string;
  preset: string;
  href: string;
  width: number;
  height: number;
  sizeLabel: string;
}

const plainClick = (event: MouseEvent | ReactMouseEvent) =>
  !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0);

/**
 * One artifact at a time, live, in a forced theme. It starts as a static
 * thumbnail; the iframe is created only after an explicit click. Cards on the
 * page can hand an artifact to the lab through links with `data-proof-slug`.
 */
export function ProofLab({ entries, sectionId }: { entries: ProofLabEntry[]; sectionId: string }) {
  const [slug, setSlug] = useState(entries[0]?.slug ?? '');
  const [theme, setTheme] = useState<EmbedTheme>('dark');
  const [live, setLive] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const focusOnLoad = useRef(false);
  const current = entries.find((e) => e.slug === slug) ?? entries[0];

  useEffect(() => setTheme(siteTheme()), []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[data-proof-slug]');
      if (!link || !plainClick(event)) return;
      const requested = link.getAttribute('data-proof-slug');
      if (!requested || !entries.some((e) => e.slug === requested)) return;
      event.preventDefault();
      setSlug(requested);
      setLive(true);
      focusOnLoad.current = true;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      document.getElementById(sectionId)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [entries, sectionId]);

  useEffect(() => {
    if (live && focusOnLoad.current) {
      focusOnLoad.current = false;
      frame.current?.focus({ preventScroll: true });
    }
  }, [live, slug]);

  if (!current) return null;
  const src = embedUrl(current.href, theme);

  const load = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!plainClick(event)) return;
    event.preventDefault();
    focusOnLoad.current = true;
    setLive(true);
  };

  return (
    <div className="proof-lab">
      <div className="proof-controls">
        <label className="proof-field">
          <span>Artifact</span>
          <select value={current.slug} onChange={(event) => setSlug(event.target.value)}>
            {entries.map((e) => (
              <option key={e.slug} value={e.slug}>
                {e.title} · {e.typeLabel}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="proof-theme">
          <legend>Theme</legend>
          {(['dark', 'light'] as const).map((value) => (
            <label key={value}>
              <input type="radio" name="proof-theme" value={value} checked={theme === value} onChange={() => setTheme(value)} />
              <span>{value === 'dark' ? 'Dark' : 'Light'}</span>
            </label>
          ))}
        </fieldset>
        <div className="proof-actions">
          {live ? (
            <button type="button" className="button" onClick={() => setLive(false)}>
              Unload live view
            </button>
          ) : null}
          <a className="text-link" href={src} target="_blank" rel="noopener">
            Open this embed in a new tab ↗
          </a>
        </div>
      </div>

      <div className={`proof-stage${live ? ' is-live' : ''}`}>
        {live ? (
          <iframe
            ref={frame}
            src={src}
            title={`${current.title}, live ${current.typeLabel.toLowerCase()} diagram in the ${theme} theme`}
            loading="lazy"
            sandbox={IFRAME_SANDBOX}
            allow="clipboard-write"
          />
        ) : (
          <>
            <img
              src={thumbnailSrc(current.slug, theme)}
              width={current.width}
              height={current.height}
              alt={`Static preview of “${current.title}” in the ${theme} theme`}
              loading="lazy"
              decoding="async"
            />
            <a className="live-embed-trigger" href={src} onClick={load}>
              <span className="live-embed-play" aria-hidden="true">
                ▶
              </span>
              Click to explore live
              <span className="visually-hidden">: {current.title}</span>
            </a>
          </>
        )}
      </div>
      <p className="proof-status" role="status" aria-live="polite">
        {live
          ? `Live: ${current.title} · ${current.preset} · ${theme} theme. Keyboard shortcuts work once the diagram has focus.`
          : `Static preview: ${current.title} · ${current.preset}. Loading the live artifact fetches one ${current.sizeLabel} file.`}
      </p>
    </div>
  );
}
