import Link from 'next/link';
import { gallery } from '@/lib/gallery';
import { REPO_URL, SITE_NAME, UPSTREAM_ORIGIN_URL, UPSTREAM_URL } from '@/lib/site';

export function SiteFooter() {
  const { engine } = gallery();
  return (
    <footer className="site-footer">
      <div className="container site-footer-inner">
        <p>
          <strong>{SITE_NAME}</strong> · engine v{engine.version} ·{' '}
          <a href={`${REPO_URL}/blob/main/LICENSE`}>MIT License</a> · a personal, non-commercial project.
        </p>
        <p className="attribution">
          Inspired by <a href={UPSTREAM_URL}>Archify</a> (tt-a1i/archify, MIT), itself based on{' '}
          <a href={UPSTREAM_ORIGIN_URL}>Cocoon-AI/architecture-diagram-generator</a>. Not affiliated with archify.si.
        </p>
        <nav aria-label="Footer">
          <Link href="/gallery">Gallery</Link>
          <Link href="/start">Start</Link>
          <Link href="/guide">Guide</Link>
          <Link href="/playground">Playground</Link>
          <Link href="/community">Community</Link>
          <a href={REPO_URL}>Source</a>
        </nav>
      </div>
    </footer>
  );
}
