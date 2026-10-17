// POSIX `node:path` for the browser engine, following Node's algorithms
// (lib/path.js) so resolved virtual paths match what the CLI would compute.
// `path.win32` is only consulted when process.platform === 'win32', which the
// browser shim never reports, so it fails loudly instead of guessing.
import { unavailable } from './env.js';
import { process } from './process.js';

function assertPath(value, name = 'path') {
  if (typeof value !== 'string') {
    const error = new TypeError(`The "${name}" argument must be of type string. Received ${typeof value}`);
    error.code = 'ERR_INVALID_ARG_TYPE';
    throw error;
  }
}

function normalizeString(input, allowAboveRoot) {
  let res = '';
  let lastSegmentLength = 0;
  let lastSlash = -1;
  let dots = 0;
  let char = '';
  for (let i = 0; i <= input.length; i += 1) {
    if (i < input.length) char = input[i];
    else if (char === '/') break;
    else char = '/';
    if (char === '/') {
      if (lastSlash === i - 1 || dots === 1) {
        // empty segment or "."
      } else if (dots === 2) {
        if (res.length < 2 || lastSegmentLength !== 2 || !res.endsWith('..')) {
          if (res.length > 2) {
            const lastSlashIndex = res.lastIndexOf('/');
            if (lastSlashIndex === -1) {
              res = '';
              lastSegmentLength = 0;
            } else {
              res = res.slice(0, lastSlashIndex);
              lastSegmentLength = res.length - 1 - res.lastIndexOf('/');
            }
            lastSlash = i;
            dots = 0;
            continue;
          } else if (res.length !== 0) {
            res = '';
            lastSegmentLength = 0;
            lastSlash = i;
            dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          res += res.length > 0 ? '/..' : '..';
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0) res += `/${input.slice(lastSlash + 1, i)}`;
        else res = input.slice(lastSlash + 1, i);
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i;
      dots = 0;
    } else if (char === '.' && dots !== -1) {
      dots += 1;
    } else {
      dots = -1;
    }
  }
  return res;
}

export function resolve(...args) {
  let resolvedPath = '';
  let resolvedAbsolute = false;
  for (let i = args.length - 1; i >= -1 && !resolvedAbsolute; i -= 1) {
    const segment = i >= 0 ? args[i] : process.cwd();
    assertPath(segment, `paths[${i}]`);
    if (segment.length === 0) continue;
    resolvedPath = `${segment}/${resolvedPath}`;
    resolvedAbsolute = segment[0] === '/';
  }
  resolvedPath = normalizeString(resolvedPath, !resolvedAbsolute);
  if (resolvedAbsolute) return `/${resolvedPath}`;
  return resolvedPath.length > 0 ? resolvedPath : '.';
}

export function normalize(input) {
  assertPath(input);
  if (input.length === 0) return '.';
  const absolute = input[0] === '/';
  const trailingSeparator = input[input.length - 1] === '/';
  let out = normalizeString(input, !absolute);
  if (out.length === 0) {
    if (absolute) return '/';
    return trailingSeparator ? './' : '.';
  }
  if (trailingSeparator) out += '/';
  return absolute ? `/${out}` : out;
}

export function isAbsolute(input) {
  assertPath(input);
  return input.length > 0 && input[0] === '/';
}

export function join(...args) {
  let joined;
  for (const arg of args) {
    assertPath(arg);
    if (arg.length > 0) joined = joined === undefined ? arg : `${joined}/${arg}`;
  }
  return joined === undefined ? '.' : normalize(joined);
}

export function relative(from, to) {
  assertPath(from, 'from');
  assertPath(to, 'to');
  if (from === to) return '';
  from = resolve(from);
  to = resolve(to);
  if (from === to) return '';
  const fromStart = 1;
  const fromEnd = from.length;
  const fromLen = fromEnd - fromStart;
  const toStart = 1;
  const toLen = to.length - toStart;
  const length = fromLen < toLen ? fromLen : toLen;
  let lastCommonSep = -1;
  let i = 0;
  for (; i < length; i += 1) {
    const fromChar = from[fromStart + i];
    if (fromChar !== to[toStart + i]) break;
    else if (fromChar === '/') lastCommonSep = i;
  }
  if (i === length) {
    if (toLen > length) {
      if (to[toStart + i] === '/') return to.slice(toStart + i + 1);
      if (i === 0) return to.slice(toStart + i);
    } else if (fromLen > length) {
      if (from[fromStart + i] === '/') lastCommonSep = i;
      else if (i === 0) lastCommonSep = 0;
    }
  }
  let out = '';
  for (i = fromStart + lastCommonSep + 1; i <= fromEnd; i += 1) {
    if (i === fromEnd || from[i] === '/') out += out.length === 0 ? '..' : '/..';
  }
  return `${out}${to.slice(toStart + lastCommonSep)}`;
}

export function dirname(input) {
  assertPath(input);
  if (input.length === 0) return '.';
  const hasRoot = input[0] === '/';
  let end = -1;
  let matchedSlash = true;
  for (let i = input.length - 1; i >= 1; i -= 1) {
    if (input[i] === '/') {
      if (!matchedSlash) {
        end = i;
        break;
      }
    } else {
      matchedSlash = false;
    }
  }
  if (end === -1) return hasRoot ? '/' : '.';
  if (hasRoot && end === 1) return '//';
  return input.slice(0, end);
}

function stripTrailingSlashes(input) {
  let end = input.length;
  while (end > 0 && input[end - 1] === '/') end -= 1;
  return input.slice(0, end);
}

export function basename(input, suffix) {
  assertPath(input);
  if (suffix !== undefined) assertPath(suffix, 'suffix');
  const stripped = stripTrailingSlashes(input);
  const base = stripped.slice(stripped.lastIndexOf('/') + 1);
  if (suffix !== undefined && suffix.length > 0 && base !== suffix && base.endsWith(suffix)) {
    return base.slice(0, base.length - suffix.length);
  }
  return base;
}

export function extname(input) {
  assertPath(input);
  const base = basename(input);
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || base === '..') return '';
  return base.slice(dot);
}

export function parse(input) {
  assertPath(input);
  const root = input[0] === '/' ? '/' : '';
  if (input.length === 0) return { root, dir: '', base: '', ext: '', name: '' };
  const stripped = stripTrailingSlashes(input) || root;
  const slash = stripped.lastIndexOf('/');
  const base = stripped.slice(slash + 1);
  const ext = extname(base);
  let dir = '';
  if (slash > 0) dir = stripped.slice(0, slash);
  else if (slash === 0) dir = '/';
  return { root, dir, base, ext, name: ext ? base.slice(0, base.length - ext.length) : base };
}

export function format(pathObject) {
  const dir = pathObject.dir || pathObject.root || '';
  const base = pathObject.base || `${pathObject.name || ''}${pathObject.ext ? (pathObject.ext.startsWith('.') ? '' : '.') + pathObject.ext : ''}`;
  if (!dir) return base;
  return dir === pathObject.root ? `${dir}${base}` : `${dir}/${base}`;
}

export function toNamespacedPath(input) {
  return input;
}

export function matchesGlob() {
  throw unavailable('path.matchesGlob()');
}

export const sep = '/';
export const delimiter = ':';

const failing = (name) => () => {
  throw unavailable(`path.win32.${name}()`, 'the browser engine is POSIX-only');
};

export const win32 = Object.freeze(Object.fromEntries(
  ['resolve', 'normalize', 'isAbsolute', 'join', 'relative', 'dirname', 'basename', 'extname', 'parse', 'format', 'toNamespacedPath']
    .map((name) => [name, failing(name)])
    .concat([['sep', '\\'], ['delimiter', ';']]),
));

const posixApi = {
  resolve, normalize, isAbsolute, join, relative, dirname, basename, extname, parse, format,
  toNamespacedPath, matchesGlob, sep, delimiter, win32,
};
posixApi.posix = posixApi;

export const posix = posixApi;
export default posixApi;
