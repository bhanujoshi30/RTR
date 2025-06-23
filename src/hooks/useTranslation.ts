
'use client';

import { useLanguage } from '@/context/LanguageContext';
import en from '@/locales/en.json';
import hi from '@/locales/hi.json';

const translations = { en, hi };

const getNestedValue = (obj: any, key: string): string | undefined => {
  return key.split('.').reduce((acc, part) => acc && acc[part], obj);
};

export function useTranslation() {
  const { locale, setLocale } = useLanguage();

  const t = (key: string): string => {
    const translation = getNestedValue(translations[locale], key) || getNestedValue(translations['en'], key) || key;
    return translation;
  };

  return { t, locale, setLocale };
}
