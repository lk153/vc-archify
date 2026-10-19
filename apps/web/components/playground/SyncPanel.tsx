'use client';

import { useEffect, useId, useState } from 'react';
import { hashText, type SavedDiagram } from './library';
import type { DiagramSync } from './sync/useDiagramSync';
import type { GitHubSettings } from './sync/github';
import styles from './Playground.module.css';

interface Props {
  sync: DiagramSync;
  current?: SavedDiagram;
  disabled: boolean;
}

/** Sync status of one diagram, shown next to its name. */
export function syncBadges(sync: DiagramSync, d: SavedDiagram): string[] {
  const badges: string[] = [];
  if (sync.folder.state === 'connected' || sync.folder.state === 'busy') {
    badges.push(d.folder && hashText(d.text) === d.folder.hash ? 'Folder ✓' : 'Folder: saving…');
  }
  if (sync.github.configured) {
    badges.push(!d.github ? 'GitHub: not committed' : hashText(d.text) === d.github.hash ? 'GitHub ✓' : 'GitHub: uncommitted changes');
  }
  return badges;
}

export function SyncPanel({ sync, current, disabled }: Props) {
  const ids = useId();
  const { folder, github } = sync;
  const [form, setForm] = useState<GitHubSettings>(github.settings);
  useEffect(() => setForm(github.settings), [github.settings]);
  const set = (patch: Partial<GitHubSettings>) => setForm((f) => ({ ...f, ...patch }));
  const busy = github.state === 'busy';

  const summary = [
    folder.state === 'connected' || folder.state === 'busy' ? `Folder: ${folder.name}` : folder.state === 'needs-permission' ? 'Folder: reconnect' : '',
    github.configured ? `GitHub: ${github.settings.repo}` : '',
  ].filter(Boolean).join(' · ') || 'Off';

  return (
    <details className={styles.sync} data-testid="pg-sync">
      <summary>
        <span>Sync</span>
        <span className={styles.syncSummary}>{summary}</span>
      </summary>

      <section className={styles.syncSection} aria-labelledby={`${ids}-folder`}>
        <h3 id={`${ids}-folder`}>Folder on this computer</h3>
        {folder.state === 'unsupported' ? (
          <p className={styles.libraryHint}>Folder sync needs a Chromium browser with the File System Access API.</p>
        ) : folder.state === 'disconnected' ? (
          <>
            <p className={styles.libraryHint}>
              Every diagram in My diagrams is written to the folder as a <code>.json</code> file and kept up to date as you edit. JSON
              diagrams added to the folder show up here on the next sync.
            </p>
            <div className={styles.row}>
              <button type="button" className={`button ${styles.small}`} onClick={() => void folder.connect()} disabled={disabled} data-testid="pg-folder-connect">
                Connect folder…
              </button>
            </div>
          </>
        ) : folder.state === 'needs-permission' ? (
          <div className={styles.row}>
            <button type="button" className={`button ${styles.small}`} onClick={() => void folder.reconnect()} data-testid="pg-folder-reconnect">
              Reconnect “{folder.name}”
            </button>
            <button type="button" className={`button ${styles.tiny}`} onClick={() => void folder.disconnect()}>
              Forget
            </button>
          </div>
        ) : (
          <div className={styles.row}>
            <span className={styles.syncTarget} data-testid="pg-folder-name">📁 {folder.name}</span>
            <button type="button" className={`button ${styles.tiny}`} onClick={() => void folder.sync()} disabled={folder.state === 'busy'} data-testid="pg-folder-sync">
              {folder.state === 'busy' ? 'Syncing…' : 'Sync now'}
            </button>
            <button type="button" className={`button ${styles.tiny}`} onClick={() => void folder.disconnect()} data-testid="pg-folder-disconnect">
              Disconnect
            </button>
          </div>
        )}
        {folder.message && <p className={styles.syncMessage} role="status" data-testid="pg-folder-message">{folder.message}</p>}
      </section>

      <section className={styles.syncSection} aria-labelledby={`${ids}-github`}>
        <h3 id={`${ids}-github`}>GitHub repository</h3>
        <form
          className={styles.syncForm}
          onSubmit={(event) => {
            event.preventDefault();
            github.save({ ...form, repo: form.repo.trim(), branch: form.branch.trim() || 'main', dir: form.dir.trim(), token: form.token.trim() });
          }}
        >
          <label>
            <span>Repository</span>
            <input value={form.repo} onChange={(e) => set({ repo: e.target.value })} placeholder="owner/name" autoComplete="off" spellCheck={false} data-testid="pg-gh-repo" />
          </label>
          <div className={styles.syncFormRow}>
            <label>
              <span>Branch</span>
              <input value={form.branch} onChange={(e) => set({ branch: e.target.value })} placeholder="main" autoComplete="off" spellCheck={false} data-testid="pg-gh-branch" />
            </label>
            <label>
              <span>Folder in repo</span>
              <input value={form.dir} onChange={(e) => set({ dir: e.target.value })} placeholder="diagrams" autoComplete="off" spellCheck={false} data-testid="pg-gh-dir" />
            </label>
          </div>
          <label>
            <span>Token</span>
            <input type="password" value={form.token} onChange={(e) => set({ token: e.target.value })} placeholder="github_pat_…" autoComplete="off" spellCheck={false} data-testid="pg-gh-token" />
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={form.remember} onChange={(e) => set({ remember: e.target.checked })} />
            Remember the token on this device
          </label>
          <p className={styles.libraryHint}>
            Use a fine-grained personal access token for this one repository with <strong>Contents: Read and write</strong>. It is sent
            only to api.github.com; without “Remember”, it is forgotten when this tab closes.
          </p>
          <div className={styles.row}>
            <button type="submit" className={`button ${styles.tiny}`} data-testid="pg-gh-save">
              Save settings
            </button>
            <button type="button" className={`button ${styles.tiny}`} onClick={() => void github.test()} disabled={!github.configured || busy} data-testid="pg-gh-test">
              Test
            </button>
          </div>
        </form>
        {github.configured && (
          <div className={styles.row}>
            <button type="button" className={`button ${styles.tiny}`} onClick={() => void github.pull()} disabled={busy || disabled} data-testid="pg-gh-pull">
              Pull
            </button>
            <button
              type="button"
              className={`button ${styles.tiny}`}
              onClick={() => current && void github.commit([current.id])}
              disabled={busy || disabled || !current}
              title={current ? `Commit “${current.name}”` : 'Open one of My diagrams to commit it'}
              data-testid="pg-gh-commit"
            >
              Commit this diagram
            </button>
            <button type="button" className={`button ${styles.tiny}`} onClick={() => void github.commit('changed')} disabled={busy || disabled} data-testid="pg-gh-commit-all">
              Commit all changes
            </button>
          </div>
        )}
        {github.message && <p className={styles.syncMessage} role="status" data-testid="pg-gh-message">{busy ? 'Working…' : github.message}</p>}
      </section>
    </details>
  );
}
