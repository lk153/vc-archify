import { Playground, type PlaygroundExample } from '@/components/playground/Playground';
import { exampleEntries, TYPE_LABELS } from '@/lib/examples';

// The whole app: one page to write diagram IR and render it in the browser.
export default function HomePage() {
  // Build-time example list; the IR itself is fetched from /examples/ on selection.
  const order = Object.keys(TYPE_LABELS);
  const entries = [...exampleEntries()].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  const examples: PlaygroundExample[] = entries.map((entry) => ({
    source: entry.source,
    title: entry.title,
    type: entry.type,
    typeLabel: TYPE_LABELS[entry.type],
  }));
  const defaultSource = (examples.find((e) => e.type === 'architecture') ?? examples[0]).source;

  return (
    <>
      <h1 className="visually-hidden">vc-archify: render architecture diagrams from JSON</h1>
      <Playground examples={examples} defaultSource={defaultSource} />
    </>
  );
}
