
'use client';

import { useLanguage } from '@/context/LanguageContext';
import en from '@/locales/en.json';
import hi from '@/locales/hi.json';

const translations = { en, hi };

const getNestedValue = (obj: any, key: string): string | undefined => {
  if (typeof key !== 'string' || !key) {
    return undefined;
  }
  return key.split('.').reduce((acc, part) => acc && acc[part], obj);
};

export function useTranslation() {
  const { locale, setLocale } = useLanguage();

  const t = (key: string, params?: Record<string, any>): string => {
    if (!key) {
      return ''; // Return an empty string if the key is invalid, preventing crashes.
    }
    
    let translation = getNestedValue(translations[locale], key) || getNestedValue(translations['en'], key) || key;
    
    // Replace placeholders like {{variable}}
    if (params) {
      Object.keys(params).forEach(paramKey => {
        translation = translation.replace(new RegExp(`{{${paramKey}}}`, 'g'), params[paramKey]);
      });
    }

    return translation;
  };

  return { t, locale, setLocale };
}
