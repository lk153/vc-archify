import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/metadata';
import Link from 'next/link';
import { GalleryGrid, type GalleryFilterOption, type GalleryGridItem } from '@/components/site/GalleryGrid';
import { ProofLab, type ProofLabEntry } from '@/components/site/ProofLab';
import { Thumbnail } from '@/components/site/Thumbnail';
import { ENGINE_CHECKS, FEATURED_TYPES, formatKB, viewBoxSize } from '@/lib/content';
import { artifactPath, gallery, galleryEntries, TYPE_LABELS, type GalleryEntry } from '@/lib/gallery';
import styles from './gallery.module.css';

export const metadata: Metadata = pageMetadata({
  title: 'Gallery',
  description:
    'Every vc-archify gallery diagram is a live artifact, regenerated from versioned JSON at build time and checked by the engine. Open, present, or load one live in the Proof Lab.',
  path: '/gallery',
});

const PROOF_LAB_ID = 'proof-lab';

function GalleryCard({ entry }: { entry: GalleryEntry }) {
  const href = artifactPath(entry);
  const titleId = `art-${entry.slug.replace(/[^a-z0-9-]/gi, '-')}`;
  const hidden = <span className="visually-hidden"> {entry.title}</span>;
  return (
    <article className={`card ${styles.card}`} aria-labelledby={titleId}>
      <a href={href} className={styles.thumb} tabIndex={-1} aria-hidden="true">
        <Thumbnail entry={entry} alt="" />
      </a>
      <div className={styles.body}>
        <p className={styles.meta}>
          <span className="chip">{TYPE_LABELS[entry.type]}</span>
          <span className="chip">{entry.preset}</span>
          {entry.engineeringProfile && <span className="chip">{entry.engineeringProfile}</span>}
        </p>
        <h3 id={titleId} className={styles.title}>
          {entry.title}
        </h3>
        <dl className={styles.stats}>
          <div>
            <dt>Nodes</dt>
            <dd>{entry.nodeCount}</dd>
          </div>
          <div>
            <dt>Relationships</dt>
            <dd>{entry.edgeCount}</dd>
          </div>
          <div>
            <dt>File</dt>
            <dd>{formatKB(entry.bytes)}</dd>
          </div>
          <div>
            <dt>Checks</dt>
            <dd>
              {entry.checks}/{entry.checks}
            </dd>
          </div>
        </dl>
        <ul className={styles.links}>
          <li>
            <a href={href}>Open{hidden}</a>
          </li>
          <li>
            <a href={`${href}?present=1`}>Present{hidden}</a>
          </li>
          <li>
            <a href={`/gallery/sources/${entry.source}`}>
              Source JSON<span className="visually-hidden"> for {entry.title}</span>
            </a>
          </li>
          <li>
            <Link prefetch={false} href={`/playground?example=${encodeURIComponent(entry.source)}`}>
              Edit in playground<span className="visually-hidden">: {entry.title}</span>
            </Link>
          </li>
          <li>
            <a href={`#${PROOF_LAB_ID}`} data-proof-slug={entry.slug}>
              Load in Proof Lab<span className="visually-hidden">: {entry.title}</span>
            </a>
          </li>
        </ul>
      </div>
    </article>
  );
}

export default function GalleryPage() {
  const { engine } = gallery();
  const entries = galleryEntries('gallery');
  const life = galleryEntries('life');
  const checks = Math.min(...entries.map((e) => e.checks));
  const presets = [...new Set(entries.map((e) => e.preset))];

  const types: GalleryFilterOption[] = FEATURED_TYPES.map((type) => ({
    id: type,
    label: TYPE_LABELS[type],
    count: entries.filter((e) => e.type === type).length,
  })).filter((t) => t.count > 0);

  const items: GalleryGridItem[] = entries.map((entry) => ({
    slug: entry.slug,
    type: entry.type,
    card: <GalleryCard entry={entry} />,
  }));

  const lab: ProofLabEntry[] = entries.map((entry) => {
    const { width, height } = viewBoxSize(entry.viewBox);
    return {
      slug: entry.slug,
      title: entry.title,
      typeLabel: TYPE_LABELS[entry.type],
      preset: entry.preset,
      href: artifactPath(entry),
      width,
      height,
      sizeLabel: formatKB(entry.bytes),
    };
  });

  return (
    <>
      <section className="container page-intro" aria-labelledby="gallery-title">
        <p className="eyebrow">Gallery</p>
        <h1 id="gallery-title">Every frame is a live artifact.</h1>
        <p className="lead">
          {entries.length} diagrams across {types.length} types and {presets.length} presets. Each one is regenerated from versioned
          JSON at build time by engine v{engine.version} and has to pass all {checks} of the engine’s structural checks, or the
          site does not build. The source that produced it is one click away.
        </p>
        <details className={styles.checks}>
          <summary>What the {checks} checks cover</summary>
          <ul>
            {ENGINE_CHECKS.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </details>
      </section>

      <section className="container" aria-labelledby="artifacts-title">
        <h2 id="artifacts-title" className="visually-hidden">
          Artifacts
        </h2>
        <GalleryGrid items={items} types={types} />
      </section>

      <section className="section" id={PROOF_LAB_ID} aria-labelledby="proof-lab-title">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Proof Lab</p>
            <h2 id="proof-lab-title">Load one artifact live, in either theme.</h2>
            <p>
              Thumbnails keep this page light. Pick an artifact and a theme, then load the real file in a sandboxed frame. It runs
              exactly as it would from your disk, with no network requests.
            </p>
          </div>
          <ProofLab entries={lab} sectionId={PROOF_LAB_ID} />
        </div>
      </section>

      <section className="section" aria-labelledby="life-title">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Beyond code</p>
            <h2 id="life-title">Everyday examples</h2>
            <p>The same engine and checks, used for plans and paperwork. Each opens in presentation mode.</p>
          </div>
          <ul className={styles.lifeList}>
            {life.map((entry) => (
              <li key={entry.slug}>
                <a href={`${artifactPath(entry)}?present=1`}>{entry.title}</a>
                <span className="muted">
                  {' '}
                  · {TYPE_LABELS[entry.type]} ·{' '}
                  <a href={`/gallery/sources/${entry.source}`}>
                    source<span className="visually-hidden"> JSON for {entry.title}</span>
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
