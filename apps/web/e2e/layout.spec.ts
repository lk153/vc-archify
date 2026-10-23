import { expect, test, type FrameLocator, type Locator, type Page } from '@playwright/test';

// Drag to rearrange: moving nodes and boundaries in the preview edits the IR
// JSON, re-renders, and can be undone. Rejected positions roll back.

const status = (page: Page) => page.getByTestId('pg-status');
const editor = (page: Page) => page.getByTestId('pg-editor');
const note = (page: Page) => page.getByTestId('pg-layout-note');
const preview = (page: Page): FrameLocator => page.frameLocator('[data-testid="pg-preview"]');
const node = (page: Page, id: string) => preview(page).locator(`svg [data-node-id="${id}"]`);

type Ir = { components: { id: string; pos: number[] }[]; nodes: { id: string; lane: string; col: number }[] };
const ir = async (page: Page): Promise<Ir> => JSON.parse(await editor(page).inputValue());
const posOf = async (page: Page, id: string) => (await ir(page)).components.find((c) => c.id === id)?.pos;

async function open(page: Page, example: string) {
  await page.goto(`/?example=${example}`);
  await expect(status(page)).toHaveAttribute('data-state', 'ok', { timeout: 30_000 });
  await expect(node(page, (await ir(page)).components?.[0]?.id ?? (await ir(page)).nodes[0].id)).toBeVisible();
  // The drag layer is ready once the preview reports its camera.
  await page.waitForTimeout(300);
}

/** Screen pixels per diagram unit in the preview (it scales the SVG to fit). */
async function pxPerUnit(page: Page) {
  const box = (await node(page, 'api').boundingBox())!;
  return box.width / Number(await node(page, 'api').locator('rect').first().getAttribute('width'));
}

async function dragBy(page: Page, target: Locator, dx: number, dy: number, from: 'center' | 'left' = 'center') {
  const box = (await target.boundingBox())!;
  const x = from === 'center' ? box.x + box.width / 2 : box.x + 10;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 3, y + dy / 3, { steps: 3 });
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
}

test('dragging a component updates its pos in the JSON, re-renders, and undoes', async ({ page }) => {
  await open(page, 'web-app.architecture.json');
  expect(await posOf(page, 'api')).toEqual([670, 300]);
  const scale = await pxPerUnit(page);
  await dragBy(page, node(page, 'api'), 52 * scale, 18 * scale);
  // Snapped to the 10-unit grid.
  await expect(note(page)).toContainText('Moved “API Server” to [720, 320].');
  const moved = [720, 320];
  expect(await posOf(page, 'api')).toEqual(moved);
  await expect(node(page, 'api').locator('rect').first()).toHaveAttribute('x', '720');
  await expect(page).not.toHaveURL(/example=/);

  await note(page).getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => posOf(page, 'api')).toEqual([670, 300]);
  await expect(node(page, 'api').locator('rect').first()).toHaveAttribute('x', '670');
  await page.getByTestId('pg-redo').click();
  await expect.poll(() => posOf(page, 'api')).toEqual(moved);
});

test('dragging a boundary by its label moves the components it wraps', async ({ page }) => {
  await open(page, 'web-app.architecture.json');
  const label = preview(page).locator('[data-graph-role="structural-frame-label"][data-composition-frame-id="1"]');
  await dragBy(page, label, 0, 40 * (await pxPerUnit(page)), 'left');
  await expect(note(page)).toContainText('Moved boundary “sg-api :443/:8000” and its 2 components by [0, 40].');
  expect([await posOf(page, 'lb'), await posOf(page, 'api'), await posOf(page, 'cdn')]).toEqual([[460, 340], [670, 340], [250, 300]]);
});

test('a position the engine rejects is rolled back, and can be applied anyway', async ({ page }) => {
  await open(page, 'web-app.architecture.json');
  const before = await editor(page).inputValue();
  await dragBy(page, node(page, 'db'), 0, 130 * (await pxPerUnit(page)));
  await expect(note(page)).toHaveAttribute('data-tone', 'error');
  await expect(note(page)).toContainText('breaks a layout rule');
  await expect(editor(page)).toHaveValue(before);
  await expect(status(page)).toHaveAttribute('data-state', 'ok');

  await note(page).getByRole('button', { name: 'Apply anyway' }).click();
  await expect(status(page)).toHaveAttribute('data-state', 'error');
  expect(await posOf(page, 'db')).not.toEqual([880, 300]);
  await expect(page.getByTestId('pg-diagnostics')).toContainText('db');
  await page.getByTestId('pg-undo').click();
  await expect(editor(page)).toHaveValue(before);
  await expect(status(page)).toHaveAttribute('data-state', 'ok');
});

test('Alt + arrows nudge a focused node, Ctrl/⌘ + Z undoes, and the zoom is kept', async ({ page }) => {
  await open(page, 'web-app.architecture.json');
  await preview(page).locator('[data-view="in"]').click();
  await preview(page).locator('[data-view="in"]').click();
  await expect(preview(page).locator('[data-view="reset"]')).toContainText('150%');
  await node(page, 'worker').focus();
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(() => posOf(page, 'worker')).toEqual([890, 440]);
  await expect(node(page, 'worker').locator('rect').first()).toHaveAttribute('x', '890');
  await expect(preview(page).locator('[data-view="reset"]')).toContainText('150%');
  // Focus follows the node into the new render, so nudges can continue.
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('pg-preview');
  await expect(node(page, 'worker')).toBeFocused();
  await page.keyboard.press('Alt+Shift+ArrowDown');
  await expect(note(page)).toContainText('Moved “Worker” to [890, 490].');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => posOf(page, 'worker')).toEqual([890, 440]);
});

test('workflow nodes land in the lane they are dropped on', async ({ page }) => {
  await open(page, 'release-delivery.workflow.json');
  const lane = (await preview(page).locator('svg rect[data-composition-frame-id="lane-1"]').boundingBox())!;
  const commit = (await node(page, 'commit').boundingBox())!;
  await dragBy(page, node(page, 'commit'), 0, lane.y + lane.height / 2 - (commit.y + commit.height / 2));
  await expect(note(page)).toContainText('Moved “Commit” to lane “Continuous Integration”, col 0.');
  expect((await ir(page)).nodes.find((n) => n.id === 'commit')).toMatchObject({ lane: 'ci', col: 0 });
});

test('dragging can be turned off, and engine-laid-out diagrams say why they cannot be dragged', async ({ page }) => {
  await open(page, 'web-app.architecture.json');
  await page.getByTestId('pg-drag').uncheck();
  await expect(preview(page).locator('svg [data-vca-drag]')).toHaveCount(0);
  const before = await editor(page).inputValue();
  await dragBy(page, node(page, 'api'), 60, 25);
  await page.waitForTimeout(500);
  await expect(editor(page)).toHaveValue(before);
  await expect(note(page)).toHaveCount(0);
  await page.getByTestId('pg-drag').check();

  await page.getByLabel('Diagram', { exact: true }).selectOption('cache-miss-request.sequence.json');
  await expect(status(page)).toHaveAttribute('data-state', 'ok');
  await expect(page.getByTestId('pg-drag-hint')).toContainText('laid out by the engine');
  await expect(preview(page).locator('svg [data-vca-drag]')).toHaveCount(0);
});
