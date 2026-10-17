import type { Metadata } from 'next';
import { Playground, type PlaygroundExample } from '@/components/playground/Playground';
import { galleryEntries, TYPE_LABELS } from '@/lib/gallery';
import { pageMetadata } from '@/lib/metadata';
import styles from './page.module.css';

export const metadata: Metadata = pageMetadata({
  title: 'Playground',
  description: 'Edit vc-archify IR JSON and render validated, interactive diagrams in your browser, with engine diagnostics and HTML download.',
  path: '/playground',
});

export default function PlaygroundPage() {
  // Build-time example list; the IR itself is fetched from /gallery/sources/ on selection.
  const examples: PlaygroundExample[] = [...galleryEntries('gallery'), ...galleryEntries('life')].map((entry) => ({
    source: entry.source,
    title: entry.title,
    type: entry.type,
    typeLabel: TYPE_LABELS[entry.type],
    kind: entry.kind,
  }));
  const defaultSource = (examples.find((e) => e.type === 'architecture') ?? examples[0]).source;

  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.intro}>
        <p className="eyebrow">Playground</p>
        <h1 className={styles.title}>Render a diagram from JSON</h1>
        <p className={styles.lead}>
          Edit an IR, or start from a gallery example, and the vc-archify engine renders it right here: the same validation,
          layout checks and self-contained HTML as the CLI, all on your device.
        </p>
      </header>
      <Playground examples={examples} defaultSource={defaultSource} />
    </div>
  );
}
