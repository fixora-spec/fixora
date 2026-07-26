export type Locale = "es" | "en";

export type LocaleDirection = "ltr" | "rtl";

export type LocaleCode = "ES" | "EN";

export type LocaleOption = {
  locale: Locale;
  code: LocaleCode;
  label: string;
  nativeLabel: string;
  htmlLang: string;
  direction: LocaleDirection;
};

export type LanguageSwitcherProps = {
  currentLocale: Locale;
  className?: string;
};

export type ChangeLocaleOptions = {
  locale: Locale;
  preservePathname?: boolean;
};