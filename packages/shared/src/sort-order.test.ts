import { describe, expect, it } from 'vitest';
import { sortKeyBetween, sortKeysAfter } from './sort-order.ts';

describe('sortKeyBetween', () => {
  it('creates a first key', () => {
    expect(sortKeyBetween(null, null)).toBe('V');
  });

  it('sorts strictly between neighbours', () => {
    const cases: Array<[string | null, string | null]> = [
      [null, 'V'],
      ['V', null],
      ['V', 'W'],
      ['A', 'B'],
      ['Az', 'B'],
      ['0V', '1'],
      [null, '01'],
      ['zzz', null],
    ];
    for (const [a, b] of cases) {
      const key = sortKeyBetween(a, b);
      if (a !== null) expect(key > a).toBe(true);
      if (b !== null) expect(key < b).toBe(true);
      expect(key.endsWith('0')).toBe(false);
    }
  });

  it('keeps order across many inserts at the same spot', () => {
    let low = 'V';
    const high = 'W';
    for (let i = 0; i < 200; i++) {
      const key = sortKeyBetween(low, high);
      expect(key > low && key < high).toBe(true);
      low = key;
    }
  });

  it('rejects an inverted range', () => {
    expect(() => sortKeyBetween('W', 'V')).toThrow();
  });

  it('generates increasing keys', () => {
    const keys = sortKeysAfter(null, 50);
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(50);
  });
});
