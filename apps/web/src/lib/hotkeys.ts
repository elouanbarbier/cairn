import { useEffect, useRef } from 'react';
import { isTypingTarget } from './utils.ts';

/** Return `false` to leave the key to the browser (no `preventDefault`). */
export type HotkeyHandler = (event: KeyboardEvent) => unknown;

/**
 * Binds single keys (`c`, `shift+p`, `?`, `escape`, `arrowdown`), modifier
 * combos (`mod+k`) and two-key sequences (`g o`). Key names are lowercase. Single keys are ignored while typing in a field.
 * `mod` is Cmd on macOS and Ctrl elsewhere.
 */
export function useHotkeys(bindings: Record<string, HotkeyHandler>, enabled = true) {
  const ref = useRef(bindings);
  ref.current = bindings;

  useEffect(() => {
    if (!enabled) return;
    let pending: string | null = null;
    let pendingTimer: ReturnType<typeof setTimeout> | undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;
      const typing = isTypingTarget(event.target);
      const map = ref.current;

      const run = (handler: HotkeyHandler) => {
        if (handler(event) !== false) event.preventDefault();
      };

      if (mod) {
        const handler = map[`mod+${key}`];
        if (handler) run(handler);
        return;
      }
      if (typing || event.altKey) return;

      if (pending) {
        const handler = map[`${pending} ${key}`];
        pending = null;
        clearTimeout(pendingTimer);
        if (handler) {
          run(handler);
          return;
        }
      }

      const combo = event.shiftKey && key.length === 1 && /[a-z]/.test(key) ? `shift+${key}` : key;
      const handler = map[combo];
      if (handler) {
        run(handler);
        return;
      }
      if (Object.keys(map).some((k) => k.startsWith(`${key} `))) {
        pending = key;
        pendingTimer = setTimeout(() => {
          pending = null;
        }, 1000);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(pendingTimer);
    };
  }, [enabled]);
}
