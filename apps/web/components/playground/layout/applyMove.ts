// Turn a drag in the preview into an IR change. The preview reports what was
// dragged, how far (in diagram units) and the rendered boxes; this module maps
// that onto each diagram type's own placement model:
//
//   architecture  components: free `pos` (or grid row/col); boundaries move their `wraps`
//   erd           entities: free `pos`, or grid row/col
//   workflow      nodes: lane + col; groups move with their member nodes
//   dataflow      nodes: stage + row
//
// Sequence and lifecycle diagrams are laid out by the engine and are not draggable.
// Positions are computed from what the reader sees (the rendered boxes), so a
// drag on a stale preview still lands where it was dropped.

import { applyPatches, type Patch } from './jsonEdit';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FrameBox extends Box {
  kind: string;
  id: string;
}

export type MoveTarget = { kind: 'node'; id: string } | { kind: 'frame'; frameKind: string; id: string };

export interface MoveRequest {
  target: MoveTarget;
  /** Drag distance in diagram units (already snapped by the preview). */
  dx: number;
  dy: number;
  /** Keyboard nudge in grid steps; cells for lane/column/row diagrams. */
  step?: { x: number; y: number };
  /** Rendered node boxes by id, and the structural frames (lanes, stages, boundaries). */
  nodes: Record<string, Box>;
  frames: FrameBox[];
}

export type MoveResult =
  | { ok: true; text: string; summary: string }
  | { ok: false; reason: string; noop?: boolean };

export interface DragConfig {
  /** Which structural frames can be dragged. */
  frames: 'all' | 'group' | 'none';
  /** Grid that free placements snap to in the preview (diagram units); 0 = none. */
  snap: number;
  /** Nodes placed freely; the others land in a grid cell when dropped. */
  free: string[];
}

/** Keyboard nudge for free placements, in diagram units. */
export const NUDGE = 10;
const WORKFLOW_MAX_COL = 5; // schema: nodes[].col ≤ 5
const DATAFLOW_MAX_ROW = 4; // the engine draws five row bands
const ERD_MAX_CELL = 12; // schema: entities[].row/col ≤ 12

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const list = (value: unknown): Json[] => (Array.isArray(value) ? value.filter((v) => v && typeof v === 'object') : []);
const isPoint = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === 'number' && Number.isFinite(n));
const isPoints = (value: unknown): value is [number, number][] => Array.isArray(value) && value.every(isPoint);
const isCell = (item: Json) => Number.isInteger(item.row) && typeof item.col === 'number' && Number.isFinite(item.col);
const tidy = (n: number) => Math.round(n * 10) / 10;
const nameOf = (item: Json) => (typeof item.label === 'string' && item.label.trim()) || String(item.id);
const center = (box: Box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
const fail = (reason: string): MoveResult => ({ ok: false, reason });
const noop: MoveResult = { ok: false, reason: 'Nothing moved.', noop: true };

function parse(text: string): Json | null {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** How the preview should offer dragging for a rendered diagram, or null when it cannot. */
export function dragConfig(renderedText: string): DragConfig | null {
  const ir = parse(renderedText);
  switch (ir?.diagram_type) {
    case 'architecture':
      return { frames: 'all', snap: NUDGE, free: list(ir.components).filter((c) => isPoint(c.pos) || !isCell(c)).map((c) => String(c.id)) };
    case 'erd':
      return { frames: 'none', snap: NUDGE, free: list(ir.entities).filter((e) => isPoint(e.pos)).map((e) => String(e.id)) };
    case 'workflow':
      return { frames: 'group', snap: 0, free: [] };
    case 'dataflow':
      return { frames: 'none', snap: 0, free: [] };
    default:
      return null;
  }
}

// ---- grid geometry from the rendered boxes ------------------------------------

/** Cell index ↔ coordinate along one axis, learnt from rendered items; gaps are interpolated. */
function axis(samples: [number, number | undefined][], fallbackPitch: number) {
  const groups = new Map<number, number[]>();
  for (const [index, coord] of samples) {
    if (Number.isInteger(index) && typeof coord === 'number' && Number.isFinite(coord)) groups.set(index, [...(groups.get(index) ?? []), coord]);
  }
  const known = [...groups].map(([index, coords]) => [index, coords.reduce((a, b) => a + b, 0) / coords.length] as const).sort((a, b) => a[0] - b[0]);
  const pitches = known.slice(1).map(([index, coord], k) => (coord - known[k][1]) / (index - known[k][0])).filter((p) => p > 0).sort((a, b) => a - b);
  const pitch = pitches.length ? pitches[Math.floor(pitches.length / 2)] : fallbackPitch;
  const at = (index: number): number => {
    if (!known.length) return index * pitch;
    const exact = known.find(([i]) => i === index);
    if (exact) return exact[1];
    const before = [...known].reverse().find(([i]) => i < index);
    const after = known.find(([i]) => i > index);
    if (before && after) return before[1] + ((after[1] - before[1]) * (index - before[0])) / (after[0] - before[0]);
    if (before) return before[1] + (index - before[0]) * pitch;
    return after![1] - (after![0] - index) * pitch;
  };
  const nearest = (coord: number, min: number, max: number) => {
    let best = min;
    let distance = Infinity;
    for (let index = min; index <= max; index += 1) {
      const d = Math.abs(at(index) - coord);
      if (d < distance) {
        distance = d;
        best = index;
      }
    }
    return best;
  };
  return { at, nearest, pitch, max: known.length ? known[known.length - 1][0] : 0 };
}

/** Bands drawn as frames (workflow lanes, dataflow stages): index → extent along one axis. */
function bands(frames: FrameBox[], kind: string, indexOf: (id: string) => number | null, vertical: boolean) {
  const items = frames
    .filter((f) => f.kind === kind)
    .map((f) => ({ index: indexOf(f.id), start: vertical ? f.y : f.x, size: vertical ? f.h : f.w }))
    .filter((b): b is { index: number; start: number; size: number } => b.index !== null);
  const pick = (coord: number) => {
    const inside = items.find((b) => coord >= b.start && coord <= b.start + b.size);
    if (inside) return inside.index;
    let best: number | null = null;
    let distance = Infinity;
    for (const b of items) {
      const d = Math.abs(b.start + b.size / 2 - coord);
      if (d < distance) {
        distance = d;
        best = b.index;
      }
    }
    return best;
  };
  const middle = (index: number) => {
    const b = items.find((item) => item.index === index);
    return b ? b.start + b.size / 2 : null;
  };
  return { pick, middle, count: items.length };
}

const clampIndex = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// ---- relationships (connections / relationships / edges / flows) ------------

interface Shift {
  dx: number;
  dy: number;
  /** Rendered box of the node before the move. */
  box: Box;
}

const within = (value: number, start: number, size: number) => value >= start - 0.5 && value <= start + size + 0.5;
/** 0 when a route point lies above/below the box (its port segment is vertical: shared x), 1 beside it (shared y). */
const sharedAxis = (point: number[], box: Box) => (within(point[0], box.x, box.w) ? 0 : within(point[1], box.y, box.h) ? 1 : -1);
const insideBox = (point: number[], box: Box) => within(point[0], box.x, box.w) && within(point[1], box.y, box.h);

/** The run of via points leading straight into a moved node's port. */
function runInto(via: number[][], intoEnd: boolean, box: Box): boolean[] {
  const flags = via.map(() => false);
  const order = via.map((_, i) => i);
  if (intoEnd) order.reverse();
  const first = via[order[0]];
  const axisIndex = sharedAxis(first, box);
  if (axisIndex === -1) return flags;
  for (const i of order) {
    if (Math.abs(via[i][axisIndex] - first[axisIndex]) > 0.5) break;
    flags[i] = true;
  }
  return flags;
}

/**
 * Move the `carried` via points with one moved end, keeping the route
 * orthogonal: where a carried point meets a point (or port) that stays put,
 * their shared coordinate is pinned, so that segment only slides.
 */
function carry(points: number[][], original: number[][], carried: boolean[], end: 'from' | 'to', shift: Shift, otherBox: Box | undefined) {
  const last = original.length - 1;
  return points.map((point, i) => {
    if (!carried[i]) return point;
    let dx = shift.dx;
    let dy = shift.dy;
    for (const j of [i - 1, i + 1]) {
      let pinned = -1;
      if (j < 0 || j > last) {
        if ((j < 0 ? 'from' : 'to') === end || !otherBox) continue; // the moved port travels with the point
        pinned = sharedAxis(original[i], otherBox);
      } else if (!carried[j]) {
        pinned = Math.abs(original[j][0] - original[i][0]) < 0.5 ? 0 : Math.abs(original[j][1] - original[i][1]) < 0.5 ? 1 : -1;
      }
      if (pinned === 0) dx = 0;
      if (pinned === 1) dy = 0;
    }
    return [point[0] + dx, point[1] + dy];
  });
}

/**
 * Keep relationships consistent with moved nodes. Routes between two nodes
 * that moved together move as a whole; a route with one moved end carries the
 * via points that lead into it (or, for a boundary drag, the ones inside the
 * boundary) and drops hand-placed label offsets, which the engine re-places.
 */
function adjustRelations(ctx: Ctx, key: string, area?: Box) {
  const { cur, shifts, patches, move } = ctx;
  list(cur[key]).forEach((rel, index) => {
    const from = shifts.get(rel.from);
    const to = shifts.get(rel.to);
    if (!from && !to) return;
    const base = `/${key}/${index}`;
    if (from && to && from.dx === to.dx && from.dy === to.dy) {
      const { dx, dy } = from;
      if (!dx && !dy) return;
      if (isPoints(rel.via) && rel.via.length) patches.push({ pointer: `${base}/via`, value: rel.via.map(([x, y]) => [tidy(x + dx), tidy(y + dy)]) });
      if (isPoint(rel.labelAt)) patches.push({ pointer: `${base}/labelAt`, value: [tidy(rel.labelAt[0] + dx), tidy(rel.labelAt[1] + dy)] });
      if (typeof rel.channelX === 'number') patches.push({ pointer: `${base}/channelX`, value: tidy(rel.channelX + dx) });
      if (typeof rel.channelY === 'number') patches.push({ pointer: `${base}/channelY`, value: tidy(rel.channelY + dy) });
      return;
    }
    if (isPoints(rel.via) && rel.via.length) {
      const original = rel.via.map(([x, y]) => [x, y]);
      let via = original;
      for (const [end, shift, other] of [['from', from, rel.to], ['to', to, rel.from]] as const) {
        if (!shift) continue;
        const run = runInto(original, end === 'to', shift.box);
        const carried = area ? original.map((point, i) => run[i] || insideBox(point, area)) : run;
        via = carry(via, original, carried, end, shift, shifts.get(other)?.box ?? move.nodes[other]);
      }
      patches.push({ pointer: `${base}/via`, value: via.map(([x, y]) => [tidy(x), tidy(y)]) });
    }
    // A hand-placed label was tuned to the old route: let the engine place it again.
    for (const field of ['labelAt', 'labelDx', 'labelDy', 'labelSegment']) {
      if (field in rel) patches.push({ pointer: `${base}/${field}`, remove: true });
    }
  });
}

// ---- shared placement helpers ---------------------------------------------------

interface Ctx {
  cur: Json;
  ren: Json;
  move: MoveRequest;
  patches: Patch[];
  shifts: Map<string, Shift>;
}

const dragDelta = (move: MoveRequest) => (move.step ? { dx: move.step.x * NUDGE, dy: move.step.y * NUDGE } : { dx: move.dx, dy: move.dy });
/** Keyboard nudges move grid placements one cell at a time. */
const cellStep = (move: MoveRequest) => ({ x: Math.sign(move.step?.x ?? 0), y: Math.sign(move.step?.y ?? 0) });

/** Free placement: the new `pos` is where the box was dropped. */
function placeFree(ctx: Ctx, key: string, index: number, item: Json, box: Box, dx: number, dy: number) {
  const x = Math.max(0, tidy(box.x + dx));
  const y = Math.max(0, tidy(box.y + dy));
  const before = isPoint(item.pos) ? item.pos : [box.x, box.y];
  if (before[0] === x && before[1] === y) return null;
  ctx.patches.push({ pointer: `/${key}/${index}/pos`, value: [x, y] });
  ctx.shifts.set(String(item.id), { dx: x - before[0], dy: y - before[1], box });
  return [x, y] as const;
}

/** Grid placement (row/col): move to the nearest cell, swapping with an item already there. */
function placeCell(
  ctx: Ctx,
  key: string,
  items: Json[],
  index: number,
  target: { row: number; col: number },
  geometry: { colAt: (col: number) => number; rowAt: (row: number) => number },
) {
  const item = items[index];
  if (item.row === target.row && item.col === target.col) return null;
  const occupantIndex = items.findIndex((other, i) => i !== index && isCell(other) && !isPoint(other.pos) && other.row === target.row && other.col === target.col);
  const set = (i: number, row: number, col: number) => {
    const moved = items[i];
    const box = ctx.move.nodes[moved.id];
    ctx.patches.push({ pointer: `/${key}/${i}/row`, value: row }, { pointer: `/${key}/${i}/col`, value: col });
    if (box) ctx.shifts.set(String(moved.id), { dx: geometry.colAt(col) - geometry.colAt(moved.col), dy: geometry.rowAt(row) - geometry.rowAt(moved.row), box });
  };
  if (occupantIndex !== -1) set(occupantIndex, item.row, Math.round(item.col));
  set(index, target.row, target.col);
  return occupantIndex === -1 ? null : items[occupantIndex];
}

const swapNote = (other: Json | null) => (other ? ` It swapped places with “${nameOf(other)}”.` : '');

function finish(ctx: Ctx, text: string, relationsKey: string, summary: string, area?: Box): MoveResult {
  if (!ctx.patches.length) return noop;
  adjustRelations(ctx, relationsKey, area);
  try {
    return { ok: true, text: applyPatches(text, ctx.patches), summary };
  } catch (error) {
    return fail(`The JSON could not be updated: ${(error as Error).message}`);
  }
}

// ---- diagram types --------------------------------------------------------------

function moveArchitecture(ctx: Ctx, text: string): MoveResult {
  const { cur, ren, move } = ctx;
  const components = list(cur.components);
  const indexOf = new Map(components.map((c, i) => [String(c.id), i]));
  const grid = cur.layout?.mode === 'grid';
  const cells = list(ren.components).filter((c) => isCell(c) && !isPoint(c.pos));
  const cols = axis(cells.map((c) => [c.col, move.nodes[c.id]?.x]), 160);
  const rows = axis(cells.map((c) => [c.row, move.nodes[c.id]?.y]), 104);
  const maxCol = (Number.isInteger(cur.layout?.cols) ? cur.layout.cols : 4) - 1;
  const geometry = { colAt: cols.at, rowAt: rows.at };
  const { dx, dy } = dragDelta(move);

  if (move.target.kind === 'node') {
    const index = indexOf.get(move.target.id);
    const box = move.nodes[move.target.id];
    if (index === undefined || !box) return fail(`“${move.target.id}” is no longer in the JSON.`);
    const component = components[index];
    if (grid && isCell(component) && !isPoint(component.pos)) {
      const step = cellStep(move);
      const target = move.step
        ? { row: Math.max(0, component.row + step.y), col: clampIndex(component.col + step.x, 0, maxCol) }
        : { row: rows.nearest(box.y + dy, 0, Math.max(rows.max + 1, component.row + 1)), col: cols.nearest(box.x + dx, 0, maxCol) };
      const other = placeCell(ctx, 'components', components, index, target, geometry);
      return finish(ctx, text, 'connections', `Moved “${nameOf(component)}” to row ${target.row}, col ${target.col}.${swapNote(other)}`);
    }
    const pos = placeFree(ctx, 'components', index, component, box, dx, dy);
    if (!pos) return noop;
    return finish(ctx, text, 'connections', `Moved “${nameOf(component)}” to [${pos[0]}, ${pos[1]}].`);
  }

  const frameIndex = Number(move.target.id);
  const rendered = list(ren.boundaries)[frameIndex];
  const boundaries = list(cur.boundaries);
  const index = rendered && boundaries[frameIndex]?.label === rendered.label ? frameIndex : boundaries.findIndex((b) => b.label === rendered?.label);
  if (index < 0) return fail('That boundary is no longer in the JSON.');
  const boundary = boundaries[index];
  const members = (Array.isArray(boundary.wraps) ? boundary.wraps : []).map(String).filter((id: string) => indexOf.has(id) && move.nodes[id]);
  if (!members.length) return fail(`Boundary “${boundary.label}” wraps no rendered components.`);
  // Keep every member on the canvas.
  const left = Math.min(...members.map((id: string) => move.nodes[id].x));
  const top = Math.min(...members.map((id: string) => move.nodes[id].y));
  const mx = Math.max(dx, -left);
  const my = Math.max(dy, -top);
  for (const id of members) {
    const i = indexOf.get(id)!;
    const component = components[i];
    if (grid && isCell(component) && !isPoint(component.pos)) {
      const col = clampIndex(component.col + Math.round(mx / cols.pitch), 0, maxCol);
      const row = Math.max(0, component.row + Math.round(my / rows.pitch));
      if (row === component.row && col === component.col) continue;
      ctx.patches.push({ pointer: `/components/${i}/row`, value: row }, { pointer: `/components/${i}/col`, value: col });
      ctx.shifts.set(id, { dx: cols.at(col) - cols.at(component.col), dy: rows.at(row) - rows.at(component.row), box: move.nodes[id] });
    } else {
      placeFree(ctx, 'components', i, component, move.nodes[id], mx, my);
    }
  }
  const count = members.length === 1 ? '1 component' : `${members.length} components`;
  const area = move.frames.find((f) => f.id === move.target.id);
  return finish(ctx, text, 'connections', `Moved boundary “${boundary.label}” and its ${count} by [${tidy(mx)}, ${tidy(my)}].`, area);
}

function moveErd(ctx: Ctx, text: string): MoveResult {
  const { cur, ren, move } = ctx;
  if (move.target.kind !== 'node') return noop;
  const entities = list(cur.entities);
  const index = entities.findIndex((e) => String(e.id) === move.target.id);
  const box = move.nodes[move.target.id];
  if (index < 0 || !box) return fail(`Table “${move.target.id}” is no longer in the JSON.`);
  const entity = entities[index];
  const { dx, dy } = dragDelta(move);
  if (isPoint(entity.pos) || !isCell(entity)) {
    const pos = placeFree(ctx, 'entities', index, entity, box, dx, dy);
    if (!pos) return noop;
    return finish(ctx, text, 'relationships', `Moved table “${nameOf(entity)}” to [${pos[0]}, ${pos[1]}].`);
  }
  // Grid tables are centred in their column and top-aligned in their row.
  const cells = list(ren.entities).filter((e) => isCell(e) && !isPoint(e.pos));
  const cols = axis(cells.map((e) => [e.col, move.nodes[e.id] && center(move.nodes[e.id]).x]), 320);
  const rows = axis(cells.map((e) => [e.row, move.nodes[e.id]?.y]), 214);
  const step = cellStep(move);
  const target = move.step
    ? { row: clampIndex(entity.row + step.y, 0, ERD_MAX_CELL), col: clampIndex(Math.round(entity.col) + step.x, 0, ERD_MAX_CELL) }
    : { row: rows.nearest(box.y + dy, 0, Math.min(ERD_MAX_CELL, rows.max + 1)), col: cols.nearest(center(box).x + dx, 0, Math.min(ERD_MAX_CELL, cols.max + 1)) };
  const other = placeCell(ctx, 'entities', entities, index, target, { colAt: cols.at, rowAt: rows.at });
  return finish(ctx, text, 'relationships', `Moved table “${nameOf(entity)}” to row ${target.row}, col ${target.col}.${swapNote(other)}`);
}

function moveWorkflow(ctx: Ctx, text: string): MoveResult {
  const { cur, ren, move } = ctx;
  const nodes = list(cur.nodes);
  const lanes = list(ren.lanes).map((lane) => String(lane.id));
  const laneLabel = (id: string) => nameOf(list(cur.lanes).find((lane) => String(lane.id) === id) ?? { id });
  const laneBands = bands(move.frames, 'lane', (id) => (/^lane-\d+$/.test(id) ? Number(id.slice(5)) : null), true);
  const cols = axis(list(ren.nodes).map((n) => [n.col, move.nodes[n.id] && center(move.nodes[n.id]).x]), 130);
  const laneMiddle = (laneId: string) => laneBands.middle(lanes.indexOf(laneId)) ?? 0;
  const { dx, dy } = move.step ? { dx: 0, dy: 0 } : move;
  const step = cellStep(move);

  if (move.target.kind === 'node') {
    const index = nodes.findIndex((n) => String(n.id) === move.target.id);
    const box = move.nodes[move.target.id];
    if (index < 0 || !box) return fail(`“${move.target.id}” is no longer in the JSON.`);
    const node = nodes[index];
    const laneIndex = lanes.indexOf(String(node.lane));
    const dropped = center(box);
    const nextLaneIndex = move.step ? clampIndex(laneIndex + step.y, 0, lanes.length - 1) : laneBands.pick(dropped.y + dy) ?? laneIndex;
    const col = move.step ? clampIndex(node.col + step.x, 0, WORKFLOW_MAX_COL) : cols.nearest(dropped.x + dx, 0, WORKFLOW_MAX_COL);
    const lane = lanes[nextLaneIndex] ?? String(node.lane);
    if (lane === node.lane && col === node.col) return noop;
    const occupant = nodes.findIndex((n, i) => i !== index && n.lane === lane && n.col === col);
    const set = (i: number, nextLane: string, nextCol: number) => {
      const moved = nodes[i];
      if (moved.lane !== nextLane) ctx.patches.push({ pointer: `/nodes/${i}/lane`, value: nextLane });
      if (moved.col !== nextCol) ctx.patches.push({ pointer: `/nodes/${i}/col`, value: nextCol });
      const movedBox = move.nodes[moved.id];
      if (movedBox) ctx.shifts.set(String(moved.id), { dx: cols.at(nextCol) - cols.at(moved.col), dy: laneMiddle(nextLane) - laneMiddle(String(moved.lane)), box: movedBox });
    };
    if (occupant !== -1) set(occupant, String(node.lane), node.col);
    set(index, lane, col);
    return finish(ctx, text, 'edges', `Moved “${nameOf(node)}” to lane “${laneLabel(lane)}”, col ${col}.${swapNote(occupant === -1 ? null : nodes[occupant])}`);
  }

  const groups = list(cur.groups);
  const renderedGroup = /^group-\d+$/.test(move.target.id) ? list(ren.groups)[Number(move.target.id.slice(6))] : undefined;
  const groupIndex = groups.findIndex((g) => renderedGroup && g.id === renderedGroup.id);
  const frame = move.frames.find((f) => f.id === move.target.id);
  if (groupIndex < 0 || !frame) return fail('That group is no longer in the JSON.');
  const group = groups[groupIndex];
  const laneIndex = lanes.indexOf(String(group.lane));
  const nextLaneIndex = move.step ? clampIndex(laneIndex + step.y, 0, lanes.length - 1) : laneBands.pick(center(frame).y + dy) ?? laneIndex;
  const width = group.toCol - group.fromCol;
  const middle = (from: number) => (cols.at(from) + cols.at(from + width)) / 2;
  const fromCol = move.step
    ? clampIndex(group.fromCol + step.x, 0, WORKFLOW_MAX_COL - width)
    : (() => {
        let best = group.fromCol;
        for (let from = 0; from <= WORKFLOW_MAX_COL - width; from += 1) {
          if (Math.abs(middle(from) - (middle(group.fromCol) + dx)) < Math.abs(middle(best) - (middle(group.fromCol) + dx))) best = from;
        }
        return best;
      })();
  const lane = lanes[nextLaneIndex] ?? String(group.lane);
  const shift = fromCol - group.fromCol;
  if (lane === group.lane && !shift) return noop;
  if (lane !== group.lane) ctx.patches.push({ pointer: `/groups/${groupIndex}/lane`, value: lane });
  if (shift) ctx.patches.push({ pointer: `/groups/${groupIndex}/fromCol`, value: group.fromCol + shift }, { pointer: `/groups/${groupIndex}/toCol`, value: group.toCol + shift });
  const members = nodes.map((n, i) => [n, i] as const).filter(([n]) => n.lane === group.lane && n.col >= group.fromCol && n.col <= group.toCol);
  for (const [node, i] of members) {
    if (lane !== node.lane) ctx.patches.push({ pointer: `/nodes/${i}/lane`, value: lane });
    if (shift) ctx.patches.push({ pointer: `/nodes/${i}/col`, value: node.col + shift });
    const box = move.nodes[node.id];
    if (box) ctx.shifts.set(String(node.id), { dx: cols.at(node.col + shift) - cols.at(node.col), dy: laneMiddle(lane) - laneMiddle(String(node.lane)), box });
  }
  return finish(ctx, text, 'edges', `Moved group “${nameOf(group)}” to lane “${laneLabel(lane)}”, cols ${group.fromCol + shift}–${group.toCol + shift}${members.length ? `, with its ${members.length === 1 ? 'node' : `${members.length} nodes`}` : ''}.`, frame);
}

function moveDataflow(ctx: Ctx, text: string): MoveResult {
  const { cur, ren, move } = ctx;
  if (move.target.kind !== 'node') return noop;
  const nodes = list(cur.nodes);
  const index = nodes.findIndex((n) => String(n.id) === move.target.id);
  const box = move.nodes[move.target.id];
  if (index < 0 || !box) return fail(`“${move.target.id}” is no longer in the JSON.`);
  const node = nodes[index];
  const stages = list(cur.stages);
  const stageBands = bands(move.frames, 'stage', (id) => (/^\d+$/.test(id) ? Number(id) : null), false);
  const rows = axis(list(ren.nodes).map((n) => [n.row, move.nodes[n.id]?.y]), 114);
  const dropped = center(box);
  const step = cellStep(move);
  const stage = move.step
    ? clampIndex(node.stage + step.x, 0, Math.max(0, stages.length - 1))
    : stageBands.pick(dropped.x + move.dx) ?? node.stage;
  const row = move.step ? clampIndex(node.row + step.y, 0, DATAFLOW_MAX_ROW) : rows.nearest(box.y + move.dy, 0, DATAFLOW_MAX_ROW);
  if (stage === node.stage && row === node.row) return noop;
  const stageMiddle = (s: number) => stageBands.middle(s) ?? 0;
  const occupant = nodes.findIndex((n, i) => i !== index && n.stage === stage && n.row === row);
  const set = (i: number, nextStage: number, nextRow: number) => {
    const moved = nodes[i];
    if (moved.stage !== nextStage) ctx.patches.push({ pointer: `/nodes/${i}/stage`, value: nextStage });
    if (moved.row !== nextRow) ctx.patches.push({ pointer: `/nodes/${i}/row`, value: nextRow });
    const movedBox = move.nodes[moved.id];
    if (movedBox) ctx.shifts.set(String(moved.id), { dx: stageMiddle(nextStage) - stageMiddle(moved.stage), dy: rows.at(nextRow) - rows.at(moved.row), box: movedBox });
  };
  if (occupant !== -1) set(occupant, node.stage, node.row);
  set(index, stage, row);
  const stageName = typeof stages[stage]?.label === 'string' ? ` (“${stages[stage].label}”)` : '';
  return finish(ctx, text, 'flows', `Moved “${nameOf(node)}” to stage ${stage}${stageName}, row ${row}.${swapNote(occupant === -1 ? null : nodes[occupant])}`);
}

/** Apply a drag from the preview (rendered from `renderedText`) to the current editor text. */
export function applyMove(currentText: string, renderedText: string, move: MoveRequest): MoveResult {
  const cur = parse(currentText);
  if (!cur) return fail('The JSON has a syntax error. Fix it first, then drag again.');
  const ren = parse(renderedText);
  if (!ren) return fail('The preview is out of date. Render it again, then drag.');
  if (cur.diagram_type !== ren.diagram_type) return fail('The JSON now describes another diagram type. Render it first, then drag.');
  const ctx: Ctx = { cur, ren, move, patches: [], shifts: new Map() };
  switch (cur.diagram_type) {
    case 'architecture':
      return moveArchitecture(ctx, currentText);
    case 'erd':
      return moveErd(ctx, currentText);
    case 'workflow':
      return moveWorkflow(ctx, currentText);
    case 'dataflow':
      return moveDataflow(ctx, currentText);
    default:
      return fail(`${String(cur.diagram_type)} diagrams are laid out automatically, so they cannot be dragged.`);
  }
}

// ---- messages from the preview ----------------------------------------------------

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const box = (value: unknown): Box | null => {
  const v = value as Record<string, unknown> | null;
  const x = num(v?.x);
  const y = num(v?.y);
  const w = num(v?.w);
  const h = num(v?.h);
  return x === null || y === null || w === null || h === null ? null : { x, y, w, h };
};

/** Validate a `move` message posted by the preview frame. */
export function parseMoveMessage(data: unknown): MoveRequest | null {
  const d = data as Record<string, unknown> | null;
  const target = d?.target as Record<string, unknown> | undefined;
  const dx = num(d?.dx);
  const dy = num(d?.dy);
  if (!target || dx === null || dy === null || typeof target.id !== 'string') return null;
  const nodes: Record<string, Box> = {};
  for (const [id, value] of Object.entries((d?.nodes as Record<string, unknown>) ?? {})) {
    const b = box(value);
    if (b) nodes[id] = b;
  }
  const frames: FrameBox[] = [];
  for (const value of Array.isArray(d?.frames) ? d.frames : []) {
    const b = box(value);
    const f = value as Record<string, unknown>;
    if (b && typeof f.kind === 'string' && typeof f.id === 'string') frames.push({ ...b, kind: f.kind, id: f.id });
  }
  const step = d?.step as Record<string, unknown> | undefined;
  const sx = num(step?.x);
  const sy = num(step?.y);
  const moveTarget: MoveTarget | null = target.kind === 'node'
    ? { kind: 'node', id: target.id }
    : target.kind === 'frame' && typeof target.frameKind === 'string'
      ? { kind: 'frame', frameKind: target.frameKind, id: target.id }
      : null;
  if (!moveTarget) return null;
  const stepOf = (n: number) => Math.max(-5, Math.min(5, Math.round(n)));
  return { target: moveTarget, dx, dy, nodes, frames, ...(sx !== null && sy !== null ? { step: { x: stepOf(sx), y: stepOf(sy) } } : {}) };
}
