import type { ReactNode } from "react";

import type {
  AppTheme,
  ResolvedAppTheme,
} from "@/types/theme";

export type ThemeContextValue = {
  theme: AppTheme;
  resolvedTheme: ResolvedAppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
};

export type ThemeProviderProps = Readonly<{
  children: ReactNode;
}>;