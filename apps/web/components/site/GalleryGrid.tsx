'use client';

import { useEffect, useState, type ReactNode } from 'react';

export interface GalleryGridItem {
  slug: string;
  type: string;
  card: ReactNode;
}

export interface GalleryFilterOption {
  id: string;
  label: string;
  count: number;
}

const ALL = 'all';

/**
 * Type filter over server-rendered gallery cards. Without JavaScript every
 * card stays visible; with it, `?type=<id>` is read on load and kept in sync.
 */
export function GalleryGrid({ items, types }: { items: GalleryGridItem[]; types: GalleryFilterOption[] }) {
  const [active, setActive] = useState(ALL);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('type');
    if (requested && types.some((t) => t.id === requested)) setActive(requested);
  }, [types]);

  const choose = (id: string) => {
    setActive(id);
    const url = new URL(window.location.href);
    if (id === ALL) url.searchParams.delete('type');
    else url.searchParams.set('type', id);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const visible = items.filter((item) => active === ALL || item.type === active).length;
  const activeLabel = types.find((t) => t.id === active)?.label;

  return (
    <>
      <div className="filter-bar" role="group" aria-label="Filter artifacts by diagram type">
        {[{ id: ALL, label: 'All', count: items.length }, ...types].map((option) => (
          <button
            key={option.id}
            type="button"
            className="filter-button"
            aria-pressed={active === option.id}
            onClick={() => choose(option.id)}
          >
            {option.label}
            <span className="filter-count" aria-label={`, ${option.count} artifacts`}>
              {option.count}
            </span>
          </button>
        ))}
      </div>
      <p className="filter-status" role="status" aria-live="polite">
        {active === ALL ? `Showing all ${items.length} artifacts` : `Showing ${visible} ${activeLabel} artifact${visible === 1 ? '' : 's'} of ${items.length}`}
      </p>
      <ul className="gallery-grid">
        {items.map((item) => (
          <li key={item.slug} data-type={item.type} hidden={active !== ALL && item.type !== active}>
            {item.card}
          </li>
        ))}
      </ul>
    </>
  );
}
