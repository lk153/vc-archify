// `node:url` for the browser engine. The build rewrites every module URL read
// to a virtual file: URL (file:///vc-archify/...), so fileURLToPath only has
// to handle file: URLs.
import { resolve } from './path.js';

export function fileURLToPath(input) {
  const url = typeof input === 'string' ? new URL(input) : input;
  if (!url || url.protocol !== 'file:') {
    const error = new TypeError(`The URL must be of scheme file (received ${url?.href ?? String(input)})`);
    error.code = 'ERR_INVALID_URL_SCHEME';
    throw error;
  }
  if (url.hostname !== '') {
    const error = new TypeError('File URL host must be "localhost" or empty');
    error.code = 'ERR_INVALID_FILE_URL_HOST';
    throw error;
  }
  return decodeURIComponent(url.pathname);
}

export function pathToFileURL(input) {
  const absolute = resolve(input);
  const encoded = absolute.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  return new URL(`file://${encoded}${input.endsWith('/') && !encoded.endsWith('/') ? '/' : ''}`);
}

const URLClass = globalThis.URL;
const URLSearchParamsClass = globalThis.URLSearchParams;

export { URLClass as URL, URLSearchParamsClass as URLSearchParams };
export default { fileURLToPath, pathToFileURL, URL: URLClass, URLSearchParams: URLSearchParamsClass };
