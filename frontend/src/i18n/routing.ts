import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['uz', 'ru', 'en'],
  defaultLocale: 'uz',
  localePrefix: 'always',
});

export const localeNames: Record<string, string> = {
  uz: "O'zbek",
  ru: 'Русский',
  en: 'English',
};