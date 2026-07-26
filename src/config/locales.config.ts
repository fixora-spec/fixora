export const SUPPORTED_LOCALES = ["es", "en"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "es";

export type LocaleConfig = {
  code: string;
  label: string;
  nativeLabel: string;
  htmlLang: string;
  direction: "ltr" | "rtl";
};

export const LOCALE_CONFIG = {
  es: {
    code: "ES",
    label: "Spanish",
    nativeLabel: "Español",
    htmlLang: "es",
    direction: "ltr",
  },
  en: {
    code: "EN",
    label: "English",
    nativeLabel: "English",
    htmlLang: "en",
    direction: "ltr",
  },
} satisfies Record<SupportedLocale, LocaleConfig>;

export function isSupportedLocale(
  locale: string,
): locale is SupportedLocale {
  return SUPPORTED_LOCALES.includes(locale as SupportedLocale);
}