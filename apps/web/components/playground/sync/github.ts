// GitHub sync through the REST "contents" API, called straight from the browser
// with a token the user provides (api.github.com allows CORS). Each diagram is
// one JSON file in a folder of the repository; every write is a commit.

export interface GitHubSettings {
  /** "owner/name" */
  repo: string;
  branch: string;
  /** Folder inside the repository, e.g. "diagrams" ("" = repository root). */
  dir: string;
  token: string;
  /** Keep the token in localStorage (this device) instead of sessionStorage (this tab). */
  remember: boolean;
}

export const DEFAULT_GITHUB: GitHubSettings = { repo: '', branch: 'main', dir: 'diagrams', token: '', remember: false };

const SETTINGS_KEY = 'vca-github-v1';
const TOKEN_KEY = 'vca-github-token';

export function loadGitHubSettings(): GitHubSettings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}') as Partial<GitHubSettings>;
    const token = saved.remember
      ? window.localStorage.getItem(TOKEN_KEY) ?? ''
      : window.sessionStorage.getItem(TOKEN_KEY) ?? '';
    return { ...DEFAULT_GITHUB, ...saved, token };
  } catch {
    return { ...DEFAULT_GITHUB };
  }
}

export function storeGitHubSettings(settings: GitHubSettings): void {
  try {
    const { token, ...rest } = settings;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
    window.localStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(TOKEN_KEY);
    if (token) (settings.remember ? window.localStorage : window.sessionStorage).setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable: settings last for this page only */
  }
}

export const githubConfigured = (s: GitHubSettings) => /^[\w.-]+\/[\w.-]+$/.test(s.repo.trim()) && Boolean(s.token.trim()) && Boolean(s.branch.trim());

export class GitHubError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'GitHubError';
  }
}

export interface RemoteFile {
  name: string;
  path: string;
  sha: string;
}

const encodePath = (path: string) => path.split('/').filter(Boolean).map(encodeURIComponent).join('/');

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(value: string): string {
  const binary = atob(value.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export class GitHubClient {
  constructor(private readonly settings: GitHubSettings) {}

  private get dir() {
    return this.settings.dir.trim().replace(/^\/+|\/+$/g, '');
  }

  pathFor(file: string) {
    return this.dir ? `${this.dir}/${file}` : file;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`https://api.github.com/repos/${this.settings.repo.trim()}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.settings.token.trim()}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    if (!response.ok) {
      let detail = '';
      try {
        detail = ((await response.json()) as { message?: string }).message ?? '';
      } catch {
        /* no JSON body */
      }
      const hint =
        response.status === 401 ? 'the token is invalid or expired'
          : response.status === 403 ? 'the token lacks permission (needs Contents: read and write) or the rate limit was hit'
            : response.status === 404 ? 'repository, branch or file not found, or the token cannot see this repository'
              : response.status === 409 || response.status === 422 ? 'the file changed on GitHub since your last pull; pull first'
                : 'GitHub request failed';
      throw new GitHubError(`GitHub ${response.status}: ${hint}${detail ? ` (${detail})` : ''}`, response.status);
    }
    return (response.status === 204 ? null : await response.json()) as T;
  }

  /** Checks the repository and branch exist and the token can push. */
  async test(): Promise<{ fullName: string; private: boolean; canPush: boolean }> {
    const repo = await this.request<{ full_name: string; private: boolean; permissions?: { push?: boolean } }>('GET', '');
    await this.request('GET', `/branches/${encodeURIComponent(this.settings.branch.trim())}`);
    return { fullName: repo.full_name, private: repo.private, canPush: Boolean(repo.permissions?.push) };
  }

  /** *.json files directly in the configured folder ([] when the folder does not exist yet). */
  async list(): Promise<RemoteFile[]> {
    try {
      const entries = await this.request<{ type: string; name: string; path: string; sha: string }[] | { type: string }>(
        'GET', `/contents/${encodePath(this.dir)}?ref=${encodeURIComponent(this.settings.branch.trim())}`,
      );
      if (!Array.isArray(entries)) return [];
      return entries
        .filter((e) => e.type === 'file' && /\.json$/i.test(e.name))
        .map((e) => ({ name: e.name, path: e.path, sha: e.sha }));
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return [];
      throw error;
    }
  }

  async read(path: string): Promise<{ text: string; sha: string }> {
    const file = await this.request<{ content: string; encoding: string; sha: string }>(
      'GET', `/contents/${encodePath(path)}?ref=${encodeURIComponent(this.settings.branch.trim())}`,
    );
    return { text: fromBase64(file.content), sha: file.sha };
  }

  /** Create or update a file (one commit). Pass the current blob SHA when updating. */
  async write(path: string, text: string, message: string, sha?: string): Promise<{ sha: string; commit: string }> {
    const result = await this.request<{ content: { sha: string }; commit: { sha: string } }>('PUT', `/contents/${encodePath(path)}`, {
      message,
      content: toBase64(text),
      branch: this.settings.branch.trim(),
      ...(sha ? { sha } : {}),
    });
    return { sha: result.content.sha, commit: result.commit.sha };
  }

  async remove(path: string, sha: string, message: string): Promise<void> {
    await this.request('DELETE', `/contents/${encodePath(path)}`, { message, sha, branch: this.settings.branch.trim() });
  }
}
