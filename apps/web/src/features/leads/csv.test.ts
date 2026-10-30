import { describe, expect, it } from 'vitest';
import { applyMapping, guessMapping, parseCsv } from './csv';

describe('parseCsv', () => {
  it('handles quotes, commas, escaped quotes and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
    ]);
  });
  it('keeps embedded newlines and skips blank lines and BOM', () => {
    expect(parseCsv('﻿a\n"l1\nl2"\n\n')).toEqual([['a'], ['l1\nl2']]);
  });
});

describe('mapping', () => {
  it('guesses by header aliases', () => {
    const m = guessMapping(['Full Name', 'E-mail', 'Mobile', 'Whatever']);
    expect([m.name, m.email, m.phone, m.company]).toEqual([0, 1, 2, -1]);
  });
  it('applies mapping to rows', () => {
    const m = guessMapping(['name', 'email']);
    expect(applyMapping([['Ann', 'a@b.co']], m)).toEqual([{ name: 'Ann', email: 'a@b.co' }]);
  });
});
