'use client';

import { useState, type CSSProperties } from 'react';
import { viewBoxSize } from '@/lib/content';
import { thumbnailSrc } from './thumbnail-src';

/**
 * Dark/light comparison of one artifact's static thumbnails. The range input
 * covers the image so it can be dragged anywhere and moved with arrow keys.
 * Without JavaScript it stays a static half-and-half split.
 */
export function ThemeCompare({ slug, title, viewBox }: { slug: string; title: string; viewBox: string | null }) {
  const [split, setSplit] = useState(50);
  const { width, height } = viewBoxSize(viewBox);
  const style = { aspectRatio: `${width} / ${height}`, '--split': `${split}%` } as CSSProperties;

  return (
    <div className="theme-compare" style={style}>
      <img src={thumbnailSrc(slug, 'dark')} width={width} height={height} alt={`${title} in the dark theme`} loading="lazy" decoding="async" />
      <img
        className="theme-compare-light"
        src={thumbnailSrc(slug, 'light')}
        width={width}
        height={height}
        alt={`${title} in the light theme`}
        loading="lazy"
        decoding="async"
      />
      <span className="theme-compare-divider" aria-hidden="true">
        <span className="theme-compare-handle">⇆</span>
      </span>
      <span className="theme-compare-tag dark" aria-hidden="true">
        Dark
      </span>
      <span className="theme-compare-tag light" aria-hidden="true">
        Light
      </span>
      <input
        className="theme-compare-range"
        type="range"
        min={0}
        max={100}
        value={split}
        onChange={(event) => setSplit(Number(event.target.value))}
        aria-label="Theme comparison: share of the diagram shown in the dark theme"
        aria-valuetext={`${split}% dark, ${100 - split}% light`}
      />
    </div>
  );
}
