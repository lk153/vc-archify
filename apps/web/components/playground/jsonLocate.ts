// Map an RFC 6901 JSON pointer (as reported by engine diagnostics) to the
// character range of that value in the editor text, so a diagnostic can select
// the offending JSON. Returns null when the text is not valid JSON or the
// pointer does not resolve (the caller then just focuses the editor).

export interface TextRange {
  start: number;
  end: number;
}

class Scanner {
  i = 0;
  constructor(readonly text: string) {}

  ws() {
    while (this.i < this.text.length && /\s/.test(this.text[this.i])) this.i += 1;
  }

  expect(char: string) {
    this.ws();
    if (this.text[this.i] !== char) throw new Error(`expected ${char}`);
    this.i += 1;
  }

  string(): string {
    this.ws();
    const start = this.i;
    if (this.text[this.i] !== '"') throw new Error('expected string');
    this.i += 1;
    while (this.i < this.text.length) {
      const char = this.text[this.i];
      if (char === '\\') this.i += 2;
      else if (char === '"') {
        this.i += 1;
        return JSON.parse(this.text.slice(start, this.i)) as string;
      } else this.i += 1;
    }
    throw new Error('unterminated string');
  }

  /** Skip one value; returns its range. */
  value(): TextRange {
    this.ws();
    const start = this.i;
    const char = this.text[this.i];
    if (char === '{') {
      this.i += 1;
      this.ws();
      if (this.text[this.i] === '}') this.i += 1;
      else {
        for (;;) {
          this.string();
          this.expect(':');
          this.value();
          this.ws();
          if (this.text[this.i] === ',') this.i += 1;
          else {
            this.expect('}');
            break;
          }
        }
      }
    } else if (char === '[') {
      this.i += 1;
      this.ws();
      if (this.text[this.i] === ']') this.i += 1;
      else {
        for (;;) {
          this.value();
          this.ws();
          if (this.text[this.i] === ',') this.i += 1;
          else {
            this.expect(']');
            break;
          }
        }
      }
    } else if (char === '"') {
      this.string();
    } else {
      const match = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(this.text.slice(this.i, this.i + 64));
      if (!match) throw new Error('unexpected token');
      this.i += match[0].length;
    }
    return { start, end: this.i };
  }

  /** At a value start: enter it and stop at the member named by `segment`. */
  descend(segment: string): boolean {
    this.ws();
    const char = this.text[this.i];
    if (char === '{') {
      this.i += 1;
      this.ws();
      if (this.text[this.i] === '}') return false;
      for (;;) {
        const key = this.string();
        this.expect(':');
        if (key === segment) {
          this.ws();
          return true;
        }
        this.value();
        this.ws();
        if (this.text[this.i] !== ',') return false;
        this.i += 1;
      }
    }
    if (char === '[') {
      if (!/^\d+$/.test(segment)) return false;
      const target = Number(segment);
      this.i += 1;
      this.ws();
      if (this.text[this.i] === ']') return false;
      for (let index = 0; ; index += 1) {
        if (index === target) {
          this.ws();
          return true;
        }
        this.value();
        this.ws();
        if (this.text[this.i] !== ',') return false;
        this.i += 1;
      }
    }
    return false;
  }
}

const segmentsOf = (pointer: string) => (pointer === '' || pointer === '/'
  ? []
  : pointer.replace(/^\//, '').split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~')));

export function locatePointer(text: string, pointer: string): TextRange | null {
  try {
    const scanner = new Scanner(text);
    for (const segment of segmentsOf(pointer)) {
      if (!scanner.descend(segment)) return null;
    }
    return scanner.value();
  } catch {
    return null;
  }
}

export interface MemberRange {
  key: string;
  keyStart: number;
  valueStart: number;
  valueEnd: number;
}

/** The members of the object at `pointer`, with the character range of each key and value. */
export function objectMembers(text: string, pointer: string): { range: TextRange; members: MemberRange[] } | null {
  const range = locatePointer(text, pointer);
  if (!range || text[range.start] !== '{') return null;
  try {
    const scanner = new Scanner(text);
    scanner.i = range.start + 1;
    const members: MemberRange[] = [];
    scanner.ws();
    if (text[scanner.i] === '}') return { range, members };
    for (;;) {
      scanner.ws();
      const keyStart = scanner.i;
      const key = scanner.string();
      scanner.expect(':');
      const value = scanner.value();
      members.push({ key, keyStart, valueStart: value.start, valueEnd: value.end });
      scanner.ws();
      if (text[scanner.i] !== ',') break;
      scanner.i += 1;
    }
    return { range, members };
  } catch {
    return null;
  }
}

/** Character offset of a 1-based line/column. */
export function offsetOf(text: string, line: number, column: number): number {
  let offset = 0;
  for (let current = 1; current < line; current += 1) {
    const next = text.indexOf('\n', offset);
    if (next === -1) return text.length;
    offset = next + 1;
  }
  return Math.min(text.length, offset + Math.max(0, column - 1));
}
