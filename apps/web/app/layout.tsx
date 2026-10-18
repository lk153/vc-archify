import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { themeBootstrap } from '@/components/ThemeToggle';
import { DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';
import './globals.css';
import './site.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${SITE_NAME} — architecture diagram playground`,
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: '/' },
  robots: { index: false, follow: false }, // personal tool, not a public site
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#050912' },
    { media: '(prefers-color-scheme: light)', color: '#f4f5f7' },
  ],
};

// Vercel Web Analytics + Speed Insights are opt-in: enable them in the Vercel
// dashboard, then set NEXT_PUBLIC_VERCEL_ANALYTICS=1 for the build.
const insights = process.env.NEXT_PUBLIC_VERCEL_ANALYTICS === '1';

// No Skew Protection on Hobby (Plan §4.0): if a tab kept open across a deploy
// asks for a JS chunk that no longer exists, reload once to pick up the new build.
const chunkReload = `(function(){var k='vca-chunk-reload',r=/ChunkLoadError|Loading chunk [\\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/;function h(m){if(!r.test(String(m||'')))return;try{if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,'1')}catch(e){return}location.reload()}addEventListener('error',function(e){h(e&&(e.message||(e.error&&e.error.message)))});addEventListener('unhandledrejection',function(e){h(e&&e.reason&&(e.reason.message||e.reason))});addEventListener('load',function(){setTimeout(function(){try{sessionStorage.removeItem(k)}catch(e){}},10000)})})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <script dangerouslySetInnerHTML={{ __html: chunkReload }} />
      </head>
      <body>
        <main id="main">{children}</main>
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
