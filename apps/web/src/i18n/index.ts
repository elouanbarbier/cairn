import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en.ts';
import { fr } from './fr.ts';

export const LANGUAGES = ['en', 'fr'] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = 'cairn.lang';

/** Stored choice, else the browser language, else English (the default language). */
function detectLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'fr') return stored;
  } catch {
    // Storage can be unavailable (private mode); fall through.
  }
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function setLanguage(language: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not persisted; the choice still applies to this session.
  }
  void i18n.changeLanguage(language);
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr } },
  lng: detectLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.language;

export default i18n;
