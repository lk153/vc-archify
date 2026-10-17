// Read-only virtual filesystem for the browser engine. It serves the files the
// worker was handed for this render (the locale manifest and catalogs under
// /vc-archify/locales/). Reads of anything else fail with ENOENT and are
// recorded so the client can supply a known file and retry; every mutating or
// descriptor-based API throws a clear "not available in the browser" error.
import { Buffer } from './buffer.js';
import { engineEnv, unavailable } from './env.js';
import { resolve } from './path.js';
import { fileURLToPath } from './url.js';

function toPath(input) {
  if (input instanceof URL) return fileURLToPath(input);
  if (typeof input === 'string') return resolve(input);
  if (ArrayBuffer.isView(input)) return resolve(new TextDecoder().decode(input));
  if (typeof input === 'number') throw unavailable('file descriptors');
  throw new TypeError('The "path" argument must be of type string or an instance of URL');
}

function files() {
  return engineEnv().files || {};
}

function isDirectory(target) {
  const prefix = target.endsWith('/') ? target : `${target}/`;
  return target === '/' || Object.keys(files()).some((file) => file.startsWith(prefix));
}

function notFound(syscall, target) {
  engineEnv().misses?.push(target);
  const error = new Error(`ENOENT: no such file or directory, ${syscall} '${target}' (not provided to the vc-archify browser engine)`);
  error.code = 'ENOENT';
  error.errno = -2;
  error.syscall = syscall;
  error.path = target;
  return error;
}

function encodingOf(options) {
  return typeof options === 'string' ? options : options?.encoding ?? null;
}

let inode = 1000;
const inodes = new Map();
function statFor(target, bigint) {
  const file = files()[target];
  const directory = file === undefined && isDirectory(target);
  if (file === undefined && !directory) return null;
  if (!inodes.has(target)) inodes.set(target, (inode += 1));
  const size = file === undefined ? 0 : Buffer.byteLength(file);
  const n = (value) => (bigint ? BigInt(value) : value);
  const zero = new Date(0);
  return {
    dev: n(1), ino: n(inodes.get(target)), mode: n(directory ? 0o40555 : 0o100444), nlink: n(1),
    uid: n(0), gid: n(0), rdev: n(0), size: n(size), blksize: n(4096), blocks: n(Math.ceil(size / 512)),
    atimeMs: n(0), mtimeMs: n(0), ctimeMs: n(0), birthtimeMs: n(0),
    atime: zero, mtime: zero, ctime: zero, birthtime: zero,
    isFile: () => !directory,
    isDirectory: () => directory,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
  };
}

export function readFileSync(input, options) {
  const target = toPath(input);
  const content = files()[target];
  if (content === undefined) throw notFound('open', target);
  const encoding = encodingOf(options);
  return encoding ? content : Buffer.from(content);
}

export function existsSync(input) {
  try {
    return statFor(toPath(input), false) !== null;
  } catch {
    return false;
  }
}

export function statSync(input, options = {}) {
  const target = toPath(input);
  const stat = statFor(target, Boolean(options.bigint));
  if (stat) return stat;
  if (options.throwIfNoEntry === false) return undefined;
  throw notFound('stat', target);
}

export const lstatSync = statSync;

export function readdirSync(input, options = {}) {
  const target = toPath(input);
  if (!isDirectory(target)) throw notFound('scandir', target);
  const prefix = target.endsWith('/') ? target : `${target}/`;
  const names = [...new Set(Object.keys(files())
    .filter((file) => file.startsWith(prefix))
    .map((file) => file.slice(prefix.length).split('/')[0]))].sort();
  if (!options.withFileTypes) return names;
  return names.map((name) => {
    const stat = statFor(`${prefix}${name}`, false);
    return { name, parentPath: target, path: target, isFile: stat.isFile, isDirectory: stat.isDirectory, isSymbolicLink: () => false };
  });
}

export function accessSync(input) {
  const target = toPath(input);
  if (!statFor(target, false)) throw notFound('access', target);
}

const fail = (name) => () => {
  throw unavailable(`fs.${name}()`, 'the engine filesystem is a read-only in-memory view');
};

export function realpathSync(input) {
  const target = toPath(input);
  if (!statFor(target, false)) throw notFound('realpath', target);
  return target;
}
realpathSync.native = realpathSync;

export const writeFileSync = fail('writeFileSync');
export const appendFileSync = fail('appendFileSync');
export const mkdirSync = fail('mkdirSync');
export const mkdtempSync = fail('mkdtempSync');
export const rmSync = fail('rmSync');
export const rmdirSync = fail('rmdirSync');
export const unlinkSync = fail('unlinkSync');
export const renameSync = fail('renameSync');
export const linkSync = fail('linkSync');
export const symlinkSync = fail('symlinkSync');
export const readlinkSync = fail('readlinkSync');
export const copyFileSync = fail('copyFileSync');
export const chmodSync = fail('chmodSync');
export const openSync = fail('openSync');
export const closeSync = fail('closeSync');
export const readSync = fail('readSync');
export const writeSync = fail('writeSync');
export const fstatSync = fail('fstatSync');
export const fchmodSync = fail('fchmodSync');
export const fsyncSync = fail('fsyncSync');
export const ftruncateSync = fail('ftruncateSync');
export const utimesSync = fail('utimesSync');
export const opendirSync = fail('opendirSync');
export const createReadStream = fail('createReadStream');
export const createWriteStream = fail('createWriteStream');
export const watch = fail('watch');

export const constants = Object.freeze({
  F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1,
  O_RDONLY: 0, O_WRONLY: 1, O_RDWR: 2, O_CREAT: 0o100, O_EXCL: 0o200, O_NOCTTY: 0o400,
  O_TRUNC: 0o1000, O_APPEND: 0o2000, O_DIRECTORY: 0o200000, O_NOFOLLOW: 0o400000,
  S_IFMT: 0o170000, S_IFREG: 0o100000, S_IFDIR: 0o40000, S_IFLNK: 0o120000,
  COPYFILE_EXCL: 1,
});

export const promises = new Proxy({}, {
  get: (_target, name) => (typeof name === 'string' ? async () => { throw unavailable(`fs.promises.${name}()`); } : undefined),
});

const api = {
  readFileSync, existsSync, statSync, lstatSync, readdirSync, accessSync, realpathSync,
  writeFileSync, appendFileSync, mkdirSync, mkdtempSync, rmSync, rmdirSync, unlinkSync, renameSync,
  linkSync, symlinkSync, readlinkSync, copyFileSync, chmodSync, openSync, closeSync, readSync,
  writeSync, fstatSync, fchmodSync, fsyncSync, ftruncateSync, utimesSync, opendirSync,
  createReadStream, createWriteStream, watch, constants, promises,
};

export default api;
