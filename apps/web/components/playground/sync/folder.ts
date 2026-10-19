// Folder sync through the File System Access API (Chromium). The chosen
// directory handle is kept in IndexedDB so the folder survives reloads; the
// browser asks again for write permission after a restart.

type Permission = 'granted' | 'prompt' | 'denied';

interface PermissionCapableHandle extends FileSystemDirectoryHandle {
  queryPermission?: (options: { mode: 'read' | 'readwrite' }) => Promise<Permission>;
  requestPermission?: (options: { mode: 'read' | 'readwrite' }) => Promise<Permission>;
  entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
}

type DirectoryPicker = (options?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }) => Promise<FileSystemDirectoryHandle>;

export interface FolderFile {
  name: string;
  text: string;
  lastModified: number;
}

export const folderSupported = () => typeof window !== 'undefined' && typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

export async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as unknown as { showDirectoryPicker: DirectoryPicker }).showDirectoryPicker;
  return picker({ id: 'vc-archify-diagrams', mode: 'readwrite' });
}

export async function folderPermission(handle: FileSystemDirectoryHandle, request = false): Promise<Permission> {
  const h = handle as PermissionCapableHandle;
  const options = { mode: 'readwrite' as const };
  try {
    if (request && h.requestPermission) return await h.requestPermission(options);
    if (h.queryPermission) return await h.queryPermission(options);
  } catch {
    return 'denied';
  }
  return 'granted';
}

/** Top-level *.json files of the folder (subfolders are ignored). */
export async function listJsonFiles(handle: FileSystemDirectoryHandle): Promise<FolderFile[]> {
  const files: FolderFile[] = [];
  const iterate = (handle as PermissionCapableHandle).entries;
  if (!iterate) return files;
  for await (const [name, entry] of iterate.call(handle)) {
    if (entry.kind !== 'file' || !/\.json$/i.test(name) || name.startsWith('.')) continue;
    const file = await (entry as FileSystemFileHandle).getFile();
    files.push({ name, text: await file.text(), lastModified: file.lastModified });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

export async function writeFolderFile(handle: FileSystemDirectoryHandle, name: string, text: string): Promise<void> {
  const fileHandle = await handle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

export async function removeFolderFile(handle: FileSystemDirectoryHandle, name: string): Promise<void> {
  try {
    await handle.removeEntry(name);
  } catch (error) {
    if ((error as DOMException)?.name !== 'NotFoundError') throw error;
  }
}

// ---- remember the handle across reloads (IndexedDB; handles are cloneable) ----

const DB = 'vc-archify';
const STORE = 'handles';
const KEY = 'folder';

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      try {
        const tx = open.result.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => open.result.close();
      } catch (error) {
        // e.g. DataCloneError for a handle that cannot be stored
        open.result.close();
        reject(error);
      }
    };
  });
}

export async function rememberFolder(handle: FileSystemDirectoryHandle | null): Promise<void> {
  try {
    await withStore<unknown>('readwrite', (store) => (handle ? store.put(handle, KEY) : store.delete(KEY)) as IDBRequest<unknown>);
  } catch {
    /* IndexedDB unavailable: the folder must be picked again after a reload */
  }
}

export async function rememberedFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await withStore<FileSystemDirectoryHandle | undefined>('readonly', (store) => store.get(KEY));
    return handle && handle.kind === 'directory' ? handle : null;
  } catch {
    return null;
  }
}
