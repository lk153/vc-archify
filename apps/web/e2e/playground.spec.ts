import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { renderDiagram } from '@vca/render';

// The playground (the app's only page, /): the in-browser engine
// (packages/browser-engine) renders IR in a Web Worker. Its output must be
// byte-identical to the Node API (@vca/render), which rendered the examples
// into apps/web/.generated/artifacts at build time.

const GENERATED = fileURLToPath(new URL('../.generated/', import.meta.url));

interface Entry {
  slug: string;
  type: string;
  title: string;
  source: string;
  nodeCount: number;
}

const examples: { entries: Entry[] } = JSON.parse(fs.readFileSync(path.join(GENERATED, 'examples.json'), 'utf8'));
const FEATURED = ['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle', 'erd'];
const sourceText = (entry: Entry) => fs.readFileSync(path.join(GENERATED, 'sources', entry.source), 'utf8');
const artifact = (entry: Entry) => fs.readFileSync(path.join(GENERATED, 'artifacts', `${entry.slug}.html`), 'utf8');
const firstOfType = (type: string) => {
  const entry = examples.entries.find((e) => e.type === type);
  if (!entry) throw new Error(`no example of type ${type}`);
  return entry;
};

const status = (page: Page) => page.getByTestId('pg-status');
const editor = (page: Page) => page.getByTestId('pg-editor');
const preview = (page: Page) => page.frameLocator('[data-testid="pg-preview"]');

async function renders(page: Page) {
  return Number(await status(page).getAttribute('data-renders'));
}

/** Resolve after the next completed render (success or failure). */
async function nextRender(page: Page, before: number) {
  await expect.poll(() => renders(page), { timeout: 30_000 }).toBeGreaterThan(before);
}

async function openPlayground(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await expect(status(page)).toHaveAttribute('data-state', /^(ok|error)$/, { timeout: 30_000 });
  return errors;
}

async function downloadHtml(page: Page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('pg-download-html').click()]);
  const file = await download.path();
  return { name: download.suggestedFilename(), html: fs.readFileSync(file, 'utf8') };
}

async function setEditor(page: Page, value: string) {
  const before = await renders(page);
  await editor(page).fill(value);
  await page.getByTestId('pg-render').click();
  await nextRender(page, before);
}

test.describe('playground', () => {
  test('renders one example per featured type from ?example=', async ({ page }) => {
    test.setTimeout(120_000);
    for (const type of FEATURED) {
      const entry = firstOfType(type);
      const errors = await openPlayground(page, `?example=${encodeURIComponent(entry.source)}`);
      await expect(status(page)).toHaveAttribute('data-state', 'ok');
      await expect(status(page)).toContainText(`Rendered ${type} diagram`);
      await expect(editor(page)).toHaveValue(sourceText(entry));
      await expect(page.getByTestId('pg-example')).toHaveValue(entry.source);
      const frame = preview(page);
      await expect(frame.locator('svg[role="img"]').first()).toBeVisible();
      await expect(frame.locator('h1')).toHaveText(entry.title);
      await expect.poll(() => frame.locator('svg[role="img"] [data-node-id]').count()).toBeGreaterThan(1);
      expect(errors, `page errors for ${entry.source}`).toEqual([]);
    }
  });

  test('the example picker loads an example IR and renders it', async ({ page }) => {
    await openPlayground(page);
    const entry = firstOfType('erd');
    const before = await renders(page);
    await page.getByLabel('Example').selectOption(entry.source);
    await nextRender(page, before);
    await expect(status(page)).toHaveAttribute('data-state', 'ok');
    await expect(editor(page)).toHaveValue(sourceText(entry));
    await expect(preview(page).locator('h1')).toHaveText(entry.title);
    await expect(page).toHaveURL(new RegExp(`[?&]example=${entry.source.replace(/\./g, '\\.')}`));
  });

  test('a broken IR shows engine diagnostics with path and fixes', async ({ page }) => {
    const entry = examples.entries.find((e) => e.source === 'web-app.architecture.json') ?? firstOfType('architecture');
    await openPlayground(page, `?example=${entry.source}`);
    await expect(status(page)).toHaveAttribute('data-state', 'ok');

    // Semantic error: a connection to a component that does not exist.
    const ir = JSON.parse(sourceText(entry));
    ir.connections[0].to = 'missing-node';
    await setEditor(page, `${JSON.stringify(ir, null, 2)}\n`);
    await expect(status(page)).toHaveAttribute('data-state', 'error');
    const diagnostics = page.getByTestId('pg-diagnostics');
    await expect(diagnostics.getByText('architecture/unknown-endpoint')).toBeVisible();
    await expect(diagnostics).toContainText('unknown target "missing-node"');
    await expect(diagnostics).toContainText('Suggested fixes');
    await diagnostics.getByRole('button', { name: 'Go to /connections/0/to' }).click();
    const selected = await editor(page).evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionEnd));
    expect(selected).toBe('"missing-node"');
    // The last good render stays visible (dimmed) and downloadable.
    await expect(page.locator('[data-stale="true"]')).toBeVisible();
    await expect(page.getByTestId('pg-download-html')).toBeEnabled();

    // Schema error.
    delete ir.meta.title;
    ir.connections[0].to = ir.components[1].id;
    await setEditor(page, JSON.stringify(ir, null, 2));
    await expect(diagnostics.getByText('schema/required')).toBeVisible();
    await expect(diagnostics).toContainText('add required property "title"');

    // JSON syntax error.
    await setEditor(page, '{\n  "diagram_type": "erd",\n  "meta": { "title": "x" },,\n}');
    await expect(diagnostics.getByText('input/json-parse')).toBeVisible();
    await expect(diagnostics.getByRole('button', { name: /Go to line 3/ })).toBeVisible();

    // Unknown diagram type.
    await setEditor(page, '{ "diagram_type": "pie" }');
    await expect(diagnostics.getByText('input/diagram-type')).toBeVisible();
  });

  test('browser output is byte-identical to the Node render', async ({ page }) => {
    test.setTimeout(240_000);
    await openPlayground(page);
    for (const entry of examples.entries) {
      const before = await renders(page);
      const picker = page.getByLabel('Example');
      if ((await picker.inputValue()) === entry.source) await page.getByTestId('pg-render').click();
      else await picker.selectOption(entry.source);
      await nextRender(page, before);
      await expect(status(page), entry.source).toHaveAttribute('data-state', 'ok');
      const { name, html } = await downloadHtml(page);
      expect(name).toBe(entry.source.replace(/\.json$/, '.html'));
      const expected = artifact(entry);
      expect(html.length, `${entry.source}: length`).toBe(expected.length);
      expect(html === expected, `${entry.source}: browser HTML must equal .generated/artifacts/${entry.slug}.html`).toBe(true);
    }
  });

  test('a lazily loaded locale catalog matches the Node API', async ({ page }) => {
    const entry = firstOfType('sequence');
    const ir = JSON.parse(sourceText(entry));
    ir.meta.locale = 'es';
    const expected = (await renderDiagram(ir)).html;
    await openPlayground(page, `?example=${entry.source}`);
    await setEditor(page, JSON.stringify(ir, null, 2));
    await expect(status(page)).toHaveAttribute('data-state', 'ok');
    await expect(preview(page).locator('html')).toHaveAttribute('lang', 'es');
    const { html } = await downloadHtml(page);
    expect(html === expected, 'es locale render must equal renderDiagram().html').toBe(true);
  });

  test('auto-render, draft persistence and preview theme', async ({ page }) => {
    const entry = firstOfType('lifecycle');
    await openPlayground(page, `?example=${entry.source}`);
    const ir = JSON.parse(sourceText(entry));
    ir.meta.title = 'Edited in the playground';
    const before = await renders(page);
    await editor(page).fill(JSON.stringify(ir, null, 2));
    await nextRender(page, before); // debounced auto-render, no click
    await expect(preview(page).locator('h1')).toHaveText('Edited in the playground');
    await expect(page).not.toHaveURL(/example=/);

    await page.getByText('Light', { exact: true }).click();
    await expect(page.getByTestId('pg-preview')).toHaveAttribute('data-theme', 'light');
    await expect(preview(page).locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByText('Dark', { exact: true }).click();
    await expect(preview(page).locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.waitForTimeout(600); // draft save is debounced
    await page.goto('/');
    await expect(status(page)).toHaveAttribute('data-state', 'ok', { timeout: 30_000 });
    await expect(editor(page)).toHaveValue(JSON.stringify(ir, null, 2));
    await expect(preview(page).locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('works without storage, by keyboard and at 360px', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
    });
    await page.setViewportSize({ width: 360, height: 760 });
    const errors = await openPlayground(page, '?example=not-a-real-source.json');
    await expect(status(page)).toHaveAttribute('data-state', 'ok');
    await expect(page).not.toHaveURL(/example=/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'horizontal overflow at 360px').toBeLessThanOrEqual(0);

    const before = await renders(page);
    await editor(page).focus();
    await page.keyboard.press('End');
    await page.keyboard.press('ControlOrMeta+Enter');
    await nextRender(page, before);
    await expect(status(page)).toHaveAttribute('data-state', 'ok');
    expect(errors).toEqual([]);
  });
});
