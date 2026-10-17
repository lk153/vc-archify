#!/usr/bin/env node
// Regenerate the gallery's static WebP thumbnails (committed to
// public/thumbnails/). The gallery shows these instead of 12 live iframes, so a
// visit loads at most one full artifact (Hobby transfer budget, Plan §4.0).
//
//   pnpm --filter @vca/web gallery && pnpm --filter @vca/web thumbnails
//
// Uses the installed Google Chrome locally (or Playwright's Chromium with
// THUMBNAILS_BUNDLED_BROWSER=1).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED = path.join(WEB, '.generated');
const OUT = path.join(WEB, 'public', 'thumbnails');
const WIDTH = 1200;
const gallery = JSON.parse(fs.readFileSync(path.join(GENERATED, 'gallery.json'), 'utf8'));

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(process.env.THUMBNAILS_BUNDLED_BROWSER ? {} : { channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: 1 });
const cdp = await page.context().newCDPSession(page);
const written = [];

for (const entry of gallery.entries) {
  for (const theme of ['dark', 'light']) {
    const url = `${pathToFileURL(path.join(GENERATED, 'artifacts', `${entry.slug}.html`)).href}?embed=1&theme=${theme}`;
    await page.goto(url, { waitUntil: 'load' });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
    await page.waitForFunction(() => !!document.querySelector('svg[role="img"]'));
    await page.waitForTimeout(400);
    const box = await page.locator('svg[role="img"]').first().boundingBox();
    if (!box) throw new Error(`${entry.slug}: diagram not visible`);
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'webp',
      quality: 82,
      clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 },
    });
    const file = path.join(OUT, `${entry.slug}-${theme}.webp`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    written.push(`${path.basename(file)} ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  }
}
await browser.close();
// Record which IR each thumbnail was taken from, so the gallery build can flag stale ones.
const manifest = Object.fromEntries(gallery.entries.map((e) => [e.slug, { sourceSha256: e.sourceSha256, viewBox: e.viewBox }]));
fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`thumbnails (${written.length}):\n  ${written.join('\n  ')}`);
