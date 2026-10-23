// Minimal, formatting-preserving edits to IR JSON text: a layout change
// rewrites only the values it touches (a `pos`, a `col`, a `via` list), so the
// rest of the author's file keeps its layout, key order and line breaks.

import { locatePointer, objectMembers } from '../jsonLocate';

export type Patch = { pointer: string; value: unknown } | { pointer: string; remove: true };

/** One-line JSON with a space after commas and colons: `[700, 300]`, `{ "x": 1 }`. */
export function formatInline(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(formatInline).join(', ')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length ? `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${formatInline(v)}`).join(', ')} }` : '{}';
  }
  return JSON.stringify(value);
}

const splitPointer = (pointer: string) => {
  const at = pointer.lastIndexOf('/');
  return { parent: pointer.slice(0, at), key: pointer.slice(at + 1).replace(/~1/g, '/').replace(/~0/g, '~') };
};

function setValue(text: string, pointer: string, value: unknown): string {
  const existing = locatePointer(text, pointer);
  const formatted = formatInline(value);
  if (existing) return text.slice(0, existing.start) + formatted + text.slice(existing.end);
  const { parent, key } = splitPointer(pointer);
  const object = objectMembers(text, parent);
  if (!object) throw new Error(`no object at ${parent || '/'}`);
  const member = `${JSON.stringify(key)}: ${formatted}`;
  const last = object.members.at(-1);
  if (!last) return `${text.slice(0, object.range.start)}{ ${member} }${text.slice(object.range.end)}`;
  // Follow the object's style: a new line at the last member's indentation, or inline.
  const lineStart = text.lastIndexOf('\n', last.keyStart) + 1;
  const indent = text.slice(lineStart, last.keyStart);
  const separator = /^[ \t]*$/.test(indent) && lineStart > object.range.start ? `,\n${indent}` : ', ';
  return text.slice(0, last.valueEnd) + separator + member + text.slice(last.valueEnd);
}

function removeValue(text: string, pointer: string): string {
  const { parent, key } = splitPointer(pointer);
  const object = objectMembers(text, parent);
  if (!object) return text;
  const index = object.members.findIndex((m) => m.key === key);
  if (index === -1) return text;
  const member = object.members[index];
  if (index > 0) return text.slice(0, object.members[index - 1].valueEnd) + text.slice(member.valueEnd);
  const next = object.members[index + 1];
  if (next) return text.slice(0, member.keyStart) + text.slice(next.keyStart);
  return text.slice(0, member.keyStart) + text.slice(member.valueEnd);
}

/**
 * Apply patches in order. Throws when the text is not valid JSON or a parent
 * object is missing; the result is always re-parsed to prove it is valid.
 */
export function applyPatches(text: string, patches: Patch[]): string {
  JSON.parse(text);
  let next = text;
  for (const patch of patches) {
    next = 'remove' in patch ? removeValue(next, patch.pointer) : setValue(next, patch.pointer, patch.value);
  }
  JSON.parse(next);
  return next;
}
