"use client";

import {
  AuthProvider,
} from "@/providers/auth-provider";

import {
  ThemeProvider,
} from "@/providers/theme-provider";

import type {
  AppProvidersProps,
} from "./AppProviders.types";

export function AppProviders({
  children,
}: AppProvidersProps) {
  return (
    <ThemeProvider>
      <AuthProvider>
        {children}
      </AuthProvider>
    </ThemeProvider>
  );
}