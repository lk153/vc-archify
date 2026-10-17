// Small `Buffer` subset on top of Uint8Array. The render path only needs
// Buffer.byteLength (portable-path checks); the rest keeps the brand-capture
// and hashing helpers well-defined if they are reached.

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

function normalizeEncoding(encoding) {
  const value = String(encoding || 'utf8').toLowerCase();
  if (value === 'utf-8') return 'utf8';
  return value;
}

function bytesFromString(value, encoding) {
  switch (normalizeEncoding(encoding)) {
    case 'utf8':
      return encoder.encode(value);
    case 'hex': {
      const out = new Uint8Array(Math.floor(value.length / 2));
      for (let i = 0; i < out.length; i += 1) out[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
      return out;
    }
    case 'base64': {
      const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
      return Uint8Array.from(binary, (c) => c.charCodeAt(0));
    }
    case 'latin1':
    case 'binary':
    case 'ascii':
      return Uint8Array.from(value, (c) => c.charCodeAt(0) & 0xff);
    default:
      throw new TypeError(`Unknown encoding: ${encoding}`);
  }
}

export class Buffer extends Uint8Array {
  static from(value, encodingOrOffset, length) {
    if (typeof value === 'string') return Buffer.fromBytes(bytesFromString(value, encodingOrOffset));
    if (value instanceof ArrayBuffer) {
      return new Buffer(value, encodingOrOffset || 0, length ?? value.byteLength - (encodingOrOffset || 0));
    }
    if (ArrayBuffer.isView(value)) {
      return Buffer.fromBytes(new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice());
    }
    if (Array.isArray(value)) return Buffer.fromBytes(Uint8Array.from(value));
    throw new TypeError('Buffer.from: unsupported value');
  }

  static fromBytes(bytes) {
    return new Buffer(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  static alloc(size, fill = 0) {
    return new Buffer(size).fill(typeof fill === 'number' ? fill : 0);
  }

  static allocUnsafe(size) {
    return new Buffer(size);
  }

  static isBuffer(value) {
    return value instanceof Buffer;
  }

  static byteLength(value, encoding) {
    if (typeof value === 'string') {
      return normalizeEncoding(encoding) === 'utf8' ? encoder.encode(value).byteLength : bytesFromString(value, encoding).byteLength;
    }
    return value.byteLength;
  }

  static concat(list, totalLength) {
    const total = totalLength ?? list.reduce((sum, item) => sum + item.byteLength, 0);
    const out = Buffer.alloc(total);
    let offset = 0;
    for (const item of list) {
      if (offset >= total) break;
      const view = item.subarray(0, Math.min(item.byteLength, total - offset));
      out.set(view, offset);
      offset += view.byteLength;
    }
    return out;
  }

  equals(other) {
    if (this.byteLength !== other.byteLength) return false;
    for (let i = 0; i < this.byteLength; i += 1) if (this[i] !== other[i]) return false;
    return true;
  }

  toString(encoding, start = 0, end = this.byteLength) {
    const view = this.subarray(start, end);
    switch (normalizeEncoding(encoding)) {
      case 'utf8':
        return decoder.decode(view);
      case 'hex': {
        let out = '';
        for (const byte of view) out += HEX[byte];
        return out;
      }
      case 'base64': {
        let binary = '';
        for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
        return btoa(binary);
      }
      case 'latin1':
      case 'binary':
      case 'ascii':
        return Array.from(view, (b) => String.fromCharCode(b)).join('');
      default:
        throw new TypeError(`Unknown encoding: ${encoding}`);
    }
  }
}

export default { Buffer };
