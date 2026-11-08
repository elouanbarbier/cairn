import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/** Knows the custom type scale from styles.css, so `text-stat` and `text-danger` don't cancel out. */
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ['micro', 'caption', 'small', 'stat'] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : (parts[0]?.[1] ?? '');
  return (first + last).toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Lowercase, accent-free text for client-side matching. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Splits `text` around the first accent-insensitive match of `query`. */
export function splitMatch(text: string, query: string): [string, string, string] | null {
  const q = normalize(query.trim());
  if (!q) return null;
  // Fold each UTF-16 unit to one character so indexes stay aligned with `text`.
  const folded = text
    .split('')
    .map((ch) => normalize(ch).charAt(0) || ch)
    .join('');
  const index = folded.indexOf(q);
  if (index < 0) return null;
  return [text.slice(0, index), text.slice(index, index + q.length), text.slice(index + q.length)];
}

/** True when the event comes from a text field, where single-key shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
