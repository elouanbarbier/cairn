import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeSetting = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'cairn.theme';

function readSetting(): ThemeSetting {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Storage unavailable: follow the system.
  }
  return 'system';
}

const ThemeContext = createContext<{ setting: ThemeSetting; setSetting: (s: ThemeSetting) => void } | null>(null);

/** Light and dark themes; follows the system unless the user picks one. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [setting, setSettingState] = useState<ThemeSetting>(readSetting);

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = setting === 'dark' || (setting === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [setting]);

  const setSetting = useCallback((next: ThemeSetting) => {
    setSettingState(next);
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisted.
    }
  }, []);

  const value = useMemo(() => ({ setting, setSetting }), [setting, setSetting]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
