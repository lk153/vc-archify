import { expect, test, type Page } from '@playwright/test';

// The IR JSON editor window: a resizable, movable, maximizable modal that edits
// the same text as the panel editor.

const status = (page: Page) => page.getByTestId('pg-status');
const editor = (page: Page) => page.getByTestId('pg-editor');
const windowEl = (page: Page) => page.getByTestId('pg-editor-window');
const windowText = (page: Page) => page.getByTestId('pg-editor-window-text');

async function open(page: Page) {
  await page.goto('/?example=web-app.architecture.json');
  await expect(status(page)).toHaveAttribute('data-state', 'ok', { timeout: 30_000 });
}

async function dragBy(page: Page, x: number, y: number, dx: number, dy: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 3 });
  await page.mouse.move(x + dx, y + dy, { steps: 3 });
  await page.mouse.up();
}

test('the editor window edits the same JSON, then closes back to the panel', async ({ page }) => {
  await open(page);
  await expect(windowEl(page)).toBeHidden();
  await page.getByTestId('pg-expand-editor').click();
  await expect(windowEl(page)).toBeVisible();
  await expect(windowEl(page).getByRole('heading')).toHaveText('IR JSON · Sample Web App');
  await expect(windowText(page)).toBeFocused();
  await expect(windowText(page)).toHaveValue(await editor(page).inputValue());

  // Edits render live behind the window.
  const ir = JSON.parse(await windowText(page).inputValue());
  ir.meta.title = 'Edited in the window';
  await windowText(page).fill(JSON.stringify(ir, null, 2));
  await expect(page.frameLocator('[data-testid="pg-preview"]').locator('h1')).toHaveText('Edited in the window');

  // A problem is listed in the window, with a way to jump to it.
  ir.components[0].type = 'not-a-type';
  await windowText(page).fill(JSON.stringify(ir, null, 2));
  await windowText(page).press('ControlOrMeta+Enter');
  await expect(windowEl(page).getByRole('list', { name: 'Problems' })).toBeVisible();
  await expect(windowEl(page).getByRole('list', { name: 'Problems' })).toContainText('/components/0/type');
  ir.components[0].type = 'external';
  await windowText(page).fill(JSON.stringify(ir, null, 2));
  await windowText(page).press('ControlOrMeta+Enter');
  await expect(status(page)).toHaveAttribute('data-state', 'ok');

  await page.keyboard.press('Escape');
  await expect(windowEl(page)).toBeHidden();
  await expect(editor(page)).toHaveValue(JSON.stringify(ir, null, 2));
  await expect(page.getByTestId('pg-expand-editor')).toBeFocused();
});

test('the window maximizes, resizes from its edges, moves by its title bar, and remembers its size', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await open(page);
  await page.getByTestId('pg-expand-editor').click();
  const start = (await windowEl(page).boundingBox())!;
  expect(start.width).toBeGreaterThan(900);

  // Maximize fills the browser window; restore brings the old size back.
  await page.getByTestId('pg-editor-window-maximize').click();
  await expect.poll(async () => (await windowEl(page).boundingBox())!.width).toBe(1400);
  expect((await windowEl(page).boundingBox())!.height).toBe(900);
  await windowEl(page).getByRole('heading').dblclick();
  await expect.poll(async () => Math.round((await windowEl(page).boundingBox())!.width)).toBe(Math.round(start.width));

  // Drag the bottom-right corner in, then the left edge out.
  await dragBy(page, start.x + start.width - 2, start.y + start.height - 2, -300, -200);
  let box = (await windowEl(page).boundingBox())!;
  expect(Math.round(box.width)).toBe(Math.round(start.width - 300));
  expect(Math.round(box.height)).toBe(Math.round(start.height - 200));
  await dragBy(page, box.x + 1, box.y + box.height / 2, -40, 0);
  box = (await windowEl(page).boundingBox())!;
  expect(Math.round(box.width)).toBe(Math.round(start.width - 260));

  // Move it by the title bar; it stays inside the browser window.
  await dragBy(page, box.x + 60, box.y + 18, 5000, 5000);
  box = (await windowEl(page).boundingBox())!;
  expect(Math.round(box.x + box.width)).toBe(1400);
  expect(Math.round(box.y + box.height)).toBe(900);

  // Close and reopen: same size and place.
  await page.getByTestId('pg-editor-window-close').click();
  await expect(windowEl(page)).toBeHidden();
  await page.getByTestId('pg-expand-editor').click();
  const again = (await windowEl(page).boundingBox())!;
  expect([Math.round(again.x), Math.round(again.y), Math.round(again.width), Math.round(again.height)])
    .toEqual([Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)]);
});
