'use client';

// Sync "My diagrams" (browser storage) with two optional targets:
//
// * Folder on disk (File System Access API): two-way. Every change is written
//   to the folder as you edit; "Sync now" (and connecting / reloading) also
//   reads the folder, so files added or edited there (by an agent, git pull, a
//   sync client) appear in My diagrams.
// * GitHub repository: explicit. "Pull" reads the repository folder, "Commit"
//   writes the current diagram (or every changed one) as one commit each.
//
// Conflicts never drop data: when a diagram changed on both sides, the other
// side's version is kept as a separate "(folder copy)" / "(GitHub copy)" diagram.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createDiagram, fileNameFor, hashText, nameFromFile, typeOf, type SavedDiagram } from '../library';
import {
  folderPermission, folderSupported, listJsonFiles, pickFolder, rememberFolder, rememberedFolder, removeFolderFile, writeFolderFile,
} from './folder';
import {
  DEFAULT_GITHUB, GitHubClient, githubConfigured, loadGitHubSettings, storeGitHubSettings, type GitHubSettings,
} from './github';

type UpdateLibrary = (update: (current: SavedDiagram[]) => SavedDiagram[]) => void;

export type FolderState = 'unsupported' | 'disconnected' | 'needs-permission' | 'connected' | 'busy';
export type GitHubState = 'unconfigured' | 'ready' | 'busy';

interface Options {
  library: SavedDiagram[];
  updateLibrary: UpdateLibrary;
  /** Called with the ids whose text was replaced from the folder or GitHub. */
  onExternalChange: (ids: string[], library: SavedDiagram[]) => void;
}

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

export function useDiagramSync({ library, updateLibrary, onExternalChange }: Options) {
  const libraryRef = useRef(library);
  libraryRef.current = library;
  const externalRef = useRef(onExternalChange);
  externalRef.current = onExternalChange;

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
    try {
      const files = await listJsonFiles(handle);
      const unmatched = new Map(files.map((f) => [f.name.toLowerCase(), f]));
      const taken = new Set(files.map((f) => f.name.toLowerCase()));
      const now = Date.now();
      const patch = new Map<string, Partial<SavedDiagram>>();
      const imports: SavedDiagram[] = [];
      const writes: { id: string; file: string; text: string }[] = [];
      const replaced: string[] = [];
      let conflicts = 0;

      for (const d of libraryRef.current) {
        if (!d.folder) {
          const file = fileNameFor(d, taken);
          taken.add(file.toLowerCase());
          writes.push({ id: d.id, file, text: d.text });
          continue;
        }
        const key = d.folder.file.toLowerCase();
        const onDisk = unmatched.get(key);
        unmatched.delete(key);
        const localHash = hashText(d.text);
        const localChanged = localHash !== d.folder.hash;
        if (!onDisk) {
          writes.push({ id: d.id, file: d.folder.file, text: d.text }); // recreate a removed file
          continue;
        }
        const diskHash = hashText(onDisk.text);
        const diskChanged = diskHash !== d.folder.hash;
        if (diskHash === localHash) {
          if (diskChanged) patch.set(d.id, { folder: { file: d.folder.file, hash: diskHash, syncedAt: now } });
        } else if (diskChanged && !localChanged) {
          patch.set(d.id, { text: onDisk.text, type: typeOf(onDisk.text) ?? d.type, updatedAt: now, folder: { file: d.folder.file, hash: diskHash, syncedAt: now } });
          replaced.push(d.id);
        } else if (localChanged && !diskChanged) {
          writes.push({ id: d.id, file: d.folder.file, text: d.text });
        } else {
          // Changed on both sides: keep the folder's version as a copy, then write ours.
          imports.push(createDiagram(`${nameFromFile(onDisk.text, onDisk.name)} (folder copy)`, onDisk.text));
          writes.push({ id: d.id, file: d.folder.file, text: d.text });
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
        imports.push({ ...entry, updatedAt: f.lastModified || now, folder: { file: f.name, hash: hashText(f.text), syncedAt: now } });
      }

      for (const w of writes) {
        await writeFolderFile(handle, w.file, w.text);
        patch.set(w.id, { ...(patch.get(w.id) ?? {}), folder: { file: w.file, hash: hashText(w.text), syncedAt: now } });
      }
      apply(patch, imports, replaced);

      const added = imports.filter((d) => d.folder).length;
      const parts = [
        `${plural(files.length, 'file')} in “${handle.name}”`,
        added ? `${added} added to My diagrams` : '',
        replaced.length ? `${replaced.length} updated from the folder` : '',
        writes.length ? `${plural(writes.length, 'file')} written` : '',
        conflicts ? `${plural(conflicts, 'conflict')} (the folder version was kept as a “folder copy”)` : '',
        skipped ? `${skipped} non-diagram JSON ignored` : '',
      ].filter(Boolean);
      setFolderMessage(`Synced: ${parts.join(' · ')}.`);
      setFolderState('connected');
    } catch (error) {
      const denied = (error as DOMException)?.name === 'NotAllowedError';
      setFolderMessage(denied ? 'Permission to the folder was revoked. Reconnect it.' : `Folder sync failed: ${message(error)}`);
      setFolderState(denied ? 'needs-permission' : 'connected');
    } finally {
      folderBusy.current = false;
    }
  }, [apply]);

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

  // Write changes through to the folder as you edit.
  useEffect(() => {
    if (folderState !== 'connected' || !folder) return undefined;
    const pending = library.filter((d) => !d.folder || hashText(d.text) !== d.folder.hash);
    if (!pending.length) return undefined;
    const timer = window.setTimeout(async () => {
      if (folderBusy.current) return;
      folderBusy.current = true;
      try {
        const taken = new Set(libraryRef.current.flatMap((d) => (d.folder ? [d.folder.file.toLowerCase()] : [])));
        const patch = new Map<string, Partial<SavedDiagram>>();
        for (const d of pending) {
          let file = d.folder?.file;
          if (!file) {
            file = fileNameFor(d, taken);
            while (await existsInFolder(folder, file)) {
              taken.add(file.toLowerCase());
              file = fileNameFor(d, taken);
            }
          }
          taken.add(file.toLowerCase());
          await writeFolderFile(folder, file, d.text);
          patch.set(d.id, { folder: { file, hash: hashText(d.text), syncedAt: Date.now() } });
        }
        apply(patch, [], []);
      } catch (error) {
        const denied = (error as DOMException)?.name === 'NotAllowedError';
        setFolderMessage(denied ? 'Permission to the folder was revoked. Reconnect it.' : `Could not write to the folder: ${message(error)}`);
        if (denied) setFolderState('needs-permission');
      } finally {
        folderBusy.current = false;
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [library, folder, folderState, apply]);

  const removeFromFolder = useCallback(async (diagram: SavedDiagram) => {
    if (!folder || folderState !== 'connected' || !diagram.folder) return;
    try {
      await removeFolderFile(folder, diagram.folder.file);
    } catch (error) {
      setFolderMessage(`Could not delete ${diagram.folder.file}: ${message(error)}`);
    }
  }, [folder, folderState]);

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

  const runGitHub = useCallback(async (work: (api: GitHubClient) => Promise<string>) => {
    if (!githubConfigured(github)) {
      setGithubMessage('Set the repository, branch and token first.');
      return;
    }
    setGithubState('busy');
    try {
      setGithubMessage(await work(new GitHubClient(github)));
    } catch (error) {
      setGithubMessage(message(error));
    } finally {
      setGithubState('ready');
    }
  }, [github]);

  const testGitHub = useCallback(() => runGitHub(async (api) => {
    const repo = await api.test();
    return `Connected to ${repo.fullName} (${repo.private ? 'private' : 'public'}, branch ${github.branch.trim()}).${repo.canPush ? '' : ' Warning: this token cannot push.'}`;
  }), [runGitHub, github.branch]);

  const pullGitHub = useCallback(() => runGitHub(async (api) => {
    const remote = await api.list();
    const byPath = new Map(remote.map((f) => [f.path.toLowerCase(), f]));
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
      const remoteHash = hashText(text);
      const localHash = hashText(d.text);
      if (remoteHash === localHash) {
        patch.set(d.id, { github: { path: file.path, sha, hash: remoteHash, syncedAt: now } });
      } else if (localHash === d.github.hash) {
        patch.set(d.id, { text, type: typeOf(text) ?? d.type, updatedAt: now, github: { path: file.path, sha, hash: remoteHash, syncedAt: now } });
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
      if (!isIr(text)) {
        skipped += 1;
        continue;
      }
      imports.push({ ...createDiagram(nameFromFile(text, file.name), text), github: { path: file.path, sha, hash: hashText(text), syncedAt: now } });
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

  const commit = useCallback((ids: string[] | 'changed') => runGitHub(async (api) => {
    const targets = libraryRef.current.filter((d) => (ids === 'changed'
      ? !d.github || hashText(d.text) !== d.github.hash
      : ids.includes(d.id)));
    if (!targets.length) return 'Nothing to commit: every diagram matches GitHub.';
    const remote = await api.list();
    const taken = new Set(remote.map((f) => f.name.toLowerCase()));
    const patch = new Map<string, Partial<SavedDiagram>>();
    let commits = 0;
    let last = '';
    try {
      for (const d of targets) {
        if (d.github && hashText(d.text) === d.github.hash) continue;
        let path = d.github?.path;
        if (!path) {
          const file = fileNameFor(d, taken);
          taken.add(file.toLowerCase());
          path = api.pathFor(file);
        }
        const result = await api.write(path, d.text, `vc-archify: ${d.github ? 'update' : 'add'} ${d.name}`, d.github?.sha);
        patch.set(d.id, { github: { path, sha: result.sha, hash: hashText(d.text), syncedAt: Date.now() } });
        commits += 1;
        last = result.commit.slice(0, 7);
      }
    } finally {
      apply(patch, [], []);
    }
    return commits ? `Committed ${plural(commits, 'diagram')} to ${github.repo.trim()}@${github.branch.trim()}${last ? ` (latest ${last})` : ''}.` : 'Nothing to commit.';
  }), [runGitHub, apply, github.repo, github.branch]);

  const removeFromGitHub = useCallback((diagram: SavedDiagram) => runGitHub(async (api) => {
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
    },
  };
}

export type DiagramSync = ReturnType<typeof useDiagramSync>;
