// "My diagrams": diagrams the user creates, imports or saves, kept in this
// browser's localStorage. The app is static (no server). Optional sync targets
// (./sync): a folder on disk (File System Access API) and a GitHub repository.

/** Link to the diagram's file in the connected folder. */
export interface FolderLink {
  file: string;
  /** hashText() of the content last written to / read from the file. */
  hash: string;
  syncedAt: number;
}

/** Link to the diagram's file in the configured GitHub repository. */
export interface GitHubLink {
  path: string;
  /** Git blob SHA of the file as last committed / pulled. */
  sha: string;
  /** hashText() of the content last committed / pulled. */
  hash: string;
  syncedAt: number;
}

export interface SavedDiagram {
  id: string;
  name: string;
  text: string;
  /** diagram_type read from the IR when it parses; informational only. */
  type: string | null;
  createdAt: number;
  updatedAt: number;
  folder?: FolderLink;
  github?: GitHubLink;
}

/** FNV-1a 32-bit content hash, for change detection (not security). */
export function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const slug = (value: string) =>
  value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/** A file name such as `billing-schema.erd.json`, unique among `taken`. */
export function fileNameFor(diagram: Pick<SavedDiagram, 'name' | 'type'>, taken: Set<string>): string {
  const stem = `${slug(diagram.name) || 'diagram'}${diagram.type ? `.${slug(diagram.type)}` : ''}`;
  let name = `${stem}.json`;
  for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `${stem}-${n}.json`;
  return name;
}

/** Display name for a diagram read from a file: its meta.title, else the file name. */
export const nameFromFile = (text: string, file: string) =>
  titleOf(text) ?? file.replace(/\.json$/i, '').replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' ');

const LIBRARY_KEY = 'vca-diagrams-v1';

/** True when localStorage can be written (it throws in some private modes). */
export function storageAvailable(): boolean {
  try {
    const probe = `${LIBRARY_KEY}-probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

const isSaved = (value: unknown): value is SavedDiagram => {
  const d = value as SavedDiagram;
  return Boolean(d) && typeof d.id === 'string' && typeof d.name === 'string' && typeof d.text === 'string';
};

export function loadLibrary(): SavedDiagram[] {
  try {
    const raw = window.localStorage.getItem(LIBRARY_KEY);
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter(isSaved) : [];
  } catch {
    return [];
  }
}

/** Persist the whole library; returns false when storage is unavailable or full. */
export function storeLibrary(library: SavedDiagram[]): boolean {
  try {
    window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
    return true;
  } catch {
    return false;
  }
}

export function typeOf(text: string): string | null {
  try {
    const ir = JSON.parse(text);
    return typeof ir?.diagram_type === 'string' ? ir.diagram_type : null;
  } catch {
    return null;
  }
}

export function titleOf(text: string): string | null {
  try {
    const title = JSON.parse(text)?.meta?.title;
    return typeof title === 'string' && title.trim() ? title.trim() : null;
  } catch {
    return null;
  }
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 12)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function createDiagram(name: string, text: string): SavedDiagram {
  const now = Date.now();
  return { id: newId(), name: name.trim() || 'Untitled diagram', text, type: typeOf(text), createdAt: now, updatedAt: now };
}

/** Most recently edited first. */
export const sortedLibrary = (library: SavedDiagram[]) => [...library].sort((a, b) => b.updatedAt - a.updatedAt);

export const SAVED_PREFIX = 'saved:';
export const savedSource = (id: string) => `${SAVED_PREFIX}${id}`;
export const savedIdOf = (source: string | null) => (source?.startsWith(SAVED_PREFIX) ? source.slice(SAVED_PREFIX.length) : null);
