import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false },
};

export default function NotFound() {
  return (
    <section className="container page-intro" aria-labelledby="not-found-title">
      <p className="eyebrow">404 · no route</p>
      <h1 id="not-found-title">This page is not on the map.</h1>
      <p className="lead">
        The link may be out of date, or the page moved. Gallery artifacts live under <code>/gallery/artifacts/&lt;name&gt;</code>.
      </p>
      <ul className="actions">
        <li>
          <Link className="button primary" href="/">
            Go to the home page
          </Link>
        </li>
        <li>
          <Link className="button" href="/gallery">
            Browse the gallery
          </Link>
        </li>
        <li>
          <Link className="button" href="/guide">
            Read the guide
          </Link>
        </li>
      </ul>
    </section>
  );
}
