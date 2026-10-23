// Playground-only script added to the preview copy of an artifact (downloads
// stay untouched). Inside the sandboxed preview frame it:
//
// - lets the reader drag nodes and boundaries (frames) and reports each drop
//   to the playground as a `move` message in diagram units;
// - nudges a focused node with Alt/Option + arrow keys (Shift: 5 steps);
// - forwards Ctrl/⌘ + Z / Shift + Z / Y as undo and redo;
// - reports the camera (zoom and centre) and the focused node, so the next
//   render reopens at the same view with the same node focused.
//
// Handshake for a new render: the frame posts `loaded`; the playground replies
// `restore` with the camera current at that moment; the frame applies it and
// posts `ready`; the playground swaps it in without a flash and, when the old
// frame had focus, sends `focus` so the same node is focused again.
//
// The playground applies a move to the IR JSON and renders again; this script
// only previews the drag. It talks to the parent through postMessage.

import type { DragConfig } from './applyMove';

export interface PreviewCamera {
  scale: number;
  center: [number, number] | null;
}

export interface EditLayerOptions {
  drag: DragConfig | null;
}


export const PREVIEW_MESSAGE_SOURCE = 'vca-preview';
export const PLAYGROUND_MESSAGE_SOURCE = 'vca-playground';

const EDIT_LAYER = String.raw`function (CONFIG) {
  'use strict';
  var container = document.querySelector('.diagram-container');
  var svg = container && container.querySelector('svg');
  var view = window.Archify && window.Archify.view;
  var root = document.documentElement;
  function post(message) {
    message.source = 'vca-preview';
    try { window.parent.postMessage(message, '*'); } catch (_) {}
  }

  // ---- camera ----
  function camera() {
    if (!view) return null;
    try {
      var state = view.state();
      var port = view.logicalViewport();
      return { scale: state.scale, center: port ? [port.x + port.width / 2, port.y + port.height / 2] : null };
    } catch (_) { return null; }
  }
  var reported = '';
  function reportCamera() {
    var current = camera();
    var key = current ? JSON.stringify(current) : '';
    if (key && key !== reported) { reported = key; post({ type: 'camera', camera: current }); }
  }
  function sameCamera(a, b) {
    if (!a || !b || Math.abs(a.scale - b.scale) > 0.01) return false;
    if (!a.center || !b.center) return true;
    return Math.abs(a.center[0] - b.center[0]) < 1 && Math.abs(a.center[1] - b.center[1]) < 1;
  }
  // Absolute: the same saved camera can be applied more than once.
  function restoreCamera(saved) {
    if (!saved || !view || !svg || sameCamera(camera(), saved)) return;
    var still = document.createElement('style');
    still.textContent = '.diagram-container svg { transition: none !important; }';
    document.head.appendChild(still);
    try {
      if (saved.scale > 1.01 && saved.center) view.centerAt(saved.center[0], saved.center[1], { scale: saved.scale, instant: true });
      else {
        view.reset({ automatic: true });
        for (var i = Math.round((1 - saved.scale) / 0.25); i > 0; i -= 1) view.zoomOut();
      }
    } catch (_) {}
    setTimeout(function () { still.remove(); }, 250);
  }
  var shown = false;
  var fallback = 0;
  // The playground may send the camera again as the frame is swapped in, if
  // the reader zoomed the old frame meanwhile.
  function restoreView(data) {
    clearTimeout(fallback);
    restoreCamera(data && data.camera);
    if (shown) return;
    shown = true;
    var sent = false;
    var done = function () {
      if (sent) return;
      sent = true;
      post({ type: 'ready' });
      reportCamera();
    };
    requestAnimationFrame(function () { requestAnimationFrame(done); });
    setTimeout(done, 200);
  }
  function loaded() {
    post({ type: 'loaded' });
    // Show up anyway if the playground does not answer.
    fallback = setTimeout(function () { restoreView(null); }, 500);
  }
  if (document.readyState === 'complete') loaded();
  else window.addEventListener('load', loaded);
  setInterval(reportCamera, 500);
  if (svg) {
    svg.addEventListener('focusin', function (event) {
      var node = event.target.closest && event.target.closest('[data-node-id]');
      if (node) post({ type: 'focus', id: node.getAttribute('data-node-id') });
    });
    svg.addEventListener('focusout', function (event) {
      if (!event.relatedTarget || !svg.contains(event.relatedTarget)) post({ type: 'focus', id: null });
    });
  }

  // ---- keyboard: undo / redo, nudges ----
  var drag = null;
  var pending = null;
  document.addEventListener('keydown', function (event) {
    var target = event.target;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    var key = (event.key || '').toLowerCase();
    if ((event.metaKey || event.ctrlKey) && !event.altKey && (key === 'z' || key === 'y')) {
      event.preventDefault();
      post({ type: key === 'y' || event.shiftKey ? 'redo' : 'undo' });
      return;
    }
    if (drag && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    if (!CONFIG.drag || !svg || !event.altKey || event.metaKey || event.ctrlKey || !/^Arrow/.test(event.key)) return;
    var node = target && target.closest && target.closest('[data-node-id]');
    if (!node || !svg.contains(node)) return;
    event.preventDefault();
    event.stopPropagation();
    if (pending) return;
    var n = event.shiftKey ? 5 : 1;
    var step = {
      x: event.key === 'ArrowLeft' ? -n : event.key === 'ArrowRight' ? n : 0,
      y: event.key === 'ArrowUp' ? -n : event.key === 'ArrowDown' ? n : 0
    };
    send({ kind: 'node', id: node.getAttribute('data-node-id') }, 0, 0, step, {});
  }, true);

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (event.source !== window.parent || !data || data.source !== 'vca-playground') return;
    if (data.type === 'restore') restoreView(data);
    if (data.type === 'focus' && typeof data.id === 'string' && svg) {
      var focused = svg.querySelector('[data-node-id="' + CSS.escape(data.id) + '"]');
      if (focused) try { focused.focus({ preventScroll: true }); } catch (_) {}
    }
    if (data.type === 'revert' && pending) {
      restore(pending);
      pending = null;
      root.classList.remove('vca-pending');
    }
  });

  if (!CONFIG.drag || !svg) return;
  var config = CONFIG.drag;
  var free = {};
  config.free.forEach(function (id) { free[id] = true; });

  var style = document.createElement('style');
  style.textContent = [
    'svg [data-vca-drag="node"] { cursor: grab !important; }',
    'html.vca-dragging, html.vca-dragging * { cursor: grabbing !important; user-select: none !important; }',
    'html.vca-pending svg, html.vca-pending svg * { cursor: progress !important; }',
    'svg [data-vca-lift] { filter: drop-shadow(0 6px 12px rgba(15, 23, 42, 0.3)); }',
    'svg [data-vca-faded] { opacity: 0.15 !important; }',
    'svg [data-vca-hover] { stroke-width: 2.5px !important; stroke-opacity: 1 !important; filter: drop-shadow(0 0 4px rgba(56, 189, 248, 0.75)); }'
  ].join('\n');
  document.head.appendChild(style);

  var slice = function (list) { return Array.prototype.slice.call(list); };
  var nodes = slice(svg.querySelectorAll('[data-node-id]'));
  nodes.forEach(function (node) { node.setAttribute('data-vca-drag', 'node'); });
  var frames = slice(svg.querySelectorAll('rect[data-graph-role="structural-frame"][data-composition-frame-kind]'));

  function number(el, name) { return Number(el.getAttribute(name)) || 0; }
  function rectBox(el) { return { x: number(el, 'x'), y: number(el, 'y'), w: number(el, 'width'), h: number(el, 'height') }; }
  function nodeBox(node) {
    var rect = node.querySelector('rect');
    if (rect && rect.hasAttribute('width')) return rectBox(rect);
    var b = node.getBBox();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }
  function frameLabels(rect) {
    var id = rect.getAttribute('data-composition-frame-id') || '';
    var labels = slice(svg.querySelectorAll('[data-graph-role="structural-frame-label"][data-composition-frame-id="' + CSS.escape(id) + '"]'));
    var next = rect.nextElementSibling;
    if (next && next.tagName.toLowerCase() === 'text' && !next.hasAttribute('data-node-label')) labels.push(next);
    return labels;
  }
  var draggable = frames.filter(function (rect) {
    var id = rect.getAttribute('data-composition-frame-id') || '';
    return config.frames === 'all' || (config.frames === 'group' && /^group-\d+$/.test(id));
  }).map(function (rect) {
    return { el: rect, id: rect.getAttribute('data-composition-frame-id'), kind: rect.getAttribute('data-composition-frame-kind'), box: rectBox(rect), labels: frameLabels(rect), labelBoxes: null };
  });

  function toSvg(event) {
    var matrix = svg.getScreenCTM();
    if (!matrix) return null;
    var p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  }
  function unitsPerPixel() {
    var matrix = svg.getScreenCTM();
    return matrix && matrix.a ? 1 / matrix.a : 1;
  }
  function inside(p, b, pad) { return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad; }
  function contains(outer, inner) {
    return inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.w <= outer.x + outer.w + 1 && inner.y + inner.h <= outer.y + outer.h + 1;
  }
  // A boundary is grabbed by its label or within a few pixels of its border;
  // its inside stays free for panning and for the nodes.
  function frameAt(p) {
    var unit = unitsPerPixel();
    var tolerance = 6 * unit;
    var hit = null;
    draggable.forEach(function (frame) {
      if (!frame.labelBoxes) frame.labelBoxes = frame.labels.map(function (label) {
        try { var b = label.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; } catch (_) { return { x: 0, y: 0, w: 0, h: 0 }; }
      });
      var b = frame.box;
      var onLabel = frame.labelBoxes.some(function (box) { return box.w > 0 && inside(p, box, 2 * unit); });
      var onBorder = inside(p, b, tolerance) && !inside(p, { x: b.x + tolerance, y: b.y + tolerance, w: b.w - 2 * tolerance, h: b.h - 2 * tolerance }, 0);
      if ((onLabel || onBorder) && (!hit || b.w * b.h < hit.box.w * hit.box.h)) hit = frame;
    });
    return hit;
  }

  var hovered = null;
  function hover(event) {
    if (pending || event.buttons) return;
    var node = event.target && event.target.closest && event.target.closest('[data-vca-drag="node"]');
    var p = !node && draggable.length ? toSvg(event) : null;
    var frame = p ? frameAt(p) : null;
    var el = frame ? frame.el : null;
    if (el !== hovered) {
      if (hovered) hovered.removeAttribute('data-vca-hover');
      hovered = el;
      if (el) el.setAttribute('data-vca-hover', '');
    }
    svg.style.cursor = frame ? 'grab' : '';
  }

  function begin(d) {
    var moving = [];
    var faded = [];
    var ids = {};
    if (d.target.kind === 'node') {
      moving.push(d.target.el);
      ids[d.target.id] = true;
      d.lift = d.target.el;
      d.lift.setAttribute('data-vca-lift', '');
    } else {
      var outer = d.target.frame.box;
      moving.push(d.target.frame.el);
      moving = moving.concat(d.target.frame.labels);
      // Members by their centre: workflow group bands can be shorter than their nodes.
      nodes.forEach(function (node) {
        var b = nodeBox(node);
        if (!inside({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, outer, 0)) return;
        moving.push(node);
        ids[node.getAttribute('data-node-id')] = true;
      });
      frames.forEach(function (rect) {
        if (rect === d.target.frame.el || !contains(outer, rectBox(rect))) return;
        moving.push(rect);
        moving = moving.concat(frameLabels(rect));
      });
    }
    slice(svg.querySelectorAll('[data-edge-from][data-edge-to]')).forEach(function (edge) {
      var from = ids[edge.getAttribute('data-edge-from')];
      var to = ids[edge.getAttribute('data-edge-to')];
      if (!from && !to) return;
      var el = edge.closest('[data-graph-role="automatic-crossover"]') || edge;
      if (from && to) moving.push(el);
      else faded.push(el);
    });
    // Translate each element once, never inside a translated ancestor.
    moving = moving.filter(function (el, index) {
      return moving.indexOf(el) === index && !moving.some(function (other) { return other !== el && other.contains(el); });
    });
    d.saved = moving.map(function (el) { return [el, el.getAttribute('transform')]; });
    d.faded = faded;
    faded.forEach(function (el) { el.setAttribute('data-vca-faded', ''); });
    if (hovered) { hovered.removeAttribute('data-vca-hover'); hovered = null; }
    // The viewer's hover trace would dim the diagram around the dragged node
    // (hover events are held back while dragging; a trace already scheduled
    // by the hover that started this drag is cleared once it fires).
    var clearTrace = function () { try { window.Archify.intentTrace.clear({ announce: false }); } catch (_) {} };
    clearTrace();
    setTimeout(function () { if (drag === d) clearTrace(); }, 150);
    root.classList.add('vca-dragging');
    try { svg.setPointerCapture(d.pointerId); } catch (_) {}
    try { window.getSelection().removeAllRanges(); } catch (_) {}
  }
  function translate(d) {
    d.saved.forEach(function (entry) {
      entry[0].setAttribute('transform', 'translate(' + d.dx + ' ' + d.dy + ')' + (entry[1] ? ' ' + entry[1] : ''));
    });
  }
  function restore(d) {
    (d.saved || []).forEach(function (entry) {
      if (entry[1] == null) entry[0].removeAttribute('transform');
      else entry[0].setAttribute('transform', entry[1]);
    });
    (d.faded || []).forEach(function (el) { el.removeAttribute('data-vca-faded'); });
    if (d.lift) d.lift.removeAttribute('data-vca-lift');
  }
  function end(d) {
    root.classList.remove('vca-dragging');
    try { svg.releasePointerCapture(d.pointerId); } catch (_) {}
  }
  function cancel() {
    var d = drag;
    drag = null;
    if (!d || !d.moved) return;
    end(d);
    restore(d);
    guardClick();
  }
  // Free placements snap to the grid while dragging (hold Alt/Option to place
  // freely); grid placements follow the pointer and land in a cell on drop.
  function snap(d, dx, dy, raw) {
    var grid = config.snap;
    if (!grid || raw) return [Math.round(dx * 10) / 10, Math.round(dy * 10) / 10];
    if (d.target.kind === 'node') {
      if (!free[d.target.id]) return [dx, dy];
      var b = d.origin;
      return [Math.round((b.x + dx) / grid) * grid - b.x, Math.round((b.y + dy) / grid) * grid - b.y];
    }
    return [Math.round(dx / grid) * grid, Math.round(dy / grid) * grid];
  }

  var clickGuardUntil = 0;
  function guardClick() {
    clickGuardUntil = Date.now() + 400;
    if (container) {
      container.setAttribute('data-just-panned', 'true');
      setTimeout(function () { container.removeAttribute('data-just-panned'); }, 400);
    }
  }
  window.addEventListener('click', function (event) {
    if (Date.now() >= clickGuardUntil) return;
    clickGuardUntil = 0;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  function send(target, dx, dy, step, d) {
    pending = d;
    root.classList.add('vca-pending');
    var boxes = {};
    nodes.forEach(function (node) { boxes[node.getAttribute('data-node-id')] = nodeBox(node); });
    var frameBoxes = frames.map(function (rect) {
      var b = rectBox(rect);
      b.kind = rect.getAttribute('data-composition-frame-kind');
      b.id = rect.getAttribute('data-composition-frame-id');
      return b;
    });
    post({ type: 'move', target: target, dx: dx, dy: dy, step: step, nodes: boxes, frames: frameBoxes, camera: camera() });
  }

  svg.addEventListener('pointerdown', function (event) {
    if (drag || event.button !== 0 || event.ctrlKey || event.metaKey) return;
    var p = toSvg(event);
    if (!p) return;
    var node = event.target && event.target.closest && event.target.closest('[data-vca-drag="node"]');
    var target = null;
    if (node) target = { kind: 'node', el: node, id: node.getAttribute('data-node-id') };
    else {
      var frame = frameAt(p);
      if (frame) {
        target = { kind: 'frame', frame: frame };
        // Keep the camera from panning: this press moves the boundary.
        event.stopPropagation();
        event.preventDefault();
      }
    }
    if (!target || pending) return;
    drag = {
      target: target,
      start: p,
      client: [event.clientX, event.clientY],
      pointerId: event.pointerId,
      moved: false,
      dx: 0,
      dy: 0,
      origin: target.kind === 'node' ? nodeBox(node) : target.frame.box
    };
  }, true);

  window.addEventListener('pointermove', function (event) {
    if (!drag) { hover(event); return; }
    if (event.pointerId !== drag.pointerId) return;
    if (!drag.moved) {
      if (Math.abs(event.clientX - drag.client[0]) + Math.abs(event.clientY - drag.client[1]) < 5) return;
      drag.moved = true;
      begin(drag);
    }
    var p = toSvg(event);
    if (!p) return;
    var snapped = snap(drag, p.x - drag.start.x, p.y - drag.start.y, event.altKey);
    drag.dx = snapped[0];
    drag.dy = snapped[1];
    translate(drag);
    event.preventDefault();
  }, true);

  window.addEventListener('pointerup', function (event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    var d = drag;
    drag = null;
    if (!d.moved) return;
    end(d);
    guardClick();
    if (!d.dx && !d.dy) { restore(d); return; }
    var target = d.target.kind === 'node'
      ? { kind: 'node', id: d.target.id }
      : { kind: 'frame', frameKind: d.target.frame.kind, id: d.target.frame.id };
    send(target, d.dx, d.dy, null, d);
  }, true);

  ['pointerover', 'pointerout'].forEach(function (type) {
    window.addEventListener(type, function (event) { if (drag && drag.moved) event.stopPropagation(); }, true);
  });

  window.addEventListener('pointercancel', function (event) {
    if (drag && event.pointerId === drag.pointerId) cancel();
  }, true);
}`;

/** Validate a camera reported by the preview. */
export function parseCamera(value: unknown): PreviewCamera | null {
  const camera = value as { scale?: unknown; center?: unknown } | null;
  if (typeof camera?.scale !== 'number' || !Number.isFinite(camera.scale)) return null;
  const center = Array.isArray(camera.center) && camera.center.length === 2 && camera.center.every((n) => typeof n === 'number' && Number.isFinite(n))
    ? (camera.center as [number, number])
    : null;
  return { scale: camera.scale, center };
}

/** Add the playground's drag layer and camera keeper to a preview copy of an artifact. */
export function withEditLayer(html: string, options: EditLayerOptions): string {
  const config = JSON.stringify(options).replace(/</g, '\\u003c');
  const script = `<script>/* vc-archify playground preview: drag layer and camera, not part of the artifact */(${EDIT_LAYER})(${config});</script>\n`;
  const at = html.lastIndexOf('</body>');
  return at === -1 ? html + script : html.slice(0, at) + script + html.slice(at);
}
