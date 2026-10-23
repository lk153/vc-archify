import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { extractSvg, renderDiagram } from '@vca/render';
import { applyMove, dragConfig, type Box, type FrameBox, type MoveRequest } from '../components/playground/layout/applyMove';
import { applyPatches } from '../components/playground/layout/jsonEdit';

// Drag-to-rearrange, without a browser: a move measured on the rendered
// example becomes a minimal JSON edit that the engine accepts.

const EXAMPLES = fileURLToPath(new URL('../../../examples/', import.meta.url));
const exampleText = (file: string) => fs.readFileSync(path.join(EXAMPLES, file), 'utf8');

const attr = (attrs: string, name: string) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? '';
const rect = (attrs: string): Box => ({ x: Number(attr(attrs, 'x')), y: Number(attr(attrs, 'y')), w: Number(attr(attrs, 'width')), h: Number(attr(attrs, 'height')) });

/** What the preview reports: node boxes and structural frames of a render. */
async function layoutOf(text: string) {
  const svg = extractSvg((await renderDiagram(JSON.parse(text))).html);
  const nodes: Record<string, Box> = {};
  for (const m of svg.matchAll(/<g\b[^>]*\bdata-node-id="([^"]+)"[^>]*>[\s\S]*?<rect\b([^>]*)>/g)) nodes[m[1]] ??= rect(m[2]);
  const frames: FrameBox[] = [...svg.matchAll(/<rect\b([^>]*data-graph-role="structural-frame"[^>]*)>/g)].map((m) => ({
    ...rect(m[1]),
    kind: attr(m[1], 'data-composition-frame-kind'),
    id: attr(m[1], 'data-composition-frame-id'),
  }));
  return { nodes, frames };
}

async function drag(file: string, target: MoveRequest['target'], dx: number, dy: number, step?: MoveRequest['step']) {
  const text = exampleText(file);
  const { nodes, frames } = await layoutOf(text);
  const result = applyMove(text, text, { target, dx, dy, step, nodes, frames });
  return { text, nodes, frames, result };
}

const changedLines = (before: string, after: string) => {
  const a = before.split('\n');
  const b = after.split('\n');
  expect(b).toHaveLength(a.length);
  return b.filter((line, i) => line !== a[i]);
};

test.describe('layout model', () => {
  test('a dragged component gets its new pos; only the lines it touches change', async () => {
    const { text, result } = await drag('web-app.architecture.json', { kind: 'node', id: 'api' }, 50, 20);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toBe('Moved “API Server” to [720, 320].');
    const ir = JSON.parse(result.text);
    expect(ir.components.find((c: { id: string }) => c.id === 'api').pos).toEqual([720, 320]);
    // The hand-routed JWT check slides its last leg along; labels tuned to old routes are re-placed.
    expect(ir.connections.find((c: { id: string }) => c.id === 'jwt-verification').via).toEqual([[620, 142], [620, 246], [785, 246]]);
    expect(ir.connections.find((c: { id: string }) => c.id === 'cache-read-through').labelDy).toBeUndefined();
    const changed = changedLines(text, result.text);
    expect(changed.map((line) => line.match(/"id": "([^"]+)"/)?.[1])).toEqual(['api', 'jwt-verification', 'cache-read-through', 'enqueue-job']);
    await renderDiagram(ir);
  });

  test('a boundary moves every component it wraps, and the routes into it', async () => {
    const { result } = await drag('web-app.architecture.json', { kind: 'frame', frameKind: 'region', id: '0' }, 40, 40);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toBe('Moved boundary “AWS Region: us-west-2” and its 8 components by [40, 40].');
    const ir = JSON.parse(result.text);
    const pos = Object.fromEntries(ir.components.map((c: { id: string; pos: number[] }) => [c.id, c.pos]));
    expect(pos).toMatchObject({ users: [40, 300], auth: [40, 110], cdn: [290, 340], api: [710, 340], worker: [920, 480] });
    // Enters the region from Auth (outside): the leg leaving Auth stays level, the rest moves with the region.
    expect(ir.connections.find((c: { id: string }) => c.id === 'jwt-verification').via).toEqual([[660, 142], [660, 286], [775, 286]]);
    await renderDiagram(ir);
  });

  test('keyboard nudges move a free placement by 10 units', async () => {
    const { result } = await drag('web-app.architecture.json', { kind: 'node', id: 'worker' }, 0, 0, { x: 1, y: 0 });
    expect(result.ok && JSON.parse(result.text).components.find((c: { id: string }) => c.id === 'worker').pos).toEqual([890, 440]);
  });

  test('a workflow node lands in the lane and column it is dropped on', async () => {
    const { nodes, frames } = await layoutOf(exampleText('release-delivery.workflow.json'));
    const ci = frames.find((f) => f.id === 'lane-1')!;
    const commit = nodes.commit;
    const { result } = await drag('release-delivery.workflow.json', { kind: 'node', id: 'commit' }, 0, ci.y + ci.h / 2 - (commit.y + commit.h / 2));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toBe('Moved “Commit” to lane “Continuous Integration”, col 0.');
    expect(JSON.parse(result.text).nodes.find((n: { id: string }) => n.id === 'commit')).toMatchObject({ lane: 'ci', col: 0 });
    await renderDiagram(JSON.parse(result.text));
  });

  test('a workflow group moves with its member nodes', async () => {
    const { result } = await drag('release-delivery.workflow.json', { kind: 'frame', frameKind: 'group', id: 'group-0' }, 130, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ir = JSON.parse(result.text);
    expect(ir.groups[0]).toMatchObject({ lane: 'ci', fromCol: 3, toCol: 4 });
    expect(ir.nodes.filter((n: { lane: string }) => n.lane === 'ci').map((n: { id: string; col: number }) => [n.id, n.col])).toEqual([['build', 3], ['checks', 4]]);
  });

  test('a dataflow node moves to the nearest stage and row', async () => {
    const { nodes } = await layoutOf(exampleText('product-analytics.dataflow.json'));
    const { result } = await drag('product-analytics.dataflow.json', { kind: 'node', id: 'model' }, 0, nodes.warehouse.y - nodes.model.y);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toBe('Moved “ML Model” to stage 4 (“Consume”), row 1.');
    expect(JSON.parse(result.text).nodes.find((n: { id: string }) => n.id === 'model')).toMatchObject({ stage: 4, row: 1 });
  });

  test('a grid table dropped on another one swaps cells with it', async () => {
    const { nodes } = await layoutOf(exampleText('orders.erd.json'));
    const { result } = await drag('orders.erd.json', { kind: 'node', id: 'payment' }, 0, nodes.order_item.y - nodes.payment.y);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toBe('Moved table “payment” to row 1, col 2. It swapped places with “order_item”.');
    const cells = Object.fromEntries(JSON.parse(result.text).entities.map((e: { id: string; row: number; col: number }) => [e.id, [e.row, e.col]]));
    expect(cells).toMatchObject({ payment: [1, 2], order_item: [0, 2] });
  });

  test('no-ops, auto-laid-out types and broken JSON are explained', async () => {
    const { result: still } = await drag('web-app.architecture.json', { kind: 'node', id: 'api' }, 0, 0);
    expect(still).toMatchObject({ ok: false, noop: true });
    const sequence = exampleText('cache-miss-request.sequence.json');
    expect(dragConfig(sequence)).toBeNull();
    expect(applyMove(sequence, sequence, { target: { kind: 'node', id: 'user' }, dx: 10, dy: 0, nodes: {}, frames: [] })).toMatchObject({ ok: false });
    expect(applyMove('{ "diagram_type": ', exampleText('web-app.architecture.json'), { target: { kind: 'node', id: 'api' }, dx: 10, dy: 0, nodes: {}, frames: [] }))
      .toMatchObject({ ok: false, reason: expect.stringContaining('syntax error') });
  });
});

test.describe('JSON edits keep the author’s formatting', () => {
  test('replace, insert and remove members in inline and multi-line objects', () => {
    const text = '{\n  "a": { "id": "x", "pos": [1, 2] },\n  "b": {\n    "id": "y",\n    "labelDy": 4\n  }\n}\n';
    const next = applyPatches(text, [
      { pointer: '/a/pos', value: [10, 20] },
      { pointer: '/a/row', value: 1 },
      { pointer: '/b/pos', value: [5, 6] },
      { pointer: '/b/labelDy', remove: true },
    ]);
    expect(next).toBe('{\n  "a": { "id": "x", "pos": [10, 20], "row": 1 },\n  "b": {\n    "id": "y",\n    "pos": [5, 6]\n  }\n}\n');
  });
});
