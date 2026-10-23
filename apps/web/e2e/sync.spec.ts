import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page, type Route } from '@playwright/test';

// Sync for "My diagrams": a folder on disk (File System Access API, replaced
// here by an in-memory directory) and a GitHub repository (api.github.com,
// replaced here by an in-memory repository behind page.route).

const EXAMPLES = fileURLToPath(new URL('../../../examples/', import.meta.url));
const exampleText = (file: string) => fs.readFileSync(path.join(EXAMPLES, file), 'utf8');
const withTitle = (file: string, title: string) => {
  const ir = JSON.parse(exampleText(file));
  ir.meta.title = title;
  return `${JSON.stringify(ir, null, 2)}\n`;
};

const status = (page: Page) => page.getByTestId('pg-status');
const savedOptions = (page: Page) => page.getByTestId('pg-example').locator('optgroup[label="My diagrams"] option');

async function open(page: Page) {
  await page.goto('/');
  await expect(status(page)).toHaveAttribute('data-state', 'ok', { timeout: 30_000 });
  await page.getByTestId('pg-sync').locator('summary').click();
}

async function saveCurrentExample(page: Page, title: string) {
  const editor = page.getByTestId('pg-editor');
  const ir = JSON.parse(await editor.inputValue());
  ir.meta.title = title;
  await editor.fill(`${JSON.stringify(ir, null, 2)}\n`);
  await page.getByTestId('pg-save').click();
  await expect(page.getByTestId('pg-name')).toHaveValue(title);
}

// ---------------------------------------------------------------- folder --

/** An in-memory stand-in for window.showDirectoryPicker() and its handle. */
async function installMemoryFolder(page: Page, seed: Record<string, string>) {
  await page.addInitScript((initial: Record<string, string>) => {
    const files = new Map<string, { text: string; lastModified: number }>(
      Object.entries(initial).map(([name, text]) => [name, { text, lastModified: Date.now() - 60_000 }]),
    );
    (window as unknown as { __memFolder: typeof files }).__memFolder = files;
    const notFound = () => new DOMException('not found', 'NotFoundError');
    const fileHandle = (name: string) => ({
      kind: 'file',
      name,
      async getFile() {
        const f = files.get(name);
        if (!f) throw notFound();
        return { text: async () => f.text, lastModified: f.lastModified };
      },
      async createWritable() {
        let buffer = '';
        return {
          write: async (chunk: string) => {
            buffer += chunk;
          },
          close: async () => {
            files.set(name, { text: buffer, lastModified: Date.now() });
          },
        };
      },
    });
    const dir = {
      kind: 'directory',
      name: 'my-diagrams',
      async getFileHandle(name: string, options?: { create?: boolean }) {
        if (!files.has(name) && !options?.create) throw notFound();
        return fileHandle(name);
      },
      async removeEntry(name: string) {
        if (!files.delete(name)) throw notFound();
      },
      async *entries() {
        for (const name of [...files.keys()]) yield [name, fileHandle(name)];
      },
      async queryPermission() {
        return 'granted';
      },
      async requestPermission() {
        return 'granted';
      },
    };
    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = async () => dir;
  }, seed);
}

const folderFiles = (page: Page) =>
  page.evaluate(() => Object.fromEntries([...(window as unknown as { __memFolder: Map<string, { text: string }> }).__memFolder].map(([k, v]) => [k, v.text])));

test('folder sync: connect imports folder diagrams and writes yours, then keeps both sides in step', async ({ page }) => {
  await installMemoryFolder(page, {
    'payments-flow.workflow.json': withTitle('agent-tool-call.workflow.json', 'Payments flow (from folder)'),
    'package.json': '{"name": "not a diagram"}',
  });
  await open(page);
  await saveCurrentExample(page, 'My platform map');

  await page.getByTestId('pg-folder-connect').click();
  await expect(page.getByTestId('pg-folder-message')).toContainText('1 added to My diagrams');
  await expect(page.getByTestId('pg-folder-message')).toContainText('1 non-diagram JSON ignored');
  await expect(page.getByTestId('pg-folder-name')).toContainText('my-diagrams');
  await expect(savedOptions(page)).toHaveCount(2);
  await expect.poll(async () => Object.keys(await folderFiles(page)).sort()).toEqual(
    ['my-platform-map.architecture.json', 'package.json', 'payments-flow.workflow.json'],
  );

  // Edits are written through to the folder.
  const editor = page.getByTestId('pg-editor');
  const ir = JSON.parse(await editor.inputValue());
  ir.meta.title = 'My platform map v2';
  await editor.fill(`${JSON.stringify(ir, null, 2)}\n`);
  await expect.poll(async () => JSON.parse((await folderFiles(page))['my-platform-map.architecture.json']).meta.title, { timeout: 10_000 })
    .toBe('My platform map v2');
  await expect(page.getByTestId('pg-sync-badges')).toContainText('Folder ✓');

  // A change made in the folder (an agent, git pull…) comes back with "Sync now".
  await page.evaluate(() => {
    const files = (window as unknown as { __memFolder: Map<string, { text: string; lastModified: number }> }).__memFolder;
    const file = files.get('my-platform-map.architecture.json')!;
    const ir = JSON.parse(file.text);
    ir.meta.title = 'Edited on disk';
    files.set('my-platform-map.architecture.json', { text: `${JSON.stringify(ir, null, 2)}\n`, lastModified: Date.now() });
  });
  await page.getByTestId('pg-folder-sync').click();
  await expect(page.getByTestId('pg-folder-message')).toContainText('1 updated from the folder');
  await expect.poll(async () => JSON.parse(await editor.inputValue()).meta.title).toBe('Edited on disk');

  // Deleting a diagram also deletes its file. (Let the re-render settle first:
  // Chrome closes a confirm() when a preview frame commits a load under it.)
  await expect(page.getByTestId('pg-preview-next')).toHaveCount(0);
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByTestId('pg-delete').click();
  await expect.poll(async () => Object.keys(await folderFiles(page)).sort()).toEqual(['package.json', 'payments-flow.workflow.json']);
});

// ---------------------------------------------------------------- github --

interface RemoteFile {
  text: string;
  sha: string;
}

/** An in-memory repository answering the GitHub REST calls the app makes. */
function memoryRepo(page: Page, repo: string, seed: Record<string, string>) {
  const files = new Map<string, RemoteFile>();
  let counter = 0;
  const nextSha = () => `sha${(counter += 1).toString().padStart(4, '0')}`;
  for (const [p, text] of Object.entries(seed)) files.set(p, { text, sha: nextSha() });
  const auth: string[] = [];
  const commits: string[] = [];

  const handler = async (route: Route) => {
    const request = route.request();
    auth.push(request.headers().authorization ?? '');
    const url = new URL(request.url());
    const prefix = `/repos/${repo}`;
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (!url.pathname.startsWith(prefix)) return json(404, { message: 'Not Found' });
    const rest = decodeURIComponent(url.pathname.slice(prefix.length));
    if (rest === '' && request.method() === 'GET') return json(200, { full_name: repo, private: true, permissions: { push: true } });
    if (rest === '/branches/main') return json(200, { name: 'main' });
    if (!rest.startsWith('/contents/')) return json(404, { message: 'Not Found' });
    const target = rest.slice('/contents/'.length);
    if (request.method() === 'GET') {
      const file = files.get(target);
      if (file) return json(200, { type: 'file', path: target, sha: file.sha, encoding: 'base64', content: Buffer.from(file.text).toString('base64') });
      const listing = [...files.entries()]
        .filter(([p]) => p.startsWith(`${target}/`) && !p.slice(target.length + 1).includes('/'))
        .map(([p, f]) => ({ type: 'file', name: p.split('/').pop(), path: p, sha: f.sha }));
      return listing.length ? json(200, listing) : json(404, { message: 'Not Found' });
    }
    const body = request.postDataJSON() as { message: string; content?: string; sha?: string };
    const existing = files.get(target);
    if (request.method() === 'PUT') {
      if (existing && body.sha !== existing.sha) return json(409, { message: `${target} does not match ${body.sha}` });
      const sha = nextSha();
      files.set(target, { text: Buffer.from(body.content!, 'base64').toString('utf8'), sha });
      commits.push(body.message);
      return json(existing ? 200 : 201, { content: { path: target, sha }, commit: { sha: `c${sha}` } });
    }
    if (request.method() === 'DELETE') {
      if (!existing || body.sha !== existing.sha) return json(409, { message: 'sha mismatch' });
      files.delete(target);
      commits.push(body.message);
      return json(200, { commit: { sha: 'cdel' } });
    }
    return json(405, { message: 'Method not allowed' });
  };
  return { files, auth, commits, install: () => page.route('https://api.github.com/**', handler) };
}

async function configureGitHub(page: Page, repo: string) {
  await page.getByTestId('pg-gh-repo').fill(repo);
  await page.getByTestId('pg-gh-token').fill('github_pat_test');
  await page.getByTestId('pg-gh-save').click();
  await page.getByTestId('pg-gh-test').click();
  await expect(page.getByTestId('pg-gh-message')).toContainText(`Connected to ${repo} (private, branch main)`);
}

test('GitHub sync: pull, commit one, commit all changes, delete — with the token on every call', async ({ page }) => {
  const repo = memoryRepo(page, 'lk153/my-diagrams', {
    'diagrams/checkout.sequence.json': withTitle('cache-miss-request.sequence.json', 'Checkout sequence (from GitHub)'),
    'diagrams/README.json': '{"note": "not a diagram"}',
    'docs/other.json': withTitle('orders.erd.json', 'Outside the folder'),
  });
  await repo.install();
  await open(page);
  await configureGitHub(page, 'lk153/my-diagrams');

  await page.getByTestId('pg-gh-pull').click();
  await expect(page.getByTestId('pg-gh-message')).toContainText('1 added to My diagrams');
  await expect(savedOptions(page)).toHaveText(['Checkout sequence (from GitHub) · Sequence']);

  // Commit a new diagram.
  await page.getByTestId('pg-example').selectOption('web-app.architecture.json');
  await expect(status(page)).toHaveAttribute('data-state', 'ok', { timeout: 30_000 });
  await saveCurrentExample(page, 'Team web app');
  await expect(page.getByTestId('pg-sync-badges')).toContainText('GitHub: not committed');
  await page.getByTestId('pg-gh-commit').click();
  await expect(page.getByTestId('pg-gh-message')).toContainText('Committed 1 diagram to lk153/my-diagrams@main');
  expect(JSON.parse(repo.files.get('diagrams/team-web-app.architecture.json')!.text).meta.title).toBe('Team web app');
  await expect(page.getByTestId('pg-sync-badges')).toContainText('GitHub ✓');

  // Edit, then "Commit all changes" updates the same file (with its SHA).
  const editor = page.getByTestId('pg-editor');
  const ir = JSON.parse(await editor.inputValue());
  ir.meta.title = 'Team web app v2';
  await editor.fill(`${JSON.stringify(ir, null, 2)}\n`);
  await expect(page.getByTestId('pg-sync-badges')).toContainText('GitHub: uncommitted changes', { timeout: 5_000 });
  await page.getByTestId('pg-gh-commit-all').click();
  await expect(page.getByTestId('pg-gh-message')).toContainText('Committed 1 diagram');
  expect(JSON.parse(repo.files.get('diagrams/team-web-app.architecture.json')!.text).meta.title).toBe('Team web app v2');
  expect(repo.commits).toEqual(['vc-archify: add Team web app', 'vc-archify: update Team web app']);

  // Delete locally and on GitHub (after the re-render settles, see above).
  await expect(page.getByTestId('pg-preview-next')).toHaveCount(0);
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByTestId('pg-delete').click();
  await expect.poll(() => repo.files.has('diagrams/team-web-app.architecture.json')).toBe(false);
  expect(repo.commits.at(-1)).toBe('vc-archify: delete Team web app');

  expect(repo.auth.every((h) => h === 'Bearer github_pat_test')).toBe(true);
});

test('GitHub sync: a diagram changed on both sides keeps both versions', async ({ page }) => {
  const repo = memoryRepo(page, 'lk153/my-diagrams', {
    'diagrams/flow.workflow.json': withTitle('release-delivery.workflow.json', 'Release flow'),
  });
  await repo.install();
  await open(page);
  await configureGitHub(page, 'lk153/my-diagrams');
  await page.getByTestId('pg-gh-pull').click();
  await expect(page.getByTestId('pg-gh-message')).toContainText('1 added to My diagrams');
  await page.getByTestId('pg-example').selectOption({ label: 'Release flow · Workflow' });
  await expect(page.getByTestId('pg-name')).toHaveValue('Release flow');

  // Local edit…
  const editor = page.getByTestId('pg-editor');
  const ir = JSON.parse(await editor.inputValue());
  ir.meta.title = 'Release flow (local edit)';
  await editor.fill(`${JSON.stringify(ir, null, 2)}\n`);
  await page.waitForTimeout(600);
  // …and a different change on GitHub.
  repo.files.set('diagrams/flow.workflow.json', { text: withTitle('release-delivery.workflow.json', 'Release flow (remote edit)'), sha: 'shaRemote' });

  await page.getByTestId('pg-gh-pull').click();
  await expect(page.getByTestId('pg-gh-message')).toContainText('1 conflict');
  await expect(savedOptions(page)).toHaveCount(2);
  await expect(page.getByTestId('pg-example')).toContainText('Release flow (remote edit) (GitHub copy)');
  expect(JSON.parse(await editor.inputValue()).meta.title).toBe('Release flow (local edit)');

  // Committing ours now overwrites GitHub (the remote version lives on as the copy).
  await page.getByTestId('pg-gh-commit').click();
  await expect(page.getByTestId('pg-gh-message')).toContainText('Committed 1 diagram');
  expect(JSON.parse(repo.files.get('diagrams/flow.workflow.json')!.text).meta.title).toBe('Release flow (local edit)');
});

test('GitHub sync: a bad token is explained', async ({ page }) => {
  await page.route('https://api.github.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Bad credentials"}' }));
  await open(page);
  await page.getByTestId('pg-gh-repo').fill('lk153/my-diagrams');
  await page.getByTestId('pg-gh-token').fill('wrong');
  await page.getByTestId('pg-gh-save').click();
  await page.getByTestId('pg-gh-test').click();
  await expect(page.getByTestId('pg-gh-message')).toContainText('GitHub 401: the token is invalid or expired (Bad credentials)');
});
