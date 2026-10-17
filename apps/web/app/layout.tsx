import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { themeBootstrap } from '@/components/ThemeToggle';
import { DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';
import './globals.css';
import './site.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — agent skill for interactive diagrams`, template: `%s · ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { type: 'website', siteName: SITE_NAME, url: SITE_URL, title: SITE_NAME, description: DESCRIPTION },
  twitter: { card: 'summary_large_image', title: SITE_NAME, description: DESCRIPTION },
};

// Vercel Web Analytics + Speed Insights (Plan §4.6) are opt-in: enable them in
// the Vercel dashboard, then set NEXT_PUBLIC_VERCEL_ANALYTICS=1 for the build.
// They load first-party scripts from /_vercel/* on site pages only, never in artifacts.
const insights = process.env.NEXT_PUBLIC_VERCEL_ANALYTICS === '1';

// No Skew Protection on Hobby (Plan §4.0): if a tab kept open across a deploy
// asks for a JS chunk that no longer exists, reload once to pick up the new build.
const chunkReload = `(function(){var k='vca-chunk-reload',r=/ChunkLoadError|Loading chunk [\\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/;function h(m){if(!r.test(String(m||'')))return;try{if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,'1')}catch(e){return}location.reload()}addEventListener('error',function(e){h(e&&(e.message||(e.error&&e.error.message)))});addEventListener('unhandledrejection',function(e){h(e&&e.reason&&(e.reason.message||e.reason))});addEventListener('load',function(){setTimeout(function(){try{sessionStorage.removeItem(k)}catch(e){}},10000)})})();`;

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#050912' },
    { media: '(prefers-color-scheme: light)', color: '#f4f5f7' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <script dangerouslySetInnerHTML={{ __html: chunkReload }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
        {insights && (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        )}
      </body>
    </html>
  );
}
