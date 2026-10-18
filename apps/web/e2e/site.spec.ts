import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// Site pages (landing, gallery, start, guide, community, 404, metadata routes).
// Runs against the production build (`next start`, see playwright.config.ts).

const PAGES = ['/', '/gallery', '/start', '/guide', '/community'];

interface Entry {
  slug: string;
  kind: 'gallery' | 'life';
  type: string;
}
const gallery = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../.generated/gallery.json', import.meta.url)), 'utf8')) as {
  entries: Entry[];
};
const galleryEntries = gallery.entries.filter((e) => e.kind === 'gallery');
const lifeEntries = gallery.entries.filter((e) => e.kind === 'life');

/** Waits for load plus a beat for hydration and idle prefetches. */
async function settle(page: Page) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(400);
}

/** Collects console errors and uncaught exceptions for a page. */
function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    errors.push(`${msg.text()} @ ${msg.location().url}`);
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  return errors;
}

test.describe('primary pages', () => {
  for (const path of PAGES) {
    test(`${path} returns 200 with one h1 and no console errors`, async ({ page }) => {
      const errors = trackErrors(page);
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('main#main')).toBeVisible();
      await expect(page).toHaveTitle(/vc-archify/);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical).toMatch(new RegExp(`${path === '/' ? '/?' : path}$`));
      await settle(page);
      expect(errors).toEqual([]);
    });

    test(`${path} has ordered headings, labelled landmarks and alt text`, async ({ page }) => {
      await page.goto(path);
      const levels = await page.evaluate(() =>
        [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
          .filter((h) => (h as HTMLElement).checkVisibility() || h.classList.contains('visually-hidden'))
          .map((h) => Number(h.tagName[1])),
      );
      expect(levels[0]).toBe(1);
      for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
      await expect(page.locator('header.site-header')).toHaveCount(1);
      await expect(page.locator('footer.site-footer')).toHaveCount(1);
      expect(await page.locator('img:not([alt])').count()).toBe(0);
      const unnamedLinks = await page.evaluate(() =>
        [...document.querySelectorAll('a[href]')].filter(
          (a) => (a as HTMLElement).checkVisibility() && a.getAttribute('aria-hidden') !== 'true' && !a.getAttribute('aria-label') && !a.textContent?.trim(),
        ).length,
      );
      expect(unnamedLinks).toBe(0);
    });
  }

  test('unknown routes render the not-found page with a 404', async ({ page }) => {
    const response = await page.goto('/no-such-page');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/not on the map/i);
    await expect(page.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/');
  });

  test('pages never load a live artifact before the reader asks for one', async ({ page }) => {
    const artifactRequests: string[] = [];
    page.on('request', (request) => {
      if (/\/(gallery\/artifacts|cases\/life)\//.test(request.url())) artifactRequests.push(request.url());
    });
    for (const path of ['/', '/gallery']) {
      await page.goto(path);
      await settle(page);
      await expect(page.locator('iframe')).toHaveCount(0);
    }
    expect(artifactRequests).toEqual([]);
  });
});

test.describe('navigation', () => {
  test('header links reach every page', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    for (const [label, path, heading] of [
      ['Gallery', '/gallery', /live artifact/i],
      ['Start', '/start', /maps it/i],
      ['Guide', '/guide', /Using vc-archify/],
      ['Community', '/community', /personal project/i],
    ] as const) {
      await nav.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    }
    await expect(nav.getByRole('link', { name: 'Playground', exact: true })).toHaveAttribute('href', '/playground');
    await page.getByRole('link', { name: 'vc-archify home' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('landing CTAs and type cards link to the right places', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Start with your agent' })).toHaveAttribute('href', '/start');
    await expect(page.getByRole('link', { name: 'Browse the gallery' })).toHaveAttribute('href', '/gallery');
    const types = page.locator('#types');
    await expect(types.getByRole('heading', { level: 3 })).toHaveText([
      'Architecture', 'Workflow', 'Sequence', 'Data flow', 'Lifecycle', 'Entity-relationship',
    ]);
    await expect(types.getByRole('link', { name: 'Starter prompt' }).first()).toHaveAttribute('href', '/start?type=architecture');
    const life = page.locator('#beyond-code a');
    await expect(life).toHaveCount(lifeEntries.length);
    for (const href of await life.evaluateAll((links) => links.map((a) => a.getAttribute('href')))) {
      expect(href).toMatch(/^\/cases\/life\/[^/]+\?present=1$/);
    }
  });

  test('the guide has a working table of contents and schema links', async ({ page }) => {
    await page.goto('/guide');
    const toc = page.getByRole('navigation', { name: 'On this page' });
    await toc.getByRole('link', { name: 'CLI reference' }).click();
    await expect(page).toHaveURL(/#cli$/);
    await expect(page.locator('#cli h2')).toBeInViewport();
    for (const type of ['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle', 'erd']) {
      await expect(page.locator(`#type-${type} pre`)).toContainText(`"diagram_type": "${type}"`);
      await expect(page.locator(`#type-${type} a[href="/schemas/${type}.schema.json"]`)).toHaveCount(1);
    }
  });
});

test.describe('start wizard', () => {
  test('?agent=cursor&type=architecture preselects and drives the commands', async ({ page }) => {
    await page.goto('/start?agent=cursor&type=architecture');
    await expect(page.getByRole('radio', { name: 'Cursor' })).toBeChecked();
    await expect(page.getByRole('radio', { name: /^Architecture/ })).toBeChecked();

    const cursorPanel = page.locator('[data-agent="cursor"]');
    await expect(cursorPanel).toBeVisible();
    await expect(cursorPanel.locator('pre').first()).toHaveText(
      'npx -y skills add lk153/vc-archify --skill vc-archify --agent cursor --global --copy --yes',
    );
    await expect(page.locator('[data-agent="claude-code"]')).toBeHidden();
    await expect(page.locator('[data-type="architecture"]')).toBeVisible();
    await expect(page.locator('[data-type="architecture"] pre').first()).toContainText('Use vc-archify');

    await page.getByRole('radio', { name: 'Codex' }).check();
    await expect(page.locator('[data-agent="codex"] pre').first()).toContainText('--agent codex --global');
    await expect(cursorPanel).toBeHidden();
    await expect(page).toHaveURL(/agent=codex/);

    await page.getByRole('radio', { name: /^Lifecycle/ }).check();
    await expect(page.locator('[data-type="lifecycle"]')).toBeVisible();
    await expect(page.locator('[data-type="architecture"]')).toBeHidden();
    await expect(page).toHaveURL(/type=lifecycle/);
  });

  test('defaults render meaningful content and the agent table', async ({ page }) => {
    await page.goto('/start');
    await expect(page.getByRole('radio', { name: 'Claude Code' })).toBeChecked();
    await expect(page.locator('[data-agent="claude-code"] pre').first()).toContainText('--agent claude-code');
    await expect(page.getByText('node <skill>/bin/vc-archify.mjs render <type> <input.json> <output.html>')).toBeVisible();
    await expect(page.getByRole('table')).toContainText('~/.cursor/skills');
  });

  test('works without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/start');
    await expect(page.locator('[data-agent="claude-code"] pre').first()).toContainText('--agent claude-code');
    await page.getByRole('radio', { name: 'OpenCode' }).check();
    await expect(page.locator('[data-agent="opencode"]')).toBeVisible();
    await expect(page.locator('[data-agent="claude-code"]')).toBeHidden();
    await context.close();
  });
});

test.describe('gallery', () => {
  test('lists every artifact with its links', async ({ page }) => {
    await page.goto('/gallery');
    const cards = page.locator('.gallery-grid > li');
    await expect(cards).toHaveCount(galleryEntries.length);
    const first = cards.first();
    const slug = galleryEntries[0].slug;
    await expect(first.getByRole('link', { name: /^Open/ })).toHaveAttribute('href', `/gallery/artifacts/${slug}`);
    await expect(first.getByRole('link', { name: /^Present/ })).toHaveAttribute('href', `/gallery/artifacts/${slug}?present=1`);
    await expect(first.getByRole('link', { name: /^Source JSON/ })).toHaveAttribute('href', /^\/gallery\/sources\/.+\.json$/);
    await expect(first.getByRole('link', { name: /^Edit in playground/ })).toHaveAttribute('href', /^\/playground\?example=.+\.json$/);
  });

  test('type filter shows only the chosen type and syncs the URL', async ({ page }) => {
    await page.goto('/gallery');
    const filter = page.getByRole('group', { name: 'Filter artifacts by diagram type' });
    const workflow = filter.getByRole('button', { name: /^Workflow/ });
    await workflow.click();
    await expect(workflow).toHaveAttribute('aria-pressed', 'true');
    const expected = galleryEntries.filter((e) => e.type === 'workflow').length;
    await expect(page.locator('.gallery-grid > li:visible')).toHaveCount(expected);
    await expect(page.locator('.gallery-grid > li[data-type="workflow"]:visible')).toHaveCount(expected);
    await expect(page).toHaveURL(/\?type=workflow$/);
    await expect(page.getByRole('status').filter({ hasText: 'Showing' })).toHaveText(`Showing ${expected} Workflow artifacts of ${galleryEntries.length}`);

    await filter.getByRole('button', { name: /^All/ }).click();
    await expect(page.locator('.gallery-grid > li:visible')).toHaveCount(galleryEntries.length);
    await expect(page).toHaveURL(/\/gallery$/);
  });

  test('?type= preselects a filter', async ({ page }) => {
    await page.goto('/gallery?type=erd');
    await expect(page.getByRole('button', { name: /^Entity-relationship/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.gallery-grid > li:visible')).toHaveCount(galleryEntries.filter((e) => e.type === 'erd').length);
  });

  test('without JavaScript every artifact stays visible', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/gallery?type=erd');
    await expect(page.locator('.gallery-grid > li:visible')).toHaveCount(galleryEntries.length);
    await context.close();
  });

  test('Proof Lab loads one artifact live on click and switches theme', async ({ page }) => {
    await page.goto('/gallery');
    const lab = page.locator('#proof-lab');
    await expect(lab.locator('iframe')).toHaveCount(0);
    await lab.getByRole('radio', { name: 'Dark' }).check();
    await lab.getByRole('link', { name: 'Click to explore live' }).click();
    const frame = lab.locator('iframe');
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute('src', `/gallery/artifacts/${galleryEntries[0].slug}?embed=1&theme=dark`);
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-downloads allow-popups');
    await expect(frame).toHaveAttribute('loading', 'lazy');
    await expect(frame).toHaveAttribute('title', /live .* diagram in the dark theme/);
    await expect(page.frameLocator('#proof-lab iframe').locator('svg[role="img"]').first()).toBeVisible();

    await lab.getByRole('radio', { name: 'Light' }).check();
    await expect(frame).toHaveAttribute('src', /theme=light$/);
    await lab.getByLabel('Artifact').selectOption('orders.erd');
    await expect(frame).toHaveAttribute('src', '/gallery/artifacts/orders.erd?embed=1&theme=light');
    await expect(lab.locator('iframe')).toHaveCount(1);
  });

  test('a card can hand its artifact to the Proof Lab', async ({ page }) => {
    await page.goto('/gallery');
    await page.locator('a[data-proof-slug="cache-miss.sequence"]').click();
    const frame = page.locator('#proof-lab iframe');
    await expect(frame).toHaveAttribute('src', /^\/gallery\/artifacts\/cache-miss\.sequence\?embed=1&theme=(dark|light)$/);
    await expect(page.locator('#proof-lab')).toBeInViewport();
  });
});

test.describe('landing hero', () => {
  test('"explore live" swaps the thumbnail for the focused artifact', async ({ page }) => {
    await page.goto('/');
    const hero = page.locator('.live-embed').first();
    await expect(hero.locator('img').first()).toBeAttached();
    await expect(hero.locator('iframe')).toHaveCount(0);
    await hero.getByRole('link', { name: 'Click to explore live' }).click();
    const frame = hero.locator('iframe');
    await expect(frame).toHaveAttribute(
      'src',
      /^\/gallery\/artifacts\/agent-tool-call\.workflow\?embed=1&theme=(dark|light)#focus=planner&reach=downstream$/,
    );
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-downloads allow-popups');
    await expect(frame).toHaveAttribute('title', /Agent Tool Call Workflow/);
    await expect(page.frameLocator('.live-embed iframe').locator('svg[role="img"]').first()).toBeVisible();

    // The live view follows the site theme.
    const before = await frame.getAttribute('src');
    await page.locator('.theme-toggle').click();
    await expect(frame).not.toHaveAttribute('src', before ?? '');
  });

  test('the theme comparison slider moves', async ({ page }) => {
    await page.goto('/');
    const slider = page.getByRole('slider', { name: /Theme comparison/ });
    await slider.focus();
    await slider.press('End');
    await expect(slider).toHaveValue('100');
    await expect(page.locator('.theme-compare')).toHaveAttribute('style', /--split:\s*100%/);
  });
});

test.describe('theme', () => {
  test('the toggle flips data-theme and the choice survives a reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    const html = page.locator('html');
    const toggle = page.locator('.theme-toggle');
    await toggle.click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('.thumb-light').first()).toBeVisible();
    await expect(page.locator('.thumb-dark').first()).toBeHidden();
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await page.locator('.theme-toggle').click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('.thumb-dark').first()).toBeVisible();
  });

  test('without a stored choice the light thumbnail follows prefers-color-scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page.locator('.thumb-light').first()).toBeVisible();
    await expect(page.locator('.thumb-dark').first()).toBeHidden();
  });
});

test.describe('narrow screens', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  for (const path of [...PAGES, '/start?agent=github-copilot&type=erd', '/no-such-page']) {
    test(`${path} has no horizontal overflow at 360px`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      for (const scheme of ['dark', 'light'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        const width = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(width).toBeLessThanOrEqual(360);
      }
    });
  }
});

test.describe('metadata routes', () => {
  test('sitemap.xml lists pages, artifacts, life cases and schemas', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const xml = await response.text();
    for (const path of ['/gallery', '/start', '/guide', '/community', '/playground']) {
      expect(xml).toMatch(new RegExp(`<loc>[^<]*${path.replace('/', '\\/')}</loc>`));
    }
    for (const entry of galleryEntries) expect(xml).toContain(`/gallery/artifacts/${entry.slug}</loc>`);
    for (const entry of lifeEntries) expect(xml).toContain(`/cases/life/${entry.slug}</loc>`);
    for (const type of ['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle', 'erd']) {
      expect(xml).toContain(`/schemas/${type}.schema.json</loc>`);
    }
  });

  test('robots.txt points at the sitemap and the OG image renders', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toMatch(/Sitemap: .*\/sitemap\.xml/);
    const og = await request.get('/opengraph-image');
    expect(og.status()).toBe(200);
    expect(og.headers()['content-type']).toContain('image/png');
  });

  test('pages advertise their own social card and the OG image', async ({ page }) => {
    for (const [path, title] of [['/gallery', 'Gallery'], ['/start', 'Start'], ['/guide', 'Guide']] as const) {
      await page.goto(path);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /opengraph-image/);
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', `${title} · vc-archify`);
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', new RegExp(`${path}$`));
    }
  });
});
