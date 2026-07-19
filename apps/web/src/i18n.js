import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import de from './locales/de.js';
import en from './locales/en.js';

export const DEFAULT_LANGUAGE = 'en';
export const LANGUAGE_STORAGE_KEY = 'ble-bridge-language-v1';
export const SUPPORTED_LANGUAGES = ['en', 'de'];

const MESSAGES = { en, de };
const I18nContext = createContext(null);

export function normalizeLanguage(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'de' || normalized.startsWith('de-') ? 'de' : DEFAULT_LANGUAGE;
}

export function detectLanguage({ storage, navigatorLanguage } = {}) {
  try {
    const stored = storage?.getItem?.(LANGUAGE_STORAGE_KEY);
    return normalizeLanguage(stored || navigatorLanguage || DEFAULT_LANGUAGE);
  } catch {
    return normalizeLanguage(navigatorLanguage || DEFAULT_LANGUAGE);
  }
}

export function translate(language, key, variables = {}, fallback = '') {
  const locale = normalizeLanguage(language);
  const template = MESSAGES[locale]?.[key] ?? MESSAGES[DEFAULT_LANGUAGE]?.[key] ?? fallback ?? key;

  return String(template).replaceAll(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => (
    Object.hasOwn(variables, name) ? String(variables[name]) : match
  ));
}

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(() => detectLanguage({
    storage: globalThis.localStorage,
    navigatorLanguage: globalThis.navigator?.language
  }));

  const setLanguage = useCallback((nextLanguage) => {
    setLanguageState(normalizeLanguage(nextLanguage));
  }, []);

  const t = useCallback((key, variables = {}, fallback = '') => (
    translate(language, key, variables, fallback)
  ), [language]);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem?.(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Language selection still works when storage is unavailable.
    }
    if (globalThis.document?.documentElement) {
      globalThis.document.documentElement.lang = language;
    }
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return value;
}
