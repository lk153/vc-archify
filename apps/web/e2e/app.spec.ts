import { expect, test } from '@playwright/test';

// The app is one page: the playground at /. Everything else is either the
// example IR it fetches (/examples/*.json) or a redirect back to /.

test('the single page loads with only the playground and a theme toggle', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/vc-archify/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByTestId('pg-example')).toBeVisible();
  await expect(page.getByTestId('pg-editor')).toBeVisible();
  await expect(page.getByTestId('pg-status')).toHaveAttribute('data-state', 'ok', { timeout: 30_000 });
  // No site navigation: the header has the brand and the theme toggle only.
  await expect(page.getByRole('navigation')).toHaveCount(0);

  const before = await page.evaluate(() => document.documentElement.dataset.theme ?? null);
  await page.getByRole('button', { name: /Switch to (light|dark) theme/ }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).not.toBe(before);
  expect(errors).toEqual([]);
});

test('example IR is served as JSON', async ({ request }) => {
  const res = await request.get('/examples/web-app.architecture.json');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/json');
  expect((await res.json()).diagram_type).toBe('architecture');
});

test('links to the former multi-page site redirect to the playground', async ({ request }) => {
  for (const path of ['/playground', '/gallery', '/gallery/artifacts/orders.erd', '/start', '/guide', '/community']) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(308);
    expect(res.headers().location, path).toBe('/');
  }
});

test('security headers are set', async ({ request }) => {
  const headers = (await request.get('/')).headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('SAMEORIGIN');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
});
