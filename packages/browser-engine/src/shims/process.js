// Minimal `process` global for the browser engine. Renderers read argv/env,
// set exitCode, and (in CLI mode only) install uncaughtException handlers;
// none of that has a browser meaning, so handlers are recorded but never run.
import { engineEnv, unavailable } from './env.js';

const config = engineEnv();
const listeners = new Map();

function addListener(event, handler) {
  if (!listeners.has(event)) listeners.set(event, []);
  listeners.get(event).push(handler);
  return process;
}

function removeListener(event, handler) {
  const list = listeners.get(event);
  if (list) listeners.set(event, list.filter((entry) => entry !== handler));
  return process;
}

function stream(name, fd) {
  const self = {
    fd,
    isTTY: false,
    columns: 80,
    write(chunk, encoding, callback) {
      const done = typeof encoding === 'function' ? encoding : callback;
      config.log?.(name, String(chunk));
      if (typeof done === 'function') queueMicrotask(done);
      return true;
    },
    on: () => self,
    once: () => self,
    off: () => self,
    end: () => self,
  };
  return self;
}

export const process = {
  title: 'vc-archify-browser-engine',
  // Same variables @vca/render passes to the CLI renderer (no ARCHIFY_* overrides).
  env: { ARCHIFY_UPDATE_CHECK_DISABLED: '1', NO_COLOR: '1', ...(config.env || {}) },
  argv: Array.isArray(config.argv) ? [...config.argv] : ['node', '/vc-archify/renderers/render.mjs'],
  argv0: 'node',
  execArgv: [],
  execPath: '/usr/local/bin/node',
  platform: 'linux',
  arch: 'x64',
  pid: 1,
  ppid: 0,
  version: 'v24.0.0',
  versions: { node: '24.0.0' },
  release: { name: 'node' },
  exitCode: undefined,
  cwd: () => '/memory',
  chdir() {
    throw unavailable('process.chdir()');
  },
  exit(code) {
    const error = unavailable(`process.exit(${code ?? ''})`, 'only CLI-only modes such as --layout-json call it');
    error.exitCode = code;
    throw error;
  },
  nextTick: (callback, ...args) => queueMicrotask(() => callback(...args)),
  emitWarning: (warning) => config.log?.('warning', String(warning?.message ?? warning)),
  on: addListener,
  once: addListener,
  addListener,
  prependListener: addListener,
  off: removeListener,
  removeListener,
  removeAllListeners: () => process,
  listeners: (event) => [...(listeners.get(event) || [])],
  listenerCount: (event) => (listeners.get(event) || []).length,
  emit: () => false,
  stdout: stream('stdout', 1),
  stderr: stream('stderr', 2),
  hrtime: Object.assign(() => [0, 0], { bigint: () => 0n }),
  uptime: () => 0,
  memoryUsage: () => ({ rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 }),
};

export default process;
