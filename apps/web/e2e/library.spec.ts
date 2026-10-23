import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// "My diagrams": create, import, save, rename, delete — persisted in this
// browser's localStorage and listed first in the Diagram picker.

const EXAMPLES = fileURLToPath(new URL('../../../examples/', import.meta.url));
const exampleText = (file: string) => fs.readFileSync(path.join(EXAMPLES, file), 'utf8');

const status = (page: Page) => page.getByTestId('pg-status');
const picker = (page: Page) => page.getByTestId('pg-example');
const savedOptions = (page: Page) => picker(page).locator('optgroup[label="My diagrams"] option');
const preview = (page: Page) => page.frameLocator('[data-testid="pg-preview"]');

async function open(page: Page) {
  await page.goto('/');
  await expect(status(page)).toHaveAttribute('data-state', 'ok', { timeout: 30_000 });
}

test('import a JSON diagram, then find it again after a reload', async ({ page }) => {
  await open(page);
  const ir = JSON.parse(exampleText('orders.erd.json'));
  ir.meta.title = 'Billing schema (imported)';
  await page.getByTestId('pg-import-input').setInputFiles({
    name: 'billing.erd.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(ir, null, 2)),
  });
  await expect(savedOptions(page)).toHaveText(['Billing schema (imported) · Entity-relationship']);
  await expect(page.getByTestId('pg-name')).toHaveValue('Billing schema (imported)');
  await expect(status(page)).toHaveAttribute('data-state', 'ok');
  await expect(preview(page).locator('h1')).toHaveText('Billing schema (imported)');

  await page.reload();
  await expect(status(page)).toHaveAttribute('data-state', 'ok', { timeout: 30_000 });
  await expect(page.getByTestId('pg-name')).toHaveValue('Billing schema (imported)');
  await expect(picker(page).locator('option:checked')).toHaveText('Billing schema (imported) · Entity-relationship');
});

test('importing a file that is not diagram IR explains why', async ({ page }) => {
  await open(page);
  await page.getByTestId('pg-import-input').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello": 1}') });
  await expect(page.getByTestId('pg-diagnostics')).toContainText('has no "diagram_type"');
  await expect(savedOptions(page)).toHaveCount(0);
});

test('an edited example can be saved, renamed and keeps saving as you edit', async ({ page }) => {
  await open(page);
  const editor = page.getByTestId('pg-editor');
  const ir = JSON.parse(await editor.inputValue());
  ir.meta.title = 'My production map';
  await editor.fill(JSON.stringify(ir, null, 2));
  await page.getByTestId('pg-save').click();
  await expect(savedOptions(page)).toHaveCount(1);
  await expect(page.getByTestId('pg-name')).toHaveValue('My production map');

  await page.getByTestId('pg-name').fill('Prod v2');
  ir.meta.title = 'Prod v2 diagram';
  await editor.fill(JSON.stringify(ir, null, 2));
  await expect(preview(page).locator('h1')).toHaveText('Prod v2 diagram', { timeout: 30_000 });
  await page.waitForTimeout(600); // autosave is debounced

  await page.reload();
  await expect(status(page)).toHaveAttribute('data-state', 'ok', { timeout: 30_000 });
  await expect(page.getByTestId('pg-name')).toHaveValue('Prod v2');
  expect(JSON.parse(await editor.inputValue()).meta.title).toBe('Prod v2 diagram');
});

test('a new diagram starts from a template, and can be deleted', async ({ page }) => {
  await open(page);
  await page.getByTestId('pg-new').selectOption({ label: 'Sequence' });
  await expect(page.getByTestId('pg-name')).toHaveValue('Untitled sequence diagram');
  await expect(status(page)).toHaveAttribute('data-state', 'ok', { timeout: 30_000 });
  await expect(preview(page).locator('h1')).toHaveText('Untitled sequence diagram');
  await expect(savedOptions(page)).toHaveCount(1);

  await expect(page.getByTestId('pg-preview-next')).toHaveCount(0); // see sync.spec: a frame load closes confirm()
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('pg-delete').click();
  await expect(savedOptions(page)).toHaveCount(0);
  await expect(page.getByTestId('pg-name')).toHaveCount(0);
  await expect(status(page)).toHaveAttribute('data-state', 'ok', { timeout: 30_000 });
});

test('the stale-preview notice is informational, not an error', async ({ page }) => {
  await open(page);
  await page.getByTestId('pg-editor').fill('{ "diagram_type": "architecture" }');
  await expect(status(page)).toHaveAttribute('data-state', 'error', { timeout: 30_000 });
  const note = page.getByTestId('pg-stale');
  await expect(note).toContainText('Preview shows the last successful render');
  await expect(note).toHaveAttribute('role', 'note');
});
