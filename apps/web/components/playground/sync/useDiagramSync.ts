'use client';

// Sync "My diagrams" (browser storage) with two optional targets:
//
// * Folder on disk (File System Access API): two-way. Changes are written to
//   the folder 10 seconds after the last edit, when the tab is hidden, or at
//   once with "Sync now"; "Sync now" (and connecting / reloading) also reads
//   the folder, so files added or edited there (by an agent, git pull, a sync
//   client) appear in My diagrams.
// * GitHub repository: explicit. "Pull" reads the repository folder, "Commit"
//   writes the current diagram (or every changed one) as one commit each.
//
// Conflicts never drop data: when a diagram changed on both sides, the other
// side's version is kept as a separate "(folder copy)" / "(GitHub copy)" diagram.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createDiagram, fileNameFor, fileNameState, hashText, nameFromFile, typeOf, type FolderLink, type SavedDiagram } from '../library';
import {
  folderPermission, folderSupported, listJsonFiles, pickFolder, rememberFolder, rememberedFolder, removeFolderFile, writeFolderFile,
} from './folder';
import {
  DEFAULT_GITHUB, GitHubClient, githubConfigured, loadGitHubSettings, storeGitHubSettings, type GitHubSettings,
} from './github';
import { MIN_PROGRESS_MS, type ToastTask } from '../Toasts';

type UpdateLibrary = (update: (current: SavedDiagram[]) => SavedDiagram[]) => void;

export type FolderState = 'unsupported' | 'disconnected' | 'needs-permission' | 'connected' | 'busy';
export type GitHubState = 'unconfigured' | 'ready' | 'busy';

interface Options {
  library: SavedDiagram[];
  updateLibrary: UpdateLibrary;
  /** Called with the ids whose text was replaced from the folder or GitHub. */
  onExternalChange: (ids: string[], library: SavedDiagram[]) => void;
  /** Shows a running sync (a progress toast) and, when it ends, its result. */
  startTask?: (title: string, total?: number | null) => ToastTask;
}

type Target = 'folder' | 'github';

/** A sync in progress, for the panel's progress bar. `total: null` = indeterminate. */
export interface SyncProgress {
  title: string;
  done: number;
  total: number | null;
}

interface Tracker {
  step(done: number, total?: number | null): void;
  succeed(text: string): void;
  fail(text: string): void;
}

/** Folder writes wait this long after the last edit (Sync now writes at once). */
export const FOLDER_WRITE_DELAY_MS = 10_000;

const isIr = (text: string) => typeOf(text) !== null;
const message = (error: unknown) => String((error as Error)?.message || error);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

async function existsInFolder(handle: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await handle.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

/** A free name for this diagram's file: not linked to another diagram, not on disk. */
async function freeFileName(handle: FileSystemDirectoryHandle, diagram: SavedDiagram, taken: Set<string>): Promise<string> {
  let file = fileNameFor(diagram, taken);
  while (await existsInFolder(handle, file)) {
    taken.add(file.toLowerCase());
    file = fileNameFor(diagram, taken);
  }
  taken.add(file.toLowerCase());
  return file;
}

/**
 * Keep the file name in step with the diagram's name: a renamed diagram's file
 * is written under the new name and the old file removed. Returns the new link,
 * or null when nothing changed.
 */
async function followName(handle: FileSystemDirectoryHandle, diagram: SavedDiagram, link: FolderLink, text: string, taken: Set<string>): Promise<FolderLink | null> {
  const state = fileNameState(link, diagram);
  if (state === 'ok') return null;
  if (state === 'stamp') return { ...link, name: diagram.name };
  taken.delete(link.file.toLowerCase());
  const file = await freeFileName(handle, diagram, taken);
  await writeFolderFile(handle, file, text);
  await removeFolderFile(handle, link.file);
  return { file, name: diagram.name, hash: hashText(text), syncedAt: Date.now() };
}

export function useDiagramSync({ library, updateLibrary, onExternalChange, startTask }: Options) {
  const libraryRef = useRef(library);
  libraryRef.current = library;
  const externalRef = useRef(onExternalChange);
  externalRef.current = onExternalChange;
  const startTaskRef = useRef(startTask);
  startTaskRef.current = startTask;

  // Progress of the running folder / GitHub sync: a bar in the panel and a toast.
  const [progress, setProgress] = useState<Record<Target, SyncProgress | null>>({ folder: null, github: null });
  const track = useCallback((target: Target, title: string, total: number | null = null): Tracker => {
    const toast = startTaskRef.current?.(title, total);
    const started = Date.now();
    let current: SyncProgress = { title, done: 0, total };
    setProgress((p) => ({ ...p, [target]: current }));
    // Keep the bar up as long as the toast's, unless another sync has taken over.
    const clear = () => window.setTimeout(
      () => setProgress((p) => (p[target] === current ? { ...p, [target]: null } : p)),
      Math.max(0, MIN_PROGRESS_MS - (Date.now() - started)),
    );
    return {
      step(done, nextTotal = current.total) {
        current = { ...current, done, total: nextTotal };
        setProgress((p) => ({ ...p, [target]: current }));
        toast?.update(done, nextTotal);
      },
      succeed(text) {
        current = { ...current, done: current.total ?? 1, total: current.total ?? 1 };
        setProgress((p) => ({ ...p, [target]: current }));
        clear();
        toast?.succeed(text);
      },
      fail(text) {
        clear();
        toast?.fail(text);
      },
    };
  }, []);

  // Apply a library change and report text replaced from outside.
  const apply = useCallback((patch: Map<string, Partial<SavedDiagram>>, imports: SavedDiagram[], replaced: string[]) => {
    updateLibrary((current) => {
      const next = [...imports, ...current.map((d) => (patch.has(d.id) ? { ...d, ...patch.get(d.id) } : d))];
      if (replaced.length) queueMicrotask(() => externalRef.current(replaced, next));
      return next;
    });
  }, [updateLibrary]);

  // ------------------------------------------------------------------ folder --
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [folderState, setFolderState] = useState<FolderState>('disconnected');
  const [folderMessage, setFolderMessage] = useState('');
  const folderBusy = useRef(false);

  const syncFolder = useCallback(async (handle: FileSystemDirectoryHandle) => {
    if (folderBusy.current) return;
    folderBusy.current = true;
    setFolderState('busy');
    const task = track('folder', `Syncing with folder “${handle.name}”…`);
    try {
      const files = await listJsonFiles(handle);
      const unmatched = new Map(files.map((f) => [f.name.toLowerCase(), f]));
      const taken = new Set(files.map((f) => f.name.toLowerCase()));
      const now = Date.now();
      const patch = new Map<string, Partial<SavedDiagram>>();
      const imports: SavedDiagram[] = [];
      const writes: { id: string; file: string; text: string; name?: string }[] = [];
      const replaced: string[] = [];
      let conflicts = 0;

      for (const d of libraryRef.current) {
        if (!d.folder) {
          const file = fileNameFor(d, taken);
          taken.add(file.toLowerCase());
          writes.push({ id: d.id, file, text: d.text, name: d.name });
          continue;
        }
        const key = d.folder.file.toLowerCase();
        const onDisk = unmatched.get(key);
        unmatched.delete(key);
        const localHash = hashText(d.text);
        const localChanged = localHash !== d.folder.hash;
        if (!onDisk) {
          writes.push({ id: d.id, file: d.folder.file, text: d.text, name: d.folder.name }); // recreate a removed file
          continue;
        }
        const diskHash = hashText(onDisk.text);
        const diskChanged = diskHash !== d.folder.hash;
        if (diskHash === localHash) {
          if (diskChanged) patch.set(d.id, { folder: { ...d.folder, hash: diskHash, syncedAt: now } });
        } else if (diskChanged && !localChanged) {
          patch.set(d.id, { text: onDisk.text, type: typeOf(onDisk.text) ?? d.type, updatedAt: now, folder: { ...d.folder, hash: diskHash, syncedAt: now } });
          replaced.push(d.id);
        } else if (localChanged && !diskChanged) {
          writes.push({ id: d.id, file: d.folder.file, text: d.text, name: d.folder.name });
        } else {
          // Changed on both sides: keep the folder's version as a copy, then write ours.
          imports.push(createDiagram(`${nameFromFile(onDisk.text, onDisk.name)} (folder copy)`, onDisk.text));
          writes.push({ id: d.id, file: d.folder.file, text: d.text, name: d.folder.name });
          conflicts += 1;
        }
      }

      let skipped = 0;
      for (const f of unmatched.values()) {
        if (!isIr(f.text)) {
          skipped += 1;
          continue;
        }
        const entry = createDiagram(nameFromFile(f.text, f.name), f.text);
        imports.push({ ...entry, updatedAt: f.lastModified || now, folder: { file: f.name, hash: hashText(f.text), syncedAt: now, name: entry.name } });
      }

      const linkOf = (d: SavedDiagram) => patch.get(d.id)?.folder ?? d.folder;
      const renames = libraryRef.current.filter((d) => {
        const link = linkOf(d);
        return link && fileNameState(link, d) === 'rename';
      }).length;
      const total = writes.length + renames;
      let done = 0;
      if (total) task.step(0, total);

      for (const w of writes) {
        await writeFolderFile(handle, w.file, w.text);
        patch.set(w.id, { ...(patch.get(w.id) ?? {}), folder: { file: w.file, hash: hashText(w.text), syncedAt: now, name: w.name } });
        task.step((done += 1), total);
      }

      // Renamed diagrams: move their files to the new name.
      let renamed = 0;
      for (const d of libraryRef.current) {
        const link = linkOf(d);
        if (!link) continue;
        const next = await followName(handle, d, link, patch.get(d.id)?.text ?? d.text, taken);
        if (!next) continue;
        if (next.file !== link.file) {
          renamed += 1;
          task.step((done += 1), total);
        }
        patch.set(d.id, { ...(patch.get(d.id) ?? {}), folder: next });
      }
      apply(patch, imports, replaced);

      const added = imports.filter((d) => d.folder).length;
      const parts = [
        `${plural(files.length, 'file')} in “${handle.name}”`,
        added ? `${added} added to My diagrams` : '',
        replaced.length ? `${replaced.length} updated from the folder` : '',
        writes.length ? `${plural(writes.length, 'file')} written` : '',
        renamed ? `${plural(renamed, 'file')} renamed` : '',
        conflicts ? `${plural(conflicts, 'conflict')} (the folder version was kept as a “folder copy”)` : '',
        skipped ? `${skipped} non-diagram JSON ignored` : '',
      ].filter(Boolean);
      const result = `Synced: ${parts.join(' · ')}.`;
      setFolderMessage(result);
      setFolderState('connected');
      task.succeed(result);
    } catch (error) {
      const denied = (error as DOMException)?.name === 'NotAllowedError';
      const result = denied ? 'Permission to the folder was revoked. Reconnect it.' : `Folder sync failed: ${message(error)}`;
      setFolderMessage(result);
      setFolderState(denied ? 'needs-permission' : 'connected');
      task.fail(result);
    } finally {
      folderBusy.current = false;
    }
  }, [apply, track]);

  const connectFolder = useCallback(async () => {
    try {
      const handle = await pickFolder();
      if ((await folderPermission(handle, true)) !== 'granted') {
        setFolderMessage('Write permission was not granted.');
        return;
      }
      // A different folder: forget links to the previous one.
      updateLibrary((current) => current.map((d) => (d.folder ? { ...d, folder: undefined } : d)));
      libraryRef.current = libraryRef.current.map((d) => (d.folder ? { ...d, folder: undefined } : d));
      setFolder(handle);
      await rememberFolder(handle);
      await syncFolder(handle);
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return; // picker cancelled
      setFolderMessage(`Could not open the folder: ${message(error)}`);
    }
  }, [syncFolder, updateLibrary]);

  const reconnectFolder = useCallback(async () => {
    if (!folder) return;
    if ((await folderPermission(folder, true)) === 'granted') await syncFolder(folder);
    else setFolderMessage('Write permission was not granted.');
  }, [folder, syncFolder]);

  const disconnectFolder = useCallback(async () => {
    setFolder(null);
    setFolderState(folderSupported() ? 'disconnected' : 'unsupported');
    setFolderMessage('Folder disconnected. Your diagrams stay in this browser; the files stay in the folder.');
    updateLibrary((current) => current.map((d) => (d.folder ? { ...d, folder: undefined } : d)));
    await rememberFolder(null);
  }, [updateLibrary]);

  // Write changes to the folder once editing pauses for FOLDER_WRITE_DELAY_MS,
  // or right away when the tab is hidden (switching away, closing it).
  useEffect(() => {
    if (folderState !== 'connected' || !folder) return undefined;
    const pending = library.filter((d) => !d.folder || hashText(d.text) !== d.folder.hash || fileNameState(d.folder, d) !== 'ok');
    if (!pending.length) return undefined;
    let started = false;
    const write = async () => {
      if (started || folderBusy.current) return;
      started = true;
      window.clearTimeout(timer);
      folderBusy.current = true;
      // Only writes and renames are worth a notification; remembering a name is silent.
      const visible = pending.filter((d) => !d.folder || hashText(d.text) !== d.folder.hash || fileNameState(d.folder, d) === 'rename');
      const task = visible.length ? track('folder', `Saving to folder “${folder.name}”…`, visible.length) : null;
      try {
        const taken = new Set(libraryRef.current.flatMap((d) => (d.folder ? [d.folder.file.toLowerCase()] : [])));
        const patch = new Map<string, Partial<SavedDiagram>>();
        let saved = 0;
        let renamed = 0;
        for (const d of pending) {
          if (!d.folder) {
            const file = await freeFileName(folder, d, taken);
            await writeFolderFile(folder, file, d.text);
            patch.set(d.id, { folder: { file, hash: hashText(d.text), syncedAt: Date.now(), name: d.name } });
            task?.step((saved += 1), visible.length);
            continue;
          }
          // A rename writes the current text under the new name.
          const moved = await followName(folder, d, d.folder, d.text, taken);
          const link = moved ?? d.folder;
          if (moved && moved.file !== d.folder.file) renamed += 1;
          if (hashText(d.text) !== link.hash) {
            await writeFolderFile(folder, link.file, d.text);
            patch.set(d.id, { folder: { ...link, hash: hashText(d.text), syncedAt: Date.now() } });
          } else if (moved) {
            patch.set(d.id, { folder: moved });
          }
          if (visible.includes(d)) task?.step((saved += 1), visible.length);
        }
        apply(patch, [], []);
        task?.succeed(`Saved ${plural(saved, 'diagram')} to “${folder.name}”${renamed ? ` (${plural(renamed, 'file')} renamed)` : ''}.`);
      } catch (error) {
        const denied = (error as DOMException)?.name === 'NotAllowedError';
        const result = denied ? 'Permission to the folder was revoked. Reconnect it.' : `Could not write to the folder: ${message(error)}`;
        setFolderMessage(result);
        if (denied) setFolderState('needs-permission');
        task?.fail(result);
      } finally {
        folderBusy.current = false;
      }
    };
    const timer = window.setTimeout(() => void write(), FOLDER_WRITE_DELAY_MS);
    const onHide = () => {
      if (document.visibilityState === 'hidden') void write();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [library, folder, folderState, apply, track]);

  const removeFromFolder = useCallback(async (diagram: SavedDiagram) => {
    if (!folder || folderState !== 'connected' || !diagram.folder) return;
    const task = track('folder', `Deleting ${diagram.folder.file} from “${folder.name}”…`);
    try {
      await removeFolderFile(folder, diagram.folder.file);
      task.succeed(`Deleted ${diagram.folder.file} from “${folder.name}”.`);
    } catch (error) {
      const result = `Could not delete ${diagram.folder.file}: ${message(error)}`;
      setFolderMessage(result);
      task.fail(result);
    }
  }, [folder, folderState, track]);

  // ------------------------------------------------------------------ github --
  const [github, setGithub] = useState<GitHubSettings>(DEFAULT_GITHUB);
  const [githubState, setGithubState] = useState<GitHubState>('unconfigured');
  const [githubMessage, setGithubMessage] = useState('');

  const client = useCallback(() => new GitHubClient(github), [github]);

  const saveGitHub = useCallback((next: GitHubSettings) => {
    const moved = next.repo.trim() !== github.repo.trim() || next.branch.trim() !== github.branch.trim() || next.dir.trim() !== github.dir.trim();
    storeGitHubSettings(next);
    setGithub(next);
    setGithubState(githubConfigured(next) ? 'ready' : 'unconfigured');
    if (moved) updateLibrary((current) => current.map((d) => (d.github ? { ...d, github: undefined } : d)));
    setGithubMessage(githubConfigured(next) ? 'Settings saved. Use Test, then Pull to load diagrams from the repository.' : 'Settings saved. Repository, branch and token are required.');
  }, [github, updateLibrary]);

  const runGitHub = useCallback(async (title: string, work: (api: GitHubClient, task: Tracker) => Promise<string>) => {
    if (!githubConfigured(github)) {
      setGithubMessage('Set the repository, branch and token first.');
      return;
    }
    setGithubState('busy');
    const task = track('github', title);
    try {
      const result = await work(new GitHubClient(github), task);
      setGithubMessage(result);
      task.succeed(result);
    } catch (error) {
      setGithubMessage(message(error));
      task.fail(message(error));
    } finally {
      setGithubState('ready');
    }
  }, [github, track]);

  const testGitHub = useCallback(() => runGitHub(`Connecting to ${github.repo.trim()}…`, async (api) => {
    const repo = await api.test();
    return `Connected to ${repo.fullName} (${repo.private ? 'private' : 'public'}, branch ${github.branch.trim()}).${repo.canPush ? '' : ' Warning: this token cannot push.'}`;
  }), [runGitHub, github.repo, github.branch]);

  const pullGitHub = useCallback(() => runGitHub(`Pulling from ${github.repo.trim()}…`, async (api, task) => {
    const remote = await api.list();
    const byPath = new Map(remote.map((f) => [f.path.toLowerCase(), f]));
    // Files to download: new ones, and linked ones whose blob changed.
    const linked = new Map(libraryRef.current.flatMap((d) => (d.github ? [[d.github.path.toLowerCase(), d.github.sha] as const] : [])));
    const total = remote.filter((f) => linked.get(f.path.toLowerCase()) !== f.sha).length;
    let read = 0;
    if (total) task.step(0, total);
    const now = Date.now();
    const patch = new Map<string, Partial<SavedDiagram>>();
    const imports: SavedDiagram[] = [];
    const replaced: string[] = [];
    let unchanged = 0;
    let conflicts = 0;
    let unlinked = 0;

    for (const d of libraryRef.current) {
      if (!d.github) continue;
      const file = byPath.get(d.github.path.toLowerCase());
      byPath.delete(d.github.path.toLowerCase());
      if (!file) {
        patch.set(d.id, { github: undefined }); // deleted on GitHub: keep it locally, unlinked
        unlinked += 1;
        continue;
      }
      if (file.sha === d.github.sha) {
        unchanged += 1;
        continue;
      }
      const { text, sha } = await api.read(file.path);
      task.step((read += 1), total);
      const remoteHash = hashText(text);
      const localHash = hashText(d.text);
      if (remoteHash === localHash) {
        patch.set(d.id, { github: { ...d.github, path: file.path, sha, hash: remoteHash, syncedAt: now } });
      } else if (localHash === d.github.hash) {
        patch.set(d.id, { text, type: typeOf(text) ?? d.type, updatedAt: now, github: { ...d.github, path: file.path, sha, hash: remoteHash, syncedAt: now } });
        replaced.push(d.id);
      } else {
        // Changed on both sides: keep GitHub's version as a copy; committing ours will overwrite the file.
        imports.push(createDiagram(`${nameFromFile(text, file.name)} (GitHub copy)`, text));
        patch.set(d.id, { github: { ...d.github, sha } });
        conflicts += 1;
      }
    }

    let skipped = 0;
    for (const file of byPath.values()) {
      const { text, sha } = await api.read(file.path);
      task.step((read += 1), total);
      if (!isIr(text)) {
        skipped += 1;
        continue;
      }
      const entry = createDiagram(nameFromFile(text, file.name), text);
      imports.push({ ...entry, github: { path: file.path, sha, hash: hashText(text), syncedAt: now, name: entry.name } });
    }
    apply(patch, imports, replaced);

    const added = imports.filter((d) => d.github).length;
    const parts = [
      `${plural(remote.length, 'file')} in ${github.repo.trim()}/${github.dir.trim() || '(root)'}`,
      added ? `${added} added to My diagrams` : '',
      replaced.length ? `${replaced.length} updated from GitHub` : '',
      unchanged ? `${unchanged} unchanged` : '',
      conflicts ? `${plural(conflicts, 'conflict')} (GitHub's version was kept as a “GitHub copy”)` : '',
      unlinked ? `${unlinked} deleted on GitHub (kept here, unlinked)` : '',
      skipped ? `${skipped} non-diagram JSON ignored` : '',
    ].filter(Boolean);
    return `Pulled: ${parts.join(' · ')}.`;
  }), [runGitHub, apply, github.repo, github.dir]);

  const commit = useCallback((ids: string[] | 'changed') => runGitHub(`Committing to ${github.repo.trim()}…`, async (api, task) => {
    const pending = (d: SavedDiagram) => !d.github || hashText(d.text) !== d.github.hash || fileNameState(d.github, d) === 'rename';
    const targets = libraryRef.current.filter((d) => (ids === 'changed' ? pending(d) : ids.includes(d.id)));
    if (!targets.length) return 'Nothing to commit: every diagram matches GitHub.';
    task.step(0, targets.length);
    const remote = await api.list();
    const taken = new Set(remote.map((f) => f.name.toLowerCase()));
    const patch = new Map<string, Partial<SavedDiagram>>();
    const notes: string[] = [];
    let committed = 0;
    let last = '';
    try {
      for (const [index, d] of targets.entries()) {
        if (index) task.step(index, targets.length);
        const state = d.github ? fileNameState(d.github, d) : 'ok';
        if (d.github && state === 'rename') {
          // Renamed: add the file under the new name, then delete the old one.
          const old = d.github;
          taken.delete((old.path.split('/').pop() ?? '').toLowerCase());
          const file = fileNameFor(d, taken);
          taken.add(file.toLowerCase());
          const path = api.pathFor(file);
          const commitMessage = `vc-archify: rename ${old.name ?? old.path.split('/').pop()} to ${d.name}`;
          const result = await api.write(path, d.text, commitMessage);
          patch.set(d.id, { github: { path, sha: result.sha, hash: hashText(d.text), syncedAt: Date.now(), name: d.name } });
          committed += 1;
          last = result.commit.slice(0, 7);
          try {
            await api.remove(old.path, old.sha, commitMessage);
            notes.push(`renamed ${old.path} to ${path}`);
          } catch (error) {
            notes.push(`added ${path}, but ${old.path} could not be deleted: ${message(error)}`);
          }
          continue;
        }
        if (d.github && hashText(d.text) === d.github.hash) {
          if (state === 'stamp') patch.set(d.id, { github: { ...d.github, name: d.name } });
          continue;
        }
        let path = d.github?.path;
        if (!path) {
          const file = fileNameFor(d, taken);
          taken.add(file.toLowerCase());
          path = api.pathFor(file);
        }
        const result = await api.write(path, d.text, `vc-archify: ${d.github ? 'update' : 'add'} ${d.name}`, d.github?.sha);
        patch.set(d.id, { github: { path, sha: result.sha, hash: hashText(d.text), syncedAt: Date.now(), name: state === 'ok' && d.github?.name !== undefined ? d.github.name : d.name } });
        committed += 1;
        last = result.commit.slice(0, 7);
      }
    } finally {
      apply(patch, [], []);
    }
    const detail = notes.length ? ` ${notes.join('; ')}.` : '';
    return committed ? `Committed ${plural(committed, 'diagram')} to ${github.repo.trim()}@${github.branch.trim()}${last ? ` (latest ${last})` : ''}.${detail}` : 'Nothing to commit.';
  }), [runGitHub, apply, github.repo, github.branch]);

  const removeFromGitHub = useCallback((diagram: SavedDiagram) => runGitHub(`Deleting ${diagram.github?.path ?? diagram.name} from ${github.repo.trim()}…`, async (api) => {
    if (!diagram.github) return '';
    await api.remove(diagram.github.path, diagram.github.sha, `vc-archify: delete ${diagram.name}`);
    return `Deleted ${diagram.github.path} from ${github.repo.trim()}.`;
  }), [runGitHub, github.repo]);

  // ----------------------------------------------------------------- startup --
  useEffect(() => {
    const settings = loadGitHubSettings();
    setGithub(settings);
    setGithubState(githubConfigured(settings) ? 'ready' : 'unconfigured');
    if (!folderSupported()) {
      setFolderState('unsupported');
      return undefined;
    }
    let cancelled = false;
    void rememberedFolder().then(async (handle) => {
      if (cancelled || !handle) return;
      setFolder(handle);
      if ((await folderPermission(handle)) === 'granted') await syncFolder(handle);
      else setFolderState('needs-permission');
    });
    return () => {
      cancelled = true;
    };
    // Runs once on mount.
  }, []);

  return {
    folder: {
      supported: folderState !== 'unsupported',
      state: folderState,
      name: folder?.name ?? '',
      message: folderMessage,
      connect: connectFolder,
      reconnect: reconnectFolder,
      disconnect: disconnectFolder,
      sync: () => (folder ? syncFolder(folder) : Promise.resolve()),
      remove: removeFromFolder,
      progress: progress.folder,
    },
    github: {
      settings: github,
      state: githubState,
      configured: githubConfigured(github),
      message: githubMessage,
      save: saveGitHub,
      test: testGitHub,
      pull: pullGitHub,
      commit,
      remove: removeFromGitHub,
      client,
      progress: progress.github,
    },
  };
}

export type DiagramSync = ReturnType<typeof useDiagramSync>;
