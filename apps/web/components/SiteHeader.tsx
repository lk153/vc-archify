import Link from 'next/link';
import { formatStars, starCount } from '@/lib/github';
import { REPO_URL, SITE_NAME } from '@/lib/site';
import { BrandMark } from './BrandMark';
import { ThemeToggle } from './ThemeToggle';

const NAV = [
  { href: '/gallery', label: 'Gallery' },
  { href: '/start', label: 'Start' },
  { href: '/guide', label: 'Guide' },
  { href: '/playground', label: 'Playground' },
  { href: '/community', label: 'Community' },
];

export async function SiteHeader() {
  const stars = await starCount();
  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <Link href="/" className="brand" aria-label={`${SITE_NAME} home`}>
          <BrandMark size={28} />
          <span className="brand-name">{SITE_NAME}</span>
        </Link>
        <nav aria-label="Primary" className="site-nav">
          <ul>
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="site-header-actions">
          <a
            className="github-link"
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`vc-archify on GitHub${stars ? `, ${stars} stars` : ''} (opens in a new tab)`}
          >
            <span className="github-link-text">GitHub</span>
            {stars ? (
              <span className="star-count" aria-hidden="true">
                ★ {formatStars(stars)}
              </span>
            ) : null}
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
