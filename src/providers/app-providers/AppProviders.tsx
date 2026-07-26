"use client";

import { ThemeProvider } from "@/providers/theme-provider";

import type { AppProvidersProps } from "./AppProviders.types";

export function AppProviders({
  children,
}: AppProvidersProps) {
  return (
    <ThemeProvider>
      {children}
    </ThemeProvider>
  );
}