import type { ComponentPropsWithoutRef } from "react";

import type { Locale } from "@/types/locale";

export type LanguageSwitcherVariant =
  | "icon"
  | "compact";

export type LanguageSwitcherProps = Omit<
  ComponentPropsWithoutRef<"button">,
  "children" | "onClick" | "aria-label"
> & {
  currentLocale: Locale;
  variant?: LanguageSwitcherVariant;
  showCode?: boolean;
  onLocaleChange?: (locale: Locale) => void;
};