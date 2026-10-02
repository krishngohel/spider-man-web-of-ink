import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { COPY } from '../../src/ui/copy.js';
import { ACTIONS } from '../../src/core/bindings.js';

// Copy rule: no em or en dashes anywhere a player (or a README reader) can see. The characters are
// built from char codes so this file never contains them itself.
const DASHES = [String.fromCharCode(8211), String.fromCharCode(8212)];
const hasDash = (s) => DASHES.some((d) => s.includes(d));

function strings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
}

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe('copy', () => {
  it('no dashes in any game copy or action label', () => {
    const all = [...strings(COPY), ...ACTIONS.map((a) => a.label)];
    expect(all.length).toBeGreaterThan(40);
    expect(all.filter(hasDash)).toEqual([]);
  });
  it('no dashes in source, index.html or the README', () => {
    const list = [...files('src'), 'index.html', 'README.md'];
    expect(list.filter((f) => hasDash(readFileSync(f, 'utf8')))).toEqual([]);
  });
});
