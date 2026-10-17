// `node:os` constants for the browser engine. Only temp-directory helpers
// (never used by the in-memory render path) read these.
import { unavailable } from './env.js';

export const EOL = '\n';
export const tmpdir = () => '/tmp';
export const homedir = () => '/home/vc-archify';
export const platform = () => 'linux';
export const type = () => 'Linux';
export const arch = () => 'x64';
export const release = () => '0.0.0';
export const hostname = () => 'browser';
export const endianness = () => 'LE';
export const cpus = () => [];
export const userInfo = () => {
  throw unavailable('os.userInfo()');
};

export default { EOL, tmpdir, homedir, platform, type, arch, release, hostname, endianness, cpus, userInfo };
