// Site-wide constants. The public URL can be overridden per environment.
export const SITE_NAME = 'vc-archify';
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://vc-archify.vercel.app').replace(/\/$/, '');
export const REPO_URL = 'https://github.com/lk153/vc-archify';
export const UPSTREAM_URL = 'https://github.com/tt-a1i/archify';
export const DESCRIPTION =
  'Write diagram IR as JSON and render validated, interactive technical architecture diagrams in your browser, ' +
  'then download them as self-contained HTML.';
