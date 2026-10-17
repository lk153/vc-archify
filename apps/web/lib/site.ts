// Site-wide constants. The public URL can be overridden per environment.
export const SITE_NAME = 'vc-archify';
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://vc-archify.vercel.app').replace(/\/$/, '');
export const REPO_OWNER = 'lk153';
export const REPO_NAME = 'vc-archify';
export const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
export const UPSTREAM_URL = 'https://github.com/tt-a1i/archify';
export const UPSTREAM_ORIGIN_URL = 'https://github.com/Cocoon-AI/architecture-diagram-generator';
export const TAGLINE = 'Describe it in plain words. Get a map you can trust.';
export const DESCRIPTION =
  'vc-archify is an MIT-licensed agent skill that turns plain-language descriptions or code into validated, ' +
  'self-contained interactive HTML diagrams with dark/light themes and in-browser export.';
