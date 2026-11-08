/**
 * Fractional indexing for `sort_order`: returns a string that sorts strictly
 * between two existing keys, so reordering never rewrites the whole list.
 * Keys use base-62 digits in ASCII order and never end with `0`.
 */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function digitAt(key: string, index: number): string {
  const char = key[index];
  if (char === undefined) throw new Error('Index out of range');
  return char;
}

function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) throw new Error(`Invalid range: ${a} >= ${b}`);
  if (b !== null) {
    let n = 0;
    while ((a[n] ?? '0') === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const low = a.length > 0 ? DIGITS.indexOf(digitAt(a, 0)) : 0;
  const high = b !== null ? DIGITS.indexOf(digitAt(b, 0)) : DIGITS.length;
  if (high - low > 1) return digitAt(DIGITS, Math.round((low + high) / 2));
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return digitAt(DIGITS, low) + midpoint(a.slice(1), null);
}

/** Key strictly between `before` and `after`; `null` means the start or end of the list. */
export function sortKeyBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) {
    throw new Error(`Invalid sort keys: ${before} >= ${after}`);
  }
  return midpoint(before ?? '', after);
}

/** `count` increasing keys after `start` (or from the beginning). */
export function sortKeysAfter(start: string | null, count: number): string[] {
  const keys: string[] = [];
  let previous = start;
  for (let i = 0; i < count; i++) {
    previous = sortKeyBetween(previous, null);
    keys.push(previous);
  }
  return keys;
}
