import type { GalleryEntry } from '@/lib/gallery';
import { viewBoxSize } from '@/lib/content';
import { thumbnailSrc } from './thumbnail-src';

type ThumbEntry = Pick<GalleryEntry, 'slug' | 'viewBox' | 'title'>;

/**
 * Static WebP preview of an artifact in both site themes. Only the image that
 * matches the active theme is displayed (see .thumb-* in site.css); with lazy
 * loading the hidden one is never fetched. Width/height come from the
 * artifact's viewBox so the page does not shift while images load.
 */
export function Thumbnail({
  entry,
  alt,
  priority = false,
  className,
}: {
  entry: ThumbEntry;
  alt?: string;
  /** Above the fold: fetch the visible variant early. */
  priority?: boolean;
  className?: string;
}) {
  const { width, height } = viewBoxSize(entry.viewBox);
  const text = alt ?? `Static preview of the “${entry.title}” diagram`;
  // Always lazy, even above the fold: the hidden theme variant is then never
  // fetched, and React does not emit <link rel=preload> hints for it (those
  // hints would otherwise ride along in prefetches onto every other page).
  const loading = 'lazy';
  const fetchPriority = priority ? 'high' : undefined;
  return (
    <span className={`thumb${className ? ` ${className}` : ''}`} style={{ aspectRatio: `${width} / ${height}` }}>
      <img className="thumb-img thumb-dark" src={thumbnailSrc(entry.slug, 'dark')} width={width} height={height} alt={text} loading={loading} fetchPriority={fetchPriority} decoding="async" />
      <img className="thumb-img thumb-light" src={thumbnailSrc(entry.slug, 'light')} width={width} height={height} alt={text} loading={loading} fetchPriority={fetchPriority} decoding="async" />
    </span>
  );
}
